/**
 * Apex Forge — Stage State
 *
 * Ports the stage management section of hooks/state-helper into TypeScript.
 * Manages current_stage, history, artifacts, and session identity.
 */

import { readJSON } from "../utils/json.js";
import { appendJSONL } from "../utils/logger.js";
import { isoTimestamp, sessionId } from "../utils/timestamp.js";
import type { StageState } from "../types/state.js";
import { appendEvent, rebuildAndCache } from "./event-log.js";

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

// saveState removed — writes go through event log + rebuildAndCache

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

  appendEvent("state", "stage.set", {
    stage,
    previous: state.current_stage,
  });

  await rebuildAndCache("state");
  return loadState();
}

/**
 * Mark the current history entry for a stage as completed.
 */
export async function completeStage(stage: string): Promise<StageState> {
  appendEvent("state", "stage.completed", { stage });
  await rebuildAndCache("state");
  return loadState();
}

/**
 * Add an artifact path to a stage's list. No duplicates.
 */
export async function addArtifact(
  stage: string,
  path: string,
): Promise<StageState> {
  appendEvent("state", "artifact.added", { stage, path });
  await rebuildAndCache("state");
  return loadState();
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

// ---------------------------------------------------------------------------
// Skill Invocation Trace
// ---------------------------------------------------------------------------

const ANALYTICS_FILE = ".apex/analytics/usage.jsonl";

/**
 * Record a skill invocation trace into state.json and simultaneously
 * write a telemetry record to .apex/analytics/usage.jsonl.
 */
export async function addSkillInvocation(
  stage: string,
  skill: string,
  version: string,
  outputStatus: string,
  afMapping: string,
): Promise<StageState> {
  const now = isoTimestamp();

  appendEvent("state", "skill.invoked", {
    stage,
    skill,
    version,
    output_status: outputStatus,
    af_mapping: afMapping,
  });

  await rebuildAndCache("state");

  // Auto-write telemetry record
  appendJSONL(ANALYTICS_FILE, {
    skill,
    duration_s: 0,
    outcome: outputStatus,
    ts: now,
  });

  return loadState();
}
