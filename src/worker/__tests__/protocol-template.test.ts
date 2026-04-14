import { describe, it, expect } from "bun:test";
import {
  generateWorkerProtocol,
  agentStartCommand,
  type ProtocolOptions,
} from "../protocol-template.js";
import type { Task } from "../../types/task.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "T3",
    title: "Implement auth API",
    description:
      "Build JWT-based authentication with /login, /register, /refresh endpoints.\n" +
      "Acceptance Criteria:\n" +
      "- POST /login returns JWT token\n" +
      "- POST /register creates user\n" +
      "- POST /refresh rotates token",
    status: "in_progress",
    depends_on: ["T1", "T2"],
    blocked_by: [],
    evidence: [],
    attempt: 1,
    created_at: "2026-04-14T00:00:00Z",
    updated_at: "2026-04-14T00:00:00Z",
    ...overrides,
  };
}

function makeOpts(overrides: Partial<ProtocolOptions> = {}): ProtocolOptions {
  return {
    task: makeTask(),
    projectRoot: "/home/user/myproject",
    worktreePath: "/home/user/myproject/.apex/worktrees/T3",
    completedDeps: ["T1", "T2"],
    ...overrides,
  };
}

describe("generateWorkerProtocol", () => {
  it("returns a string starting with the correct heading", () => {
    const md = generateWorkerProtocol(makeOpts());
    expect(md.startsWith("# Apex-Forge Worker Agent")).toBe(true);
    expect(md).toContain("Task T3");
  });

  it("includes task information section with title, description, and deps", () => {
    const md = generateWorkerProtocol(makeOpts());
    // Section heading
    expect(md).toContain("## 你的任务");
    // Task fields
    expect(md).toContain("Implement auth API");
    expect(md).toContain("JWT-based authentication");
    expect(md).toContain("T1, T2");
  });

  it("includes acceptance criteria from description", () => {
    const md = generateWorkerProtocol(makeOpts());
    expect(md).toContain("POST /login returns JWT token");
    expect(md).toContain("POST /register creates user");
    expect(md).toContain("POST /refresh rotates token");
  });

  it("includes execution protocol section with tier rules", () => {
    const md = generateWorkerProtocol(makeOpts());
    expect(md).toContain("## 执行协议");
    expect(md).toContain("Tier 1");
    expect(md).toContain("Tier 2/3");
    expect(md).toContain("Brainstorm");
    expect(md).toContain("Execute");
    expect(md).toContain("Ship");
  });

  it("includes core rules section with TDD, evidence grading, verification gate", () => {
    const md = generateWorkerProtocol(makeOpts());
    expect(md).toContain("## 核心规则");
    expect(md).toContain("TDD");
    expect(md).toContain("E3");
    expect(md).toContain("验证");
  });

  it("includes communication protocol section with correct paths", () => {
    const md = generateWorkerProtocol(makeOpts());
    expect(md).toContain("## 通信协议");
    // status.json path
    expect(md).toContain("/home/user/myproject/.apex/workers/T3/status.json");
    // result.json path
    expect(md).toContain("/home/user/myproject/.apex/workers/T3/result.json");
    // apex commands
    expect(md).toContain("apex task submit T3");
    expect(md).toContain("apex task verify T3");
    expect(md).toContain("apex task block T3");
  });

  it("includes work boundaries section", () => {
    const md = generateWorkerProtocol(makeOpts());
    expect(md).toContain("## 工作边界");
    expect(md).toContain("worktree");
    // Must mention the branch
    expect(md).toContain("apex/T3");
  });

  it("does NOT include cross-model section by default", () => {
    const md = generateWorkerProtocol(makeOpts());
    expect(md).not.toContain("## 跨模型独立评审");
  });

  it("includes cross-model section when crossModel=true", () => {
    const md = generateWorkerProtocol(makeOpts({ crossModel: true }));
    expect(md).toContain("跨模型");
    expect(md).toContain("独立");
  });

  it("handles task with no dependencies", () => {
    const md = generateWorkerProtocol(
      makeOpts({
        task: makeTask({ depends_on: [] }),
        completedDeps: [],
      }),
    );
    expect(md).toContain("## 你的任务");
    // Should show none or empty
    expect(md).toMatch(/Dependencies completed.*none|无/i);
  });

  it("uses projectRoot for communication paths, not worktreePath", () => {
    const md = generateWorkerProtocol(makeOpts());
    // status.json must point to projectRoot, not worktreePath
    expect(md).toContain("/home/user/myproject/.apex/workers/T3/status.json");
    expect(md).not.toContain(
      "/home/user/myproject/.apex/worktrees/T3/.apex/workers",
    );
  });
});

describe("agentStartCommand", () => {
  const worktree = "/home/user/myproject/.apex/worktrees/T3";

  it("returns correct claude command", () => {
    const cmd = agentStartCommand("claude", worktree);
    expect(cmd).toBe(
      `cd "${worktree}" && claude --append-system-prompt-file .apex/worker-protocol.md`,
    );
  });

  it("returns correct codex command", () => {
    const cmd = agentStartCommand("codex", worktree);
    expect(cmd).toBe(`cd "${worktree}" && codex --full-auto`);
  });

  it("returns correct gemini command", () => {
    const cmd = agentStartCommand("gemini", worktree);
    expect(cmd).toBe(
      `cd "${worktree}" && gemini --yolo -p "$(cat .apex/worker-protocol.md)"`,
    );
  });

  it("defaults to claude command for unknown agent", () => {
    const cmd = agentStartCommand("unknown-agent", worktree);
    expect(cmd).toBe(
      `cd "${worktree}" && claude --append-system-prompt-file .apex/worker-protocol.md`,
    );
  });
});
