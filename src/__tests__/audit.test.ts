import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROJECT_ROOT = process.cwd();
const APEX = join(PROJECT_ROOT, "dist/apex-forge");

let testDir: string;
let originalCwd: string;

function run(...args: string[]): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
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

/** Seed a minimal .apex/ with a completed pipeline in state.jsonl */
function seedCompletePipeline(sessionId: string): void {
  const logDir = join(".apex", "log");
  mkdirSync(logDir, { recursive: true });

  const stages = [
    "brainstorm",
    "plan",
    "execute",
    "review",
    "ship",
    "compound",
  ];
  const events: string[] = [];
  let t = new Date("2026-04-10T10:00:00Z");

  // stage.set + stage.completed for each stage
  let prev = "idle";
  for (const stage of stages) {
    events.push(
      JSON.stringify({
        ts: t.toISOString(),
        session_id: sessionId,
        domain: "state",
        type: "stage.set",
        payload: { stage, previous: prev },
      }),
    );
    t = new Date(t.getTime() + 5 * 60 * 1000); // +5 min
    events.push(
      JSON.stringify({
        ts: t.toISOString(),
        session_id: sessionId,
        domain: "state",
        type: "stage.completed",
        payload: { stage },
      }),
    );
    prev = stage;
  }

  // ship checkpoint
  events.push(
    JSON.stringify({
      ts: new Date("2026-04-10T10:25:00Z").toISOString(),
      session_id: sessionId,
      domain: "state",
      type: "ship.checkpoint",
      payload: { name: "iteration-summary" },
    }),
  );
  events.push(
    JSON.stringify({
      ts: new Date("2026-04-10T10:25:01Z").toISOString(),
      session_id: sessionId,
      domain: "state",
      type: "ship.checkpoint",
      payload: { name: "push-prompt" },
    }),
  );
  events.push(
    JSON.stringify({
      ts: new Date("2026-04-10T10:25:02Z").toISOString(),
      session_id: sessionId,
      domain: "state",
      type: "ship.checkpoint",
      payload: { name: "compound-transition" },
    }),
  );

  // skill invocation
  events.push(
    JSON.stringify({
      ts: new Date("2026-04-10T10:20:00Z").toISOString(),
      session_id: sessionId,
      domain: "state",
      type: "skill.invoked",
      payload: {
        stage: "review",
        skill: "thorough-code-review",
        version: "1.0",
        output_status: "done",
        af_mapping: "review",
      },
    }),
  );

  appendFileSync(join(logDir, "state.jsonl"), `${events.join("\n")}\n`);

  // Write minimal state.json for init
  writeFileSync(
    join(".apex", "state.json"),
    JSON.stringify({
      current_stage: "idle",
      last_updated: "2026-04-10T10:30:00Z",
      session_id: sessionId,
      artifacts: {},
      history: [],
    }),
  );
  writeFileSync(
    join(".apex", "tasks.json"),
    JSON.stringify({ tasks: [], next_id: 1 }),
  );
  writeFileSync(
    join(".apex", "memory.json"),
    JSON.stringify({ facts: [], next_id: 1 }),
  );
}

/** Seed a pipeline where brainstorm was completed via transition (not gate) */
function seedBrokenPipeline(sessionId: string): void {
  const logDir = join(".apex", "log");
  mkdirSync(logDir, { recursive: true });

  const events: string[] = [];
  let t = new Date("2026-04-10T10:00:00Z");

  // brainstorm: only stage.set, NO stage.completed (closed by transition)
  events.push(
    JSON.stringify({
      ts: t.toISOString(),
      session_id: sessionId,
      domain: "state",
      type: "stage.set",
      payload: { stage: "brainstorm", previous: "idle" },
    }),
  );
  t = new Date(t.getTime() + 30 * 1000); // only 30 seconds

  // Jump straight to plan (brainstorm auto-closed by transition)
  events.push(
    JSON.stringify({
      ts: t.toISOString(),
      session_id: sessionId,
      domain: "state",
      type: "stage.set",
      payload: { stage: "plan", previous: "brainstorm" },
    }),
  );
  t = new Date(t.getTime() + 5 * 60 * 1000);
  events.push(
    JSON.stringify({
      ts: t.toISOString(),
      session_id: sessionId,
      domain: "state",
      type: "stage.completed",
      payload: { stage: "plan" },
    }),
  );

  // execute, review, ship with gate completions
  for (const stage of ["execute", "review", "ship"]) {
    events.push(
      JSON.stringify({
        ts: t.toISOString(),
        session_id: sessionId,
        domain: "state",
        type: "stage.set",
        payload: {
          stage,
          previous:
            stage === "execute"
              ? "plan"
              : stage === "review"
                ? "execute"
                : "review",
        },
      }),
    );
    t = new Date(t.getTime() + 5 * 60 * 1000);
    events.push(
      JSON.stringify({
        ts: t.toISOString(),
        session_id: sessionId,
        domain: "state",
        type: "stage.completed",
        payload: { stage },
      }),
    );
  }

  appendFileSync(join(logDir, "state.jsonl"), `${events.join("\n")}\n`);

  writeFileSync(
    join(".apex", "state.json"),
    JSON.stringify({
      current_stage: "idle",
      last_updated: t.toISOString(),
      session_id: sessionId,
      artifacts: {},
      history: [],
    }),
  );
  writeFileSync(
    join(".apex", "tasks.json"),
    JSON.stringify({ tasks: [], next_id: 1 }),
  );
  writeFileSync(
    join(".apex", "memory.json"),
    JSON.stringify({ facts: [], next_id: 1 }),
  );
}

