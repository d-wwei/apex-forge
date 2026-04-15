import { describe, test, expect } from "bun:test";
import {
  BUILTIN_ADAPTERS,
  resolveAdapter,
  resolveAdapterWithConfig,
  type AgentAdapter,
  type AgentCapabilities,
  type ProtocolInjectionMethod,
  type StartOpts,
} from "../agent-adapter.js";
import type { AdaptersMap } from "../../types/config.js";

// ── BUILTIN_ADAPTERS registry ────────────────────────────────────────

describe("BUILTIN_ADAPTERS", () => {
  test("has exactly 4 entries: claude, codex, gemini, opencode", () => {
    const keys = Object.keys(BUILTIN_ADAPTERS).sort();
    expect(keys).toEqual(["claude", "codex", "gemini", "opencode"]);
  });

  test("every adapter has all required fields", () => {
    for (const [name, adapter] of Object.entries(BUILTIN_ADAPTERS)) {
      expect(adapter.name).toBe(name);
      expect(typeof adapter.binary).toBe("string");
      expect(typeof adapter.buildStartCommand).toBe("function");
      expect(adapter.protocolInjection).toBeDefined();
      expect(adapter.capabilities).toBeDefined();
      expect(Array.isArray(adapter.interruptKeys)).toBe(true);
      expect(adapter.interruptKeys.length).toBeGreaterThan(0);
      expect(typeof adapter.skipProxyEnv).toBe("boolean");
    }
  });
});

// ── buildStartCommand per agent ──────────────────────────────────────

describe("buildStartCommand", () => {
  const baseOpts: StartOpts = {
    worktreePath: "/tmp/wt",
    protocolPath: "/tmp/wt/.apex/worker-protocol.md",
  };

  test("claude: uses --append-system-prompt-file", () => {
    const cmd = BUILTIN_ADAPTERS.claude.buildStartCommand(baseOpts);
    expect(cmd).toContain("claude");
    expect(cmd).toContain("--append-system-prompt-file");
    expect(cmd).toContain(baseOpts.protocolPath);
  });

  test("codex: pipes cat protocol into codex exec --full-auto", () => {
    const cmd = BUILTIN_ADAPTERS.codex.buildStartCommand(baseOpts);
    expect(cmd).toContain("cat");
    expect(cmd).toContain(baseOpts.protocolPath);
    expect(cmd).toContain("codex");
    expect(cmd).toContain("--full-auto");
  });

  test("gemini: uses --yolo and single-quoted cat path", () => {
    const cmd = BUILTIN_ADAPTERS.gemini.buildStartCommand(baseOpts);
    expect(cmd).toContain("gemini");
    expect(cmd).toContain("--yolo");
    expect(cmd).toContain("-p");
    // single-quoted cat path
    expect(cmd).toContain(`$(cat '${baseOpts.protocolPath}')`);
  });

  test("opencode: uses run -p with single-quoted cat path", () => {
    const cmd = BUILTIN_ADAPTERS.opencode.buildStartCommand(baseOpts);
    expect(cmd).toContain("opencode");
    expect(cmd).toContain("run -p");
    expect(cmd).toContain(`$(cat '${baseOpts.protocolPath}')`);
  });

  test("all commands include cd to worktreePath", () => {
    for (const adapter of Object.values(BUILTIN_ADAPTERS)) {
      const cmd = adapter.buildStartCommand(baseOpts);
      expect(cmd).toContain(`cd "${baseOpts.worktreePath}"`);
    }
  });

  test("model override is passed when provided", () => {
    const opts: StartOpts = { ...baseOpts, model: "o3" };
    const cmd = BUILTIN_ADAPTERS.codex.buildStartCommand(opts);
    expect(cmd).toContain("o3");
  });
});

// ── Capabilities ─────────────────────────────────────────────────────

describe("capabilities", () => {
  test("claude preferredLanguage is zh", () => {
    expect(BUILTIN_ADAPTERS.claude.capabilities.preferredLanguage).toBe("zh");
  });

  test("codex, gemini, opencode preferredLanguage is en", () => {
    expect(BUILTIN_ADAPTERS.codex.capabilities.preferredLanguage).toBe("en");
    expect(BUILTIN_ADAPTERS.gemini.capabilities.preferredLanguage).toBe("en");
    expect(BUILTIN_ADAPTERS.opencode.capabilities.preferredLanguage).toBe("en");
  });

  test("all adapters canExecuteBash", () => {
    for (const adapter of Object.values(BUILTIN_ADAPTERS)) {
      expect(adapter.capabilities.canExecuteBash).toBe(true);
    }
  });

  test("all adapters canWriteFiles and canReadFiles", () => {
    for (const adapter of Object.values(BUILTIN_ADAPTERS)) {
      expect(adapter.capabilities.canWriteFiles).toBe(true);
      expect(adapter.capabilities.canReadFiles).toBe(true);
    }
  });

  test("claude maxPromptBytes is 1MB", () => {
    expect(BUILTIN_ADAPTERS.claude.capabilities.maxPromptBytes).toBe(1_000_000);
  });

  test("codex, gemini, opencode maxPromptBytes is 200KB", () => {
    expect(BUILTIN_ADAPTERS.codex.capabilities.maxPromptBytes).toBe(200_000);
    expect(BUILTIN_ADAPTERS.gemini.capabilities.maxPromptBytes).toBe(200_000);
    expect(BUILTIN_ADAPTERS.opencode.capabilities.maxPromptBytes).toBe(200_000);
  });
});

