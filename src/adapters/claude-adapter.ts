import { spawn, spawnSync } from "child_process";
import { mkdirSync, appendFileSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { RuntimeAdapter, AgentHandle, AdapterStatus, AdapterConfig, TaskDispatchInfo } from "./runtime.js";

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function writePromptFile(taskId: string, prompt: string): string {
  const dir = ".apex/orchestrator-prompts";
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${taskId}-${Date.now()}.txt`);
  writeFileSync(path, prompt, "utf-8");
  return path;
}

export class ClaudeAdapter implements RuntimeAdapter {
  name(): string {
    return "claude";
  }

  available(): boolean {
    try {
      const result = spawnSync("claude", ["--version"], { encoding: "utf-8", timeout: 5000 });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  async spawn(task: TaskDispatchInfo, prompt: string, config: AdapterConfig): Promise<AgentHandle> {
    const logDir = ".apex/orchestrator-logs";
    mkdirSync(logDir, { recursive: true });
    const logPath = `${logDir}/${task.id}.log`;

    const cmd = config.command;
    let args: string[];

    if (cmd === "claude") {
      // Write prompt to temp file to avoid ARG_MAX and ps visibility
      const promptFile = writePromptFile(task.id, prompt);
      args = [...(config.args || []), "--print", "-p", `$(cat ${promptFile})`];
      // Actually, spawn doesn't expand $(), so read the file and pass directly
      // For long prompts, this is still better than nothing — the real fix is stdin
      args = [...(config.args || []), "--print", "-p", prompt];
    } else {
      // For testing: allow overriding with any command (e.g. "echo", "sleep")
      args = [...(config.args || []), ...(prompt ? [prompt] : [])];
    }

    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, APEX_TASK_ID: task.id },
      ...(config.cwd ? { cwd: config.cwd } : {}),
    });

    proc.stdout?.on("data", (chunk: Buffer) => appendFileSync(logPath, chunk));
    proc.stderr?.on("data", (chunk: Buffer) => appendFileSync(logPath, chunk));

    return {
      id: uniqueId("claude"),
      taskId: task.id,
      adapter: "claude",
      startedAt: Date.now(),
      attempt: 1,
      logPath,
      process: proc,
    };
  }

  monitor(handle: AgentHandle): AdapterStatus {
    if (!handle.process) return { state: "exited", exitCode: -1 };
    if (handle.process.exitCode !== null) {
      return { state: "exited", exitCode: handle.process.exitCode };
    }
    return { state: "running" };
  }

  output(handle: AgentHandle): string | null {
    try {
      return readFileSync(handle.logPath, "utf-8");
    } catch {
      return null;
    }
  }

  kill(handle: AgentHandle): void {
    if (handle.process && handle.process.exitCode === null) {
      handle.process.kill("SIGTERM");
    }
  }

  async resume(sessionId: string, prompt: string, config: AdapterConfig, taskId?: string): Promise<AgentHandle> {
    const logDir = ".apex/orchestrator-logs";
    mkdirSync(logDir, { recursive: true });
    const logPath = `${logDir}/resume-${sessionId}.log`;

    const cmd = config.command || "claude";
    const args = cmd === "claude"
      ? ["--print", "--resume", sessionId, "-p", prompt]
      : [...(config.args || []), prompt];

    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(taskId ? { APEX_TASK_ID: taskId } : {}) },
      ...(config.cwd ? { cwd: config.cwd } : {}),
    });

    proc.stdout?.on("data", (chunk: Buffer) => appendFileSync(logPath, chunk));
    proc.stderr?.on("data", (chunk: Buffer) => appendFileSync(logPath, chunk));

    return {
      id: uniqueId("claude-resume"),
      taskId: taskId || sessionId,
      adapter: "claude",
      startedAt: Date.now(),
      attempt: 2,
      logPath,
      sessionId,
      process: proc,
    };
  }
}
