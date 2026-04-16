import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

const PROJECT_ROOT = process.cwd();
const APEX = join(PROJECT_ROOT, "dist/apex-forge");
const GATE_HOOK = join(PROJECT_ROOT, "skill/hooks/apex-forge-gate.sh");

let testDir: string;
let originalCwd: string;

function run(
  ...args: string[]
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync(APEX, args, {
    encoding: "utf-8",
    cwd: process.cwd(),
    timeout: 10000,
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status ?? 1,
  };
}

function runHook(input: object): { stdout: string; exitCode: number } {
  const result = spawnSync("bash", [GATE_HOOK], {
    input: JSON.stringify(input),
    encoding: "utf-8",
    cwd: testDir,
    timeout: 5000,
  });
  return { stdout: result.stdout || "", exitCode: result.status ?? 1 };
}

function parseDecision(stdout: string): { decision: string; reason: string } | null {
  try {
    const d = JSON.parse(stdout);
    return {
      decision: d.hookSpecificOutput?.permissionDecision || "",
      reason: d.hookSpecificOutput?.permissionDecisionReason || "",
    };
  } catch {
    return null;
  }
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
  testDir = join(tmpdir(), `apex-skip-gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(testDir, { recursive: true });
  process.chdir(testDir);
  run("init");
  initGitRepo();
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

// ─── PreToolUse hook denies --skip-gate ─────────────────────────

describe("PreToolUse hook: --skip-gate denial", () => {
  test("deny apex stage complete with --skip-gate", () => {
    mkdirSync(join(testDir, ".apex"), { recursive: true });
    writeFileSync(join(testDir, ".apex/state.test.json"),
      JSON.stringify({ current_stage: "brainstorm" }));

    const r = runHook({
      tool_name: "Bash",
      tool_input: { command: "apex stage complete brainstorm --skip-gate" },
      cwd: testDir,
    });
    const d = parseDecision(r.stdout);
    expect(d).not.toBeNull();
    expect(d!.decision).toBe("deny");
    expect(d!.reason).toContain("skip-gate");
  });

  test("allow apex stage complete without --skip-gate", () => {
    mkdirSync(join(testDir, ".apex"), { recursive: true });
    writeFileSync(join(testDir, ".apex/state.test.json"),
      JSON.stringify({ current_stage: "brainstorm" }));

    const r = runHook({
      tool_name: "Bash",
      tool_input: { command: "apex stage complete brainstorm" },
      cwd: testDir,
    });
    expect(parseDecision(r.stdout)).toBeNull(); // no output = allow
  });
});

// ─── Stage ordering enforcement ─────────────────────────────────

describe("Stage ordering enforcement", () => {
  test("apex stage set plan without brainstorm → rejected", () => {
    run("stage", "set", "brainstorm"); // set but don't complete
    const r = run("stage", "set", "plan");
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("brainstorm");
  });

  test("apex stage set plan after brainstorm completed → allowed", () => {
    // Create proper brainstorm artifact
    writeArtifact("docs/brainstorms/test-requirements.md",
      "---\ntitle: Test\nscope: Lightweight\nstatus: approved\n---\n\n## Acceptance Criteria\n- AC1\n\n## Constraints\n- C1\n");
    run("stage", "artifact", "brainstorm", "docs/brainstorms/test-requirements.md");
    run("stage", "set", "brainstorm");
    run("stage", "complete", "brainstorm");

    const r = run("stage", "set", "plan");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("plan");
  });

  test("apex stage set execute without plan → rejected", () => {
    // Must have history (pipeline started) for ordering to kick in
    run("stage", "set", "brainstorm");
    const r = run("stage", "set", "execute");
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("plan");
  });

  test("apex stage set idle → always allowed", () => {
    run("stage", "set", "brainstorm");
    const r = run("stage", "set", "idle");
    expect(r.exitCode).toBe(0);
  });

  test("apex stage set brainstorm → always allowed", () => {
    const r = run("stage", "set", "brainstorm");
    expect(r.exitCode).toBe(0);
  });
});

// ─── --skip-gate removed from CLI ───────────────────────────────

describe("--skip-gate removed from CLI", () => {
  test("--skip-gate flag is ignored (gate still enforced)", () => {
    run("stage", "set", "brainstorm");
    // No artifact → gate should fail even with --skip-gate
    const r = run("stage", "complete", "brainstorm", "--skip-gate");
    expect(r.exitCode).toBe(1); // gate blocks
    expect(r.stderr).toContain("BLOCKED");
  });
});

// ─── Normal flow still works ────────────────────────────────────

describe("Normal pipeline flow", () => {
  test("brainstorm → plan → execute (correct order) works", () => {
    // Brainstorm
    writeArtifact("docs/brainstorms/test-requirements.md",
      "---\ntitle: Test\nscope: Lightweight\nstatus: approved\n---\n\n## Acceptance Criteria\n- AC1\n\n## Constraints\n- C1\n");
    run("stage", "artifact", "brainstorm", "docs/brainstorms/test-requirements.md");
    run("stage", "set", "brainstorm");
    const b = run("stage", "complete", "brainstorm");
    expect(b.exitCode).toBe(0);

    // Plan
    writeArtifact("docs/plans/test-plan.md",
      "---\ntitle: Test\nstatus: approved\n---\n\n## File Manifest\n- src/foo.ts\n\n## Test Files\n- src/foo.test.ts\n\n## Tasks\n- T1: Do thing\n");
    run("stage", "artifact", "plan", "docs/plans/test-plan.md");
    run("task", "create", "Do thing", "desc");
    const p = run("stage", "set", "plan");
    expect(p.exitCode).toBe(0);
    const pc = run("stage", "complete", "plan");
    expect(pc.exitCode).toBe(0);

    // Execute
    const e = run("stage", "set", "execute");
    expect(e.exitCode).toBe(0);
  });
});
