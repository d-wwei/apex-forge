import { existsSync, unlinkSync, readFileSync } from "fs";
import { readJSON, writeJSON } from "../utils/json.js";
import type { TaskStore } from "../types/task.js";

const BROWSE_STATE = ".apex/browse.json";
const TELEMETRY_SESSION = ".apex/.telemetry-session";

export async function recoverState(): Promise<string[]> {
  const issues: string[] = [];

  // 1. Clean stale browse daemon state
  if (existsSync(BROWSE_STATE)) {
    try {
      const info = JSON.parse(readFileSync(BROWSE_STATE, "utf-8"));
      try {
        process.kill(info.pid, 0); // Check if alive
      } catch {
        // Process is dead, clean up state file
        unlinkSync(BROWSE_STATE);
        issues.push("Cleaned stale browse daemon state (process was dead)");
      }
    } catch {
      unlinkSync(BROWSE_STATE);
      issues.push("Cleaned corrupted browse state file");
    }
  }

  // 2. Clean stale telemetry session
  if (existsSync(TELEMETRY_SESSION)) {
    try {
      const session = JSON.parse(readFileSync(TELEMETRY_SESSION, "utf-8"));
      const age = Date.now() - (session.started_at || 0);
      if (age > 3600000) {
        // > 1 hour
        unlinkSync(TELEMETRY_SESSION);
        issues.push("Cleaned stale telemetry session (>1 hour old)");
      }
    } catch {
      unlinkSync(TELEMETRY_SESSION);
      issues.push("Cleaned corrupted telemetry session");
    }
  }

  // 3. Fix tasks stuck in assigned/in_progress without an active orchestrator
  const store = await readJSON<TaskStore>(".apex/tasks.json", {
    tasks: [],
    next_id: 1,
  });
  let fixed = false;
  for (const task of store.tasks) {
    if (task.status === "assigned" || task.status === "in_progress") {
      task.status = "open";
      task.updated_at = new Date().toISOString();
      issues.push(
        `Released stuck task ${task.id} (${task.title}) back to open`,
      );
      fixed = true;
    }
  }
  if (fixed) {
    await writeJSON(".apex/tasks.json", store);
  }

  // 4. Validate JSON files aren't corrupted
  for (const file of [
    ".apex/state.json",
    ".apex/tasks.json",
    ".apex/memory.json",
  ]) {
    if (existsSync(file)) {
      try {
        JSON.parse(readFileSync(file, "utf-8"));
      } catch {
        issues.push(
          `WARNING: ${file} is corrupted. Run 'apex init' to reset.`,
        );
      }
    }
  }

  return issues;
}
