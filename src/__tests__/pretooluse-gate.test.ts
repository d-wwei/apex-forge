import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync, execSync } from "child_process";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const GATE_HOOK = join(process.cwd(), "skill/hooks/apex-forge-gate.sh");

let testDir: string;
let originalCwd: string;

function runHook(input: object): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("bash", [GATE_HOOK], {
    input: JSON.stringify(input),
    encoding: "utf-8",
    cwd: testDir,
    timeout: 5000,
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status ?? 1,
  };
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

function setupApex(stage: string, extras?: Record<string, unknown>): void {
  mkdirSync(join(testDir, ".apex"), { recursive: true });
  const state = { current_stage: stage, last_updated: "2026-01-01", ...extras };
  writeFileSync(join(testDir, ".apex", "state.test-session.json"), JSON.stringify(state));
}

beforeEach(() => {
  originalCwd = process.cwd();
  testDir = join(tmpdir(), `apex-gate-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

// ─── Non-apex projects ──────────────────────────────────────────

describe("Non-apex projects (no .apex/)", () => {
  test("git commit → allow", () => {
    const r = runHook({ tool_name: "Bash", tool_input: { command: "git commit -m test" }, cwd: testDir });
    expect(r.stdout.trim()).toBe("");
    expect(r.exitCode).toBe(0);
  });

  test("Edit code file → allow", () => {
    const r = runHook({ tool_name: "Edit", tool_input: { file_path: "src/main.ts" }, cwd: testDir });
    expect(r.stdout.trim()).toBe("");
    expect(r.exitCode).toBe(0);
  });
});

// ─── Non-matching tools ─────────────────────────────────────────

describe("Non-matching tools", () => {
  test("Read tool → allow (not checked)", () => {
    setupApex("execute");
    const r = runHook({ tool_name: "Read", tool_input: { file_path: "src/main.ts" }, cwd: testDir });
    expect(r.stdout.trim()).toBe("");
    expect(r.exitCode).toBe(0);
  });

  test("Grep tool → allow", () => {
    setupApex("brainstorm");
    const r = runHook({ tool_name: "Grep", tool_input: { pattern: "foo" }, cwd: testDir });
    expect(r.stdout.trim()).toBe("");
    expect(r.exitCode).toBe(0);
  });
});

// ─── Git operations gate ────────────────────────────────────────

describe("Git operations gate", () => {
  test("git commit in execute stage → deny", () => {
    setupApex("execute");
    const r = runHook({ tool_name: "Bash", tool_input: { command: "git commit -m feat" }, cwd: testDir });
    const d = parseDecision(r.stdout);
    expect(d).not.toBeNull();
    expect(d!.decision).toBe("deny");
    expect(d!.reason).toContain("execute");
  });

  test("git push in review stage → deny", () => {
    setupApex("review");
    const r = runHook({ tool_name: "Bash", tool_input: { command: "git push origin main" }, cwd: testDir });
    const d = parseDecision(r.stdout);
    expect(d!.decision).toBe("deny");
  });

  test("gh pr create in brainstorm → deny", () => {
    setupApex("brainstorm");
    const r = runHook({ tool_name: "Bash", tool_input: { command: "gh pr create --title test" }, cwd: testDir });
    const d = parseDecision(r.stdout);
    expect(d!.decision).toBe("deny");
  });

  test("git commit in ship stage → allow", () => {
    setupApex("ship", { ship_checkpoints: ["iteration-summary", "push-prompt"] });
    const r = runHook({ tool_name: "Bash", tool_input: { command: "git commit -m feat" }, cwd: testDir });
    expect(parseDecision(r.stdout)).toBeNull(); // no output = allow
  });

  test("git push in ship WITHOUT checkpoints → deny", () => {
    setupApex("ship", { ship_checkpoints: [] });
    const r = runHook({ tool_name: "Bash", tool_input: { command: "git push origin main" }, cwd: testDir });
    const d = parseDecision(r.stdout);
    expect(d!.decision).toBe("deny");
    expect(d!.reason).toContain("checkpoints missing");
  });

  test("git push in ship WITH checkpoints → allow", () => {
    setupApex("ship", { ship_checkpoints: ["iteration-summary", "push-prompt"] });
    const r = runHook({ tool_name: "Bash", tool_input: { command: "git push origin main" }, cwd: testDir });
    expect(parseDecision(r.stdout)).toBeNull();
  });

  test("idle stage → allow git commit (no pipeline)", () => {
    setupApex("idle");
    const r = runHook({ tool_name: "Bash", tool_input: { command: "git commit -m test" }, cwd: testDir });
    expect(parseDecision(r.stdout)).toBeNull();
  });

  test("non-git bash command in execute → allow", () => {
    setupApex("execute");
    const r = runHook({ tool_name: "Bash", tool_input: { command: "npm test" }, cwd: testDir });
    expect(parseDecision(r.stdout)).toBeNull();
  });
});

// ─── Brainstorm code edit gate ──────────────────────────────────

describe("Brainstorm code edit gate", () => {
  test("Edit .ts file in brainstorm → deny", () => {
    setupApex("brainstorm");
    const r = runHook({ tool_name: "Edit", tool_input: { file_path: "src/main.ts" }, cwd: testDir });
    const d = parseDecision(r.stdout);
    expect(d!.decision).toBe("deny");
    expect(d!.reason).toContain("Brainstorm");
  });

  test("Write .py file in brainstorm → deny", () => {
    setupApex("brainstorm");
    const r = runHook({ tool_name: "Write", tool_input: { file_path: "script.py" }, cwd: testDir });
    const d = parseDecision(r.stdout);
    expect(d!.decision).toBe("deny");
  });

  test("Edit .md file in brainstorm → allow", () => {
    setupApex("brainstorm");
    const r = runHook({ tool_name: "Edit", tool_input: { file_path: "docs/brainstorms/req.md" }, cwd: testDir });
    expect(parseDecision(r.stdout)).toBeNull();
  });

  test("Edit docs/ path in brainstorm → allow", () => {
    setupApex("brainstorm");
    const r = runHook({ tool_name: "Write", tool_input: { file_path: "docs/plans/plan.md" }, cwd: testDir });
    expect(parseDecision(r.stdout)).toBeNull();
  });

  test("Edit .json config in brainstorm → allow", () => {
    setupApex("brainstorm");
    const r = runHook({ tool_name: "Edit", tool_input: { file_path: "config.json" }, cwd: testDir });
    expect(parseDecision(r.stdout)).toBeNull();
  });

  test("Edit .ts file in execute → allow (not brainstorm)", () => {
    setupApex("execute");
    const r = runHook({ tool_name: "Edit", tool_input: { file_path: "src/main.ts" }, cwd: testDir });
    expect(parseDecision(r.stdout)).toBeNull();
  });
});
