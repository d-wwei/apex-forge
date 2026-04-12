import { spawn, spawnSync } from "child_process";
import { mkdirSync, appendFileSync, readFileSync } from "fs";
import type { RuntimeAdapter, AgentHandle, AdapterStatus, AdapterConfig, TaskDispatchInfo } from "./runtime.js";

let handleCounter = 0;

export class CodexAdapter implements RuntimeAdapter {
  name(): string {
    return "codex";
  }

  available(): boolean {
    const result = spawnSync("which", ["codex"], { encoding: "utf-8" });
    return result.status === 0;
  }

  async spawn(task: TaskDispatchInfo, prompt: string, config: AdapterConfig): Promise<AgentHandle> {
    const logDir = ".apex/orchestrator-logs";
    mkdirSync(logDir, { recursive: true });
    const logPath = `${logDir}/${task.id}-codex.log`;

    const cmd = config.command || "codex";
    const args = cmd === "codex"
      ? ["-q", prompt]
      : [...(config.args || []), ...(prompt ? [prompt] : [])];

    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, APEX_TASK_ID: task.id },
      ...(config.cwd ? { cwd: config.cwd } : {}),
    });

    proc.stdout?.on("data", (chunk: Buffer) => appendFileSync(logPath, chunk));
    proc.stderr?.on("data", (chunk: Buffer) => appendFileSync(logPath, chunk));

    return {
      id: `codex-${++handleCounter}-${task.id}`,
      taskId: task.id,
      adapter: "codex",
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

  async resume(sessionId: string, prompt: string, config: AdapterConfig): Promise<AgentHandle> {
    // Codex doesn't support --resume; spawn fresh with context
    return this.spawn(
      { id: `resume-${sessionId}`, title: "Resume", description: prompt },
      prompt,
      config
    );
  }
}
