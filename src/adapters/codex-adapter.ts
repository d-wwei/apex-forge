import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type {
  AdapterConfig,
  AdapterStatus,
  AgentHandle,
  RuntimeAdapter,
  TaskDispatchInfo,
} from "./runtime.js";

let handleCounter = 0;

function writePromptFile(taskId: string, prompt: string): string {
  const dir = ".apex/orchestrator-prompts";
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${taskId}-codex-${Date.now()}.txt`);
  writeFileSync(path, prompt, "utf-8");
  return path;
}

export class CodexAdapter implements RuntimeAdapter {
  name(): string {
    return "codex";
  }

  available(): boolean {
    try {
      const result = spawnSync("codex", ["--version"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  async spawn(
    task: TaskDispatchInfo,
    prompt: string,
    config: AdapterConfig,
  ): Promise<AgentHandle> {
    const logDir = ".apex/orchestrator-logs";
    mkdirSync(logDir, { recursive: true });
    const logPath = `${logDir}/${task.id}-codex.log`;

    // Save prompt for auditability
    writePromptFile(task.id, prompt);

    const cmd = config.command || "codex";
    let args: string[];
    let useStdin = false;

    if (cmd === "codex") {
      // codex exec: non-interactive mode
      // --full-auto enables workspace-write sandbox + auto-approval
      // Prompt via stdin (codex reads from stdin when no prompt arg given)
      args = [...(config.args || []), "exec", "--full-auto"];
      useStdin = true;
    } else {
      args = [...(config.args || []), ...(prompt ? [prompt] : [])];
    }

    const proc = spawn(cmd, args, {
      stdio: [useStdin ? "pipe" : "ignore", "pipe", "pipe"],
      env: { ...process.env, APEX_TASK_ID: task.id },
      ...(config.cwd ? { cwd: config.cwd } : {}),
    });

    if (useStdin && proc.stdin) {
      proc.stdin.write(prompt);
      proc.stdin.end();
    }

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

  async resume(
    sessionId: string,
    prompt: string,
    config: AdapterConfig,
    taskId?: string,
  ): Promise<AgentHandle> {
    // Codex supports resume via `codex exec resume --last`; fall back to fresh spawn
    return this.spawn(
      {
        id: taskId || `resume-${sessionId}`,
        title: "Resume",
        description: prompt,
      },
      prompt,
      config,
    );
  }
}
