/**
 * Apex Forge — Memory Curation
 *
 * Deterministic fact extraction from recent project activity.
 * Scans git history, completed tasks, solution docs, and tech stack
 * to auto-populate the memory store without LLM calls.
 */

import { spawnSync } from "child_process";
import { readJSON } from "../utils/json.js";
import { existsSync, readdirSync, readFileSync } from "fs";
import type { TaskStore } from "../types/task.js";
import type { MemoryStore } from "../types/memory.js";

interface CuratedFact {
  content: string;
  confidence: number;
  tags: string[];
}

export async function curateFacts(): Promise<CuratedFact[]> {
  const facts: CuratedFact[] = [];
  const existing = await readJSON<MemoryStore>(".apex/memory.json", {
    facts: [],
    next_id: 1,
  });
  const existingContent = new Set(
    existing.facts.map((f) => f.content.toLowerCase()),
  );

  // 1. Extract from git log (last 7 days)
  const gitLog = spawnSync(
    "git",
    ["log", "--oneline", "--since=7.days.ago", "--format=%s"],
    { encoding: "utf-8" },
  );
  if (gitLog.status === 0 && gitLog.stdout.trim()) {
    const commits = gitLog.stdout.trim().split("\n");
    // Extract tech stack from commit messages
    const patterns: Record<string, string[]> = {};
    for (const msg of commits) {
      if (msg.match(/auth|jwt|session|token/i))
        patterns.auth = [...(patterns.auth || []), msg];
      if (msg.match(/database|migration|schema|sql/i))
        patterns.database = [...(patterns.database || []), msg];
      if (msg.match(/api|endpoint|route/i))
        patterns.api = [...(patterns.api || []), msg];
      if (msg.match(/test|spec|jest|vitest/i))
        patterns.testing = [...(patterns.testing || []), msg];
      if (msg.match(/deploy|ci|cd|docker/i))
        patterns.devops = [...(patterns.devops || []), msg];
    }
    for (const [area, msgs] of Object.entries(patterns)) {
      const fact = `Recent work in ${area}: ${msgs.length} commits (${msgs.slice(0, 3).join("; ")})`;
      if (!existingContent.has(fact.toLowerCase())) {
        facts.push({
          content: fact,
          confidence: 0.7,
          tags: [area, "curated"],
        });
      }
    }
  }

  // 2. Extract from completed tasks
  const tasks = await readJSON<TaskStore>(".apex/tasks.json", {
    tasks: [],
    next_id: 1,
  });
  const completed = tasks.tasks.filter(
    (t) => t.status === "done" && t.evidence.length > 0,
  );
  for (const task of completed.slice(-5)) {
    // last 5 completed
    const fact = `Completed: ${task.title} (evidence: ${task.evidence[0]})`;
    if (!existingContent.has(fact.toLowerCase())) {
      facts.push({
        content: fact,
        confidence: 0.85,
        tags: ["completed-task", "curated"],
      });
    }
  }

  // 3. Extract from solution docs
  if (existsSync("docs/solutions")) {
    const solutions = readdirSync("docs/solutions", { recursive: true })
      .filter((f: any) => String(f).endsWith(".md"))
      .slice(-5); // last 5
    for (const sol of solutions) {
      const content = readFileSync(`docs/solutions/${sol}`, "utf-8");
      const titleMatch = content.match(/^#\s+(.+)/m);
      if (titleMatch) {
        const fact = `Solution documented: ${titleMatch[1]}`;
        if (!existingContent.has(fact.toLowerCase())) {
          facts.push({
            content: fact,
            confidence: 0.9,
            tags: ["solution", "curated"],
          });
        }
      }
    }
  }

  // 4. Extract tech stack from package.json / requirements.txt
  for (const [file, tag] of [
    ["package.json", "node"],
    ["requirements.txt", "python"],
    ["go.mod", "go"],
    ["Gemfile", "ruby"],
  ] as const) {
    if (existsSync(file)) {
      const fact = `Project uses ${tag} (${file} detected)`;
      if (!existingContent.has(fact.toLowerCase())) {
        facts.push({
          content: fact,
          confidence: 0.95,
          tags: ["tech-stack", tag, "curated"],
        });
      }
    }
  }

  return facts;
}
