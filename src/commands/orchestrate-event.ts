/**
 * `apex orchestrate event <action> [--task <id>] [--detail <json>]`
 *
 * Records an orchestration event to state.jsonl for Dashboard visibility
 * and cross-session recovery audit trail.
 */

import { appendEvent } from "../state/event-log.js";

export async function cmdOrchestrateEvent(args: string[]): Promise<void> {
  const action = args[0]?.startsWith("--") ? undefined : args[0];
  if (!action) {
    console.error(
      "Usage: apex orchestrate event <action> [--task <id>] [--detail <json>]",
    );
    process.exit(1);
  }

  // Parse --task flag
  const taskIdx = args.indexOf("--task");
  const task = taskIdx >= 0 ? args[taskIdx + 1] : undefined;

  // Parse --detail flag (JSON object merged into payload)
  const detailIdx = args.indexOf("--detail");
  let detail: Record<string, unknown> = {};
  if (detailIdx >= 0 && args[detailIdx + 1]) {
    try {
      detail = JSON.parse(args[detailIdx + 1]);
    } catch {
      console.error("Invalid JSON for --detail");
      process.exit(1);
    }
  }

  const payload: Record<string, unknown> = { action, ...detail };
  if (task) payload.task = task;

  appendEvent("state", "orchestration.event", payload);
  console.log(
    `Recorded orchestration event: ${action}${task ? ` (task: ${task})` : ""}`,
  );
}
