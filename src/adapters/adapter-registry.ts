import { ClaudeAdapter } from "./claude-adapter.js";
import { CodexAdapter } from "./codex-adapter.js";
import { GeminiAdapter } from "./gemini-adapter.js";
import type { RuntimeAdapter } from "./runtime.js";

const BUILT_IN_ADAPTERS: Array<() => RuntimeAdapter> = [
  () => new ClaudeAdapter(),
  () => new CodexAdapter(),
  () => new GeminiAdapter(),
];

/**
 * Detect all available adapters by checking CLI availability in PATH.
 * Returns a map of adapter name → adapter instance for available adapters.
 */
export function detectAdapters(): Map<string, RuntimeAdapter> {
  const available = new Map<string, RuntimeAdapter>();

  for (const factory of BUILT_IN_ADAPTERS) {
    const adapter = factory();
    if (adapter.available()) {
      available.set(adapter.name(), adapter);
    }
  }

  return available;
}

/**
 * Resolve an adapter by name. Falls back to "claude" if requested adapter is unavailable.
 * Throws if no adapters are available at all.
 */
export function resolveAdapter(
  adapters: Map<string, RuntimeAdapter>,
  name?: string,
): RuntimeAdapter {
  if (name && adapters.has(name)) {
    return adapters.get(name)!;
  }

  // Fallback: claude → codex → gemini → first available
  for (const fallback of ["claude", "codex", "gemini"]) {
    if (adapters.has(fallback)) {
      return adapters.get(fallback)!;
    }
  }

  // Last resort: any available adapter
  const first = adapters.values().next();
  if (!first.done) return first.value;

  throw new Error(
    "No agent adapters available. Install at least one agent CLI:\n" +
      "  - Claude Code: https://docs.anthropic.com/en/docs/claude-code\n" +
      "  - Codex: https://github.com/openai/codex\n" +
      "  - Gemini CLI: https://github.com/google/gemini-cli",
  );
}
