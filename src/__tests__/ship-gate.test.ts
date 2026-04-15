import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync, execSync } from "child_process";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const PROJECT_ROOT = process.cwd();
const APEX = join(PROJECT_ROOT, "dist/apex-forge");

let testDir: string;
let originalCwd: string;

function run(
  ...args: string[]
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync(APEX, args, {
    encoding: "utf-8",
    cwd: process.cwd(),
    timeout: 15000,
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status ?? 1,
  };
}

function initGitRepo(): void {
  execSync("git init && git config user.email test@test.com && git config user.name Test", {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  writeFileSync("README.md", "# Test\n");
  execSync("git add . && git commit -m 'init'", {
    cwd: process.cwd(),
    stdio: "pipe",
  });
}

beforeEach(() => {
  originalCwd = process.cwd();
  testDir = join(tmpdir(), `apex-test-ship-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(testDir, { recursive: true });
  process.chdir(testDir);
  run("init");
  initGitRepo();
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

describe("Ship Stage Structural Gate", () => {
  test("ship gate BLOCKS when no review artifact exists", () => {
    run("stage", "set", "ship");
    const r = run("stage", "complete", "ship");
    expect(r.exitCode).toBe(1);
    expect(r.stdout + r.stderr).toContain("S1");
    expect(r.stderr).toContain("BLOCKED");
  });

  test("ship gate BLOCKS when no git commit since review", () => {
    // Register a review artifact
    mkdirSync("docs/reviews", { recursive: true });
    writeFileSync("docs/reviews/test-review.md", "---\nstatus: DONE\n---\n# Review\n");
    run("stage", "artifact", "review", "docs/reviews/test-review.md");
    run("stage", "set", "ship");

    // No new commit since review → S2 should fail
    const r = run("stage", "complete", "ship");
    expect(r.exitCode).toBe(1);
    // Should block on one of the missing checks
    expect(r.stderr).toContain("BLOCKED");
  });

  test("ship gate BLOCKS when push-prompt checkpoint missing", () => {
    // Set up: review artifact + git commit
    mkdirSync("docs/reviews", { recursive: true });
    writeFileSync("docs/reviews/test-review.md", "---\nstatus: DONE\n---\n# Review\n");
    run("stage", "artifact", "review", "docs/reviews/test-review.md");
    run("stage", "set", "ship");

    // Make a commit
    writeFileSync("feature.ts", "export const x = 1;\n");
    execSync("git add . && git commit -m 'feat: test'", {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    // Record iteration-summary checkpoint but NOT push-prompt
    run("ship", "checkpoint", "iteration-summary");

    const r = run("stage", "complete", "ship");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("S7");
  });

  test("ship gate BLOCKS when iteration-summary checkpoint missing", () => {
    mkdirSync("docs/reviews", { recursive: true });
    writeFileSync("docs/reviews/test-review.md", "---\nstatus: DONE\n---\n# Review\n");
    run("stage", "artifact", "review", "docs/reviews/test-review.md");
    run("stage", "set", "ship");

    writeFileSync("feature.ts", "export const x = 1;\n");
    execSync("git add . && git commit -m 'feat: test'", {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    // Record push-prompt but NOT iteration-summary
    run("ship", "checkpoint", "push-prompt");

    const r = run("stage", "complete", "ship");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("S8");
  });

  test("ship gate PASSES when all checks satisfied", () => {
    mkdirSync("docs/reviews", { recursive: true });
    writeFileSync("docs/reviews/test-review.md", "---\nstatus: DONE\n---\n# Review\n");
    run("stage", "artifact", "review", "docs/reviews/test-review.md");
    run("stage", "set", "ship");

    // Make a commit
    writeFileSync("feature.ts", "export const x = 1;\n");
    execSync("git add . && git commit -m 'feat: test'", {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    // Record all checkpoints
    run("ship", "checkpoint", "iteration-summary");
    run("ship", "checkpoint", "push-prompt");
    run("ship", "checkpoint", "compound-transition");

    const r = run("stage", "complete", "ship");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("S1");
    expect(r.stdout).toContain("S2");
  });

  test("apex ship checkpoint records event", () => {
    run("stage", "set", "ship");
    const r = run("ship", "checkpoint", "push-prompt");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("push-prompt");
  });

  test("apex ship checkpoint rejects unknown checkpoint", () => {
    run("stage", "set", "ship");
    const r = run("ship", "checkpoint", "invalid-name");
    expect(r.exitCode).toBe(1);
  });

  test("ship gate checks required skill invocations from bindings", () => {
    mkdirSync("docs/reviews", { recursive: true });
    writeFileSync("docs/reviews/test-review.md", "---\nstatus: DONE\n---\n# Review\n");
    run("stage", "artifact", "review", "docs/reviews/test-review.md");
    run("stage", "set", "ship");

    writeFileSync("feature.ts", "export const x = 1;\n");
    execSync("git add . && git commit -m 'feat: test'", {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    run("ship", "checkpoint", "iteration-summary");
    run("ship", "checkpoint", "push-prompt");
    run("ship", "checkpoint", "compound-transition");

    // Even with all checkpoints, if bindings.yaml has required ship skills
    // and they weren't invoked, Check 5a should catch it.
    // This test verifies the gate passes when no ship bindings are triggered
    // (great-writer is conditional on "new repository" — not always required)
    const r = run("stage", "complete", "ship");
    expect(r.exitCode).toBe(0);
  });
});
