import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

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

function writeArtifact(path: string, content: string): void {
  const dir = path.substring(0, path.lastIndexOf("/"));
  if (dir) mkdirSync(dir, { recursive: true });
  writeFileSync(path, content);
}

beforeEach(() => {
  originalCwd = process.cwd();
  testDir = join(tmpdir(), `apex-test-gates-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(testDir, { recursive: true });
  process.chdir(testDir);
  run("init");
  initGitRepo();
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

// ─── Brainstorm Gate ────────────────────────────────────────

describe("Brainstorm Gate", () => {
  test("BLOCKS when no artifact", () => {
    run("stage", "set", "brainstorm");
    const r = run("stage", "complete", "brainstorm");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("S1");
  });

  test("BLOCKS when artifact missing status: approved", () => {
    writeArtifact("docs/brainstorms/test-requirements.md",
      "---\ntitle: Test\nscope: Lightweight\nstatus: draft\n---\n\n## Acceptance Criteria\n- AC1\n\n## Constraints\n- C1\n");
    run("stage", "artifact", "brainstorm", "docs/brainstorms/test-requirements.md");
    run("stage", "set", "brainstorm");

    const r = run("stage", "complete", "brainstorm");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("S6"); // status not approved
  });

  test("PASSES when all checks satisfied", () => {
    writeArtifact("docs/brainstorms/test-requirements.md",
      "---\ntitle: Test\nscope: Lightweight\nstatus: approved\n---\n\n## Acceptance Criteria\n- AC1\n\n## Constraints\n- C1\n");
    run("stage", "artifact", "brainstorm", "docs/brainstorms/test-requirements.md");
    run("stage", "set", "brainstorm");

    const r = run("stage", "complete", "brainstorm");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("S1");
    expect(r.stdout).toContain("S6");
  });

  test("checks acceptance criteria section", () => {
    writeArtifact("docs/brainstorms/test-requirements.md",
      "---\ntitle: Test\nscope: Lightweight\nstatus: approved\n---\n\n## Constraints\n- C1\n");
    run("stage", "artifact", "brainstorm", "docs/brainstorms/test-requirements.md");
    run("stage", "set", "brainstorm");

    const r = run("stage", "complete", "brainstorm");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("S3"); // no acceptance criteria
  });
});

// ─── Plan Gate ──────────────────────────────────────────────

describe("Plan Gate", () => {
  test("BLOCKS when no artifact", () => {
    run("stage", "set", "plan");
    const r = run("stage", "complete", "plan");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("S1");
  });

  test("BLOCKS when status not approved", () => {
    writeArtifact("docs/plans/test-plan.md",
      "---\ntitle: Test\nstatus: draft\n---\n\n## File Manifest\n- src/foo.ts\n\n## Test Files\n- src/__tests__/foo.test.ts\n\n## Tasks\n- T1: Do thing\n");
    run("stage", "artifact", "plan", "docs/plans/test-plan.md");
    run("task", "create", "Do thing", "desc");
    run("stage", "set", "plan");

    const r = run("stage", "complete", "plan");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("S7"); // status not approved
  });

  test("PASSES when all checks satisfied", () => {
    writeArtifact("docs/plans/test-plan.md",
      "---\ntitle: Test\nstatus: approved\n---\n\n## File Manifest\n- src/foo.ts\n\n## Test Files\n- src/__tests__/foo.test.ts\n\n## Tasks\n- T1: Do thing\n");
    run("stage", "artifact", "plan", "docs/plans/test-plan.md");
    run("task", "create", "Do thing", "desc");
    run("stage", "set", "plan");

    const r = run("stage", "complete", "plan");
    expect(r.exitCode).toBe(0);
  });
});

// ─── Execute Gate ───────────────────────────────────────────

describe("Execute Gate", () => {
  test("BLOCKS when tasks not done", () => {
    run("task", "create", "Task1", "desc");
    run("stage", "set", "execute");

    const r = run("stage", "complete", "execute");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("S1");
  });

  test("checks for execution log", () => {
    run("task", "create", "Task1", "desc");
    run("task", "assign", "T1");
    run("task", "start", "T1");
    run("task", "submit", "T1", "done");
    run("task", "verify", "T1", "pass");
    run("stage", "set", "execute");

    const r = run("stage", "complete", "execute");
    // S1 passes (all tasks done), S3 may fail (no execution log)
    expect(r.stdout).toContain("S1");
    // S3 should fail — no execution log
    expect(r.stdout).toContain("S3");
  });
});

// ─── Review Gate ────────────────────────────────────────────

describe("Review Gate", () => {
  test("BLOCKS when no artifact", () => {
    run("stage", "set", "review");
    const r = run("stage", "complete", "review");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("S1");
  });

  test("BLOCKS when missing persona sections", () => {
    writeArtifact("docs/reviews/test-review.md",
      "---\nstatus: DONE\n---\n\n# Review\nLooks good.\n");
    run("stage", "artifact", "review", "docs/reviews/test-review.md");
    run("stage", "set", "review");

    const r = run("stage", "complete", "review");
    expect(r.exitCode).toBe(1);
    // Missing security, correctness, spec, adversarial sections
    expect(r.stdout).toContain("S3");
  });

  test("BLOCKS when status not DONE", () => {
    writeArtifact("docs/reviews/test-review.md",
      "---\nstatus: BLOCKED\n---\n\n## Security\nOK\n## Correctness\nOK\n## Spec Compliance\nOK\n## Adversarial\nOK\n");
    run("stage", "artifact", "review", "docs/reviews/test-review.md");
    run("stage", "set", "review");

    const r = run("stage", "complete", "review");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("S7"); // status not DONE
  });

  test("BLOCKS on unresolved P0", () => {
    writeArtifact("docs/reviews/test-review.md",
      "---\nstatus: DONE\n---\n\n## Security\n- P0: SQL injection in login handler\n## Correctness\nOK\n## Spec Compliance\nOK\n## Adversarial\nOK\n");
    run("stage", "artifact", "review", "docs/reviews/test-review.md");
    run("stage", "set", "review");

    const r = run("stage", "complete", "review");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("S8"); // unresolved P0
  });

  test("PASSES with all persona sections and DONE status", () => {
    writeArtifact("docs/reviews/test-review.md",
      "---\nstatus: DONE\n---\n\n## Security\nNo issues.\n## Correctness\nAll good.\n## Spec Compliance\nMatches spec.\n## Adversarial\nNo edge cases found.\n");
    run("stage", "artifact", "review", "docs/reviews/test-review.md");
    run("stage", "set", "review");

    const r = run("stage", "complete", "review");
    expect(r.exitCode).toBe(0);
  });
});

// ─── Compound Gate ──────────────────────────────────────────

describe("Compound Gate", () => {
  test("BLOCKS when no solution doc", () => {
    run("stage", "set", "compound");
    const r = run("stage", "complete", "compound");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("S1");
  });

  test("BLOCKS when re-entry-prompt checkpoint missing", () => {
    writeArtifact("docs/solutions/test/solution.md",
      "# Solution\n\n## Root Cause\nBug in X.\n\n## Prevention\nAdd test.\n");
    run("stage", "artifact", "compound", "docs/solutions/test/solution.md");
    writeArtifact("docs/roadmaps/roadmap-20260415.md", "# Roadmap\n");
    run("memory", "add", "Test lesson", "0.8", "test");
    run("stage", "set", "compound");

    const r = run("stage", "complete", "compound");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("S6"); // re-entry prompt missing
  });

  test("compound checkpoint records event", () => {
    run("stage", "set", "compound");
    const r = run("compound", "checkpoint", "re-entry-prompt");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("re-entry-prompt");
  });

  test("compound checkpoint rejects invalid name", () => {
    run("stage", "set", "compound");
    const r = run("compound", "checkpoint", "invalid");
    expect(r.exitCode).toBe(1);
  });

  test("PASSES when all checks satisfied", () => {
    writeArtifact("docs/solutions/test/solution.md",
      "# Solution\n\n## Root Cause\nBug in X.\n\n## Prevention\nAdd test.\n");
    run("stage", "artifact", "compound", "docs/solutions/test/solution.md");
    writeArtifact("docs/roadmaps/roadmap-20260415.md", "# Roadmap\n");
    run("memory", "add", "Test lesson", "0.8", "test");
    run("compound", "checkpoint", "re-entry-prompt");
    run("stage", "set", "compound");

    const r = run("stage", "complete", "compound");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("S1");
    expect(r.stdout).toContain("S6");
  });
});
