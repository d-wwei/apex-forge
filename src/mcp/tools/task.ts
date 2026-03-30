/**
 * Apex Forge — MCP Task Tools
 *
 * Registers task management tools on the MCP server.
 * Covers the full task lifecycle: create, assign, start, submit, verify, block, release, list, next, get.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  taskCreate,
  taskAssign,
  taskStart,
  taskSubmit,
  taskVerify,
  taskBlock,
  taskRelease,
  taskList,
  taskNext,
  taskGet,
} from "../../state/tasks.js";

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
}

export function registerTaskTools(server: McpServer) {
  // ── Create ──────────────────────────────────────────────────────────────
  server.tool(
    "apex_task_create",
    "Create a new task with title, description, and optional dependencies",
    {
      title: z.string(),
      description: z.string(),
      depends_on: z.array(z.string()).optional(),
    },
    async ({ title, description, depends_on }) => {
      try {
        const task = await taskCreate(title, description, depends_on || []);
        return ok(`Created ${task.id}: ${task.title}`);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── Assign (open -> assigned) ───────────────────────────────────────────
  server.tool(
    "apex_task_assign",
    "Assign a task (open -> assigned)",
    { task_id: z.string() },
    async ({ task_id }) => {
      try {
        const task = await taskAssign(task_id);
        return ok(`Assigned ${task.id}`);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── Start (assigned -> in_progress) ─────────────────────────────────────
  server.tool(
    "apex_task_start",
    "Start working on a task (assigned -> in_progress)",
    { task_id: z.string() },
    async ({ task_id }) => {
      try {
        const task = await taskStart(task_id);
        return ok(`Started ${task.id}`);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── Submit (in_progress -> to_verify) ───────────────────────────────────
  server.tool(
    "apex_task_submit",
    "Submit a task for verification with evidence (in_progress -> to_verify)",
    { task_id: z.string(), evidence: z.string() },
    async ({ task_id, evidence }) => {
      try {
        const task = await taskSubmit(task_id, evidence);
        return ok(`Submitted ${task.id} for verification`);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── Verify (to_verify -> done | in_progress) ───────────────────────────
  server.tool(
    "apex_task_verify",
    "Verify a task: pass=true -> done, pass=false -> back to in_progress",
    { task_id: z.string(), pass: z.boolean() },
    async ({ task_id, pass }) => {
      try {
        const task = await taskVerify(task_id, pass);
        const outcome = pass ? "verified (done)" : "rejected (back to in_progress)";
        return ok(`${task.id}: ${outcome}`);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── Block (any except done -> blocked) ──────────────────────────────────
  server.tool(
    "apex_task_block",
    "Block a task with a reason (any status except done -> blocked)",
    { task_id: z.string(), reason: z.string() },
    async ({ task_id, reason }) => {
      try {
        const task = await taskBlock(task_id, reason);
        return ok(`Blocked ${task.id}: ${reason}`);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── Release (assigned -> open) ──────────────────────────────────────────
  server.tool(
    "apex_task_release",
    "Release a task back to the pool (assigned -> open)",
    { task_id: z.string() },
    async ({ task_id }) => {
      try {
        const task = await taskRelease(task_id);
        return ok(`Released ${task.id}`);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── List ────────────────────────────────────────────────────────────────
  server.tool(
    "apex_task_list",
    "List all tasks, optionally filtered by status",
    { status: z.string().optional() },
    async ({ status }) => {
      try {
        const tasks = await taskList(
          status ? { status: status as any } : undefined,
        );
        const text = tasks
          .map((t) => `${t.id} [${t.status}] ${t.title}`)
          .join("\n");
        return ok(text || "No tasks");
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── Next ────────────────────────────────────────────────────────────────
  server.tool(
    "apex_task_next",
    "Find the next available unblocked task whose dependencies are met",
    {},
    async () => {
      try {
        const task = await taskNext();
        return ok(
          task
            ? `Next: ${task.id} — ${task.title}`
            : "No available tasks",
        );
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── Get ─────────────────────────────────────────────────────────────────
  server.tool(
    "apex_task_get",
    "Get full details of a specific task",
    { task_id: z.string() },
    async ({ task_id }) => {
      try {
        const task = await taskGet(task_id);
        return ok(JSON.stringify(task, null, 2));
      } catch (e) {
        return err(e);
      }
    },
  );
}
