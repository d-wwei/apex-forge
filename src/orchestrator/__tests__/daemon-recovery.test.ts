import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDaemonState, discoverWorkers } from "../daemon.js";

describe("daemon recovery on startup", () => {
  let tmpDir: string;
  let origCwd: string;
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `apex-daemon-recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    origCwd = process.cwd();
    process.chdir(tmpDir);
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(origCwd);
    logSpy.mockRestore();
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  function writeWorkerFiles(taskId: string, opts: { meta?: any; result?: any; status?: any }) {
    const dir = join(tmpDir, ".apex", "workers", taskId);
    mkdirSync(dir, { recursive: true });
    if (opts.meta) {
      writeFileSync(join(dir, "meta.json"), JSON.stringify(opts.meta, null, 2));
    }
    if (opts.result) {
      writeFileSync(join(dir, "result.json"), JSON.stringify(opts.result, null, 2));
    }
    if (opts.status) {
      writeFileSync(join(dir, "status.json"), JSON.stringify(opts.status, null, 2));
    }
  }

  test("discoverWorkers picks up existing workers on fresh daemon start", async () => {
    writeWorkerFiles("T1", {
      meta: { task_id: "T1", window_handle: null, worktree_path: ".apex/worktrees/T1", branch: "apex/T1", started_at: new Date().toISOString(), agent: "claude" },
    });
    writeWorkerFiles("T2", {
      meta: { task_id: "T2", window_handle: null, worktree_path: ".apex/worktrees/T2", branch: "apex/T2", started_at: new Date().toISOString(), agent: "codex" },
    });

    const state = createDaemonState(tmpDir, null);
    await discoverWorkers(state);

    expect(state.workers.size).toBe(2);
    expect(state.workers.has("T1")).toBe(true);
    expect(state.workers.has("T2")).toBe(true);
  });

  test("discovered workers with result.json have resultChecked=false for tick to process", async () => {
    writeWorkerFiles("T3", {
      meta: { task_id: "T3", window_handle: null, worktree_path: ".apex/worktrees/T3", branch: "apex/T3", started_at: new Date().toISOString(), agent: "claude" },
      result: { verdict: "pass", summary: "All tests pass" },
    });

    const state = createDaemonState(tmpDir, null);
    await discoverWorkers(state);

    const worker = state.workers.get("T3");
    expect(worker).toBeDefined();
    expect(worker!.resultChecked).toBe(false);
  });

  test("discoverWorkers logs recovery of pre-existing workers", async () => {
    writeWorkerFiles("T4", {
      meta: { task_id: "T4", window_handle: { id: "@1", name: "T4-test" }, worktree_path: ".apex/worktrees/T4", branch: "apex/T4", started_at: new Date().toISOString(), agent: "gemini" },
      result: { verdict: "pass", summary: "Done" },
    });

    const state = createDaemonState(tmpDir, null);
    await discoverWorkers(state);

    // Should log recovery info
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("T4"));
  });

  test("discoverWorkers does not re-add already tracked workers", async () => {
    writeWorkerFiles("T5", {
      meta: { task_id: "T5", window_handle: null, worktree_path: ".apex/worktrees/T5", branch: "apex/T5", started_at: new Date().toISOString(), agent: "claude" },
    });

    const state = createDaemonState(tmpDir, null);
    await discoverWorkers(state);
    expect(state.workers.size).toBe(1);

    // Second call should not duplicate
    await discoverWorkers(state);
    expect(state.workers.size).toBe(1);
  });
});
