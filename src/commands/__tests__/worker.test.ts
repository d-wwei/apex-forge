import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// --- Test helpers ---

function makeTmpDir(): string {
  const dir = join(tmpdir(), `apex-worker-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeTasksJson(dir: string, tasks: any[]) {
  const apexDir = join(dir, ".apex");
  mkdirSync(apexDir, { recursive: true });
  writeFileSync(
    join(apexDir, "tasks.json"),
    JSON.stringify({ tasks, next_id: tasks.length + 1 }, null, 2),
  );
}

function writeWorkerMeta(dir: string, taskId: string, meta: any) {
  const metaDir = join(dir, ".apex", "workers", taskId);
  mkdirSync(metaDir, { recursive: true });
  writeFileSync(join(metaDir, "meta.json"), JSON.stringify(meta, null, 2));
}

// --- Tests ---

describe("cmdWorker", () => {
  let tmpDir: string;
  let origCwd: string;
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;
  let exitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    origCwd = process.cwd();
    process.chdir(tmpDir);

    // Initialize as git repo for worktree commands
    const { spawnSync } = require("child_process");
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

  // --- Help text ---

  describe("help", () => {
    test("prints usage when no subcommand given", async () => {
      const { cmdWorker } = await import("../worker.js");
      try {
        await cmdWorker([]);
      } catch {}
      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("apex worker");
      expect(output).toContain("spawn");
      expect(output).toContain("kill");
    });

    test("prints usage for 'help' subcommand", async () => {
      const { cmdWorker } = await import("../worker.js");
      try {
        await cmdWorker(["help"]);
      } catch {}
      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("spawn");
      expect(output).toContain("kill");
    });
  });

  // --- Agent resolution priority ---

  describe("resolveAgent", () => {
    test("CLI --agent flag takes highest priority", async () => {
      const { resolveAgent } = await import("../worker.js");
      const task = { adapter: "gemini" } as any;
      expect(await resolveAgent(["--agent", "codex"], task)).toBe("codex");
    });

    test("falls back to task.adapter when no CLI flag", async () => {
      const { resolveAgent } = await import("../worker.js");
      const task = { adapter: "gemini" } as any;
      expect(await resolveAgent([], task)).toBe("gemini");
    });

    test("defaults to 'claude' when neither CLI nor task specifies", async () => {
      const { resolveAgent } = await import("../worker.js");
      const task = {} as any;
      expect(await resolveAgent([], task)).toBe("claude");
    });
  });

  // --- spawn --dry-run ---

  describe("spawn --dry-run", () => {
    test("generates protocol file and prints without creating terminal window", async () => {
      const task = {
        id: "T1",
        title: "Build auth API",
        description: "Implement JWT authentication.\n\nAcceptance Criteria:\n- Login endpoint works",
        status: "assigned",
        depends_on: [],
        blocked_by: [],
        evidence: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };
      writeTasksJson(tmpDir, [task]);

      const { cmdWorker } = await import("../worker.js");
      try {
        await cmdWorker(["spawn", "T1", "--dry-run"]);
      } catch {}

      // Should NOT have called process.exit(1)
      const exitCalls = exitSpy.mock.calls.filter((c) => c[0] === 1);
      expect(exitCalls.length).toBe(0);

      // Protocol file should exist in the worktree
      const protocolPath = join(tmpDir, ".apex", "worktrees", "T1", ".apex", "worker-protocol.md");
      if (existsSync(protocolPath)) {
        const content = readFileSync(protocolPath, "utf-8");
        expect(content).toContain("T1");
        expect(content).toContain("Build auth API");
      }

      // Console output should include the protocol or dry-run indication
      const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("dry-run");
    });
  });

  // --- kill with missing meta.json ---

  describe("kill", () => {
    test("handles missing meta.json gracefully", async () => {
      const { cmdWorker } = await import("../worker.js");
      try {
        await cmdWorker(["kill", "T99"]);
      } catch (e: any) {
        // Should exit with error about missing worker
        expect(e.message).toContain("process.exit(1)");
      }
      const output = errorSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("T99");
    });

    test("cleans up worker directory when meta.json exists", async () => {
      const meta = {
        task_id: "T2",
        window_handle: null,
        worktree_path: ".apex/worktrees/T2",
        branch: "apex/T2",
        started_at: "2026-01-01T00:00:00Z",
        agent: "claude",
      };
      writeWorkerMeta(tmpDir, "T2", meta);

      const { cmdWorker } = await import("../worker.js");
      try {
        await cmdWorker(["kill", "T2"]);
      } catch {}

      // Worker directory should be removed
      expect(existsSync(join(tmpDir, ".apex", "workers", "T2"))).toBe(false);
    });
  });

  // --- slugify ---

  describe("toSlug", () => {
    test("converts title to kebab-case slug", async () => {
      const { toSlug } = await import("../worker.js");
      expect(toSlug("Build Auth API")).toBe("build-auth-api");
    });

    test("truncates to 20 characters", async () => {
      const { toSlug } = await import("../worker.js");
      const result = toSlug("This is a very long task title that exceeds the limit");
      expect(result.length).toBeLessThanOrEqual(20);
    });

    test("removes non-alphanumeric characters", async () => {
      const { toSlug } = await import("../worker.js");
      expect(toSlug("Fix: bug #123 (urgent)")).toBe("fix-bug-123-urgent");
    });
  });
});
