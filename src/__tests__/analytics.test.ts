import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEvents, loadJSONL } from "../utils/analytics.js";

const TEST_DIR = ".test-apex";
const ANALYTICS_DIR = join(TEST_DIR, "analytics");

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(ANALYTICS_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function writeJSONL(filePath: string, records: any[]) {
  writeFileSync(
    filePath,
    `${records.map((r) => JSON.stringify(r)).join("\n")}\n`,
  );
}

// ─── loadJSONL ───────────────────────────────────────────────

describe("loadJSONL", () => {
  test("returns [] for missing file", () => {
    expect(loadJSONL(join(TEST_DIR, "nonexistent.jsonl"))).toEqual([]);
  });

  test("returns [] for empty file", () => {
    writeFileSync(join(TEST_DIR, "empty.jsonl"), "");
    expect(loadJSONL(join(TEST_DIR, "empty.jsonl"))).toEqual([]);
  });

  test("parses valid JSONL", () => {
    writeJSONL(join(TEST_DIR, "valid.jsonl"), [{ a: 1 }, { b: 2 }]);
    const result = loadJSONL(join(TEST_DIR, "valid.jsonl"));
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("skips malformed lines", () => {
    writeFileSync(
      join(TEST_DIR, "mixed.jsonl"),
      '{"good":true}\nNOT JSON\n{"also_good":true}\n',
    );
    const result = loadJSONL(join(TEST_DIR, "mixed.jsonl"));
    expect(result).toEqual([{ good: true }, { also_good: true }]);
  });

  test("handles trailing newlines", () => {
    writeFileSync(join(TEST_DIR, "trailing.jsonl"), '{"x":1}\n\n\n');
    expect(loadJSONL(join(TEST_DIR, "trailing.jsonl"))).toEqual([{ x: 1 }]);
  });
});

// ─── loadEvents: orchestrator source ─────────────────────────

describe("loadEvents — orchestrator source", () => {
  test("normalizes agent completion records", () => {
    writeJSONL(join(ANALYTICS_DIR, "orchestrator.jsonl"), [
      {
        task_id: "T1",
        run_key: "T1",
        adapter: "claude",
        outcome: "success",
        duration_s: 42,
        attempt: 1,
        ts: "2026-01-01T00:00:00Z",
      },
    ]);
    const events = loadEvents(TEST_DIR);
    expect(events).toHaveLength(1);
    expect(events[0].skill).toBe("claude");
    expect(events[0].outcome).toBe("success");
    expect(events[0].duration_s).toBe(42);
    expect(events[0].source).toBe("orchestrator");
    expect(events[0].meta.task_id).toBe("T1");
  });

  test("normalizes cross-model synthesis records", () => {
    writeJSONL(join(ANALYTICS_DIR, "orchestrator.jsonl"), [
      {
        task_id: "T2",
        event: "cross_model_synthesis",
        agents: ["claude", "codex"],
        verdict: "pass",
        blocker_count: 0,
        concern_count: 1,
        note_count: 3,
        ts: "2026-01-01T00:01:00Z",
      },
    ]);
    const events = loadEvents(TEST_DIR);
    expect(events).toHaveLength(1);
    expect(events[0].skill).toBe("cross-model-synthesis");
    expect(events[0].outcome).toBe("pass");
    expect(events[0].duration_s).toBe(0);
    expect(events[0].meta.agents).toEqual(["claude", "codex"]);
    expect(events[0].meta.blocker_count).toBe(0);
  });

  test("handles missing adapter field", () => {
    writeJSONL(join(ANALYTICS_DIR, "orchestrator.jsonl"), [
      { task_id: "T1", outcome: "success", ts: "2026-01-01T00:00:00Z" },
    ]);
    const events = loadEvents(TEST_DIR);
    expect(events[0].skill).toBe("unknown");
  });
});

// ─── loadEvents: telemetry (usage.jsonl) source ──────────────

describe("loadEvents — telemetry source", () => {
  test("normalizes usage records", () => {
    writeJSONL(join(ANALYTICS_DIR, "usage.jsonl"), [
      {
        skill: "apex-forge",
        duration_s: 10,
        outcome: "success",
        ts: "2026-01-01T00:00:00Z",
      },
    ]);
    const events = loadEvents(TEST_DIR);
    expect(events).toHaveLength(1);
    expect(events[0].skill).toBe("apex-forge");
    expect(events[0].source).toBe("telemetry");
    expect(events[0].duration_s).toBe(10);
  });

  test("handles legacy field names (timestamp, name, result, duration)", () => {
    writeJSONL(join(ANALYTICS_DIR, "usage.jsonl"), [
      {
        name: "old-skill",
        duration: 5,
        result: "error",
        timestamp: "2026-01-01T00:00:00Z",
      },
    ]);
    const events = loadEvents(TEST_DIR);
    expect(events[0].skill).toBe("old-skill");
    expect(events[0].outcome).toBe("error");
    expect(events[0].duration_s).toBe(5);
    expect(events[0].ts).toBe("2026-01-01T00:00:00Z");
  });
});

// ─── loadEvents: traces source ───────────────────────────────

describe("loadEvents — trace source", () => {
  test("includes completed spans only", () => {
    writeJSONL(join(ANALYTICS_DIR, "traces.jsonl"), [
      {
        trace_id: "t1",
        span_id: "s1",
        name: "execute",
        status: "ok",
        duration_ms: 1500,
        started_at: "2026-01-01T00:00:00Z",
        ended_at: "2026-01-01T00:00:01.500Z",
      },
      {
        trace_id: "t1",
        span_id: "s2",
        name: "review",
        status: "running",
        started_at: "2026-01-01T00:00:02Z",
      },
      {
        trace_id: "t1",
        span_id: "s3",
        name: "plan",
        status: "error",
        duration_ms: 300,
        started_at: "2026-01-01T00:00:03Z",
        ended_at: "2026-01-01T00:00:03.300Z",
      },
    ]);
    const events = loadEvents(TEST_DIR);
    // Only "ok" and "error" spans included, "running" filtered out
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.skill)).toEqual(["execute", "plan"]);
  });

  test("converts duration_ms to duration_s correctly", () => {
    writeJSONL(join(ANALYTICS_DIR, "traces.jsonl"), [
      {
        trace_id: "t1",
        span_id: "s1",
        name: "span",
        status: "ok",
        duration_ms: 1234,
        ended_at: "2026-01-01T00:00:01Z",
      },
    ]);
    const events = loadEvents(TEST_DIR);
    expect(events[0].duration_s).toBe(1.2); // Math.round(1234/100)/10
    expect(events[0].source).toBe("trace");
  });
});

// ─── loadEvents: hook source ─────────────────────────────────

describe("loadEvents — hook source", () => {
  test("normalizes hook events", () => {
    writeJSONL(join(TEST_DIR, "events.jsonl"), [
      {
        ts: "2026-01-01T00:00:00Z",
        tool: "Read",
        meta: { file: "/src/foo.ts" },
      },
    ]);
    const events = loadEvents(TEST_DIR);
    expect(events).toHaveLength(1);
    expect(events[0].skill).toBe("Read");
    expect(events[0].outcome).toBe("success");
    expect(events[0].source).toBe("hook");
    expect(events[0].meta.file).toBe("/src/foo.ts");
  });
});

// ─── loadEvents: merging & sorting ───────────────────────────

describe("loadEvents — merge behavior", () => {
  test("merges all four sources and sorts by timestamp", () => {
    writeJSONL(join(ANALYTICS_DIR, "orchestrator.jsonl"), [
      {
        adapter: "claude",
        outcome: "success",
        duration_s: 10,
        ts: "2026-01-01T00:00:03Z",
      },
    ]);
    writeJSONL(join(ANALYTICS_DIR, "usage.jsonl"), [
      {
        skill: "apex",
        outcome: "success",
        duration_s: 5,
        ts: "2026-01-01T00:00:01Z",
      },
    ]);
    writeJSONL(join(ANALYTICS_DIR, "traces.jsonl"), [
      {
        name: "span",
        status: "ok",
        duration_ms: 100,
        ended_at: "2026-01-01T00:00:04Z",
      },
    ]);
    writeJSONL(join(TEST_DIR, "events.jsonl"), [
      { ts: "2026-01-01T00:00:02Z", tool: "Bash" },
    ]);

    const events = loadEvents(TEST_DIR);
    expect(events).toHaveLength(4);
    // Verify chronological order
    expect(events[0].source).toBe("telemetry"); // 00:01
    expect(events[1].source).toBe("hook"); // 00:02
    expect(events[2].source).toBe("orchestrator"); // 00:03
    expect(events[3].source).toBe("trace"); // 00:04
  });

  test("caps at 200 most recent events", () => {
    const records = Array.from({ length: 250 }, (_, i) => ({
      adapter: "claude",
      outcome: "success",
      duration_s: 1,
      ts: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`,
    }));
    writeJSONL(join(ANALYTICS_DIR, "orchestrator.jsonl"), records);
    const events = loadEvents(TEST_DIR);
    expect(events).toHaveLength(200);
    // Should be the 200 most recent (i.e., last 200 by timestamp)
    expect(events[0].ts).toBe("2026-01-01T00:00:50Z"); // record #50
  });

  test("returns [] when all sources are missing", () => {
    expect(loadEvents(TEST_DIR)).toEqual([]);
  });

  test("handles partial sources (some missing, some present)", () => {
    writeJSONL(join(ANALYTICS_DIR, "orchestrator.jsonl"), [
      {
        adapter: "gemini",
        outcome: "failure",
        duration_s: 3,
        ts: "2026-01-01T00:00:00Z",
      },
    ]);
    // No usage.jsonl, no traces.jsonl, no events.jsonl
    const events = loadEvents(TEST_DIR);
    expect(events).toHaveLength(1);
    expect(events[0].skill).toBe("gemini");
  });
});
