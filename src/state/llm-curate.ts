/**
 * Apex Forge — LLM-Powered Memory Curation
 *
 * Uses Claude to intelligently extract structured facts from activity context.
 * Mirrors deer-flow's MemoryUpdater pattern: send conversation/activity to an
 * LLM, receive back facts with confidence scores.
 *
 * Requires ANTHROPIC_API_KEY environment variable.
 * For deterministic extraction without an API key, use `apex memory curate`.
 */

import Anthropic from "@anthropic-ai/sdk";
import { spawnSync } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { readJSON } from "../utils/json.js";
import type { MemoryStore } from "../types/memory.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedFact {
  content: string;
  confidence: number;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const EXTRACT_PROMPT = `You are a memory curator for a software project. Given the following activity context, extract structured facts that would be valuable to remember for future sessions.

Rules:
- Extract only facts that are reusable across sessions (not ephemeral details)
- Assign confidence 0.0-1.0 based on how well-established the fact is
- Remove references to uploaded files or temporary paths (they won't exist next session)
- Focus on: architecture decisions, tech stack, team conventions, solved problems, known gotchas
- Skip: timestamps, session IDs, one-time debugging steps, obvious facts
- Each fact should be a self-contained sentence that makes sense without additional context
- Prefer specific technical details over vague summaries

Output as JSON array:
[
  {"content": "Auth uses JWT with RS256 signing", "confidence": 0.95, "tags": ["auth", "architecture"]},
  {"content": "Database migrations use Drizzle ORM", "confidence": 0.9, "tags": ["database", "tech-stack"]}
]

Only output the JSON array. No explanation, no markdown fences.`;

// ---------------------------------------------------------------------------
// LLM Curation
// ---------------------------------------------------------------------------

/**
 * Send activity context to Claude and extract structured facts.
 * Deduplicates against existing memory store.
 */
export async function llmCurate(context: string): Promise<ExtractedFact[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Set it to enable LLM memory curation.\n" +
        "  export ANTHROPIC_API_KEY=sk-ant-...\n" +
        "Or use 'apex memory curate' for deterministic extraction (no API key needed).",
    );
  }

  // Load existing facts to avoid duplicates
  const existing = await readJSON<MemoryStore>(".apex/memory.json", {
    facts: [],
    next_id: 1,
  });
  const existingContent = existing.facts.map((f) => f.content.toLowerCase());

  const client = new Anthropic({ apiKey });

  const existingBlock =
    existingContent.length > 0
      ? `\n\n--- EXISTING FACTS (do not duplicate) ---\n${existingContent.join("\n")}`
      : "";

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001", // Fast and cheap for extraction
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `${EXTRACT_PROMPT}\n\n--- ACTIVITY CONTEXT ---\n${context}${existingBlock}`,
      },
    ],
  });

  // Parse response
  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // Extract JSON array from response (handle markdown code blocks if present)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const facts: ExtractedFact[] = JSON.parse(jsonMatch[0]);

    // Filter: valid structure, reasonable confidence, not duplicate
    return facts.filter(
      (f) =>
        f.content &&
        typeof f.content === "string" &&
        f.content.length > 5 &&
        typeof f.confidence === "number" &&
        f.confidence >= 0.3 &&
        f.confidence <= 1.0 &&
        Array.isArray(f.tags) &&
        !existingContent.includes(f.content.toLowerCase()),
    );
  } catch {
    // JSON parse failed — return empty rather than crash
    return [];
  }
}

// ---------------------------------------------------------------------------
// Context Builder
// ---------------------------------------------------------------------------

/**
 * Build a rich activity context from multiple project sources:
 * - Recent git commits and diff stats
 * - Completed tasks with evidence
 * - Solution documentation
 * - Project config files (tech stack indicators)
 */
export async function buildCurationContext(): Promise<string> {
  const parts: string[] = [];

  // 1. Recent git log
  const gitLog = spawnSync(
    "git",
    ["log", "--oneline", "-20", "--format=%h %s"],
    { encoding: "utf-8" },
  );
  if (gitLog.status === 0 && gitLog.stdout.trim()) {
    parts.push("## Recent Commits\n" + gitLog.stdout.trim());
  }

  // 2. Recent git diff summary
  const gitDiff = spawnSync("git", ["diff", "--stat", "HEAD~5..HEAD"], {
    encoding: "utf-8",
  });
  if (gitDiff.status === 0 && gitDiff.stdout.trim()) {
    parts.push("## Recent Changes\n" + gitDiff.stdout.trim());
  }

  // 3. Completed tasks with evidence
  const tasks = await readJSON<any>(".apex/tasks.json", { tasks: [] });
  const completed = (tasks.tasks || []).filter(
    (t: any) => t.status === "done",
  );
  if (completed.length > 0) {
    parts.push(
      "## Completed Tasks\n" +
        completed
          .map(
            (t: any) =>
              `- ${t.title}: ${t.description || "(no description)"} (evidence: ${(t.evidence || []).join(", ") || "none"})`,
          )
          .join("\n"),
    );
  }

  // 4. Solution docs (last 5, first 500 chars each)
  if (existsSync("docs/solutions")) {
    const files = readdirSync("docs/solutions", { recursive: true })
      .filter((f: any) => String(f).endsWith(".md"))
      .slice(-5);
    for (const f of files) {
      const content = readFileSync(`docs/solutions/${f}`, "utf-8").slice(
        0,
        500,
      );
      parts.push(`## Solution: ${f}\n${content}`);
    }
  }

  // 5. Project config files (tech stack indicators)
  for (const f of [
    "package.json",
    "requirements.txt",
    "go.mod",
    "Gemfile",
    "Cargo.toml",
    "pyproject.toml",
    "tsconfig.json",
  ]) {
    if (existsSync(f)) {
      const content = readFileSync(f, "utf-8").slice(0, 300);
      parts.push(`## ${f}\n${content}`);
    }
  }

  // 6. Existing memory for context (helps LLM avoid low-value extraction)
  const memory = await readJSON<MemoryStore>(".apex/memory.json", {
    facts: [],
    next_id: 1,
  });
  if (memory.facts.length > 0) {
    parts.push(
      "## Current Memory Store\n" +
        memory.facts
          .slice(-10)
          .map((f) => `- [${f.confidence.toFixed(2)}] ${f.content}`)
          .join("\n"),
    );
  }

  return parts.join("\n\n");
}
