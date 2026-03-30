import { loadState } from "../state/stage.js";
import { taskList } from "../state/tasks.js";
import { memoryList } from "../state/memory.js";
import type { TaskStatus } from "../types/task.js";

const VERSION = "0.1.0";

export async function cmdStatus(args: string[]): Promise<void> {
  const jsonMode = args.includes("--json");

  const state = await loadState();
  const tasks = await taskList();
  const facts = await memoryList();

  // Count tasks by status
  const counts: Record<TaskStatus, number> = {
    open: 0,
    assigned: 0,
    in_progress: 0,
    to_verify: 0,
    done: 0,
    blocked: 0,
  };
  for (const t of tasks) {
    counts[t.status]++;
  }
  const total = tasks.length;

  // Find highest confidence
  const highestConf =
    facts.length > 0
      ? Math.max(...facts.map((f) => f.confidence))
      : 0;

  // Find next available task
  const doneIds = new Set(
    tasks.filter((t) => t.status === "done").map((t) => t.id),
  );
  const nextTask = tasks.find(
    (t) =>
      t.status === "open" &&
      t.depends_on.every((dep) => doneIds.has(dep)),
  );

  // Collect recent artifacts (last 5 entries across all types)
  const artifactEntries: { type: string; path: string }[] = [];
  for (const [type, paths] of Object.entries(state.artifacts)) {
    for (const p of paths) {
      artifactEntries.push({ type, path: p });
    }
  }
  const recentArtifacts = artifactEntries.slice(-5);

  if (jsonMode) {
    const output = {
      version: VERSION,
      session_id: state.session_id,
      stage: state.current_stage,
      last_updated: state.last_updated,
      tasks: {
        total,
        ...counts,
      },
      memory: {
        count: facts.length,
        highest_confidence: highestConf,
      },
      artifacts: state.artifacts,
      next_task: nextTask
        ? { id: nextTask.id, title: nextTask.title }
        : null,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Human-readable output
  console.log(`apex-forge v${VERSION}`);
  console.log();
  console.log(`Session: ${state.session_id || "(none)"}`);
  console.log(`Stage:   ${state.current_stage}`);
  console.log(`Updated: ${state.last_updated}`);
  console.log();

  const taskParts = [
    `${total} total`,
    counts.done > 0 ? `${counts.done} done` : null,
    counts.in_progress > 0 ? `${counts.in_progress} in_progress` : null,
    counts.open > 0 ? `${counts.open} open` : null,
    counts.assigned > 0 ? `${counts.assigned} assigned` : null,
    counts.blocked > 0 ? `${counts.blocked} blocked` : null,
    counts.to_verify > 0 ? `${counts.to_verify} to_verify` : null,
  ].filter(Boolean);
  console.log(`Tasks:  ${taskParts.join(" | ")}`);

  if (facts.length > 0) {
    console.log(
      `Memory: ${facts.length} facts (highest: ${highestConf.toFixed(2)})`,
    );
  } else {
    console.log("Memory: 0 facts");
  }

  if (recentArtifacts.length > 0) {
    console.log();
    console.log("Recent artifacts:");
    for (const a of recentArtifacts) {
      console.log(`  ${a.type}: ${a.path}`);
    }
  }

  if (nextTask) {
    console.log();
    console.log(`Next task: ${nextTask.id} — "${nextTask.title}"`);
  }
}
