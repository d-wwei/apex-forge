#!/usr/bin/env bun

/**
 * Telemetry Remote Sync
 *
 * Uploads local JSONL analytics to a configurable remote endpoint.
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

const ANALYTICS_FILE = ".apex/analytics/usage.jsonl";
const SYNC_STATE_FILE = ".apex/analytics/.sync-state";

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
 * Read the last synced line number from the sync state file.
 */
function readSyncState(): number {
  if (!existsSync(SYNC_STATE_FILE)) return 0;
  try {
    return parseInt(readFileSync(SYNC_STATE_FILE, "utf-8").trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Write the current sync position so we can resume next time.
 */
function writeSyncState(lineCount: number): void {
  const dir = dirname(SYNC_STATE_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(SYNC_STATE_FILE, String(lineCount));
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
 * Main sync routine. Reads unsynced JSONL lines, POSTs them to the
 * configured endpoint, and updates the sync state on success.
 */
export async function sync(): Promise<void> {
  const config = await loadSyncConfig();
  if (!config) {
    console.log("No telemetry sync configured.");
    console.log("Set APEX_TELEMETRY_ENDPOINT and optionally APEX_TELEMETRY_KEY to enable.");
    return;
  }

  if (!existsSync(ANALYTICS_FILE)) {
    console.log("No analytics data to sync.");
    return;
  }

  const lastSynced = readSyncState();

  const allLines = readFileSync(ANALYTICS_FILE, "utf-8").trim().split("\n").filter(Boolean);
  const newLines = allLines.slice(lastSynced);

  if (newLines.length === 0) {
    console.log("Already up to date.");
    return;
  }

  const events = newLines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (events.length === 0) {
    console.log("No parseable events to sync.");
    writeSyncState(allLines.length);
    return;
  }

  console.log(`Syncing ${events.length} event(s) to ${config.mode} (${config.endpoint})...`);

  const headers = buildHeaders(config);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ events }),
    });

    if (response.ok) {
      writeSyncState(allLines.length);
      console.log(`Synced ${events.length} event(s) successfully.`);
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
