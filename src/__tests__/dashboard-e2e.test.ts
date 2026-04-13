import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { spawn, type Subprocess } from "bun";

/**
 * E2E test: start a Dashboard server, write analytics data, and verify
 * the /api/state HTTP response includes orchestrator events.
 */

const TEST_PROJECT = ".test-e2e-project";
const APEX_DIR = join(TEST_PROJECT, ".apex");
const ANALYTICS_DIR = join(APEX_DIR, "analytics");
const PORT = 3599; // High port unlikely to conflict

let server: Subprocess | null = null;

function writeJSONL(filePath: string, records: any[]) {
  writeFileSync(filePath, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

beforeAll(async () => {
  // Create test project structure
  rmSync(TEST_PROJECT, { recursive: true, force: true });
  mkdirSync(ANALYTICS_DIR, { recursive: true });
  mkdirSync(join(APEX_DIR, "log"), { recursive: true });

  // Write test state files
  writeFileSync(join(APEX_DIR, "tasks.json"), JSON.stringify({ tasks: [], next_id: 1 }));
  writeFileSync(join(APEX_DIR, "state.json"), JSON.stringify({ current_stage: "idle", artifacts: {}, history: [] }));
  writeFileSync(join(APEX_DIR, "memory.json"), JSON.stringify({ facts: [], next_id: 1 }));

  // Write test analytics data
  writeJSONL(join(ANALYTICS_DIR, "orchestrator.jsonl"), [
    { task_id: "T1", run_key: "T1", adapter: "claude", outcome: "success", exit_code: 0, duration_s: 30, attempt: 1, ts: "2026-01-01T00:00:00Z" },
    { task_id: "T2", run_key: "T2:codex", adapter: "codex", outcome: "success", exit_code: 0, duration_s: 20, attempt: 1, ts: "2026-01-01T00:01:00Z" },
    { task_id: "T2", event: "cross_model_synthesis", agents: ["claude", "codex"], verdict: "pass", blocker_count: 0, concern_count: 1, note_count: 2, ts: "2026-01-01T00:02:00Z" },
  ]);

  writeJSONL(join(ANALYTICS_DIR, "usage.jsonl"), [
    { skill: "apex-forge", duration_s: 5, outcome: "success", ts: "2026-01-01T00:03:00Z" },
  ]);

  // Start dashboard as a standalone Bun HTTP server
  // We use a minimal inline script that imports buildStatePayload-like logic
  // to avoid the full dashboard CLI (which manages registry, hub, etc.)
  const testServer = `
    import { loadEvents } from "../src/utils/analytics.js";
    import { readFileSync, existsSync } from "fs";
    import { join } from "path";

    function readJSON(path, fallback) {
      try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return fallback; }
    }

    const projectDir = "${TEST_PROJECT}";
    const apexDir = join(projectDir, ".apex");

    Bun.serve({
      port: ${PORT},
      fetch(req) {
        const analytics = loadEvents(apexDir);
        const tasks = readJSON(join(apexDir, "tasks.json"), { tasks: [], next_id: 1 });
        const state = readJSON(join(apexDir, "state.json"), { current_stage: "idle", artifacts: {}, history: [] });
        const memory = readJSON(join(apexDir, "memory.json"), { facts: [], next_id: 1 });
        return Response.json({
          project: { name: "test-project", path: projectDir },
          tasks, state, memory, analytics,
        });
      },
    });
  `;
  writeFileSync(join(TEST_PROJECT, "server.ts"), testServer);

  server = spawn({
    cmd: ["bun", "run", join(TEST_PROJECT, "server.ts")],
    stdout: "pipe",
    stderr: "pipe",
  });

  // Wait for server to start
  for (let i = 0; i < 20; i++) {
    try {
      await fetch(`http://localhost:${PORT}/`);
      break;
    } catch {
      await Bun.sleep(200);
    }
  }
});

afterAll(() => {
  server?.kill();
  rmSync(TEST_PROJECT, { recursive: true, force: true });
});

describe("Dashboard E2E — /api/state", () => {
  test("returns analytics with orchestrator events", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/state`);
    expect(res.ok).toBe(true);

    const data = await res.json();
    const analytics = data.analytics;

    expect(analytics.length).toBeGreaterThanOrEqual(4);

    // Verify orchestrator events are present
    const orchEvents = analytics.filter((a: any) => a.source === "orchestrator");
    expect(orchEvents.length).toBe(3);

    // Verify telemetry events are present
    const telEvents = analytics.filter((a: any) => a.source === "telemetry");
    expect(telEvents.length).toBe(1);
  });

  test("analytics are sorted by timestamp", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/state`);
    const data = await res.json();

    const timestamps = data.analytics.map((a: any) => a.ts);
    const sorted = [...timestamps].sort();
    expect(timestamps).toEqual(sorted);
  });

  test("orchestrator agent completion has correct fields", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/state`);
    const data = await res.json();

    const claudeEvent = data.analytics.find((a: any) => a.skill === "claude");
    expect(claudeEvent).toBeDefined();
    expect(claudeEvent.outcome).toBe("success");
    expect(claudeEvent.duration_s).toBe(30);
    expect(claudeEvent.source).toBe("orchestrator");
    expect(claudeEvent.meta.task_id).toBe("T1");
  });

  test("cross-model synthesis has correct fields", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/state`);
    const data = await res.json();

    const synthesis = data.analytics.find((a: any) => a.skill === "cross-model-synthesis");
    expect(synthesis).toBeDefined();
    expect(synthesis.outcome).toBe("pass");
    expect(synthesis.meta.agents).toEqual(["claude", "codex"]);
    expect(synthesis.meta.blocker_count).toBe(0);
  });

  test("telemetry stats are computable from analytics", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/state`);
    const data = await res.json();
    const analytics = data.analytics;

    const totalRuns = analytics.length;
    const totalDur = analytics.reduce((s: number, a: any) => s + (a.duration_s || 0), 0);
    const successes = analytics.filter((a: any) => a.outcome === "success" || a.outcome === "pass").length;

    expect(totalRuns).toBe(4);
    expect(totalDur).toBe(55); // 30 + 20 + 0 + 5
    expect(successes).toBe(4); // all succeed
    expect(Math.round(successes / totalRuns * 100)).toBe(100);
  });
});
