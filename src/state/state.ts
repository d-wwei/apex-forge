/**
 * Apex Forge — Stage State
 *
 * Ports the stage management section of hooks/state-helper into TypeScript.
 * Manages current_stage, history, artifacts, and session identity.
 */

import { readJSON, writeJSON } from "../utils/json.js";
import { isoTimestamp, sessionId } from "../utils/timestamp.js";
import type { StageState, StageHistory } from "../types/state.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_PATH = ".apex/state.json";

function defaultState(): StageState {
  return {
    current_stage: "idle",
    last_updated: isoTimestamp(),
    session_id: sessionId(),
    artifacts: {
      brainstorm: [],
      plan: [],
      execute: [],
      review: [],
      solutions: [],
    },
    history: [],
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadState(): Promise<StageState> {
  return readJSON<StageState>(STATE_PATH, defaultState());
}

async function saveState(state: StageState): Promise<void> {
  await writeJSON(STATE_PATH, state);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read or create the default stage state.
 */
export async function getState(): Promise<StageState> {
  return loadState();
}

/**
 * Set the current stage and record a new history entry.
 * If a previous stage was active (not idle, not the same stage),
 * its history entry is completed first.
 */
export async function setStage(stage: string): Promise<StageState> {
  const state = await loadState();
  const now = isoTimestamp();
  const oldStage = state.current_stage;

  // Close previous stage in history if it was active and different
  if (oldStage !== "idle" && oldStage !== stage) {
    for (let i = state.history.length - 1; i >= 0; i--) {
      const entry = state.history[i];
      if (entry.stage === oldStage && !entry.completed) {
        entry.completed = now;
        break;
      }
    }
  }

  // Record new stage start
  const entry: StageHistory = { stage, started: now };
  state.history.push(entry);

  // Update current stage
  state.current_stage = stage;
  state.last_updated = now;

  // Ensure artifacts key exists for this stage
  if (!state.artifacts[stage]) {
    state.artifacts[stage] = [];
  }

  await saveState(state);
  return state;
}

/**
 * Mark the current history entry for a stage as completed.
 */
export async function completeStage(stage: string): Promise<StageState> {
  const state = await loadState();
  const now = isoTimestamp();

  // Find the most recent uncompleted entry for this stage
  for (let i = state.history.length - 1; i >= 0; i--) {
    const entry = state.history[i];
    if (entry.stage === stage && !entry.completed) {
      entry.completed = now;
      break;
    }
  }

  state.last_updated = now;
  await saveState(state);
  return state;
}

/**
 * Add an artifact path to a stage's list. No duplicates.
 */
export async function addArtifact(
  stage: string,
  path: string,
): Promise<StageState> {
  const state = await loadState();
  const now = isoTimestamp();

  if (!state.artifacts[stage]) {
    state.artifacts[stage] = [];
  }

  if (!state.artifacts[stage].includes(path)) {
    state.artifacts[stage].push(path);
  }

  state.last_updated = now;
  await saveState(state);
  return state;
}

/**
 * Get artifact paths for a given stage.
 */
export async function getArtifacts(stage: string): Promise<string[]> {
  const state = await loadState();
  return state.artifacts[stage] ?? [];
}

/**
 * Format a human-readable status summary (same format as `apex status`).
 */
export async function statusSummary(): Promise<string> {
  const state = await loadState();

  const totalArtifacts = Object.values(state.artifacts).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );
  const completedStages = state.history.filter((h) => h.completed).length;

  const lines = [
    `Session: ${state.session_id}`,
    `Stage: ${state.current_stage}`,
    `Updated: ${state.last_updated}`,
    `Artifacts: ${totalArtifacts} total`,
    `History: ${completedStages} stages completed, ${state.history.length} total entries`,
  ];

  return lines.join("\n");
}

/**
 * Return the full state as a plain object (for session-start hook injection).
 */
export async function statusJSON(): Promise<object> {
  return loadState();
}
