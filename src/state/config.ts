/**
 * Apex Forge — Config Resolution
 *
 * Reads .apex/config.yaml (flat key: value format) and merges with DEFAULT_CONFIG.
 * No external YAML library — the config format is intentionally flat.
 */

import { DEFAULT_CONFIG, type ApexConfig } from "../types/config.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_PATH = ".apex/config.yaml";

// ---------------------------------------------------------------------------
// Simple YAML parser (flat key: value only)
// ---------------------------------------------------------------------------

/**
 * Parse a flat YAML file (key: value per line).
 * Handles:
 *   - Comments (#) and empty lines are skipped
 *   - String values (with or without quotes)
 *   - Numeric values (integers and floats)
 *   - Boolean values (true/false, yes/no)
 *   - Keys use snake_case or kebab-case
 */
export function parseSimpleYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const raw of content.split("\n")) {
    const line = raw.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith("#")) continue;

    // Find the first colon that separates key from value
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Strip inline comments (only if preceded by whitespace)
    const inlineComment = value.search(/\s+#/);
    if (inlineComment !== -1) {
      value = value.slice(0, inlineComment).trim();
    }

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Type coercion helpers
// ---------------------------------------------------------------------------

function coerceValue(value: string): string | number | boolean {
  // Booleans
  if (value === "true" || value === "yes") return true;
  if (value === "false" || value === "no") return false;

  // Numbers (integer or float)
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

  return value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load config from .apex/config.yaml and merge with DEFAULT_CONFIG.
 * Config file values override defaults. Missing keys use defaults.
 */
export async function loadConfig(): Promise<ApexConfig> {
  const file = Bun.file(CONFIG_PATH);

  if (!(await file.exists())) {
    return { ...DEFAULT_CONFIG };
  }

  const content = await file.text();
  const raw = parseSimpleYaml(content);

  // Start with defaults, then overlay parsed values with type coercion
  const config = { ...DEFAULT_CONFIG } as Record<string, unknown>;

  for (const [key, value] of Object.entries(raw)) {
    // Only override keys that exist in the default config
    if (key in DEFAULT_CONFIG) {
      config[key] = coerceValue(value);
    }
  }

  return config as unknown as ApexConfig;
}
