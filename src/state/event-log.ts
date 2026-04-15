/**
 * Apex Forge — Event Sourcing Core
 *
 * Append-only event logs for concurrent-safe state mutations.
 * Each domain (task, state, memory) has its own JSONL log.
 * JSON cache files are materialized views rebuilt from events.
 *
 * Safety: appendFileSync writes < 4KB are atomic on POSIX (PIPE_BUF).
 * Two processes appending simultaneously produce two complete lines.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, copyFileSync } from "fs";
import { join } from "path";
import { writeJSON } from "../utils/json.js";
import { isoTimestamp, sessionId } from "../utils/timestamp.js";
import type { TaskStore, TaskStatus } from "../types/task.js";
import type { StageState, SessionPipeline } from "../types/state.js";
import type { MemoryStore } from "../types/memory.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_DIR = ".apex/log";
const TASKS_LOG = join(LOG_DIR, "tasks.jsonl");
const STATE_LOG = join(LOG_DIR, "state.jsonl");
const MEMORY_LOG = join(LOG_DIR, "memory.jsonl");

const TASKS_CACHE = ".apex/tasks.json";
const STATE_CACHE = ".apex/state.json";
const MEMORY_CACHE = ".apex/memory.json";

// ---------------------------------------------------------------------------
// Event type
// ---------------------------------------------------------------------------

export interface DomainEvent {
  ts: string;
  session_id: string;
  domain: "task" | "state" | "memory";
  type: string;
  payload: Record<string, unknown>;
}

export type Domain = "task" | "state" | "memory";

// ---------------------------------------------------------------------------
// Session ID resolution
// ---------------------------------------------------------------------------

let _cachedSessionId: string | null = null;

/**
 * Sanitize a session ID for safe use in filenames.
 * Rejects path traversal, null bytes, and overly long values.
 */
function sanitizeSessionId(id: string): string {
  const clean = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return clean.slice(0, 128) || "unknown";
}

/**
 * Per-session state cache path. Used to isolate pipeline stage per session.
 */
export function sessionStateCachePath(sid?: string): string {
  const id = sanitizeSessionId(sid || currentSessionId());
  return `.apex/state.${id}.json`;
}

/**
 * Reset the cached session ID. Exported for test support only.
 */
export function _resetSessionIdCache(): void {
  _cachedSessionId = null;
}

export function currentSessionId(): string {
  // 1. Environment variable (set by hooks)
  const envId = process.env.APEX_SESSION_ID;
  if (envId) return envId;

  // 2. Cached from previous call
  if (_cachedSessionId) return _cachedSessionId;

  // 3. Generate new (do NOT read state.json — avoids cross-session pollution)
  _cachedSessionId = sessionId();
  return _cachedSessionId;
}

// ---------------------------------------------------------------------------
// Core: append & read
// ---------------------------------------------------------------------------

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function logPath(domain: Domain): string {
  switch (domain) {
    case "task": return TASKS_LOG;
    case "state": return STATE_LOG;
    case "memory": return MEMORY_LOG;
  }
}

function cachePath(domain: Domain): string {
  switch (domain) {
    case "task": return TASKS_CACHE;
    case "state": return STATE_CACHE;
    case "memory": return MEMORY_CACHE;
  }
}

function seedPath(domain: Domain): string {
  return join(LOG_DIR, `${domain}.seed.json`);
}

/**
 * Append a single event to the domain's JSONL log.
 * Atomic for writes < PIPE_BUF (4096 bytes) on POSIX.
 */
export function appendEvent(
  domain: Domain,
  type: string,
  payload: Record<string, unknown>,
): void {
  ensureLogDir();

  // Auto-seed: if cache exists but log doesn't, save current state as seed
  const lp = logPath(domain);
  const cp = cachePath(domain);
  const sp = seedPath(domain);
  if (!existsSync(lp) && existsSync(cp) && !existsSync(sp)) {
    try { copyFileSync(cp, sp); } catch { /* ignore */ }
  }

  const event: DomainEvent = {
    ts: isoTimestamp(),
    session_id: currentSessionId(),
    domain,
    type,
    payload,
  };

  appendFileSync(lp, JSON.stringify(event) + "\n");
}

/**
 * Read all events from a domain's JSONL log.
 */
