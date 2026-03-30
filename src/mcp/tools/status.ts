/**
 * Apex Forge — MCP Status Tool
 *
 * Registers the apex_status tool on the MCP server.
 * Available to all roles — provides a unified project status overview.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadState } from "../../state/stage.js";
import { taskList } from "../../state/tasks.js";
import { memoryList } from "../../state/memory.js";
import type { TaskStatus } from "../../types/task.js";

const VERSION = "0.1.0";

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
}

export function registerStatusTools(server: McpServer) {
  server.tool(
    "apex_status",
    "Show current apex-forge project status: stage, tasks, memory, artifacts, next task",
    {},
    async () => {
      try {
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

        // Highest confidence
        const highestConf =
          facts.length > 0
            ? Math.max(...facts.map((f) => f.confidence))
            : 0;

        // Next available task
        const doneIds = new Set(
          tasks.filter((t) => t.status === "done").map((t) => t.id),
        );
        const nextTask = tasks.find(
          (t) =>
            t.status === "open" &&
            t.depends_on.every((dep) => doneIds.has(dep)),
        );

        const output = {
          version: VERSION,
          session_id: state.session_id,
          stage: state.current_stage,
          last_updated: state.last_updated,
          tasks: {
            total: tasks.length,
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

        return ok(JSON.stringify(output, null, 2));
      } catch (e) {
        return err(e);
      }
    },
  );
}
