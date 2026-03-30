/**
 * Daemon lifecycle manager.
 *
 * - Reads / writes `.apex/browse.json` to track the running daemon.
 * - Spawns the daemon by re-invoking the same binary with `__daemon__ PORT TOKEN`.
 * - Provides `sendCommand` for the client CLI and `stopDaemon` for cleanup.
 */

import { existsSync, unlinkSync, openSync, mkdirSync } from "fs";
import { dirname } from "path";
import { spawn as nodeSpawn } from "child_process";
import { readJSON, writeJSON } from "../utils/json.js";
import type { DaemonInfo, CommandResult } from "./types.js";

const STATE_FILE = ".apex/browse.json";
const LOG_FILE = ".apex/browse-daemon.log";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return a running daemon, starting one if necessary. */
export async function ensureDaemon(): Promise<DaemonInfo> {
  const existing = await connectDaemon();
  if (existing) return existing;
  return startDaemon();
}

/** Send a command to a running daemon and return the text result. */
export async function sendCommand(
  info: DaemonInfo,
  command: string,
  args: string[],
): Promise<string> {
  const resp = await fetch(`http://127.0.0.1:${info.port}/command`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${info.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command, args }),
    signal: AbortSignal.timeout(30_000),
  });

  const result = (await resp.json()) as CommandResult;
  if (!result.ok) throw new Error(result.error || "Command failed");
  return result.data || "";
}

/** Stop the running daemon (if any) and remove the state file. */
export async function stopDaemon(): Promise<void> {
  const info = await connectDaemon();
  if (!info) {
    console.log("No daemon running");
    return;
  }

  try {
    await fetch(`http://127.0.0.1:${info.port}/stop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${info.token}` },
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Best-effort; the daemon may already be gone.
  }

  try {
    unlinkSync(STATE_FILE);
  } catch {
    // Already cleaned up.
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Try to connect to an existing daemon.  Returns null when none is alive. */
async function connectDaemon(): Promise<DaemonInfo | null> {
  if (!existsSync(STATE_FILE)) return null;

  const info = await readJSON<DaemonInfo | null>(STATE_FILE, null);
  if (!info) return null;

  try {
    // Signal 0 = check if process is alive (throws if not).
    process.kill(info.pid, 0);

    const resp = await fetch(`http://127.0.0.1:${info.port}/status`, {
      headers: { Authorization: `Bearer ${info.token}` },
      signal: AbortSignal.timeout(2_000),
    });
    if (resp.ok) return info;
  } catch {
    // Process dead or port unreachable — clean up stale state.
  }

  try {
    unlinkSync(STATE_FILE);
  } catch {
    // Already gone.
  }
  return null;
}

/**
 * Build the argv prefix to re-invoke ourselves.
 *
 * Compiled binary:
 *   process.argv     = ["bun", "/$bunfs/root/apex-browse", "goto", ...]
 *   process.execPath = "/real/path/to/apex-browse"
 *   → spawn [process.execPath, "__daemon__", ...]
 *
 * Dev mode (bun run):
 *   process.argv     = ["/path/to/bun", "src/browse/cli.ts", "goto", ...]
 *   process.execPath = "/path/to/bun"
 *   → spawn ["bun", "src/browse/cli.ts", "__daemon__", ...]
 */
function selfArgv(): string[] {
  // In a compiled Bun binary, argv[1] is a virtual $bunfs path.
  // Use process.execPath which points to the real compiled binary.
  const script = process.argv[1];
  if (script && script.startsWith("/$bunfs/")) {
    // Compiled binary mode.
    return [process.execPath];
  }
  // Dev mode: bun run src/browse/cli.ts ...
  if (script && /\.[tj]sx?$/.test(script)) {
    return [process.execPath, script];
  }
  // Fallback: compiled binary where argv[1] is the user command.
  return [process.execPath];
}

/** Spawn a new daemon sub-process and wait for it to become ready. */
async function startDaemon(): Promise<DaemonInfo> {
  const port = 10_000 + Math.floor(Math.random() * 50_000);
  const token = crypto.randomUUID();

  // Re-invoke ourselves as the daemon.
  // Use Node's child_process.spawn with detached:true so the daemon
  // survives after the parent (CLI client) exits.
  const argv = selfArgv();
  const logDir = dirname(LOG_FILE);
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const logFd = openSync(LOG_FILE, "a");

  const proc = nodeSpawn(argv[0], [...argv.slice(1), "__daemon__", String(port), token], {
    stdio: ["ignore", logFd, logFd],
    detached: true,
    cwd: process.cwd(),
  });
  proc.unref();

  if (!proc.pid) throw new Error("Failed to spawn daemon process");

  const info: DaemonInfo = {
    pid: proc.pid,
    port,
    token,
    started_at: new Date().toISOString(),
  };

  await writeJSON(STATE_FILE, info);

  // Poll until the daemon is listening (up to 10 s).
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/status`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(1_000),
      });
      if (resp.ok) return info;
    } catch {
      // Not ready yet.
    }
  }

  throw new Error("Daemon failed to start within 10 seconds");
}
