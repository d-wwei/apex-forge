/**
 * Analytics data loading — shared between dashboard and tests.
 *
 * Reads JSONL files from .apex/ and normalizes them into a unified analytics format.
 * Four data sources: orchestrator (agent-agnostic), telemetry CLI, traces, hook events.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export interface AnalyticsEvent {
  ts: string;
  skill: string;
  outcome: string;
  duration_s: number;
  meta: Record<string, any>;
  source: "orchestrator" | "telemetry" | "trace" | "hook";
}

/**
 * Read a JSONL file and return an array of parsed objects.
 * Returns [] if file is missing or unreadable. Skips malformed lines.
 */
export function loadJSONL(filePath: string): any[] {
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Load and merge analytics from all four data sources in an .apex/ directory.
 *
 * Sources (in priority order):
 *   1. orchestrator.jsonl — multi-agent dispatch results (agent-agnostic, primary)
 *   2. usage.jsonl — telemetry CLI / skill invocation records (agent-agnostic)
 *   3. traces.jsonl — completed trace spans (agent-agnostic)
 *   4. events.jsonl — agent-specific hook events (optional enhancement)
 *
 * Returns a unified, sorted, capped array of AnalyticsEvent objects.
 */
export function loadEvents(apexDir: string): AnalyticsEvent[] {
  // Source 1: Orchestrator events — multi-agent dispatch results (agent-agnostic, primary)
  const orchestratorEvents = loadJSONL(join(apexDir, "analytics", "orchestrator.jsonl"));
  const orchestrator: AnalyticsEvent[] = orchestratorEvents.map((o) => {
    if (o.event === "cross_model_synthesis") {
      return {
        ts: o.ts || "",
        skill: "cross-model-synthesis",
        outcome: o.verdict || "unknown",
        duration_s: 0,
        meta: { task_id: o.task_id, agents: o.agents, blocker_count: o.blocker_count, concern_count: o.concern_count, note_count: o.note_count },
        source: "orchestrator" as const,
      };
    }
    return {
      ts: o.ts || "",
      skill: o.adapter || "unknown",
      outcome: o.outcome || "unknown",
      duration_s: o.duration_s ?? 0,
      meta: { task_id: o.task_id, run_key: o.run_key, attempt: o.attempt },
      source: "orchestrator" as const,
    };
  });

  // Source 2: Telemetry CLI / skill invocation records (agent-agnostic)
  const legacyAnalytics = loadJSONL(join(apexDir, "analytics", "usage.jsonl"));
  const telemetry: AnalyticsEvent[] = legacyAnalytics.map((a) => ({
    ts: a.ts || a.timestamp || "",
    skill: a.skill || a.name || "unknown",
    outcome: a.outcome || a.result || "unknown",
    duration_s: a.duration_s ?? a.duration ?? 0,
    meta: {},
    source: "telemetry" as const,
  }));

  // Source 3: Completed trace spans (agent-agnostic)
  const traceSpans = loadJSONL(join(apexDir, "analytics", "traces.jsonl"));
  const traces: AnalyticsEvent[] = traceSpans
    .filter((s) => s.status === "ok" || s.status === "error")
    .map((s) => ({
      ts: s.ended_at || s.started_at || "",
      skill: s.name || "unknown",
      outcome: s.status === "ok" ? "success" : "error",
      duration_s: s.duration_ms != null ? Math.round(s.duration_ms / 100) / 10 : 0,
      meta: { trace_id: s.trace_id, span_id: s.span_id },
      source: "trace" as const,
    }));

  // Source 4: Agent-specific hook events (optional enhancement, e.g. Claude Code PostToolUse)
  const hookEvents = loadJSONL(join(apexDir, "events.jsonl"));
  const hooks: AnalyticsEvent[] = hookEvents.map((e) => ({
    ts: e.ts,
    skill: e.tool || "unknown",
    outcome: "success",
    duration_s: 0,
    meta: e.meta || {},
    source: "hook" as const,
  }));

  // Merge all sources, sort by timestamp (newest last), cap at 200 most recent
  return [...orchestrator, ...telemetry, ...traces, ...hooks]
    .sort((a, b) => (a.ts || "").localeCompare(b.ts || ""))
    .slice(-200);
}
