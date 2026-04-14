import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  listWorkers,
  checkWorkerHealth,
  getMonitorReport,
  type WorkerStatus,
  type WorkerResult,
  type WorkerMeta,
  type WorkerHealth,
  type WorkerInfo,
} from "../monitor.js";

let testDir: string;
let originalCwd: string;

// ── Helpers ────────────────────────────────────────────────────────

function writeWorkerFile(taskId: string, file: string, data: unknown): void {
  const dir = join(testDir, ".apex", "workers", taskId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), JSON.stringify(data, null, 2));
}

function makeMeta(taskId: string, overrides: Partial<WorkerMeta> = {}): WorkerMeta {
  return {
    task_id: taskId,
    pid: 99999,
    window_handle: { id: "surf-1", name: `${taskId}-slug`, adapter: "cmux" },
    worktree_path: `.apex/worktrees/${taskId}`,
    branch: `apex/${taskId}`,
    started_at: new Date().toISOString(),
    agent: "claude",
    ...overrides,
  };
}

function makeStatus(overrides: Partial<WorkerStatus> = {}): WorkerStatus {
  return {
    task_id: "T1",
    stage: "implement",
    progress: "3/5 tests passing",
    last_activity: new Date().toISOString(),
    errors: [],
    ...overrides,
  };
}

function makeResult(overrides: Partial<WorkerResult> = {}): WorkerResult {
  return {
    task_id: "T1",
    verdict: "pass",
    summary: "All tests passing",
    findings: ["Implemented auth module", "Added 5 tests"],
    completed_at: new Date().toISOString(),
    branch: "apex/T1",
    commit: "abc1234",
    ...overrides,
  };
}

// ── Setup / Teardown ───────────────────────────────────────────────

