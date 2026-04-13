import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Task } from "../types/task.js";

interface PromptTemplate {
  name?: string;
  description?: string;
  model_hint?: string;
  skill?: string;
  persona?: string;
}

/**
 * Build the complete agent prompt from task + template + workspace context.
 */
export function buildAgentPrompt(
  task: Task,
  template: PromptTemplate | null,
  options: {
    workspacePath?: string;
    attempt?: number;
    previousAttemptNotes?: string;
    dagArtifacts?: Array<{ taskId: string; summary: string }>;
  } = {},
): string {
  const lines: string[] = [];

  // Task header
  lines.push(`You are an AI agent executing task ${task.id}.`);
  lines.push("");
  lines.push("## Task");
  lines.push(`Title: ${task.title}`);
  lines.push(`Description: ${task.description}`);

  if (task.depends_on.length > 0) {
    lines.push(`Dependencies: ${task.depends_on.join(", ")} (already completed)`);
  }

  // Template / role info
  if (template) {
    if (template.name) {
      lines.push("");
      lines.push(`## Agent Role: ${template.name}`);
      if (template.description) lines.push(template.description);
    }
  }

  // Skill injection
  const skillContent = loadSkillContent(template?.skill);
  if (skillContent) {
    lines.push("");
    lines.push("## Skill Instructions");
    lines.push(skillContent);
  }

  // Persona injection
  const personaContent = loadPersonaContent(template?.persona);
  if (personaContent) {
    lines.push("");
    lines.push("## Evaluation Perspective");
    lines.push(personaContent);
  }

  // Workspace context
  if (options.workspacePath) {
    lines.push("");
    lines.push("## Workspace");
    lines.push(`Path: ${options.workspacePath}`);
    lines.push("Write your output to: `output/result.json`");
  }

  // Retry context
  if (options.attempt && options.attempt > 1) {
    lines.push("");
    lines.push(`## Retry Context (Attempt ${options.attempt})`);
    lines.push("This is a retry. Review previous attempt notes before starting.");
    if (options.previousAttemptNotes) {
      lines.push("");
      lines.push("### Previous Attempt Notes");
      lines.push(options.previousAttemptNotes);
    }
  }

  // DAG artifacts from upstream tasks
  if (options.dagArtifacts && options.dagArtifacts.length > 0) {
    lines.push("");
    lines.push("## Upstream Task Results");
    for (const artifact of options.dagArtifacts) {
      lines.push(`- ${artifact.taskId}: ${artifact.summary}`);
    }
    lines.push("");
    lines.push("Check the `input/` directory in your workspace for full upstream results.");
  }

  // Standard rules
  lines.push("");
  lines.push("## Rules");
  lines.push("1. Stay scoped: only work on this task");
  lines.push("2. When the task involves writing code, follow TDD where appropriate");
  lines.push("3. When done, exit with code 0. If blocked, exit with code 1");
  lines.push("");
  lines.push("## REQUIRED OUTPUT (do this BEFORE exiting)");
  lines.push("You MUST create the file `output/result.json` in your workspace.");
  lines.push("This file is how the orchestrator knows what you accomplished.");
  lines.push("Without it, your work is considered incomplete.");
  lines.push("");
  lines.push("Format:");
  lines.push("```json");
  lines.push("{");
  lines.push('  "verdict": "pass" or "fail",');
  lines.push('  "findings": [{"severity": "high|medium|low", "description": "..."}],');
  lines.push('  "summary": "One-sentence summary of what was done"');
  lines.push("}");
  lines.push("```");

  return lines.filter(l => l !== undefined).join("\n");
}

/**
 * Load skill content from skill/ directory. Returns null if not found.
 */
function loadSkillContent(skillRef?: string): string | null {
  if (!skillRef) return null;

  // Try direct path first, then skill/stages/, then skill/
  const candidates = [
    skillRef,
    join("skill/stages", `${skillRef}.md`),
    join("skill", `${skillRef}.md`),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, "utf-8");
    }
  }

  return null;
}

/**
 * Load persona content from skill/personas/ directory. Returns formatted string or null.
 */
function loadPersonaContent(personaRef?: string): string | null {
  if (!personaRef) return null;

  const candidates = [
    join("skill/personas", `${personaRef}.yaml`),
    join("skill/personas", personaRef),
    personaRef,
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf-8");
      return formatPersonaYaml(raw);
    }
  }

  return null;
}

/**
 * Convert persona YAML into human-readable prompt text.
 */
function formatPersonaYaml(yaml: string): string {
  const lines: string[] = [];

  for (const line of yaml.split("\n")) {
    let match = line.match(/^(\w+):\s*"?(.+?)"?\s*$/);
    if (match) {
      const [, key, value] = match;
      if (key === "name") lines.push(`**Role**: ${value}`);
      else if (key === "background") lines.push(`**Background**: ${value}`);
      else if (key === "evaluates_from") lines.push(`**Focus**: ${value}`);
      else if (key === "blind_spots") lines.push(`**Known blind spots**: ${value}`);
      else if (key === "output_format") lines.push(`**Output format**: ${value}`);
    } else if ((match = line.match(/^\s+-\s+"?(.+)"?\s*$/))) {
      lines.push(`  - ${match[1]}`);
    } else if (line.match(/^typical_questions:/)) {
      lines.push("**Key questions to answer**:");
    }
  }

  return lines.join("\n");
}
