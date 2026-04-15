import { describe, it, expect } from "bun:test";
import {
  generateWorkerProtocol,
  agentStartCommand,
  sectionCommunicationForCapabilities,
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

  it("includes Plan Agent directive check section", () => {
    const md = generateWorkerProtocol(makeOpts());
    expect(md).toContain("## Plan Agent 通信协议");
    expect(md).toContain("[PLAN-AGENT]");
    expect(md).toContain("[PLAN-AGENT:INTERRUPT]");
    expect(md).toContain("directive.json");
    expect(md).toContain("escalation.json");
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

describe("generateWorkerProtocol — English (lang=en)", () => {
  const enOpts = makeOpts({ agent: "codex" });

  it("generates English task section", () => {
    const md = generateWorkerProtocol(enOpts);
    expect(md).toContain("## Your Task");
    expect(md).not.toContain("## 你的任务");
  });

  it("generates English execution protocol section", () => {
    const md = generateWorkerProtocol(enOpts);
    expect(md).toContain("## Execution Protocol");
    expect(md).not.toContain("## 执行协议");
  });

  it("generates English core rules section", () => {
    const md = generateWorkerProtocol(enOpts);
    expect(md).toContain("## Core Rules");
    expect(md).toContain("TDD");
    expect(md).toContain("E3");
    expect(md).not.toContain("## 核心规则");
  });

  it("generates English communication section with JSON fields", () => {
    const md = generateWorkerProtocol(enOpts);
    expect(md).toContain("## Communication Protocol");
    expect(md).toContain('"task_id"');
    expect(md).toContain('"verdict"');
    expect(md).toContain("status.json");
    expect(md).toContain("result.json");
  });

  it("generates English directive section", () => {
    const md = generateWorkerProtocol(enOpts);
    expect(md).toContain("## Plan Agent Communication Protocol");
    expect(md).toContain("[PLAN-AGENT]");
    expect(md).toContain("directive.json");
  });

  it("generates English boundaries section", () => {
    const md = generateWorkerProtocol(enOpts);
    expect(md).toContain("## Work Boundaries");
    expect(md).not.toContain("## 工作边界");
  });

  it("generates English cross-model section when enabled", () => {
    const md = generateWorkerProtocol(makeOpts({ agent: "codex", crossModel: true }));
    expect(md).toContain("## Cross-Model Independent Review");
    expect(md).not.toContain("## 跨模型独立评审");
  });

  it("still generates Chinese for claude agent", () => {
    const md = generateWorkerProtocol(makeOpts({ agent: "claude" }));
    expect(md).toContain("## 你的任务");
    expect(md).toContain("## 执行协议");
    expect(md).toContain("## 核心规则");
  });

  it("defaults to Chinese when no agent specified", () => {
    const md = generateWorkerProtocol(makeOpts());
    expect(md).toContain("## 你的任务");
  });
});

describe("agentStartCommand", () => {
  const worktree = "/home/user/myproject/.apex/worktrees/T3";

  it("returns claude command with --append-system-prompt-file", async () => {
    const cmd = await agentStartCommand("claude", worktree);
    expect(cmd).toContain("claude");
    expect(cmd).toContain("--append-system-prompt-file");
    expect(cmd).toContain(worktree);
  });

  it("returns codex command with stdin pipe and exec --full-auto", async () => {
    const cmd = await agentStartCommand("codex", worktree);
    expect(cmd).toContain("cat");
    expect(cmd).toContain("codex");
    expect(cmd).toContain("exec --full-auto");
    expect(cmd).toContain(worktree);
  });

  it("returns gemini command with single-quoted protocol path", async () => {
    const cmd = await agentStartCommand("gemini", worktree);
    expect(cmd).toContain("gemini");
    expect(cmd).toContain("'");
    expect(cmd).toContain(worktree);
  });

  it("returns opencode command with run -p", async () => {
    const cmd = await agentStartCommand("opencode", worktree);
    expect(cmd).toContain("opencode");
    expect(cmd).toContain("run -p");
    expect(cmd).toContain(worktree);
  });

  it("throws for unknown agent instead of falling back", async () => {
    await expect(agentStartCommand("unknown-agent", worktree)).rejects.toThrow(
      /unknown agent/i,
    );
  });
});

describe("sectionCommunication — capability degradation", () => {
  const fullCaps = {
    canExecuteBash: true,
    canWriteFiles: true,
    canReadFiles: true,
    canRunApexCLI: true,
    preferredLanguage: "en" as const,
    maxPromptBytes: 200_000,
  };
  const fileWriteCaps = { ...fullCaps, canExecuteBash: false, canRunApexCLI: false };
  const minimalCaps = { ...fileWriteCaps, canWriteFiles: false };
  const commOpts = { task: makeTask(), projectRoot: "/proj" };

  it("full bash mode includes heredoc and apex commands", () => {
    const result = sectionCommunicationForCapabilities(commOpts, "en", fullCaps);
    expect(result).toContain("cat >");
    expect(result).toContain("APEX_EOF");
    expect(result).toContain("apex task submit");
  });

  it("file-write mode uses Write instructions, no heredoc", () => {
    const result = sectionCommunicationForCapabilities(commOpts, "en", fileWriteCaps);
    expect(result).toContain("Write the following JSON");
    expect(result).not.toContain("cat >");
    expect(result).toContain("status.json");
    expect(result).toContain("result.json");
  });

  it("minimal mode uses Create file, no heredoc, no apex CLI", () => {
    const result = sectionCommunicationForCapabilities(commOpts, "en", minimalCaps);
    expect(result).toContain("Create file");
    expect(result).not.toContain("cat >");
    expect(result).not.toContain("Write the following JSON");
    expect(result).not.toContain("apex task submit");
  });

  it("file-write mode works in Chinese", () => {
    const result = sectionCommunicationForCapabilities(commOpts, "zh", fileWriteCaps);
    expect(result).toContain("将以下 JSON 写入");
    expect(result).not.toContain("cat >");
  });

  it("minimal mode works in Chinese", () => {
    const result = sectionCommunicationForCapabilities(commOpts, "zh", minimalCaps);
    expect(result).toContain("创建文件");
    expect(result).not.toContain("cat >");
  });

  it("all tiers include task_id and verdict JSON fields", () => {
    for (const caps of [fullCaps, fileWriteCaps, minimalCaps]) {
      const result = sectionCommunicationForCapabilities(commOpts, "en", caps);
      expect(result).toContain('"task_id"');
      expect(result).toContain('"verdict"');
    }
  });

  it("file-write mode includes apex CLI as Run instructions", () => {
    const result = sectionCommunicationForCapabilities(commOpts, "en", fileWriteCaps);
    expect(result).toContain("apex task submit");
    expect(result).toContain("apex task verify");
    expect(result).toContain("apex task block");
  });

  it("minimal mode excludes all apex CLI commands", () => {
    const result = sectionCommunicationForCapabilities(commOpts, "en", minimalCaps);
    expect(result).not.toContain("apex task submit");
    expect(result).not.toContain("apex task verify");
    expect(result).not.toContain("apex task block");
  });
});
