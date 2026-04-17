import type { ChildProcess } from "node:child_process";

// --- Adapter Status ---

export type AdapterState = "running" | "idle" | "exited";

export interface AdapterStatus {
  state: AdapterState;
  exitCode?: number;
}

// --- Agent Handle ---

export interface AgentHandle {
  id: string;
  taskId: string;
  adapter: string;
  startedAt: number;
  attempt: number;
  logPath: string;
  sessionId?: string;
  process?: ChildProcess;
}

// --- Adapter Config ---

export interface AdapterConfig {
  command: string;
  args: string[];
  cwd?: string;
}

// --- Task Dispatch Info (subset of Task for adapter consumption) ---

export interface TaskDispatchInfo {
  id: string;
  title: string;
  description: string;
}

// --- Runtime Adapter Interface ---

export interface RuntimeAdapter {
  /** Adapter name, e.g. "claude", "codex", "gemini" */
  name(): string;

  /** Whether this adapter's CLI is available in PATH */
  available(): boolean;

  /** Spawn a new agent for a task */
  spawn(
    task: TaskDispatchInfo,
    prompt: string,
    config: AdapterConfig,
  ): Promise<AgentHandle>;

  /** Check agent status without blocking */
  monitor(handle: AgentHandle): AdapterStatus;

  /** Read agent output (stdout or result file). Returns null if not yet available. */
  output(handle: AgentHandle): string | null;

  /** Kill a running agent */
  kill(handle: AgentHandle): void;

  /** Resume a previous session for retry */
  resume(
    sessionId: string,
    prompt: string,
    config: AdapterConfig,
  ): Promise<AgentHandle>;
}
