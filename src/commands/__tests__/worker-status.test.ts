import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ── Helpers ────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(tmpdir(), `apex-worker-status-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeWorkerFile(dir: string, taskId: string, file: string, data: unknown): void {
  const wdir = join(dir, ".apex", "workers", taskId);
  mkdirSync(wdir, { recursive: true });
  writeFileSync(join(wdir, file), JSON.stringify(data, null, 2));
}

function makeMeta(taskId: string, agent = "claude", startedAt?: string) {
  return {
    task_id: taskId,
    window_handle: null,
    worktree_path: `.apex/worktrees/${taskId}`,
    branch: `apex/${taskId}`,
    started_at: startedAt ?? new Date().toISOString(),
    agent,
  };
}

// ── Setup / Teardown ──────────────────────────────────────────────

let tmpDir: string;
let origCwd: string;
let logSpy: ReturnType<typeof spyOn>;
let errorSpy: ReturnType<typeof spyOn>;
let exitSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  tmpDir = makeTmpDir();
  origCwd = process.cwd();
  process.chdir(tmpDir);
  mkdirSync(join(tmpDir, ".apex", "workers"), { recursive: true });

  logSpy = spyOn(console, "log").mockImplementation(() => {});
  errorSpy = spyOn(console, "error").mockImplementation(() => {});
  exitSpy = spyOn(process, "exit").mockImplementation((code?: number) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  process.chdir(origCwd);
  logSpy.mockRestore();
  errorSpy.mockRestore();
  exitSpy.mockRestore();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

// ── timeAgo ───────────────────────────────────────────────────────

describe("timeAgo", () => {
  test("returns 'just now' for recent timestamps", async () => {
    const { timeAgo } = await import("../worker.js");
    const now = new Date().toISOString();
    expect(timeAgo(now)).toBe("just now");
  });

  test("returns minutes for timestamps within the hour", async () => {
    const { timeAgo } = await import("../worker.js");
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(timeAgo(fiveMinAgo)).toBe("5 min ago");
  });

  test("returns hours for timestamps within the day", async () => {
    const { timeAgo } = await import("../worker.js");
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(twoHoursAgo)).toBe("2 hr ago");
  });

  test("returns days for older timestamps", async () => {
    const { timeAgo } = await import("../worker.js");
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(threeDaysAgo)).toBe("3 days ago");
  });

  test("returns '1 min ago' for 90 seconds", async () => {
    const { timeAgo } = await import("../worker.js");
    const ninetySecAgo = new Date(Date.now() - 90 * 1000).toISOString();
    expect(timeAgo(ninetySecAgo)).toBe("1 min ago");
  });
});

// ── list ──────────────────────────────────────────────────────────

describe("apex worker list", () => {
  test("prints table header and worker rows", async () => {
    // Set up a completed worker
    const started = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    writeWorkerFile(tmpDir, "T1", "meta.json", makeMeta("T1", "claude", started));
    writeWorkerFile(tmpDir, "T1", "status.json", {
      task_id: "T1", stage: "review", progress: "3/5", last_activity: new Date().toISOString(), errors: [],
    });
    writeWorkerFile(tmpDir, "T1", "result.json", {
      task_id: "T1", verdict: "pass", summary: "Done", findings: [], completed_at: new Date().toISOString(), branch: "apex/T1", commit: "abc",
    });

    const { cmdWorker } = await import("../worker.js");
    await cmdWorker(["list"]);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("ID");
    expect(output).toContain("Agent");
    expect(output).toContain("Stage");
    expect(output).toContain("Status");
    expect(output).toContain("T1");
    expect(output).toContain("claude");
    expect(output).toContain("review");
    expect(output).toContain("completed");
  });

  test("prints 'No workers' when none exist", async () => {
    // Empty workers dir already exists from beforeEach
    const { cmdWorker } = await import("../worker.js");
    await cmdWorker(["list"]);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("No workers");
  });

  test("shows CRASHED status for dead worker", async () => {
    writeWorkerFile(tmpDir, "T3", "meta.json", {
      ...makeMeta("T3", "gemini"),
      pid: 2147483647, // non-existent PID
    });

    const { cmdWorker } = await import("../worker.js");
    await cmdWorker(["list"]);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("T3");
    expect(output).toContain("CRASHED");
  });
});

// ── status ────────────────────────────────────────────────────────

describe("apex worker status", () => {
  test("prints detailed info for a valid worker", async () => {
    writeWorkerFile(tmpDir, "T1", "meta.json", makeMeta("T1", "claude"));
    writeWorkerFile(tmpDir, "T1", "status.json", {
      task_id: "T1", stage: "execute", progress: "3/5 subtasks done",
      last_activity: new Date().toISOString(), errors: [],
    });

    const { cmdWorker } = await import("../worker.js");
    await cmdWorker(["status", "T1"]);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("Worker T1");
    expect(output).toContain("claude");
    expect(output).toContain("execute");
    expect(output).toContain("3/5 subtasks done");
  });

  test("shows verdict and summary for completed worker", async () => {
    writeWorkerFile(tmpDir, "T1", "meta.json", makeMeta("T1", "claude"));
    writeWorkerFile(tmpDir, "T1", "result.json", {
      task_id: "T1", verdict: "pass", summary: "All tests green",
      findings: [], completed_at: new Date().toISOString(), branch: "apex/T1", commit: "abc",
    });

    const { cmdWorker } = await import("../worker.js");
    await cmdWorker(["status", "T1"]);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("pass");
    expect(output).toContain("All tests green");
  });

  test("exits with error for missing task-id argument", async () => {
    const { cmdWorker } = await import("../worker.js");
    try {
      await cmdWorker(["status"]);
    } catch (e: any) {
      expect(e.message).toContain("process.exit(1)");
    }
    const output = errorSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("Usage");
  });

  test("exits with error for non-existent worker", async () => {
    const { cmdWorker } = await import("../worker.js");
    try {
      await cmdWorker(["status", "T999"]);
    } catch (e: any) {
      expect(e.message).toContain("process.exit(1)");
    }
    const output = errorSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("T999");
  });
});

// ── report ────────────────────────────────────────────────────────

describe("apex worker report", () => {
  test("includes monitor report section", async () => {
    writeWorkerFile(tmpDir, "T1", "meta.json", {
      ...makeMeta("T1", "claude"),
      pid: undefined,
    });
    writeWorkerFile(tmpDir, "T1", "result.json", {
      task_id: "T1", verdict: "pass", summary: "OK",
      findings: [], completed_at: new Date().toISOString(), branch: "apex/T1", commit: "abc",
    });

    const { cmdWorker } = await import("../worker.js");
    await cmdWorker(["report"]);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("T1");
  });

  test("includes cost section header", async () => {
    const { cmdWorker } = await import("../worker.js");
    await cmdWorker(["report"]);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    // Should have cost section (even if empty)
    expect(output).toContain("Cost");
  });

  test("includes rate limit section header", async () => {
    const { cmdWorker } = await import("../worker.js");
    await cmdWorker(["report"]);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    // Should have rate limit section (even if no data)
    expect(output).toContain("Rate");
  });
});
