import { existsSync, readFileSync } from "fs";
import { join } from "path";

export interface AgentResult {
  taskId: string;
  adapter: string;
  persona?: string;
  verdict?: string;
  findings?: Finding[];
  output?: string;
  exitCode: number;
  duration_s: number;
}

export interface Finding {
  severity: "blocker" | "concern" | "note";
  description: string;
  source?: string;  // which agent/persona found this
}

export interface SynthesizedResult {
  taskId: string;
  agents: string[];
  verdict: string;   // "pass" | "fail" | "mixed"
  blockers: Finding[];
  concerns: Finding[];
  notes: Finding[];
  summary: string;
}

/**
 * Collect structured result from an agent's workspace.
 * Reads output/result.json if it exists, falls back to log file.
 */
export function collectResult(
  workspacePath: string,
  taskId: string,
  adapter: string,
  exitCode: number,
  duration_s: number,
  persona?: string,
): AgentResult {
  const resultPath = join(workspacePath, "output", "result.json");

  if (existsSync(resultPath)) {
    try {
      const raw = JSON.parse(readFileSync(resultPath, "utf-8"));
      return {
        taskId,
        adapter,
        persona,
        verdict: raw.verdict,
        findings: raw.findings || [],
        output: raw.output || raw.summary,
        exitCode,
        duration_s,
      };
    } catch {
      // malformed result.json, fall through
    }
  }

  // Fallback: read log file
  const logPath = join(".apex/orchestrator-logs", `${taskId}.log`);
  const output = existsSync(logPath) ? readFileSync(logPath, "utf-8") : undefined;

  return {
    taskId,
    adapter,
    persona,
    verdict: exitCode === 0 ? "pass" : "fail",
    findings: [],
    output,
    exitCode,
    duration_s,
  };
}

/**
 * Synthesize findings from multiple agents (Mode 2: multi-perspective review).
 * Merges findings, deduplicates by description similarity, ranks by severity.
 */
export function synthesizeFindings(results: AgentResult[]): SynthesizedResult {
  const taskId = results[0]?.taskId || "unknown";
  const agents = results.map(r => `${r.adapter}${r.persona ? `(${r.persona})` : ""}`);

  // Collect all findings with source attribution
  const allFindings: Finding[] = [];
  for (const result of results) {
    for (const finding of result.findings || []) {
      allFindings.push({
        ...finding,
        source: finding.source || `${result.adapter}${result.persona ? `(${result.persona})` : ""}`,
      });
    }
  }

  // Deduplicate by description similarity (exact match for now)
  const seen = new Set<string>();
  const unique: Finding[] = [];
  for (const f of allFindings) {
    const key = f.description.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(f);
    }
  }

  // Categorize
  const blockers = unique.filter(f => f.severity === "blocker");
  const concerns = unique.filter(f => f.severity === "concern");
  const notes = unique.filter(f => f.severity === "note");

  // Determine overall verdict
  const anyFail = results.some(r => r.verdict === "fail" || r.exitCode !== 0);
  const allPass = results.every(r => r.verdict === "pass" && r.exitCode === 0);
  const verdict = blockers.length > 0 ? "fail" : allPass ? "pass" : anyFail ? "mixed" : "pass";

  // Build summary
  const summaryParts = [
    `${results.length} agents reviewed`,
    `${unique.length} unique findings`,
  ];
  if (blockers.length > 0) summaryParts.push(`${blockers.length} blockers`);
  if (concerns.length > 0) summaryParts.push(`${concerns.length} concerns`);

  return {
    taskId,
    agents,
    verdict,
    blockers,
    concerns,
    notes,
    summary: summaryParts.join(", "),
  };
}
