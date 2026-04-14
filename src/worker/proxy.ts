/**
 * Local API proxy — transparently forwards requests to api.anthropic.com
 * while extracting rate-limit headers and tracking token usage/costs.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { appendJSONL } from "../utils/logger.js";
import { readJSON, writeJSON } from "../utils/json.js";

// ─── Types ───────────────────────────────────────────────────────────

export interface RateLimitInfo {
  tokens_remaining: number;
  tokens_limit: number;
  requests_remaining: number;
  requests_limit: number;
  utilization_5h: number;
  throttled: boolean;
  updated_at: string;
}

export interface CostEntry {
  task_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  ts: string;
}

interface TaskCostSummary {
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  request_count: number;
}

export interface CostSummary {
  total_cost_usd: number;
  total_requests: number;
  by_task: Record<string, TaskCostSummary>;
}

// ─── Model Pricing (per token) ───────────────────────────────────────

interface ModelPricing {
  input: number;   // USD per token
  output: number;  // USD per token
}

const PRICING: Record<string, ModelPricing> = {
  "opus-4":   { input: 15  / 1_000_000, output: 75 / 1_000_000 },
  "sonnet-4": { input: 3   / 1_000_000, output: 15 / 1_000_000 },
  "haiku-4":  { input: 0.8 / 1_000_000, output: 4  / 1_000_000 },
};

const DEFAULT_PRICING = PRICING["sonnet-4"];

const THROTTLE_THRESHOLD = 0.90;
const UPSTREAM = "https://api.anthropic.com";
const APEX_DIR = ".apex";
const RATE_LIMIT_FILE = `${APEX_DIR}/rate-limit.json`;
const COST_LOG_FILE = `${APEX_DIR}/cost-log.jsonl`;
const PORT_FILE = `${APEX_DIR}/proxy-port`;

// ─── Pure Functions (exported for testing) ───────────────────────────

function resolvePricing(model: string): ModelPricing {
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (model.includes(key)) return pricing;
  }
  return DEFAULT_PRICING;
}

export function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const limitTokens = parseInt(headers.get("x-ratelimit-limit-tokens") ?? "", 10);
  const remainingTokens = parseInt(headers.get("x-ratelimit-remaining-tokens") ?? "", 10);
  const limitRequests = parseInt(headers.get("x-ratelimit-limit-requests") ?? "", 10);
  const remainingRequests = parseInt(headers.get("x-ratelimit-remaining-requests") ?? "", 10);

  if ([limitTokens, remainingTokens, limitRequests, remainingRequests].some(isNaN)) {
    return null;
  }
  if (limitTokens === 0 || limitRequests === 0) {
    return null;
  }

  const tokenUtil = 1 - remainingTokens / limitTokens;
  const requestUtil = 1 - remainingRequests / limitRequests;
  const utilization_5h = Math.max(tokenUtil, requestUtil);

  return {
    tokens_remaining: remainingTokens,
    tokens_limit: limitTokens,
    requests_remaining: remainingRequests,
    requests_limit: limitRequests,
    utilization_5h: Math.round(utilization_5h * 1000) / 1000, // 3 decimal places
    throttled: utilization_5h >= THROTTLE_THRESHOLD,
    updated_at: new Date().toISOString(),
  };
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = resolvePricing(model);
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

export function extractUsageFromBody(body: unknown): { input_tokens: number; output_tokens: number } | null {
  if (body === null || typeof body !== "object") return null;
  const usage = (body as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return null;
  const { input_tokens, output_tokens } = usage as Record<string, unknown>;
  if (typeof input_tokens !== "number" || typeof output_tokens !== "number") return null;
  return { input_tokens, output_tokens };
}

// ─── File I/O ────────────────────────────────────────────────────────

export async function readRateLimit(): Promise<RateLimitInfo | null> {
  return readJSON<RateLimitInfo | null>(RATE_LIMIT_FILE, null);
}

export async function readCostSummary(): Promise<CostSummary> {
  const empty: CostSummary = { total_cost_usd: 0, total_requests: 0, by_task: {} };

  if (!existsSync(COST_LOG_FILE)) return empty;

  const raw = readFileSync(COST_LOG_FILE, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);

  const summary: CostSummary = { total_cost_usd: 0, total_requests: 0, by_task: {} };

  for (const line of lines) {
    let entry: CostEntry;
    try {
      entry = JSON.parse(line) as CostEntry;
    } catch {
      continue; // skip malformed lines
    }

    summary.total_cost_usd += entry.cost_usd;
    summary.total_requests += 1;

    const tid = entry.task_id ?? "unknown";
    if (!summary.by_task[tid]) {
      summary.by_task[tid] = { total_cost_usd: 0, total_input_tokens: 0, total_output_tokens: 0, request_count: 0 };
    }
    const bucket = summary.by_task[tid];
    bucket.total_cost_usd += entry.cost_usd;
    bucket.total_input_tokens += entry.input_tokens;
    bucket.total_output_tokens += entry.output_tokens;
    bucket.request_count += 1;
  }

  return summary;
}

// ─── Proxy Server ────────────────────────────────────────────────────

let proxyServer: ReturnType<typeof Bun.serve> | null = null;

async function findAvailablePort(start: number, end: number): Promise<number> {
  for (let port = start; port <= end; port++) {
    try {
      const test = Bun.serve({ port, fetch: () => new Response(), });
      test.stop(true);
      return port;
    } catch {
      continue;
    }
  }
  throw new Error(`No available port in range ${start}-${end}`);
}

export async function startProxy(port?: number): Promise<number> {
  if (proxyServer) throw new Error("Proxy already running");

  if (!existsSync(APEX_DIR)) mkdirSync(APEX_DIR, { recursive: true });

  const resolvedPort = port ?? await findAvailablePort(9100, 9199);

  proxyServer = Bun.serve({
    port: resolvedPort,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const upstreamUrl = `${UPSTREAM}${url.pathname}${url.search}`;

      // Clone request body for later parsing (cost tracking)
      const reqBody = req.body ? await req.text() : null;
      let reqJson: Record<string, unknown> | null = null;
      try {
        if (reqBody) reqJson = JSON.parse(reqBody) as Record<string, unknown>;
      } catch { /* non-JSON body, ignore */ }

      const taskId = req.headers.get("x-apex-task-id") ?? "unknown";

      // Forward to upstream — strip internal header before sending
      const fwdHeaders = new Headers(req.headers);
      fwdHeaders.delete("x-apex-task-id");
      const upstreamReq = new Request(upstreamUrl, {
        method: req.method,
        headers: fwdHeaders,
        body: reqBody,
      });

      const upstreamRes = await fetch(upstreamReq);

      // Read response body for usage extraction
      const resBody = await upstreamRes.text();

      // Extract rate limits from response headers
      const rateLimit = parseRateLimitHeaders(upstreamRes.headers);
      if (rateLimit) {
        await writeJSON(RATE_LIMIT_FILE, rateLimit);
      }

      // Extract usage and log cost
      let resJson: unknown = null;
      try {
        resJson = JSON.parse(resBody);
      } catch { /* non-JSON response */ }

      if (resJson) {
        const usage = extractUsageFromBody(resJson);
        if (usage) {
          const model = (reqJson?.model as string) ?? "unknown";
          const cost = calculateCost(model, usage.input_tokens, usage.output_tokens);
          const entry: CostEntry = {
            task_id: taskId,
            model,
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cost_usd: Math.round(cost * 1_000_000) / 1_000_000, // 6 decimal places
            ts: new Date().toISOString(),
          };
          appendJSONL(COST_LOG_FILE, entry as unknown as Record<string, unknown>);
        }
      }

      // Return response to caller with original headers
      const resHeaders = new Headers(upstreamRes.headers);
      return new Response(resBody, {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        headers: resHeaders,
      });
    },
  });

  await writeJSON(PORT_FILE, { port: resolvedPort, pid: process.pid });
  return resolvedPort;
}

export async function stopProxy(): Promise<void> {
  if (proxyServer) {
    proxyServer.stop(true);
    proxyServer = null;
  }
  if (existsSync(PORT_FILE)) {
    unlinkSync(PORT_FILE);
  }
}
