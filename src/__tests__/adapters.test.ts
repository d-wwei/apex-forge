import { describe, expect, test } from "bun:test";
import type {
  AdapterConfig,
  AdapterStatus,
  AgentHandle,
  RuntimeAdapter,
  TaskDispatchInfo,
} from "../adapters/runtime.js";

describe("RuntimeAdapter interface", () => {
  test("AdapterStatus has required state variants", () => {
    const running: AdapterStatus = { state: "running" };
    const idle: AdapterStatus = { state: "idle" };
    const exited: AdapterStatus = { state: "exited", exitCode: 0 };
    const failed: AdapterStatus = { state: "exited", exitCode: 1 };

    expect(running.state).toBe("running");
    expect(idle.state).toBe("idle");
    expect(exited.exitCode).toBe(0);
    expect(failed.exitCode).toBe(1);
  });

  test("AgentHandle has required fields", () => {
    const handle: AgentHandle = {
      id: "agent-001",
      taskId: "T10",
      adapter: "claude",
      startedAt: Date.now(),
      attempt: 1,
      logPath: ".apex/orchestrator-logs/T10.log",
    };

    expect(handle.id).toBe("agent-001");
    expect(handle.taskId).toBe("T10");
    expect(handle.adapter).toBe("claude");
    expect(handle.attempt).toBe(1);
    expect(handle.logPath).toContain("T10");
  });

  test("AgentHandle supports optional sessionId and process", () => {
    const handle: AgentHandle = {
      id: "agent-002",
      taskId: "T11",
      adapter: "claude",
      startedAt: Date.now(),
      attempt: 2,
      logPath: ".apex/orchestrator-logs/T11.log",
      sessionId: "session-abc-123",
    };

    expect(handle.sessionId).toBe("session-abc-123");
    expect(handle.attempt).toBe(2);
  });

  test("AdapterConfig has command and args", () => {
    const config: AdapterConfig = {
      command: "claude",
      args: ["--print"],
    };

    expect(config.command).toBe("claude");
    expect(config.args).toEqual(["--print"]);
  });

  test("RuntimeAdapter contract can be implemented as a plain object", () => {
    const mockAdapter: RuntimeAdapter = {
      name: () => "mock",
      available: () => true,
      spawn: async (
        _task: TaskDispatchInfo,
        _prompt: string,
        _config: AdapterConfig,
      ) => ({
        id: "mock-001",
        taskId: "T1",
        adapter: "mock",
        startedAt: Date.now(),
        attempt: 1,
        logPath: "/dev/null",
      }),
      monitor: (_handle: AgentHandle) => ({
        state: "exited" as const,
        exitCode: 0,
      }),
      output: (_handle: AgentHandle) => "mock output",
      kill: (_handle: AgentHandle) => {},
      resume: async (
        _sessionId: string,
        _prompt: string,
        _config: AdapterConfig,
      ) => ({
        id: "mock-002",
        taskId: "T1",
        adapter: "mock",
        startedAt: Date.now(),
        attempt: 2,
        logPath: "/dev/null",
      }),
    };

    expect(mockAdapter.name()).toBe("mock");
    expect(mockAdapter.available()).toBe(true);
  });

  test("RuntimeAdapter spawn returns AgentHandle", async () => {
    const mockAdapter: RuntimeAdapter = {
      name: () => "test",
      available: () => true,
      spawn: async (
        task: TaskDispatchInfo,
        _prompt: string,
        _config: AdapterConfig,
      ) => ({
        id: `agent-${task.id}`,
        taskId: task.id,
        adapter: "test",
        startedAt: Date.now(),
        attempt: 1,
        logPath: `.apex/orchestrator-logs/${task.id}.log`,
      }),
      monitor: (_h: AgentHandle) => ({ state: "running" as const }),
      output: (_h: AgentHandle) => null,
      kill: (_h: AgentHandle) => {},
      resume: async (
        sessionId: string,
        _prompt: string,
        _config: AdapterConfig,
      ) => ({
        id: `agent-resume-${sessionId}`,
        taskId: "T1",
        adapter: "test",
        startedAt: Date.now(),
        attempt: 2,
        logPath: ".apex/orchestrator-logs/T1.log",
        sessionId,
      }),
    };

    const handle = await mockAdapter.spawn(
      { id: "T5", title: "Test task", description: "A test" },
      "Do the thing",
      { command: "test", args: [] },
    );

    expect(handle.taskId).toBe("T5");
    expect(handle.adapter).toBe("test");
    expect(handle.attempt).toBe(1);
  });

  test("RuntimeAdapter resume returns handle with incremented attempt", async () => {
    const mockAdapter: RuntimeAdapter = {
      name: () => "test",
      available: () => true,
      spawn: async (_t: TaskDispatchInfo, _p: string, _c: AdapterConfig) => ({
        id: "x",
        taskId: "T1",
        adapter: "test",
        startedAt: 0,
        attempt: 1,
        logPath: "",
      }),
      monitor: (_h: AgentHandle) => ({ state: "running" as const }),
      output: (_h: AgentHandle) => null,
      kill: (_h: AgentHandle) => {},
      resume: async (
        sessionId: string,
        _prompt: string,
        _config: AdapterConfig,
      ) => ({
        id: `resumed-${sessionId}`,
        taskId: "T1",
        adapter: "test",
        startedAt: Date.now(),
        attempt: 3,
        logPath: ".apex/orchestrator-logs/T1.log",
        sessionId,
      }),
    };

    const handle = await mockAdapter.resume("sess-abc", "Continue work", {
      command: "test",
      args: [],
    });
    expect(handle.attempt).toBe(3);
    expect(handle.sessionId).toBe("sess-abc");
  });
});
