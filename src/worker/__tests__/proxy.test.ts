import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  parseRateLimitHeaders,
  calculateCost,
  extractUsageFromBody,
  readRateLimit,
  readCostSummary,
  type RateLimitInfo,
  type CostEntry,
} from "../proxy.js";

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  testDir = join(tmpdir(), `apex-test-proxy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(testDir, { recursive: true });
  process.chdir(testDir);
  mkdirSync(".apex", { recursive: true });
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

// ─── Rate Limit Header Extraction ────────────────────────────────────

describe("parseRateLimitHeaders", () => {
  test("extracts all four rate limit headers", () => {
    const headers = new Headers({
      "x-ratelimit-limit-tokens": "100000",
      "x-ratelimit-remaining-tokens": "80000",
      "x-ratelimit-limit-requests": "1000",
      "x-ratelimit-remaining-requests": "500",
    });

    const info = parseRateLimitHeaders(headers);
    expect(info.tokens_limit).toBe(100000);
    expect(info.tokens_remaining).toBe(80000);
    expect(info.requests_limit).toBe(1000);
    expect(info.requests_remaining).toBe(500);
  });

  test("calculates utilization_5h correctly", () => {
    const headers = new Headers({
      "x-ratelimit-limit-tokens": "100000",
      "x-ratelimit-remaining-tokens": "20000",
      "x-ratelimit-limit-requests": "1000",
      "x-ratelimit-remaining-requests": "100",
    });

    const info = parseRateLimitHeaders(headers);
    // token utilization: 1 - 20000/100000 = 0.80
    // request utilization: 1 - 100/1000 = 0.90
    // utilization_5h = max of both = 0.90
    expect(info.utilization_5h).toBe(0.9);
  });

  test("sets throttled=true when utilization >= 0.90", () => {
    const headers = new Headers({
      "x-ratelimit-limit-tokens": "100000",
      "x-ratelimit-remaining-tokens": "5000",
      "x-ratelimit-limit-requests": "1000",
      "x-ratelimit-remaining-requests": "900",
    });

    const info = parseRateLimitHeaders(headers);
    // token utilization: 1 - 5000/100000 = 0.95
    expect(info.throttled).toBe(true);
  });

  test("sets throttled=false when utilization < 0.90", () => {
    const headers = new Headers({
      "x-ratelimit-limit-tokens": "100000",
      "x-ratelimit-remaining-tokens": "50000",
      "x-ratelimit-limit-requests": "1000",
      "x-ratelimit-remaining-requests": "800",
    });

    const info = parseRateLimitHeaders(headers);
    // token: 0.50, request: 0.20 -> max 0.50 < 0.90
    expect(info.throttled).toBe(false);
  });

  test("returns null when headers are missing", () => {
    const headers = new Headers({ "content-type": "application/json" });
    const info = parseRateLimitHeaders(headers);
    expect(info).toBeNull();
  });

  test("returns null when limit headers are zero (avoid division by zero)", () => {
    const headers = new Headers({
      "x-ratelimit-limit-tokens": "0",
      "x-ratelimit-remaining-tokens": "0",
      "x-ratelimit-limit-requests": "0",
      "x-ratelimit-remaining-requests": "0",
    });

    const info = parseRateLimitHeaders(headers);
    expect(info).toBeNull();
  });

  test("includes updated_at timestamp", () => {
    const headers = new Headers({
      "x-ratelimit-limit-tokens": "100000",
      "x-ratelimit-remaining-tokens": "80000",
      "x-ratelimit-limit-requests": "1000",
      "x-ratelimit-remaining-requests": "500",
    });

    const before = new Date().toISOString();
    const info = parseRateLimitHeaders(headers);
    const after = new Date().toISOString();

    expect(info!.updated_at).toBeTruthy();
    expect(info!.updated_at >= before).toBe(true);
    expect(info!.updated_at <= after).toBe(true);
  });
});

// ─── Cost Calculation ────────────────────────────────────────────────

describe("calculateCost", () => {
  test("claude-opus-4 pricing: $15/MTok input, $75/MTok output", () => {
    const cost = calculateCost("claude-opus-4-20250514", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(15 + 75, 2);
  });

  test("claude-sonnet-4 pricing: $3/MTok input, $15/MTok output", () => {
    const cost = calculateCost("claude-sonnet-4-20250514", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(3 + 15, 2);
  });

  test("claude-haiku-4 pricing: $0.80/MTok input, $4/MTok output", () => {
    const cost = calculateCost("claude-haiku-4-20250514", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.8 + 4, 2);
  });

  test("defaults to sonnet pricing for unknown model", () => {
    const cost = calculateCost("unknown-model", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(3 + 15, 2);
  });

  test("handles small token counts correctly", () => {
    // 5000 input + 2000 output at sonnet rates
    // input: 5000 * 3 / 1_000_000 = 0.015
    // output: 2000 * 15 / 1_000_000 = 0.030
    const cost = calculateCost("claude-sonnet-4-20250514", 5000, 2000);
    expect(cost).toBeCloseTo(0.045, 4);
  });

  test("handles zero tokens", () => {
    const cost = calculateCost("claude-sonnet-4-20250514", 0, 0);
    expect(cost).toBe(0);
  });

  test("matches model by prefix (opus-4)", () => {
    const cost = calculateCost("claude-opus-4", 100_000, 100_000);
    // input: 100k * 15 / 1M = 1.5; output: 100k * 75 / 1M = 7.5
    expect(cost).toBeCloseTo(9.0, 2);
  });
});

// ─── Usage Extraction from Response Body ─────────────────────────────

describe("extractUsageFromBody", () => {
  test("extracts input_tokens and output_tokens from valid response", () => {
    const body = {
      id: "msg_123",
      type: "message",
      usage: { input_tokens: 5000, output_tokens: 2000 },
    };
    const usage = extractUsageFromBody(body);
    expect(usage).toEqual({ input_tokens: 5000, output_tokens: 2000 });
  });

  test("returns null for body without usage", () => {
    const body = { id: "msg_123", type: "message" };
    const usage = extractUsageFromBody(body);
    expect(usage).toBeNull();
  });

  test("returns null for non-object body", () => {
    const usage = extractUsageFromBody(null);
    expect(usage).toBeNull();
  });

  test("returns null when usage fields are not numbers", () => {
    const body = { usage: { input_tokens: "five", output_tokens: "two" } };
    const usage = extractUsageFromBody(body);
    expect(usage).toBeNull();
  });
});

// ─── readRateLimit ───────────────────────────────────────────────────

describe("readRateLimit", () => {
  test("reads existing rate-limit.json", async () => {
    const data: RateLimitInfo = {
      tokens_remaining: 80000,
      tokens_limit: 100000,
      requests_remaining: 500,
      requests_limit: 1000,
      utilization_5h: 0.2,
      throttled: false,
      updated_at: new Date().toISOString(),
    };
    writeFileSync(".apex/rate-limit.json", JSON.stringify(data));

    const result = await readRateLimit();
    expect(result).toEqual(data);
  });

  test("returns null when file does not exist", async () => {
    const result = await readRateLimit();
    expect(result).toBeNull();
  });
});

// ─── readCostSummary ─────────────────────────────────────────────────

describe("readCostSummary", () => {
  test("aggregates cost entries by task_id", async () => {
    const entries: CostEntry[] = [
      { task_id: "T1", model: "claude-sonnet-4", input_tokens: 5000, output_tokens: 2000, cost_usd: 0.045, ts: "2025-01-01T00:00:00Z" },
      { task_id: "T1", model: "claude-sonnet-4", input_tokens: 3000, output_tokens: 1000, cost_usd: 0.024, ts: "2025-01-01T00:01:00Z" },
      { task_id: "T2", model: "claude-opus-4", input_tokens: 1000, output_tokens: 500, cost_usd: 0.0525, ts: "2025-01-01T00:02:00Z" },
    ];
    const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    writeFileSync(".apex/cost-log.jsonl", lines);

    const summary = await readCostSummary();
    expect(summary.by_task["T1"].total_cost_usd).toBeCloseTo(0.069, 4);
    expect(summary.by_task["T1"].total_input_tokens).toBe(8000);
    expect(summary.by_task["T1"].total_output_tokens).toBe(3000);
    expect(summary.by_task["T1"].request_count).toBe(2);

    expect(summary.by_task["T2"].total_cost_usd).toBeCloseTo(0.0525, 4);
    expect(summary.by_task["T2"].request_count).toBe(1);

    expect(summary.total_cost_usd).toBeCloseTo(0.1215, 4);
    expect(summary.total_requests).toBe(3);
  });

  test("returns empty summary when no cost log exists", async () => {
    const summary = await readCostSummary();
    expect(summary.total_cost_usd).toBe(0);
    expect(summary.total_requests).toBe(0);
    expect(Object.keys(summary.by_task)).toHaveLength(0);
  });

  test("skips malformed JSONL lines gracefully", async () => {
    const lines = [
      JSON.stringify({ task_id: "T1", model: "claude-sonnet-4", input_tokens: 1000, output_tokens: 500, cost_usd: 0.0105, ts: "2025-01-01T00:00:00Z" }),
      "this is not json",
      "",
      JSON.stringify({ task_id: "T1", model: "claude-sonnet-4", input_tokens: 2000, output_tokens: 1000, cost_usd: 0.021, ts: "2025-01-01T00:01:00Z" }),
    ].join("\n") + "\n";
    writeFileSync(".apex/cost-log.jsonl", lines);

    const summary = await readCostSummary();
    expect(summary.total_requests).toBe(2);
    expect(summary.by_task["T1"].total_cost_usd).toBeCloseTo(0.0315, 4);
  });
});
