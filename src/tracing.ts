/**
 * Apex Forge — Observability / Tracing
 *
 * Lightweight structured spans inspired by LangSmith.
 * Writes completed spans to .apex/analytics/traces.jsonl for post-hoc analysis.
 */

import { existsSync, readFileSync } from "fs";
import { appendJSONL } from "./utils/logger.js";
import { isoTimestamp } from "./utils/timestamp.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRACE_FILE = ".apex/analytics/traces.jsonl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Span {
  trace_id: string;
  span_id: string;
  parent_id?: string;
  name: string;
  started_at: string;
  ended_at?: string;
  duration_ms?: number;
  status: "running" | "ok" | "error";
  metadata?: Record<string, unknown>;
}

export interface TraceSummary {
  trace_id: string;
  root_span: string;
  span_count: number;
  started_at: string;
  ended_at?: string;
  total_duration_ms?: number;
  has_errors: boolean;
}

// ---------------------------------------------------------------------------
// In-memory active spans
// ---------------------------------------------------------------------------

const activeSpans: Map<string, Span> = new Map();

// ---------------------------------------------------------------------------
// Span lifecycle
// ---------------------------------------------------------------------------

/**
 * Start a new span. If parentId is provided, the span inherits the parent's trace_id.
 * Returns the span_id for later use with endSpan().
 */
export function startSpan(name: string, parentId?: string): string {
  const spanId = `span-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const traceId = parentId
    ? activeSpans.get(parentId)?.trace_id || `trace-${Date.now()}`
    : `trace-${Date.now()}`;

  const span: Span = {
    trace_id: traceId,
    span_id: spanId,
    parent_id: parentId,
    name,
    started_at: isoTimestamp(),
    status: "running",
  };

  activeSpans.set(spanId, span);
  return spanId;
}

/**
 * End a span and flush it to the trace file.
 */
export function endSpan(
  spanId: string,
  status: "ok" | "error" = "ok",
  metadata?: Record<string, unknown>,
): void {
  const span = activeSpans.get(spanId);
  if (!span) return;

  span.ended_at = isoTimestamp();
  span.duration_ms = Date.now() - new Date(span.started_at).getTime();
  span.status = status;
  if (metadata) span.metadata = metadata;

  appendJSONL(TRACE_FILE, span as unknown as Record<string, unknown>);
  activeSpans.delete(spanId);
}

/**
 * Get all currently running spans.
 */
export function getActiveSpans(): Span[] {
  return [...activeSpans.values()];
}

// ---------------------------------------------------------------------------
// Trace queries
// ---------------------------------------------------------------------------

/**
 * Load all completed spans from the trace file.
 */
export function loadTraces(): Span[] {
  if (!existsSync(TRACE_FILE)) return [];

  const lines = readFileSync(TRACE_FILE, "utf-8").trim().split("\n").filter(Boolean);
  return lines.map((line) => JSON.parse(line) as Span);
}

/**
 * Get a summary of recent traces (grouped by trace_id).
 */
export function listTraceSummaries(limit = 20): TraceSummary[] {
  const spans = loadTraces();
  const byTrace = new Map<string, Span[]>();

  for (const span of spans) {
    const group = byTrace.get(span.trace_id) || [];
    group.push(span);
    byTrace.set(span.trace_id, group);
  }

  const summaries: TraceSummary[] = [];

  for (const [traceId, traceSpans] of byTrace) {
    const root = traceSpans.find((s) => !s.parent_id) || traceSpans[0];
    const allEnded = traceSpans.filter((s) => s.ended_at);
    const totalMs = allEnded.reduce((sum, s) => sum + (s.duration_ms || 0), 0);
    const hasErrors = traceSpans.some((s) => s.status === "error");

    const endedAts = allEnded
      .map((s) => s.ended_at!)
      .sort();

    summaries.push({
      trace_id: traceId,
      root_span: root.name,
      span_count: traceSpans.length,
      started_at: root.started_at,
      ended_at: endedAts.length > 0 ? endedAts[endedAts.length - 1] : undefined,
      total_duration_ms: totalMs || undefined,
      has_errors: hasErrors,
    });
  }

  // Most recent first, limited
  return summaries.reverse().slice(0, limit);
}

/**
 * Get all spans for a specific trace.
 */
export function getTraceSpans(traceId: string): Span[] {
  return loadTraces().filter((s) => s.trace_id === traceId);
}
