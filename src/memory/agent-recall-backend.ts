/**
 * Apex Forge — Agent Recall Memory Backend
 *
 * Hybrid backend: writes go to BOTH Agent Recall AND local .apex/memory.json.
 * Reads use local store (instantly available) while Agent Recall provides
 * richer context injection and cross-session recovery.
 *
 * Why hybrid: Agent Recall's HTTP API returns MCP-formatted text summaries
 * (designed for LLM consumption), not structured JSON arrays. Its search
 * index is also async (AI compression), so newly added facts aren't
 * immediately searchable. The local store provides instant structured access.
 */

import {
  memoryAdd,
  memoryList,
  memorySearch,
  memoryRemove,
  memoryPrune,
  memoryInject,
} from "../state/memory.js";
import type {
  MemoryBackend,
  MemoryFact,
  SolutionRef,
  ActiveTask,
  CheckpointData,
} from "./interface.js";

const BASE_URL = "http://localhost:37777";
const TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function arGet(path: string, params?: Record<string, string>): Promise<string> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
  }
  const resp = await fetch(url.toString(), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`Agent Recall GET ${path} failed: ${resp.status}`);
  }
  // Handle both text/plain and JSON MCP format
  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("text/plain")) {
    return resp.text();
  }
  const json = await resp.json() as { content?: Array<{ text: string }> };
  if (json.content?.[0]?.text) return json.content[0].text;
  return JSON.stringify(json);
}

async function arPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const resp = await fetch(new URL(path, BASE_URL).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`Agent Recall POST ${path} failed: ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

async function arGetJson<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
  }
  const resp = await fetch(url.toString(), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`Agent Recall GET ${path} failed: ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentProject(): string {
  return process.cwd().split("/").pop() || "unknown";
}

// ---------------------------------------------------------------------------
// Backend implementation
// ---------------------------------------------------------------------------

export class AgentRecallBackend implements MemoryBackend {
  readonly name = "agent-recall";

  /**
   * Write to BOTH Agent Recall and local store.
   * Agent Recall gets the observation for cross-session/cross-platform use.
   * Local store provides instant structured read-back.
   */
  async addFact(
    fact: string,
    confidence: number,
    tags: string[] = [],
  ): Promise<string> {
    // Write to local store first (instant)
    const localFact = await memoryAdd(fact, confidence, tags);

    // Also send to Agent Recall (async, fire-and-forget)
    const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
    const confLabel =
      confidence >= 0.8 ? "HIGH" : confidence >= 0.5 ? "MED" : "LOW";

    try {
      await arPost("/api/memory/save", {
        text: `[${confLabel}] ${fact}${tagStr}`,
        title: fact.slice(0, 60),
        project: currentProject(),
      });
    } catch {
      // Agent Recall write failed — local store is the safety net
    }

    return localFact.id;
  }

  /** Read from local store (instant, structured). */
  async searchFacts(query: string, _limit?: number): Promise<MemoryFact[]> {
    const results = await memorySearch(query);
    return results.map((f) => ({
      id: f.id,
      content: f.content,
      confidence: f.confidence,
      tags: f.tags,
      createdAt: f.created_at,
      source: "apex-local",
    }));
  }

  /** Read from local store. */
  async listFacts(minConfidence: number = 0): Promise<MemoryFact[]> {
    const results = await memoryList(minConfidence);
    return results.map((f) => ({
      id: f.id,
      content: f.content,
      confidence: f.confidence,
      tags: f.tags,
      createdAt: f.created_at,
      source: "apex-local",
    }));
  }

  async removeFact(id: string): Promise<void> {
    await memoryRemove(id);
    // Agent Recall doesn't expose a delete endpoint — only local removal
  }

  async pruneFacts(_minConfidence?: number): Promise<number> {
    const result = await memoryPrune();
    return result.removed;
  }

  async addSolution(
    path: string,
    category: string,
    tags: string[],
  ): Promise<void> {
    // Local store
    await memoryAdd(`Solution: ${path}`, 0.9, ["solution", category, ...tags], "compound");

    // Agent Recall
    try {
      const tagStr = ["solution", category, ...tags].join(", ");
      await arPost("/api/memory/save", {
        text: `[SOLUTION] ${category}: ${path} [${tagStr}]`,
        title: `Solution: ${path.split("/").pop()}`,
        project: currentProject(),
      });
    } catch {
      // Local store has it
    }
  }

  async searchSolutions(query: string): Promise<SolutionRef[]> {
    const results = await memorySearch(`solution ${query}`);
    return results
      .filter((f) => f.tags.includes("solution"))
      .map((f) => {
        const pathMatch = f.content.match(/Solution:\s*(\S+)/);
        const category =
          f.tags.find((t) => t !== "solution") || "unknown";
        return {
          path: pathMatch?.[1] || "",
          category,
          title: (pathMatch?.[1] || "").split("/").pop() || "",
          tags: f.tags,
        };
      });
  }

  /**
   * Context injection: prefer Agent Recall (richer cross-session context),
   * fall back to local apex-memory XML block.
   */
  async injectContext(project: string): Promise<string> {
    try {
      const arContext = await arGet("/api/context/inject", {
        project: project || currentProject(),
      });
      if (arContext && arContext.trim().length > 0) {
        return arContext;
      }
    } catch {
      // Fall through to local
    }

    return memoryInject();
  }

  /** Task recovery: prefer Agent Recall (cross-platform awareness). */
  async getActiveTask(): Promise<ActiveTask | null> {
    try {
      const result = await arGetJson<{
        task_name?: string;
        status?: string;
        progress?: string;
      }>("/api/recovery/active-task", {
        project: currentProject(),
      });

      if (result.task_name) {
        return {
          taskId: result.task_name,
          stage: result.status || "unknown",
          description: result.progress || "",
          lastUpdated: new Date().toISOString(),
        };
      }
    } catch {
      // Fall through to local
    }

    // Local fallback: read tasks.json
    const { readJSON } = await import("../utils/json.js");
    const store = await readJSON<{ tasks: Array<{ id: string; status: string; title: string; updated_at: string }> }>(
      ".apex/tasks.json",
      { tasks: [] },
    );
    const active = store.tasks.find((t) => t.status === "in_progress");
    if (!active) return null;
    return {
      taskId: active.id,
      stage: active.status,
      description: active.title,
      lastUpdated: active.updated_at,
    };
  }

  async saveCheckpoint(data: CheckpointData): Promise<void> {
    // Save to Agent Recall
    try {
      await arPost("/api/recovery/checkpoint", {
        project: currentProject(),
        name: `${data.stage}${data.taskId ? `:${data.taskId}` : ""}`,
      });
    } catch {
      // Fall through to local
    }

    // Also save locally
    const { writeJSON } = await import("../utils/json.js");
    const { isoTimestamp } = await import("../utils/timestamp.js");
    const checkpoint = {
      stage: data.stage,
      taskId: data.taskId,
      context: data.context,
      savedAt: isoTimestamp(),
    };
    await writeJSON(`.apex/checkpoints/${data.stage}-${Date.now()}.json`, checkpoint);
  }
}