export function readEvents(domain: Domain): DomainEvent[] {
  const lp = logPath(domain);
  if (!existsSync(lp)) return [];
  try {
    return readFileSync(lp, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as DomainEvent; } catch { return null; }
      })
      .filter(Boolean) as DomainEvent[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Materializers: replay events → current state
// ---------------------------------------------------------------------------

function loadSeed<T>(domain: Domain, defaultValue: T): T {
  const sp = seedPath(domain);
  if (!existsSync(sp)) return defaultValue;
  try {
    return JSON.parse(readFileSync(sp, "utf-8")) as T;
  } catch {
    return defaultValue;
  }
}

export function materializeTasks(events: DomainEvent[]): TaskStore {
  const store = loadSeed<TaskStore>("task", { tasks: [], next_id: 1 });

  for (const evt of events) {
    const p = evt.payload;
    switch (evt.type) {
      case "task.created": {
        const id = p.id as string;
        // Detect duplicate ID: annotate conflict instead of silent drop
        const existing = store.tasks.find((t) => t.id === id);
        if (existing) {
          if (!existing.description.includes("[conflict:")) {
            existing.description += ` [conflict: duplicate ${id} from session ${evt.session_id}]`;
          }
          break;
        }
        store.tasks.push({
          id,
          title: (p.title as string) || "",
          description: (p.description as string) || "",
          status: "open" as TaskStatus,
          depends_on: (p.depends_on as string[]) || [],
          blocked_by: [],
          evidence: [],
          adapter: p.adapter as string | undefined,
          persona: p.persona as string | undefined,
          skill: p.skill as string | undefined,
          attempt: p.attempt as number | undefined,
          workspace_path: p.workspace_path as string | undefined,
          session_id: p.session_id as string | undefined,
          created_at: evt.ts,
          updated_at: evt.ts,
        });
        const num = parseInt(id.replace(/\D/g, ""), 10);
        if (num >= store.next_id) store.next_id = num + 1;
        break;
      }
      case "task.transitioned": {
        const task = store.tasks.find((t) => t.id === p.id);
        if (!task) break;
        const to = p.to as TaskStatus;
        const from = p.from as TaskStatus;

        if (to === "blocked") {
          task.previous_status = from;
          task.block_reason = (p.reason as string) || "no reason given";
          (task.blocked_by as any[]).push({
            reason: task.block_reason,
            blocked_at: evt.ts,
            previous_status: from,
          });
        }
        if (to === "done") {
          task.completed_at = evt.ts;
        }
        if (to === "open" && from === "blocked") {
          delete task.block_reason;
        }
        if (to === "to_verify" && p.evidence) {
          (task.evidence as any[]).push({
            content: p.evidence as string,
            submitted_at: evt.ts,
          });
        }
        task.status = to;
        task.updated_at = evt.ts;
        // Preserve orchestration fields from transition payload
        if (p.adapter) task.adapter = p.adapter as string;
        if (p.persona) task.persona = p.persona as string;
        if (p.skill) task.skill = p.skill as string;
        if (p.attempt) task.attempt = p.attempt as number;
        if (p.workspace_path) task.workspace_path = p.workspace_path as string;
        if (p.session_id) task.session_id = p.session_id as string;
        break;
      }
    }
  }

  return store;
}

/**
 * Materialize a single global state from all events (no session filtering).
 * NOTE: If you add new event types here, also update materializePerSession() below.
 */
export function materializeState(events: DomainEvent[]): StageState {
  const state = loadSeed<StageState>("state", {
    current_stage: "idle",
    last_updated: isoTimestamp(),
    session_id: currentSessionId(),
    artifacts: {},
    history: [],
  });

  for (const evt of events) {
    const p = evt.payload;
    switch (evt.type) {
      case "stage.set": {
        const newStage = p.stage as string;
        const oldStage = state.current_stage;

        // Close previous stage
        if (oldStage !== "idle" && oldStage !== newStage) {
          for (let i = state.history.length - 1; i >= 0; i--) {
            if (state.history[i].stage === oldStage && !state.history[i].completed) {
              state.history[i].completed = evt.ts;
              break;
            }
          }
        }

        state.history.push({ stage: newStage, started: evt.ts });
        state.current_stage = newStage;
        state.last_updated = evt.ts;
        if (!state.artifacts[newStage]) state.artifacts[newStage] = [];
        break;
      }
      case "stage.completed": {
        const stage = p.stage as string;
        for (let i = state.history.length - 1; i >= 0; i--) {
          if (state.history[i].stage === stage && !state.history[i].completed) {
            state.history[i].completed = evt.ts;
            break;
          }
        }
        state.last_updated = evt.ts;
        break;
      }
      case "artifact.added": {
        const stage = p.stage as string;
        const path = p.path as string;
        if (!state.artifacts[stage]) state.artifacts[stage] = [];
        if (!state.artifacts[stage].includes(path)) {
          state.artifacts[stage].push(path);
        }
        state.last_updated = evt.ts;
        break;
      }
      case "skill.invoked": {
        if (!state.skill_invocations) state.skill_invocations = [];
        state.skill_invocations.push({
          stage: p.stage as string,
          skill: p.skill as string,
          version: p.version as string,
          timestamp: evt.ts,
          output_status: p.output_status as string,
          af_mapping: p.af_mapping as string,
        });
        state.last_updated = evt.ts;
        break;
      }
      case "orchestration.event": {
        if (!state.orchestration_events) state.orchestration_events = [];
        state.orchestration_events.push({
          action: p.action as string,
          task: p.task as string | undefined,
          timestamp: evt.ts,
          detail: p as Record<string, unknown>,
        });
        state.last_updated = evt.ts;
        break;
      }
    }
  }

  return state;
}

/**
 * Group state events by session_id and materialize each independently.
 * Returns one SessionPipeline per session, sorted newest-first.
 * Sessions with no activity in the last SESSION_STALE_MS are marked stale.
 * Used by the dashboard for multi-session pipeline display.
 */
const SESSION_STALE_MS = 30 * 60 * 1000; // 30 minutes

export function materializePerSession(events: DomainEvent[]): SessionPipeline[] {
  // 1. Group events by session_id
  const groups = new Map<string, DomainEvent[]>();
  for (const evt of events) {
    const sid = evt.session_id || "unknown";
    let arr = groups.get(sid);
    if (!arr) { arr = []; groups.set(sid, arr); }
    arr.push(evt);
  }

  const now = Date.now();
  const pipelines: SessionPipeline[] = [];

  // 2. Materialize each group independently (fresh default per session, no loadSeed)
  for (const [sid, sessionEvents] of groups) {
    const state: StageState = {
      current_stage: "idle",
      // Use first event's timestamp — NOT new Date() — to avoid making
      // sessions with only unhandled event types appear as "just now".
      last_updated: sessionEvents[0]?.ts ?? new Date().toISOString(),
      session_id: sid,
      artifacts: {},
      history: [],
    };

    let sessionSummary: { en?: string; zh?: string } | undefined;

    // Replay events — same switch logic as materializeState
    for (const evt of sessionEvents) {
      const p = evt.payload;
      switch (evt.type) {
        case "stage.set": {
          const newStage = p.stage as string;
          const oldStage = state.current_stage;
          if (oldStage !== "idle" && oldStage !== newStage) {
            for (let i = state.history.length - 1; i >= 0; i--) {
              if (state.history[i].stage === oldStage && !state.history[i].completed) {
                state.history[i].completed = evt.ts;
                break;
              }
            }
          }
          state.history.push({ stage: newStage, started: evt.ts });
          state.current_stage = newStage;
          state.last_updated = evt.ts;
          if (!state.artifacts[newStage]) state.artifacts[newStage] = [];
          break;
        }
        case "stage.completed": {
          const stage = p.stage as string;
          for (let i = state.history.length - 1; i >= 0; i--) {
            if (state.history[i].stage === stage && !state.history[i].completed) {
              state.history[i].completed = evt.ts;
              break;
            }
          }
          state.last_updated = evt.ts;
          break;
        }
        case "artifact.added": {
          const stage = p.stage as string;
          const path = p.path as string;
          if (!state.artifacts[stage]) state.artifacts[stage] = [];
          if (!state.artifacts[stage].includes(path)) {
            state.artifacts[stage].push(path);
          }
          state.last_updated = evt.ts;
          break;
        }
        // skill.invoked intentionally omitted — not needed for pipeline display
        case "session.summary": {
          sessionSummary = {
            en: (p.en as string) || sessionSummary?.en,
            zh: (p.zh as string) || sessionSummary?.zh,
          };
          break;
        }
      }
    }

    const lastUpdatedMs = new Date(state.last_updated).getTime();
    pipelines.push({
      session_id: sid,
      current_stage: state.current_stage,
      last_updated: state.last_updated,
      history: state.history,
      artifacts: state.artifacts,
      stale: (now - lastUpdatedMs) > SESSION_STALE_MS,
      summary: sessionSummary,
    });
  }

  // 3. Sort: non-stale first, then by last_updated descending
  pipelines.sort((a, b) => {
    if (a.stale !== b.stale) return a.stale ? 1 : -1;
    return b.last_updated.localeCompare(a.last_updated);
  });

  return pipelines;
}

export function materializeMemory(events: DomainEvent[]): MemoryStore {
  const store = loadSeed<MemoryStore>("memory", { facts: [], next_id: 1 });

  for (const evt of events) {
    const p = evt.payload;
    switch (evt.type) {
      case "fact.added": {
        const id = p.id as string;
        if (store.facts.some((f) => f.id === id)) break;
        store.facts.push({
          id,
          content: (p.content as string) || "",
          confidence: (p.confidence as number) ?? 0.5,
          tags: (p.tags as string[]) || [],
          source: (p.source as string) || "",
          created_at: evt.ts,
        });
        const num = parseInt(id.replace(/\D/g, ""), 10);
        if (num >= store.next_id) store.next_id = num + 1;
        break;
      }
      case "fact.removed": {
        const id = p.id as string;
        store.facts = store.facts.filter((f) => f.id !== id);
        break;
      }
      case "fact.pruned": {
        const removedIds = (p.removed_ids as string[]) || [];
        store.facts = store.facts.filter((f) => !removedIds.includes(f.id));
        break;
      }
    }
  }

  return store;
}

// ---------------------------------------------------------------------------
// Rebuild: events → materialize → write cache
// ---------------------------------------------------------------------------

export async function rebuildAndCache(domain: Domain): Promise<void> {
  const events = readEvents(domain);

  switch (domain) {
    case "task": {
      const store = materializeTasks(events);
      await writeJSON(TASKS_CACHE, store);
      break;
    }
    case "state": {
      const sid = currentSessionId();
      const sessionEvents = events.filter(e => e.session_id === sid);

      // 1. Per-session cache (CLI reads this)
      const sessionState = materializeState(sessionEvents);
      sessionState.session_id = sid;
      await writeJSON(sessionStateCachePath(sid), sessionState);

      // 2. Global cache (Dashboard fallback)
      const globalState = materializeState(events);
      await writeJSON(STATE_CACHE, globalState);
      break;
    }
    case "memory": {
      const store = materializeMemory(events);
      await writeJSON(MEMORY_CACHE, store);
      break;
    }
  }
}

export async function rebuildAllCaches(): Promise<void> {
  await rebuildAndCache("task");
  await rebuildAndCache("state");
  await rebuildAndCache("memory");
}

// ---------------------------------------------------------------------------
// Global memory layer (~/.apex-forge/)
// ---------------------------------------------------------------------------

const GLOBAL_DIR = join(process.env.HOME || "/tmp", ".apex-forge");
const GLOBAL_LOG_DIR = join(GLOBAL_DIR, "log");
const GLOBAL_MEMORY_LOG = join(GLOBAL_LOG_DIR, "memory.jsonl");
const GLOBAL_MEMORY_CACHE = join(GLOBAL_DIR, "memory.json");

function ensureGlobalLogDir(): void {
  if (!existsSync(GLOBAL_LOG_DIR)) {
    mkdirSync(GLOBAL_LOG_DIR, { recursive: true });
  }
}

export function appendGlobalMemoryEvent(
  type: string,
  payload: Record<string, unknown>,
): void {
  ensureGlobalLogDir();
  const event: DomainEvent = {
    ts: isoTimestamp(),
    session_id: currentSessionId(),
    domain: "memory",
    type,
    payload,
  };
  appendFileSync(GLOBAL_MEMORY_LOG, JSON.stringify(event) + "\n");
}

export function readGlobalMemoryEvents(): DomainEvent[] {
  if (!existsSync(GLOBAL_MEMORY_LOG)) return [];
  try {
    return readFileSync(GLOBAL_MEMORY_LOG, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as DomainEvent; } catch { return null; }
      })
      .filter(Boolean) as DomainEvent[];
  } catch {
    return [];
  }
}

export async function rebuildGlobalMemoryCache(): Promise<void> {
  const events = readGlobalMemoryEvents();
  const store = materializeMemory(events);
  ensureGlobalLogDir();
  await writeJSON(GLOBAL_MEMORY_CACHE, store);
}

export function getGlobalMemoryCachePath(): string {
  return GLOBAL_MEMORY_CACHE;
}
