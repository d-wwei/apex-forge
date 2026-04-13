#!/usr/bin/env bun

/**
 * Telemetry Remote Sync
 *
 * Uploads local JSONL analytics to a configurable remote endpoint.
 * Syncs three data sources: usage, orchestrator, and traces.
 * Each file has an independent sync cursor for incremental uploads.
 *
 * Supports two modes:
 *   - Supabase (if endpoint contains "supabase")
 *   - Generic webhook (POST JSON to any URL)
 *
 * Configuration via environment variables:
 *   APEX_TELEMETRY_ENDPOINT — URL to POST events to
 *   APEX_TELEMETRY_KEY      — Optional auth key
 *
 * Or via .apex/config.yaml telemetry section.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const ANALYTICS_FILES = [
  { path: ".apex/analytics/usage.jsonl", stateFile: ".apex/analytics/.sync-state", source: "telemetry" },
  { path: ".apex/analytics/orchestrator.jsonl", stateFile: ".apex/analytics/.sync-state-orchestrator", source: "orchestrator" },
  { path: ".apex/analytics/traces.jsonl", stateFile: ".apex/analytics/.sync-state-traces", source: "trace" },
];

interface SyncConfig {
  endpoint: string;
  api_key?: string;
  mode: "supabase" | "webhook";
}

/**
 * Load sync configuration from environment variables or .apex/config.yaml.
 * Returns null if no telemetry sync is configured.
 */
async function loadSyncConfig(): Promise<SyncConfig | null> {
  // 1. Check environment variables first (highest priority)
  if (process.env.APEX_TELEMETRY_ENDPOINT) {
    const endpoint = process.env.APEX_TELEMETRY_ENDPOINT;
    return {
      endpoint,
      api_key: process.env.APEX_TELEMETRY_KEY,
      mode: endpoint.includes("supabase") ? "supabase" : "webhook",
    };
  }

  // 2. Check .apex/config.yaml for telemetry section
  const configPath = ".apex/config.yaml";
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      // Simple YAML parsing for telemetry block (no external dependency)
      const endpointMatch = raw.match(/telemetry[\s\S]*?endpoint:\s*["']?([^\s"']+)/);
      const keyMatch = raw.match(/telemetry[\s\S]*?api_key:\s*["']?([^\s"']+)/);
      if (endpointMatch) {
        const endpoint = endpointMatch[1];
        return {
          endpoint,
          api_key: keyMatch?.[1],
          mode: endpoint.includes("supabase") ? "supabase" : "webhook",
        };
      }
    } catch {
      // Config file unreadable or malformed, fall through
    }
  }

  return null;
}

/**
 * Read the last synced line number from a sync state file.
 */
function readSyncState(stateFile: string): number {
  if (!existsSync(stateFile)) return 0;
  try {
    return parseInt(readFileSync(stateFile, "utf-8").trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Write the current sync position so we can resume next time.
 */
function writeSyncState(stateFile: string, lineCount: number): void {
  const dir = dirname(stateFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(stateFile, String(lineCount));
}

/**
 * Build request headers based on the sync mode and config.
 */
function buildHeaders(config: SyncConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.mode === "supabase" && config.api_key) {
    headers["apikey"] = config.api_key;
    headers["Authorization"] = `Bearer ${config.api_key}`;
  } else if (config.api_key) {
    headers["Authorization"] = `Bearer ${config.api_key}`;
  }

  return headers;
}

/**
 * Collect unsynced events from a single JSONL file.
 * Returns parsed events tagged with their source, and the total line count for cursor update.
 */
function collectUnsyncedEvents(filePath: string, stateFile: string, source: string): { events: any[]; totalLines: number } {
  if (!existsSync(filePath)) return { events: [], totalLines: 0 };

  const allLines = readFileSync(filePath, "utf-8").trim().split("\n").filter(Boolean);
  const lastSynced = readSyncState(stateFile);
  const newLines = allLines.slice(lastSynced);

  const events = newLines
    .map((line) => {
      try {
        return { ...JSON.parse(line), _source: source };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return { events, totalLines: allLines.length };
}

/**
 * Main sync routine. Reads unsynced JSONL lines from all analytics files,
 * POSTs them to the configured endpoint, and updates sync cursors on success.
 */
export async function sync(): Promise<void> {
  const config = await loadSyncConfig();
  if (!config) {
    console.log("No telemetry sync configured.");
    console.log("Set APEX_TELEMETRY_ENDPOINT and optionally APEX_TELEMETRY_KEY to enable.");
    return;
  }

  // Collect unsynced events from all sources
  const collected = ANALYTICS_FILES.map((f) => ({
    ...f,
    ...collectUnsyncedEvents(f.path, f.stateFile, f.source),
  }));

  const allEvents = collected.flatMap((c) => c.events);

  if (allEvents.length === 0) {
    console.log("Already up to date.");
    return;
  }

  console.log(`Syncing ${allEvents.length} event(s) to ${config.mode} (${config.endpoint})...`);
  for (const c of collected) {
    if (c.events.length > 0) {
      console.log(`  ${c.source}: ${c.events.length} new event(s)`);
    }
  }

  const headers = buildHeaders(config);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ events: allEvents }),
    });

    if (response.ok) {
      // Update all cursors only on successful POST
      for (const c of collected) {
        if (c.totalLines > 0) {
          writeSyncState(c.stateFile, c.totalLines);
        }
      }
      console.log(`Synced ${allEvents.length} event(s) successfully.`);
    } else {
      const body = await response.text().catch(() => "");
      console.error(`Sync failed: ${response.status} ${response.statusText}`);
      if (body) console.error(`Response: ${body.slice(0, 200)}`);
    }
  } catch (err: any) {
    console.error(`Sync error: ${err.message}`);
  }
}

// Run directly when executed as a script
if (import.meta.main) {
  sync();
}