// ── interruptKeys ────────────────────────────────────────────────────

describe("interruptKeys", () => {
  test("claude uses Escape", () => {
    expect(BUILTIN_ADAPTERS.claude.interruptKeys).toEqual(["Escape"]);
  });

  test("codex uses C-c", () => {
    expect(BUILTIN_ADAPTERS.codex.interruptKeys).toEqual(["C-c"]);
  });

  test("gemini uses C-c", () => {
    expect(BUILTIN_ADAPTERS.gemini.interruptKeys).toEqual(["C-c"]);
  });

  test("opencode uses C-c", () => {
    expect(BUILTIN_ADAPTERS.opencode.interruptKeys).toEqual(["C-c"]);
  });
});

// ── protocolInjection ────────────────────────────────────────────────

describe("protocolInjection", () => {
  test("claude uses system-prompt-file with flag", () => {
    expect(BUILTIN_ADAPTERS.claude.protocolInjection).toEqual({
      type: "system-prompt-file",
      flag: "--append-system-prompt-file",
    });
  });

  test("codex uses stdin", () => {
    expect(BUILTIN_ADAPTERS.codex.protocolInjection).toEqual({ type: "stdin" });
  });

  test("gemini uses cli-argument with -p flag", () => {
    expect(BUILTIN_ADAPTERS.gemini.protocolInjection).toEqual({
      type: "cli-argument",
      flag: "-p",
    });
  });

  test("opencode uses cli-argument with -p flag", () => {
    expect(BUILTIN_ADAPTERS.opencode.protocolInjection).toEqual({
      type: "cli-argument",
      flag: "-p",
    });
  });
});

// ── resolveAdapter (convenience, builtin-only) ───────────────────────

describe("resolveAdapter", () => {
  test("returns builtin for known agent", () => {
    const adapter = resolveAdapter("claude");
    expect(adapter.name).toBe("claude");
    expect(adapter.binary).toBe("claude");
  });

  test("returns builtin for each known agent", () => {
    for (const name of ["claude", "codex", "gemini", "opencode"]) {
      const adapter = resolveAdapter(name);
      expect(adapter.name).toBe(name);
    }
  });

  test("throws for unknown agent", () => {
    expect(() => resolveAdapter("unknown-agent")).toThrow();
  });
});

// ── resolveAdapterWithConfig ─────────────────────────────────────────

describe("resolveAdapterWithConfig", () => {
  test("config override wins over builtin", () => {
    const configAdapters: AdaptersMap = {
      claude: { command: "my-claude", args: ["--custom-flag"] },
    };
    const adapter = resolveAdapterWithConfig("claude", configAdapters);
    // Config override merges with builtin, so capabilities stay from builtin
    expect(adapter.capabilities.preferredLanguage).toBe("zh");
    // But the start command uses config's command
    const cmd = adapter.buildStartCommand({
      worktreePath: "/tmp/wt",
      protocolPath: "/tmp/wt/.apex/worker-protocol.md",
    });
    expect(cmd).toContain("my-claude");
    expect(cmd).toContain("--custom-flag");
  });

  test("builtin returned when no config override", () => {
    const configAdapters: AdaptersMap = {};
    const adapter = resolveAdapterWithConfig("claude", configAdapters);
    expect(adapter.name).toBe("claude");
    expect(adapter.capabilities.preferredLanguage).toBe("zh");
  });

  test("builtin returned when configAdapters is undefined", () => {
    const adapter = resolveAdapterWithConfig("claude", undefined);
    expect(adapter.name).toBe("claude");
  });

  test("config enables custom agent with default capabilities", () => {
    const configAdapters: AdaptersMap = {
      "my-custom-agent": { command: "my-agent-bin", args: ["--go"] },
    };
    const adapter = resolveAdapterWithConfig("my-custom-agent", configAdapters);
    expect(adapter.name).toBe("my-custom-agent");
    const cmd = adapter.buildStartCommand({
      worktreePath: "/tmp/wt",
      protocolPath: "/tmp/wt/.apex/worker-protocol.md",
    });
    expect(cmd).toContain("my-agent-bin");
    expect(cmd).toContain("--go");
    // Default capabilities for unknown custom agents
    expect(adapter.capabilities.canExecuteBash).toBe(true);
  });

  test("error for unknown agent with no config", () => {
    expect(() => resolveAdapterWithConfig("unknown-agent", undefined)).toThrow();
    expect(() => resolveAdapterWithConfig("unknown-agent", {})).toThrow();
  });
});
