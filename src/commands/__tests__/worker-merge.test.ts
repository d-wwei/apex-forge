import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

// --- Test helpers ---

function makeTmpDir(): string {
  const dir = join(tmpdir(), `apex-merge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJSON(path: string, data: unknown) {
  const dir = join(path, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function setupWorker(dir: string, taskId: string, opts: { verdict?: string; summary?: string; dirty?: boolean }) {
  const workersDir = join(dir, ".apex", "workers", taskId);
  mkdirSync(workersDir, { recursive: true });

  // meta.json
  writeJSON(join(workersDir, "meta.json"), {
    task_id: taskId,
    window_handle: null,
    worktree_path: `.apex/worktrees/${taskId}`,
    branch: `apex/${taskId}`,
    started_at: "2026-01-01T00:00:00Z",
    agent: "claude",
  });

  // result.json (only if verdict provided)
  if (opts.verdict !== undefined) {
    writeJSON(join(workersDir, "result.json"), {
      verdict: opts.verdict,
      summary: opts.summary ?? "test summary",
    });
  }

  // Create worktree directory (simulated — not a real git worktree)
  const wtPath = join(dir, ".apex", "worktrees", taskId);
  mkdirSync(wtPath, { recursive: true });

  // If dirty, put an uncommitted file marker
  if (opts.dirty) {
    writeFileSync(join(wtPath, "dirty-file.txt"), "uncommitted");
  }
}

function writeTasksJson(dir: string, tasks: any[]) {
  const apexDir = join(dir, ".apex");
  mkdirSync(apexDir, { recursive: true });
  writeFileSync(
    join(apexDir, "tasks.json"),
    JSON.stringify({ tasks, next_id: tasks.length + 1 }, null, 2),
  );
}

// --- Tests ---

describe("worker merge", () => {
  let tmpDir: string;
  let origCwd: string;
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;
  let exitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    origCwd = process.cwd();
    process.chdir(tmpDir);

    // Initialize as git repo
    spawnSync("git", ["init"], { cwd: tmpDir });
    spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: tmpDir });

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
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // --- merge: refuses if no result.json ---

  test("merge refuses if no result.json", async () => {
    writeTasksJson(tmpDir, []);
    // Create meta but no result
    const workersDir = join(tmpDir, ".apex", "workers", "T1");
    mkdirSync(workersDir, { recursive: true });
    writeFileSync(
      join(workersDir, "meta.json"),
      JSON.stringify({ task_id: "T1", branch: "apex/T1", worktree_path: ".apex/worktrees/T1" }),
    );

    const { cmdMerge } = await import("../worker.js");
    try {
      await cmdMerge(["T1"]);
    } catch (e: any) {
      expect(e.message).toContain("process.exit(1)");
    }
    const output = errorSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("No result.json");
  });

  // --- merge: refuses if verdict !== "pass" ---

  test("merge refuses if verdict is not pass", async () => {
    writeTasksJson(tmpDir, [{ id: "T2", title: "Failing task", depends_on: [], status: "done" }]);
    setupWorker(tmpDir, "T2", { verdict: "fail" });

    const { cmdMerge } = await import("../worker.js");
    try {
      await cmdMerge(["T2"]);
    } catch (e: any) {
      expect(e.message).toContain("process.exit(1)");
    }
    const output = errorSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("verdict is 'fail'");
  });

  // --- merge: refuses if uncommitted changes ---

  test("merge refuses if worktree has uncommitted changes", async () => {
    writeTasksJson(tmpDir, [{ id: "T3", title: "Dirty task", depends_on: [], status: "done" }]);

    // Set up a real git worktree so `git status --porcelain` works
    const branch = "apex/T3";
    spawnSync("git", ["worktree", "add", ".apex/worktrees/T3", "-b", branch], { cwd: tmpDir });

    // Write an untracked file into the worktree
    const wtPath = join(tmpDir, ".apex", "worktrees", "T3");
    writeFileSync(join(wtPath, "dirty.txt"), "uncommitted");

    // Set up worker meta + passing result
    const workersDir = join(tmpDir, ".apex", "workers", "T3");
    mkdirSync(workersDir, { recursive: true });
    writeFileSync(
      join(workersDir, "meta.json"),
      JSON.stringify({
        task_id: "T3",
        branch,
        worktree_path: ".apex/worktrees/T3",
        started_at: "2026-01-01T00:00:00Z",
        agent: "claude",
      }),
    );
    writeFileSync(join(workersDir, "result.json"), JSON.stringify({ verdict: "pass" }));

    const { cmdMerge } = await import("../worker.js");
    try {
      await cmdMerge(["T3"]);
    } catch (e: any) {
      expect(e.message).toContain("process.exit(1)");
    }
    const output = errorSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("uncommitted changes");
  });

  // --- strategy flag parsing ---

  test("parseStrategy returns local by default", async () => {
    // Test indirectly via cmdMerge with no --strategy flag — it should attempt merge with "local"
    // We verify by checking the success message mentions 'local'
    writeTasksJson(tmpDir, [{ id: "T4", title: "Good task", depends_on: [], status: "done" }]);

    // Create a real branch with a commit so merge can succeed
    const branch = "apex/T4";
    spawnSync("git", ["worktree", "add", ".apex/worktrees/T4", "-b", branch], { cwd: tmpDir });
    const wtPath = join(tmpDir, ".apex", "worktrees", "T4");
    writeFileSync(join(wtPath, "feature.txt"), "new feature");
    spawnSync("git", ["-C", wtPath, "add", "feature.txt"]);
    spawnSync("git", ["-C", wtPath, "commit", "-m", "add feature"]);

    const workersDir = join(tmpDir, ".apex", "workers", "T4");
    mkdirSync(workersDir, { recursive: true });
    writeFileSync(
      join(workersDir, "meta.json"),
      JSON.stringify({ task_id: "T4", branch, worktree_path: ".apex/worktrees/T4" }),
    );
    writeFileSync(join(workersDir, "result.json"), JSON.stringify({ verdict: "pass" }));

    const { cmdMerge } = await import("../worker.js");
    await cmdMerge(["T4"]);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("strategy 'local'");
  });

  test("parseStrategy parses --strategy squash", async () => {
    writeTasksJson(tmpDir, [{ id: "T5", title: "Squash task", depends_on: [], status: "done" }]);

    const branch = "apex/T5";
    spawnSync("git", ["worktree", "add", ".apex/worktrees/T5", "-b", branch], { cwd: tmpDir });
    const wtPath = join(tmpDir, ".apex", "worktrees", "T5");
    writeFileSync(join(wtPath, "feature.txt"), "squash feature");
    spawnSync("git", ["-C", wtPath, "add", "feature.txt"]);
    spawnSync("git", ["-C", wtPath, "commit", "-m", "add squash feature"]);

    const workersDir = join(tmpDir, ".apex", "workers", "T5");
    mkdirSync(workersDir, { recursive: true });
    writeFileSync(
      join(workersDir, "meta.json"),
      JSON.stringify({ task_id: "T5", branch, worktree_path: ".apex/worktrees/T5" }),
    );
    writeFileSync(join(workersDir, "result.json"), JSON.stringify({ verdict: "pass" }));

    const { cmdMerge } = await import("../worker.js");
    await cmdMerge(["T5", "--strategy", "squash"]);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("strategy 'squash'");
  });
});

// --- topoSort ---

describe("topoSort", () => {
  test("sorts tasks with no deps first", async () => {
    const { topoSort } = await import("../worker.js");

    const tasks = [
      { id: "T1", title: "A", depends_on: ["T2"], status: "done" as const },
      { id: "T2", title: "B", depends_on: [], status: "done" as const },
      { id: "T3", title: "C", depends_on: ["T1"], status: "done" as const },
    ] as any[];

    const result = topoSort(["T1", "T2", "T3"], tasks);
    // T2 has no deps -> first. T1 depends on T2 -> second. T3 depends on T1 -> third.
    expect(result).toEqual(["T2", "T1", "T3"]);
  });

  test("handles independent tasks (no deps)", async () => {
    const { topoSort } = await import("../worker.js");

    const tasks = [
      { id: "T1", title: "A", depends_on: [], status: "done" as const },
      { id: "T2", title: "B", depends_on: [], status: "done" as const },
    ] as any[];

    const result = topoSort(["T1", "T2"], tasks);
    // Both independent — input order preserved
    expect(result).toEqual(["T1", "T2"]);
  });

  test("only includes relevant task IDs", async () => {
    const { topoSort } = await import("../worker.js");

    const tasks = [
      { id: "T1", title: "A", depends_on: ["T2"], status: "done" as const },
      { id: "T2", title: "B", depends_on: [], status: "done" as const },
      { id: "T3", title: "C", depends_on: [], status: "done" as const },
    ] as any[];

    // Only merge T1 and T3, not T2
    const result = topoSort(["T1", "T3"], tasks);
    // T2 is not in the set, so T1's dep on T2 is a no-op. Both T1 and T3 are independent here.
    expect(result).toEqual(["T1", "T3"]);
  });

  test("diamond dependency is handled", async () => {
    const { topoSort } = await import("../worker.js");

    const tasks = [
      { id: "T1", title: "Base", depends_on: [], status: "done" as const },
      { id: "T2", title: "Left", depends_on: ["T1"], status: "done" as const },
      { id: "T3", title: "Right", depends_on: ["T1"], status: "done" as const },
      { id: "T4", title: "Top", depends_on: ["T2", "T3"], status: "done" as const },
    ] as any[];

    const result = topoSort(["T1", "T2", "T3", "T4"], tasks);
    // T1 must come before T2 and T3, which must come before T4
    expect(result.indexOf("T1")).toBeLessThan(result.indexOf("T2"));
    expect(result.indexOf("T1")).toBeLessThan(result.indexOf("T3"));
    expect(result.indexOf("T2")).toBeLessThan(result.indexOf("T4"));
    expect(result.indexOf("T3")).toBeLessThan(result.indexOf("T4"));
  });
});

// --- help includes merge ---

describe("help text includes merge commands", () => {
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  test("help text mentions merge and merge-all", async () => {
    const { cmdWorker } = await import("../worker.js");
    try {
      await cmdWorker(["help"]);
    } catch {}
    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(output).toContain("merge <task-id>");
    expect(output).toContain("merge-all");
    expect(output).toContain("--strategy");
  });
});
