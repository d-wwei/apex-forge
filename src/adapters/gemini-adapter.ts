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
  const path = join(dir, `${taskId}-gemini-${Date.now()}.txt`);
  writeFileSync(path, prompt, "utf-8");
  return path;
}

export class GeminiAdapter implements RuntimeAdapter {
  name(): string {
    return "gemini";
  }

  available(): boolean {
    try {
      const result = spawnSync("gemini", ["--version"], {
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
    const logPath = `${logDir}/${task.id}-gemini.log`;

    // Save prompt for auditability + use as fallback for long prompts
    const promptFile = writePromptFile(task.id, prompt);
    const baseCmd = config.command || "gemini";
    let spawnCmd: string;
    let args: string[];

    if (baseCmd === "gemini") {
      const promptBytes = Buffer.byteLength(prompt);
      if (promptBytes > 200_000) {
        // Long prompt: use shell to read from file, avoids ARG_MAX
        const extraArgs = (config.args || []).join(" ");
        spawnCmd = "sh";
        args = [
          "-c",
          `${baseCmd} ${extraArgs} --yolo -p "$(cat '${promptFile}')"`.trim(),
        ];
      } else {
        spawnCmd = baseCmd;
        args = [...(config.args || []), "--yolo", "-p", prompt];
      }
    } else {
      spawnCmd = baseCmd;
      args = [...(config.args || []), ...(prompt ? [prompt] : [])];
    }

    const proc = spawn(spawnCmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, APEX_TASK_ID: task.id },
      ...(config.cwd ? { cwd: config.cwd } : {}),
    });

    proc.stdout?.on("data", (chunk: Buffer) => appendFileSync(logPath, chunk));
    proc.stderr?.on("data", (chunk: Buffer) => appendFileSync(logPath, chunk));

    return {
      id: `gemini-${++handleCounter}-${task.id}`,
      taskId: task.id,
      adapter: "gemini",
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
    // Gemini supports --resume for session continuation
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
