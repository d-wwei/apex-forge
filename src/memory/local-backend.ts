/**
 * Apex Forge — Local File Backend
 *
 * Wraps the existing .apex/memory.json logic as a MemoryBackend.
 * This is the fallback when no external memory system is available.
 */

import {
  memoryAdd,
  memoryList,
  memorySearch,
  memoryRemove,
  memoryInject,
  memoryPrune,
} from "../state/memory.js";
import { readJSON } from "../utils/json.js";
import { isoTimestamp } from "../utils/timestamp.js";
import type { TaskStore } from "../types/task.js";
import type {
  MemoryBackend,
  MemoryFact,
  SolutionRef,
  ActiveTask,
  CheckpointData,
} from "./interface.js";

const TASKS_PATH = ".apex/tasks.json";

// ---------------------------------------------------------------------------
// Backend implementation
// ---------------------------------------------------------------------------

export class LocalBackend implements MemoryBackend {
  readonly name = "apex-local";

  async addFact(
    fact: string,
    confidence: number,
    tags: string[] = [],
  ): Promise<string> {
    const result = await memoryAdd(fact, confidence, tags);
    return result.id;
  }

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
    // Store a reference to the solution doc in memory
    await memoryAdd(
      `Solution: ${path}`,
      0.9,
      ["solution", category, ...tags],
      "compound",
    );
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

  async injectContext(_project: string): Promise<string> {
    return memoryInject();
  }

  async getActiveTask(): Promise<ActiveTask | null> {
    try {
      const store = await readJSON<TaskStore>(TASKS_PATH, {
        tasks: [],
        next_id: 1,
      });

      const active = store.tasks.find((t) => t.status === "in_progress");
      if (!active) return null;

      return {
        taskId: active.id,
        stage: active.status,
        description: active.title,
        lastUpdated: active.updated_at,
      };
    } catch {
      return null;
    }
  }

  async saveCheckpoint(data: CheckpointData): Promise<void> {
    const { writeJSON } = await import("../utils/json.js");
    const checkpoint = {
      stage: data.stage,
      taskId: data.taskId,
      context: data.context,
      savedAt: isoTimestamp(),
    };
    const filename = `.apex/checkpoints/${data.stage}-${Date.now()}.json`;
    await writeJSON(filename, checkpoint);
  }
}