beforeEach(() => {
  originalCwd = process.cwd();
  testDir = join(
    tmpdir(),
    `apex-test-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(testDir, { recursive: true });
  process.chdir(testDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

describe("apex audit", () => {
  test("outputs PIPELINE AUDIT header and grade on complete pipeline", () => {
    seedCompletePipeline("test-session-001");
    const r = run("audit", "--no-test");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("PIPELINE AUDIT");
    expect(r.stdout).toMatch(/Grade [A-F]/);
  });

  test("--session targets specific session", () => {
    seedCompletePipeline("target-session");
    // Add a second session with incomplete data
    const logDir = join(".apex", "log");
    appendFileSync(
      join(logDir, "state.jsonl"),
      `${JSON.stringify({
        ts: "2026-04-11T10:00:00Z",
        session_id: "other-session",
        domain: "state",
        type: "stage.set",
        payload: { stage: "brainstorm", previous: "idle" },
      })}\n`,
    );
    const r = run("audit", "--session", "target-session", "--no-test");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("target-session");
  });

  test("--json produces valid JSON with checks, scores, grade", () => {
    seedCompletePipeline("json-session");
    const r = run("audit", "--json", "--no-test");
    expect(r.exitCode).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json).toHaveProperty("checks");
    expect(json).toHaveProperty("scores");
    expect(json).toHaveProperty("grade");
    expect(Array.isArray(json.checks)).toBe(true);
  });

  test("detects gate bypass (completed_via transition)", () => {
    seedBrokenPipeline("broken-session");
    const r = run("audit", "--no-test", "--json");
    expect(r.exitCode).toBe(0);
    const json = JSON.parse(r.stdout);
    const gateCheck = json.checks.find(
      (c: any) => c.id.includes("L1") && c.detail?.includes("transition"),
    );
    expect(gateCheck).toBeDefined();
    expect(gateCheck.verdict).toBe("WARN");
  });

  test("detects missing compound stage", () => {
    seedBrokenPipeline("broken-session");
    const r = run("audit", "--no-test", "--json");
    expect(r.exitCode).toBe(0);
    const json = JSON.parse(r.stdout);
    const stageCheck = json.checks.find(
      (c: any) => c.id === "L1-stages" && c.verdict !== "PASS",
    );
    // broken pipeline is missing compound
    expect(stageCheck).toBeDefined();
  });

  test("audit is read-only — .apex/ not modified", () => {
    seedCompletePipeline("readonly-session");
    // Snapshot .apex contents before
    const before = readdirSync(".apex").sort().join(",");
    const stateBefore = readFileSync(".apex/state.json", "utf-8");
    const logBefore = readFileSync(".apex/log/state.jsonl", "utf-8");

    run("audit", "--no-test");

    // Snapshot after
    const after = readdirSync(".apex").sort().join(",");
    const stateAfter = readFileSync(".apex/state.json", "utf-8");
    const logAfter = readFileSync(".apex/log/state.jsonl", "utf-8");

    expect(after).toBe(before);
    expect(stateAfter).toBe(stateBefore);
    expect(logAfter).toBe(logBefore);
  });

  test("complete pipeline with no artifacts: grade reflects L1 PASS + L2/L3 SKIP", () => {
    seedCompletePipeline("score-session");
    const r = run("audit", "--json", "--no-test");
    const json = JSON.parse(r.stdout);
    // L1: all PASS (stages, gates, checkpoints, skills, timeline)
    // L2: all SKIP (no artifact files on disk)
    // L3: all SKIP (no artifacts, no git, --no-test)
    // SKIP checks excluded from scoring → grade A
    expect(json.grade).toBe("A");
    expect(json.scores).toBeDefined();
    expect(json.session).toBe("score-session");
  });

  test("--all mode lists sessions", () => {
    seedCompletePipeline("all-session-1");
    const r = run("audit", "--all", "--no-test", "--json");
    expect(r.exitCode).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.sessions).toBeDefined();
    expect(json.sessions.length).toBeGreaterThan(0);
    expect(json.sessions[0].session_id).toBe("all-session-1");
  });
});
