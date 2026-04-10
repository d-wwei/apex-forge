/**
 * Apex Forge — Pluggable Memory Backend Interface
 *
 * Defines a unified interface for memory operations.
 * Backends are detected at startup and selected by priority.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface MemoryFact {
  id: string;
  content: string;
  confidence: number;
  tags: string[];
  createdAt: string;
  source?: string; // "agent-recall" | "apex-local"
}

export interface SolutionRef {
  path: string;
  category: string;
  title: string;
  tags: string[];
}

export interface ActiveTask {
  taskId: string;
  stage: string;
  description: string;
  lastUpdated: string;
}

export interface CheckpointData {
  stage: string;
  taskId?: string;
  context: string;
}

// ---------------------------------------------------------------------------
// Backend interface
// ---------------------------------------------------------------------------

export interface MemoryBackend {
  /** Backend identifier, e.g. "agent-recall" | "apex-local" */
  readonly name: string;

  // --- Fact operations ---
  addFact(
    fact: string,
    confidence: number,
    tags?: string[],
  ): Promise<string>; // returns fact ID

  searchFacts(query: string, limit?: number): Promise<MemoryFact[]>;
  listFacts(minConfidence?: number): Promise<MemoryFact[]>;
  removeFact(id: string): Promise<void>;
  pruneFacts(minConfidence?: number): Promise<number>; // returns deleted count

  // --- Solution docs (compound stage) ---
  addSolution(
    path: string,
    category: string,
    tags: string[],
  ): Promise<void>;
  searchSolutions(query: string): Promise<SolutionRef[]>;

  // --- Context injection (session start) ---
  injectContext(project: string): Promise<string>; // returns injection text

  // --- Session recovery ---
  getActiveTask(): Promise<ActiveTask | null>;
  saveCheckpoint(data: CheckpointData): Promise<void>;
}
