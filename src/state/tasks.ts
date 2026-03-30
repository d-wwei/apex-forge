/**
 * Apex Forge — Task State Machine
 *
 * Ports hooks/task-helper into TypeScript with stronger enforcement.
 *
 * State machine:
 *   open -> assigned -> in_progress -> to_verify -> done
 *   (any except done) -> blocked
 *   assigned -> open (release)
 *   to_verify -> in_progress (verify fail)
 *   blocked -> open (unblock, restores previous_status metadata)
 */

import { readJSON, writeJSON } from "../utils/json.js";
import { isoTimestamp } from "../utils/timestamp.js";
import { TaskNotFoundError, InvalidTransitionError } from "../utils/errors.js";
import type { Task, TaskStore, TaskStatus } from "../types/task.js";
import { ALLOWED_TRANSITIONS } from "../types/task.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TASKS_PATH = ".apex/tasks.json";
const EMPTY_STORE: TaskStore = { tasks: [], next_id: 1 };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadStore(): Promise<TaskStore> {
  return readJSON<TaskStore>(TASKS_PATH, EMPTY_STORE);
}

async function saveStore(store: TaskStore): Promise<void> {
  await writeJSON(TASKS_PATH, store);
}

function findTask(store: TaskStore, taskId: string): Task {
  const task = store.tasks.find((t) => t.id === taskId);
  if (!task) throw new TaskNotFoundError(taskId);
  return task;
}

function depsAllDone(store: TaskStore, task: Task): boolean {
  const doneIds = new Set(
    store.tasks.filter((t) => t.status === "done").map((t) => t.id),
  );
  return task.depends_on.every((d) => doneIds.has(d));
}

function unmetDeps(store: TaskStore, task: Task): string[] {
  const doneIds = new Set(
    store.tasks.filter((t) => t.status === "done").map((t) => t.id),
  );
  return task.depends_on.filter((d) => !doneIds.has(d));
}

// ---------------------------------------------------------------------------
// Core transition enforcement
// ---------------------------------------------------------------------------

/**
 * The single enforcement point for all state transitions.
 * Every convenience function delegates here.
 */
export async function taskTransition(
  taskId: string,
  toStatus: TaskStatus,
  extra?: { evidence?: string; reason?: string },
): Promise<Task> {
  const store = await loadStore();
  const task = findTask(store, taskId);
  const from = task.status;

  // Validate the transition
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(toStatus)) {
    throw new InvalidTransitionError(taskId, from, toStatus);
  }

  const now = isoTimestamp();

  // --- Handle special cases per target status ---

  if (toStatus === "blocked") {
    // Save previous status so unblock can reference it
    task.previous_status = from;
    task.block_reason = extra?.reason ?? "no reason given";
    task.blocked_by.push({
      reason: task.block_reason,
      blocked_at: now,
      previous_status: from,
    } as never); // blocked_by stores history objects in the bash version
  }

  if (toStatus === "done") {
    task.completed_at = now;
  }

  if (toStatus === "open" && from === "blocked") {
    // Unblock — previous_status is informational; we always go to open per ALLOWED_TRANSITIONS
    delete task.block_reason;
  }

  if (toStatus === "to_verify") {
    if (!extra?.evidence) {
      throw new InvalidTransitionError(
        taskId,
        from,
        toStatus + " (evidence required)",
      );
    }
    task.evidence.push({
      content: extra.evidence,
      submitted_at: now,
    } as never);
  }

  // in_progress from to_verify is a verify-fail — no special handling, just transition

  task.status = toStatus;
  task.updated_at = now;

  await saveStore(store);
  return task;
}

// ---------------------------------------------------------------------------
// Public API — convenience wrappers
// ---------------------------------------------------------------------------

/**
 * Create a new task with auto-incremented ID (T1, T2, ...).
 */
export async function taskCreate(
  title: string,
  desc: string,
  dependsOn: string[] = [],
): Promise<Task> {
  const store = await loadStore();
  const now = isoTimestamp();

  const id = `T${store.next_id}`;
  store.next_id += 1;

  const task: Task = {
    id,
    title,
    description: desc,
    status: "open",
    depends_on: dependsOn,
    blocked_by: [],
    evidence: [],
    created_at: now,
    updated_at: now,
  };

  store.tasks.push(task);
  await saveStore(store);
  return task;
}

/**
 * Get a task by ID. Throws TaskNotFoundError if missing.
 */
export async function taskGet(taskId: string): Promise<Task> {
  const store = await loadStore();
  return findTask(store, taskId);
}

/**
 * List tasks, optionally filtered by status.
 */
export async function taskList(filter?: {
  status?: TaskStatus;
}): Promise<Task[]> {
  const store = await loadStore();
  let tasks = store.tasks;
  if (filter?.status) {
    tasks = tasks.filter((t) => t.status === filter.status);
  }
  return tasks;
}

/**
 * Assign a task: open -> assigned.
 * Warns (via console) if dependencies are not met but does not block the transition.
 */
export async function taskAssign(taskId: string): Promise<Task> {
  const store = await loadStore();
  const task = findTask(store, taskId);

  // Warn about unmet dependencies (matches bash behavior)
  const unmet = unmetDeps(store, task);
  if (unmet.length > 0) {
    console.warn(
      `Warning: ${taskId} has unmet dependencies: ${unmet.join(", ")}`,
    );
  }

  return taskTransition(taskId, "assigned");
}

/**
 * Start working: assigned -> in_progress.
 */
export async function taskStart(taskId: string): Promise<Task> {
  return taskTransition(taskId, "in_progress");
}

/**
 * Submit for verification: in_progress -> to_verify. Evidence is required.
 */
export async function taskSubmit(
  taskId: string,
  evidence: string,
): Promise<Task> {
  return taskTransition(taskId, "to_verify", { evidence });
}

/**
 * Verify a task.
 *   pass=true  -> to_verify -> done
 *   pass=false -> to_verify -> in_progress (verify fail, rework needed)
 */
export async function taskVerify(
  taskId: string,
  pass: boolean,
): Promise<Task> {
  if (pass) {
    return taskTransition(taskId, "done");
  }
  return taskTransition(taskId, "in_progress");
}

/**
 * Block a task: (any except done) -> blocked. Reason is required.
 */
export async function taskBlock(
  taskId: string,
  reason: string,
): Promise<Task> {
  return taskTransition(taskId, "blocked", { reason });
}

/**
 * Release a task back to the pool: assigned -> open.
 */
export async function taskRelease(taskId: string): Promise<Task> {
  return taskTransition(taskId, "open");
}

/**
 * Find the next unblocked open task whose dependencies are all done.
 * Returns null if no candidate is available.
 */
export async function taskNext(): Promise<Task | null> {
  const store = await loadStore();
  const candidates = store.tasks.filter(
    (t) => t.status === "open" && depsAllDone(store, t),
  );
  return candidates.length > 0 ? candidates[0] : null;
}
