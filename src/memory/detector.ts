/**
 * Apex Forge — Memory Backend Detector
 *
 * Probes available memory systems in priority order and returns the best one.
 * Detection is fast (2s timeout) and silent — no user interaction needed.
 */

import type { MemoryBackend } from "./interface.js";
import { AgentRecallBackend } from "./agent-recall-backend.js";
import { LocalBackend } from "./local-backend.js";

const AGENT_RECALL_URL = "http://localhost:37777";
const PROBE_TIMEOUT_MS = 2000;

// ---------------------------------------------------------------------------
// Singleton cache — detect once per process
// ---------------------------------------------------------------------------

let cachedBackend: MemoryBackend | null = null;

/**
 * Detect the best available memory backend.
 * Results are cached for the lifetime of the process.
 */
export async function detectMemoryBackend(): Promise<MemoryBackend> {
  if (cachedBackend) return cachedBackend;

  // Priority 1: Agent Recall
  try {
    const resp = await fetch(`${AGENT_RECALL_URL}/api/search?query=ping&project=_probe`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    // Any HTTP response (even 4xx) means the server is running
    if (resp.ok || resp.status < 500) {
      cachedBackend = new AgentRecallBackend();
      return cachedBackend;
    }
  } catch {
    // Agent Recall not running — continue
  }

  // Priority N: Future backends can be probed here

  // Fallback: local .apex/ files
  cachedBackend = new LocalBackend();
  return cachedBackend;
}

/**
 * Reset the cached backend (for testing or re-detection).
 */
export function resetBackendCache(): void {
  cachedBackend = null;
}