beforeEach(() => {
  originalCwd = process.cwd();
  testDir = join(tmpdir(), `apex-test-monitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(testDir, { recursive: true });
  process.chdir(testDir);
  mkdirSync(".apex/workers", { recursive: true });
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

// ─── listWorkers ───────────────────────────────────────────────────

describe("listWorkers", () => {
  test("returns empty array when no workers exist", async () => {
    const workers = await listWorkers();
    expect(workers).toEqual([]);
  });

  test("returns workers with meta only", async () => {
    const meta = makeMeta("T1");
    writeWorkerFile("T1", "meta.json", meta);

    const workers = await listWorkers();
    expect(workers).toHaveLength(1);
    expect(workers[0].meta.task_id).toBe("T1");
    expect(workers[0].status).toBeNull();
    expect(workers[0].result).toBeNull();
  });

  test("returns workers with meta + status", async () => {
    writeWorkerFile("T1", "meta.json", makeMeta("T1"));
    writeWorkerFile("T1", "status.json", makeStatus({ task_id: "T1" }));

    const workers = await listWorkers();
    expect(workers).toHaveLength(1);
    expect(workers[0].status).not.toBeNull();
    expect(workers[0].status!.stage).toBe("implement");
  });

  test("returns workers with meta + status + result", async () => {
    writeWorkerFile("T1", "meta.json", makeMeta("T1"));
    writeWorkerFile("T1", "status.json", makeStatus({ task_id: "T1" }));
    writeWorkerFile("T1", "result.json", makeResult({ task_id: "T1" }));

    const workers = await listWorkers();
    expect(workers).toHaveLength(1);
    expect(workers[0].result).not.toBeNull();
    expect(workers[0].result!.verdict).toBe("pass");
  });

  test("returns multiple workers", async () => {
    writeWorkerFile("T1", "meta.json", makeMeta("T1"));
    writeWorkerFile("T2", "meta.json", makeMeta("T2"));
    writeWorkerFile("T3", "meta.json", makeMeta("T3"));

    const workers = await listWorkers();
    expect(workers).toHaveLength(3);
    const ids = workers.map((w) => w.meta.task_id).sort();
    expect(ids).toEqual(["T1", "T2", "T3"]);
  });

  test("skips directories without meta.json", async () => {
    writeWorkerFile("T1", "meta.json", makeMeta("T1"));
    // T2 directory exists but has no meta.json
    mkdirSync(join(testDir, ".apex", "workers", "T2"), { recursive: true });
    writeFileSync(join(testDir, ".apex", "workers", "T2", "notes.txt"), "not meta");

    const workers = await listWorkers();
    expect(workers).toHaveLength(1);
    expect(workers[0].meta.task_id).toBe("T1");
  });
});

// ─── checkWorkerHealth ─────────────────────────────────────────────

describe("checkWorkerHealth", () => {
  test("returns completed when result.json exists with pass verdict", async () => {
    writeWorkerFile("T1", "meta.json", makeMeta("T1"));
    writeWorkerFile("T1", "status.json", makeStatus({ task_id: "T1" }));
    writeWorkerFile("T1", "result.json", makeResult({ task_id: "T1", verdict: "pass" }));

    const health = await checkWorkerHealth("T1");
    expect(health.completed).toBe(true);
  });

  test("returns completed when result.json exists with fail verdict", async () => {
    writeWorkerFile("T1", "meta.json", makeMeta("T1"));
    writeWorkerFile("T1", "result.json", makeResult({ task_id: "T1", verdict: "fail" }));

    const health = await checkWorkerHealth("T1");
    expect(health.completed).toBe(true);
  });

  test("detects stale worker when last_activity is old", async () => {
    const oldTime = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago
    writeWorkerFile("T1", "meta.json", makeMeta("T1", { pid: undefined, window_handle: null }));
    writeWorkerFile("T1", "status.json", makeStatus({ task_id: "T1", last_activity: oldTime }));

    const health = await checkWorkerHealth("T1");
    expect(health.stale).toBe(true);
  });

  test("not stale when last_activity is recent", async () => {
    writeWorkerFile("T1", "meta.json", makeMeta("T1", { pid: undefined, window_handle: null }));
    writeWorkerFile("T1", "status.json", makeStatus({ task_id: "T1", last_activity: new Date().toISOString() }));

    const health = await checkWorkerHealth("T1");
    expect(health.stale).toBe(false);
  });

  test("crashed when PID is dead and no result", async () => {
    // PID 2147483647 should not exist
    writeWorkerFile("T1", "meta.json", makeMeta("T1", { pid: 2147483647, window_handle: null }));

    const health = await checkWorkerHealth("T1");
    // No result.json + dead PID = crashed
    expect(health.crashed).toBe(true);
    expect(health.alive).toBe(false);
  });

  test("not crashed when no PID and no window_handle (ambiguous, defaults not crashed)", async () => {
    writeWorkerFile("T1", "meta.json", makeMeta("T1", { pid: undefined, window_handle: null }));
    writeWorkerFile("T1", "status.json", makeStatus({ task_id: "T1" }));

    const health = await checkWorkerHealth("T1");
    // No signals to determine alive/crashed -- not crashed if we can't tell
    expect(health.alive).toBe(false);
    expect(health.crashed).toBe(false);
  });

  test("throws when worker does not exist", async () => {
    await expect(checkWorkerHealth("NONEXISTENT")).rejects.toThrow();
  });
});

// ─── getMonitorReport ──────────────────────────────────────────────

describe("getMonitorReport", () => {
  test("returns 'no workers' message when empty", async () => {
    const report = await getMonitorReport();
    expect(report).toContain("No workers");
  });

  test("shows completed pass status", async () => {
    writeWorkerFile("T1", "meta.json", makeMeta("T1", { pid: undefined, window_handle: null }));
    writeWorkerFile("T1", "status.json", makeStatus({ task_id: "T1", stage: "done" }));
    writeWorkerFile("T1", "result.json", makeResult({ task_id: "T1", verdict: "pass" }));

    const report = await getMonitorReport();
    expect(report).toContain("T1");
    expect(report).toContain("pass");
  });

  test("shows completed fail status", async () => {
    writeWorkerFile("T1", "meta.json", makeMeta("T1", { pid: undefined, window_handle: null }));
    writeWorkerFile("T1", "result.json", makeResult({ task_id: "T1", verdict: "fail" }));

    const report = await getMonitorReport();
    expect(report).toContain("T1");
    expect(report).toContain("fail");
  });

  test("shows CRASHED status for dead worker", async () => {
    writeWorkerFile("T1", "meta.json", makeMeta("T1", { pid: 2147483647, window_handle: null }));

    const report = await getMonitorReport();
    expect(report).toContain("T1");
    expect(report).toContain("CRASHED");
  });

  test("shows STALE status for inactive worker", async () => {
    const oldTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    writeWorkerFile("T1", "meta.json", makeMeta("T1", { pid: undefined, window_handle: null }));
    writeWorkerFile("T1", "status.json", makeStatus({ task_id: "T1", last_activity: oldTime }));

    const report = await getMonitorReport();
    expect(report).toContain("T1");
    expect(report).toContain("STALE");
  });

  test("shows multiple workers", async () => {
    writeWorkerFile("T1", "meta.json", makeMeta("T1", { pid: undefined, window_handle: null }));
    writeWorkerFile("T1", "result.json", makeResult({ task_id: "T1", verdict: "pass" }));

    writeWorkerFile("T2", "meta.json", makeMeta("T2", { pid: 2147483647, window_handle: null }));

    const report = await getMonitorReport();
    expect(report).toContain("T1");
    expect(report).toContain("T2");
  });

  test("includes stage and progress when available", async () => {
    writeWorkerFile("T1", "meta.json", makeMeta("T1", { pid: undefined, window_handle: null }));
    writeWorkerFile("T1", "status.json", makeStatus({ task_id: "T1", stage: "implement", progress: "3/5 tests passing" }));

    const report = await getMonitorReport();
    expect(report).toContain("implement");
    expect(report).toContain("3/5 tests passing");
  });
});
