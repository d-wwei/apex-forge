/**
 * Apex Forge — Memory System
 *
 * Ports the memory section of hooks/state-helper into TypeScript.
 * Provides a scored fact store with search, pruning, and context injection.
 */

import { readJSON, writeJSON } from "../utils/json.js";
import { isoTimestamp } from "../utils/timestamp.js";
import { FactNotFoundError } from "../utils/errors.js";
import type { Fact, MemoryStore } from "../types/memory.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEMORY_PATH = ".apex/memory.json";
const EMPTY_STORE: MemoryStore = { facts: [], next_id: 1 };
const MAX_FACTS = 100;
const PRUNE_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadStore(): Promise<MemoryStore> {
  return readJSON<MemoryStore>(MEMORY_PATH, EMPTY_STORE);
}

async function saveStore(store: MemoryStore): Promise<void> {
  await writeJSON(MEMORY_PATH, store);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a new fact with confidence score (0.0-1.0).
 * Auto-increments ID: F1, F2, ...
 */
export async function memoryAdd(
  content: string,
  confidence: number,
  tags: string[] = [],
  source: string = "",
): Promise<Fact> {
  if (confidence < 0 || confidence > 1) {
    throw new RangeError(
      `Confidence must be between 0.0 and 1.0, got ${confidence}`,
    );
  }

  const store = await loadStore();
  const now = isoTimestamp();

  const id = `F${store.next_id}`;
  store.next_id += 1;

  const fact: Fact = {
    id,
    content,
    confidence,
    tags,
    source: source || `session ${now.slice(0, 10)}`,
    created_at: now,
  };

  store.facts.push(fact);
  await saveStore(store);
  return fact;
}

/**
 * List facts at or above a confidence threshold, sorted descending by confidence.
 */
export async function memoryList(minConfidence: number = 0): Promise<Fact[]> {
  const store = await loadStore();
  return store.facts
    .filter((f) => f.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Case-insensitive search across fact content and tags.
 */
export async function memorySearch(query: string): Promise<Fact[]> {
  const store = await loadStore();
  const q = query.toLowerCase();

  return store.facts.filter((f) => {
    const inContent = f.content.toLowerCase().includes(q);
    const inTags = f.tags.some((t) => t.toLowerCase().includes(q));
    return inContent || inTags;
  });
}

/**
 * Remove a fact by ID. Throws FactNotFoundError if not found.
 */
export async function memoryRemove(factId: string): Promise<void> {
  const store = await loadStore();
  const idx = store.facts.findIndex((f) => f.id === factId);

  if (idx === -1) {
    throw new FactNotFoundError(factId);
  }

  store.facts.splice(idx, 1);
  await saveStore(store);
}

/**
 * Format all facts for context injection into agent prompts.
 * Returns an <apex-memory> XML block sorted by confidence descending.
 *
 * Example output:
 *   <apex-memory>
 *   - (high) Auth uses JWT RS256 [auth, jwt]
 *   - (med) Redis cache TTL is 300s [cache]
 *   </apex-memory>
 */
export async function memoryInject(): Promise<string> {
  const store = await loadStore();

  if (store.facts.length === 0) {
    return "";
  }

  const sorted = [...store.facts].sort(
    (a, b) => b.confidence - a.confidence,
  );

  const lines = sorted.map((f) => {
    const label =
      f.confidence >= 0.8 ? "high" : f.confidence >= 0.5 ? "med" : "low";
    const tagStr = f.tags.length > 0 ? ` [${f.tags.join(", ")}]` : "";
    return `- (${label}) ${f.content}${tagStr}`;
  });

  return `<apex-memory>\n${lines.join("\n")}\n</apex-memory>`;
}

/**
 * Prune low-confidence facts and cap total at MAX_FACTS.
 *
 * 1. Remove all facts below PRUNE_THRESHOLD (0.5).
 * 2. If still over MAX_FACTS (100), keep top 100 by confidence.
 *
 * Returns counts of removed and kept facts.
 */
export async function memoryPrune(): Promise<{
  removed: number;
  kept: number;
}> {
  const store = await loadStore();
  const original = store.facts.length;

  // Step 1: remove below threshold
  store.facts = store.facts.filter((f) => f.confidence >= PRUNE_THRESHOLD);
  const prunedLow = original - store.facts.length;

  // Step 2: cap at MAX_FACTS, keep highest confidence
  let prunedCap = 0;
  if (store.facts.length > MAX_FACTS) {
    store.facts.sort((a, b) => b.confidence - a.confidence);
    prunedCap = store.facts.length - MAX_FACTS;
    store.facts = store.facts.slice(0, MAX_FACTS);
  }

  await saveStore(store);

  const totalRemoved = prunedLow + prunedCap;
  return { removed: totalRemoved, kept: store.facts.length };
}
