import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  formatCostReport,
  checkBudget,
  formatRateLimitStatus,
  formatTokens,
} from "../cost.js";
import type { CostSummary, RateLimitInfo } from "../proxy.js";

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  testDir = join(tmpdir(), `apex-test-cost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(testDir, { recursive: true });
  process.chdir(testDir);
  mkdirSync(".apex", { recursive: true });
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

// ─── formatTokens ───────────────────────────────────────────────────

describe("formatTokens", () => {
  test("formats thousands with k suffix", () => {
    expect(formatTokens(120000)).toBe("120k");
  });

  test("formats fractional thousands", () => {
    expect(formatTokens(35500)).toBe("35.5k");
  });

  test("formats small counts without suffix", () => {
    expect(formatTokens(500)).toBe("500");
  });

  test("formats zero", () => {
    expect(formatTokens(0)).toBe("0");
  });

  test("formats exact thousand", () => {
    expect(formatTokens(1000)).toBe("1k");
  });

  test("rounds to one decimal", () => {
    expect(formatTokens(1234)).toBe("1.2k");
  });
});

// ─── formatCostReport ───────────────────────────────────────────────

describe("formatCostReport", () => {
  const summary: CostSummary = {
    total_cost_usd: 0.73,
    total_requests: 20,
    by_task: {
      T1: { total_cost_usd: 0.45, total_input_tokens: 120000, total_output_tokens: 35000, request_count: 12 },
      T2: { total_cost_usd: 0.28, total_input_tokens: 80000, total_output_tokens: 20000, request_count: 8 },
    },
  };

  test("formats basic cost report without budget", () => {
    const report = formatCostReport(summary);
    expect(report).toContain("T1");
    expect(report).toContain("$0.45");
    expect(report).toContain("120k");
    expect(report).toContain("35k");
    expect(report).toContain("12 calls");
    expect(report).toContain("T2");
    expect(report).toContain("$0.28");
    expect(report).toContain("$0.73");
    expect(report).not.toContain("Budget");
  });

  test("includes task titles from tasks.json when available", () => {
    const tasks = {
      tasks: [
        { id: "T1", title: "auth-api", status: "done", depends_on: [], blocked_by: [], evidence: [], created_at: "", updated_at: "" },
        { id: "T2", title: "pagination", status: "done", depends_on: [], blocked_by: [], evidence: [], created_at: "", updated_at: "" },
      ],
      next_id: 3,
    };
    writeFileSync(".apex/tasks.json", JSON.stringify(tasks));

    const report = formatCostReport(summary);
    expect(report).toContain("auth-api");
    expect(report).toContain("pagination");
  });

  test("formats report with budget info", () => {
    const report = formatCostReport(summary, 5.0);
    expect(report).toContain("Budget");
    expect(report).toContain("$5.00");
    expect(report).toContain("$0.73");
    expect(report).toContain("Remaining");
  });

  test("handles empty summary", () => {
    const empty: CostSummary = { total_cost_usd: 0, total_requests: 0, by_task: {} };
    const report = formatCostReport(empty);
    expect(report).toContain("$0.00");
  });
});

// ─── checkBudget ────────────────────────────────────────────────────

describe("checkBudget", () => {
  test("returns ok when no budget set", async () => {
    const result = await checkBudget({});
    expect(result.status).toBe("ok");
  });

  test("returns ok when under warning threshold", async () => {
    // Write cost log with $0.50 total
    const entries = [
      JSON.stringify({ task_id: "T1", model: "claude-sonnet-4", input_tokens: 1000, output_tokens: 500, cost_usd: 0.50, ts: "2025-01-01T00:00:00Z" }),
    ];
    writeFileSync(".apex/cost-log.jsonl", entries.join("\n") + "\n");

    const result = await checkBudget({ budget_usd: 5.0 });
    expect(result.status).toBe("ok");
    expect(result.used).toBeCloseTo(0.50, 2);
    expect(result.budget).toBe(5.0);
  });

  test("returns warn when usage exceeds warning threshold", async () => {
    const entries = [
      JSON.stringify({ task_id: "T1", model: "claude-sonnet-4", input_tokens: 1000, output_tokens: 500, cost_usd: 4.20, ts: "2025-01-01T00:00:00Z" }),
    ];
    writeFileSync(".apex/cost-log.jsonl", entries.join("\n") + "\n");

    // 4.20 / 5.00 = 0.84 >= 0.80 default threshold
    const result = await checkBudget({ budget_usd: 5.0 });
    expect(result.status).toBe("warn");
  });

  test("returns exceeded when usage meets budget", async () => {
    const entries = [
      JSON.stringify({ task_id: "T1", model: "claude-sonnet-4", input_tokens: 1000, output_tokens: 500, cost_usd: 5.00, ts: "2025-01-01T00:00:00Z" }),
    ];
    writeFileSync(".apex/cost-log.jsonl", entries.join("\n") + "\n");

    const result = await checkBudget({ budget_usd: 5.0 });
    expect(result.status).toBe("exceeded");
  });

  test("respects custom warning threshold", async () => {
    const entries = [
      JSON.stringify({ task_id: "T1", model: "claude-sonnet-4", input_tokens: 1000, output_tokens: 500, cost_usd: 3.00, ts: "2025-01-01T00:00:00Z" }),
    ];
    writeFileSync(".apex/cost-log.jsonl", entries.join("\n") + "\n");

    // 3.00 / 5.00 = 0.60, below 0.80 but above 0.50
    const resultDefault = await checkBudget({ budget_usd: 5.0 });
    expect(resultDefault.status).toBe("ok");

    const resultCustom = await checkBudget({ budget_usd: 5.0, budget_warn: 0.50 });
    expect(resultCustom.status).toBe("warn");
  });

  test("exceeded takes priority over warn", async () => {
    const entries = [
      JSON.stringify({ task_id: "T1", model: "claude-sonnet-4", input_tokens: 1000, output_tokens: 500, cost_usd: 6.00, ts: "2025-01-01T00:00:00Z" }),
    ];
    writeFileSync(".apex/cost-log.jsonl", entries.join("\n") + "\n");

    const result = await checkBudget({ budget_usd: 5.0 });
    expect(result.status).toBe("exceeded");
  });
});

// ─── formatRateLimitStatus ──────────────────────────────────────────

describe("formatRateLimitStatus", () => {
  test("formats rate limit info", () => {
    const info: RateLimitInfo = {
      tokens_remaining: 80000,
      tokens_limit: 100000,
      requests_remaining: 500,
      requests_limit: 1000,
      utilization_5h: 0.5,
      throttled: false,
      updated_at: "2025-01-01T00:00:00Z",
    };

    const output = formatRateLimitStatus(info);
    expect(output).toContain("80,000");
    expect(output).toContain("100,000");
    expect(output).toContain("80%");
    expect(output).toContain("500");
    expect(output).toContain("1,000");
    expect(output).toContain("50%");
    expect(output).toContain("OK");
    expect(output).not.toContain("THROTTLED");
  });

  test("shows throttled warning", () => {
    const info: RateLimitInfo = {
      tokens_remaining: 5000,
      tokens_limit: 100000,
      requests_remaining: 50,
      requests_limit: 1000,
      utilization_5h: 0.95,
      throttled: true,
      updated_at: "2025-01-01T00:00:00Z",
    };

    const output = formatRateLimitStatus(info);
    expect(output).toContain("THROTTLED");
  });

  test("returns message when null", () => {
    const output = formatRateLimitStatus(null);
    expect(output).toContain("No rate limit data");
  });
});
