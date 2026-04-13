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
import { existsSync } from "fs";
import { readdir } from "fs/promises";

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
 * Structural gate check result for a single item.
 */
export interface GateCheckItem {
  id: string;
  pass: boolean;
  reason: string;
}

/**
 * Run structural gate checks for a stage before allowing completion.
 * Returns { pass, items } where items lists each check with pass/fail and reason.
 */
export async function runStructuralGate(stage: string): Promise<{ pass: boolean; items: GateCheckItem[] }> {
  const state = await loadState();
  const items: GateCheckItem[] = [];

  const stageArtifacts = state.artifacts[stage] ?? [];
  const hasArtifact = stageArtifacts.length > 0;

  // Load task store for task-related checks
  const taskStore = await readJSON<{ tasks: Array<{ id: string; status: string; depends_on: string[] }> }>(
    ".apex/tasks.json",
    { tasks: [] },
  );
  const allTasks = taskStore.tasks;

  switch (stage) {
    case "brainstorm": {
      items.push({ id: "S1", pass: hasArtifact, reason: hasArtifact ? "Artifact registered" : "No artifact registered (run: apex stage artifact brainstorm <path>)" });
      const artifactPath = stageArtifacts[0];
      const fileExists = artifactPath ? existsSync(artifactPath) : false;
      items.push({ id: "S2", pass: fileExists, reason: fileExists ? `File exists: ${artifactPath}` : "Artifact file not found on disk" });
      break;
    }
    case "plan": {
      items.push({ id: "S1", pass: hasArtifact, reason: hasArtifact ? "Artifact registered" : "No artifact registered (run: apex stage artifact plan <path>)" });
      const artifactPath = stageArtifacts[0];
      const fileExists = artifactPath ? existsSync(artifactPath) : false;
      items.push({ id: "S2", pass: fileExists, reason: fileExists ? `File exists: ${artifactPath}` : "Artifact file not found on disk" });
      const hasOpenTasks = allTasks.some(t => t.status === "open" || t.status === "assigned");
      items.push({ id: "S3", pass: hasOpenTasks || allTasks.length > 0, reason: allTasks.length > 0 ? `${allTasks.length} tasks registered` : "No tasks registered (run: apex task create)" });
      break;
    }
    case "execute": {
      if (allTasks.length === 0) {
        items.push({ id: "S1", pass: false, reason: "No tasks registered — create tasks first (apex task create)" });
      } else {
        const nonDone = allTasks.filter(t => t.status !== "done");
        const allDone = nonDone.length === 0;
        items.push({ id: "S1", pass: allDone, reason: allDone ? `All ${allTasks.length} tasks done` : `${nonDone.length} task(s) not done: ${nonDone.map(t => t.id).join(", ")}` });
      }
      break;
    }
    case "review": {
      items.push({ id: "S1", pass: hasArtifact, reason: hasArtifact ? "Artifact registered" : "No review artifact registered" });
      const artifactPath = stageArtifacts[0];
      const fileExists = artifactPath ? existsSync(artifactPath) : false;
      items.push({ id: "S2", pass: fileExists, reason: fileExists ? `File exists: ${artifactPath}` : "Review artifact file not found" });
      break;
    }
    case "ship": {
      // Check that a review artifact exists in state
      const reviewArtifacts = state.artifacts["review"] ?? [];
      items.push({ id: "S1", pass: reviewArtifacts.length > 0, reason: reviewArtifacts.length > 0 ? "Review artifact confirmed" : "No review artifact — complete Review first" });
      break;
    }
    case "compound": {
      // Check that a solution doc or roadmap snapshot exists
      let hasSolution = false;
      try {
        const files = await readdir("docs/solutions", { recursive: true });
        hasSolution = files.some(f => f.toString().endsWith(".md"));
      } catch { /* dir doesn't exist */ }
      let hasRoadmap = false;
      try {
        const files = await readdir("docs/roadmaps");
        hasRoadmap = files.some(f => f.toString().endsWith(".md"));
      } catch { /* dir doesn't exist */ }
      items.push({ id: "S1", pass: hasSolution || hasRoadmap, reason: (hasSolution || hasRoadmap) ? "Solution/roadmap doc exists" : "No solution doc or roadmap snapshot found" });
      break;
    }
    default: {
      // Unknown stage — pass through (no gate defined)
      items.push({ id: "S0", pass: true, reason: `No structural gate defined for stage: ${stage}` });
    }
  }

  const pass = items.every(i => i.pass);
  return { pass, items };
}

/**
 * Mark the current history entry for a stage as completed.
 * Runs structural gate checks first — refuses if any check fails.
 */
export async function completeStage(stage: string, skipGate = false): Promise<StageState> {
  if (!skipGate) {
    const gate = await runStructuralGate(stage);
    if (!gate.pass) {
      const failed = gate.items.filter(i => !i.pass);
      const msg = failed.map(i => `  ${i.id}: FAIL — ${i.reason}`).join("\n");
      throw new Error(`Stage gate BLOCKED for '${stage}':\n${msg}\n\nFix the issues above, then retry.`);
    }
  }
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
