import { describe, test, expect, beforeEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import type { Task } from "../types/task.js";

// --- T2: ClaudeAdapter tests ---

describe("ClaudeAdapter", () => {
  test("name returns 'claude'", async () => {
    const { ClaudeAdapter } = await import("../adapters/claude-adapter.js");
    const adapter = new ClaudeAdapter();
    expect(adapter.name()).toBe("claude");
  });

  test("available checks for claude CLI in PATH", async () => {
    const { ClaudeAdapter } = await import("../adapters/claude-adapter.js");
    const adapter = new ClaudeAdapter();
    // claude is installed on this machine
    const result = adapter.available();
    expect(typeof result).toBe("boolean");
  });

  test("spawn returns AgentHandle with correct fields", async () => {
    const { ClaudeAdapter } = await import("../adapters/claude-adapter.js");
    const adapter = new ClaudeAdapter();

    // Use --help instead of actual prompt to avoid real API calls
    const handle = await adapter.spawn(
      { id: "T-test", title: "Test", description: "test task" },
      "echo test",
      { command: "echo", args: [] }  // override to echo for testing
    );

    expect(handle.taskId).toBe("T-test");
    expect(handle.adapter).toBe("claude");
    expect(handle.attempt).toBe(1);
    expect(handle.logPath).toContain("T-test");
    expect(handle.id).toBeTruthy();

    // cleanup
    adapter.kill(handle);
  });

  test("monitor returns running for active process", async () => {
    const { ClaudeAdapter } = await import("../adapters/claude-adapter.js");
    const adapter = new ClaudeAdapter();

    // spawn a slow process
    const handle = await adapter.spawn(
      { id: "T-monitor", title: "Test", description: "test" },
      "",
      { command: "sleep", args: ["10"] }
    );

    const status = adapter.monitor(handle);
    expect(status.state).toBe("running");

    adapter.kill(handle);
  });

  test("monitor returns exited after process completes", async () => {
    const { ClaudeAdapter } = await import("../adapters/claude-adapter.js");
    const adapter = new ClaudeAdapter();

    const handle = await adapter.spawn(
      { id: "T-exit", title: "Test", description: "test" },
      "",
      { command: "true", args: [] }  // exits immediately with 0
    );

    // wait for process to exit
    await new Promise(r => setTimeout(r, 200));

    const status = adapter.monitor(handle);
    expect(status.state).toBe("exited");
    expect(status.exitCode).toBe(0);
  });
});

// --- T5: Workspace tests ---

describe("Workspace", () => {
  const testWorkspaceRoot = ".test-workspaces";

  beforeEach(() => {
    rmSync(testWorkspaceRoot, { recursive: true, force: true });
  });

  test("createWorkspace creates directory structure", async () => {
    const { createWorkspace } = await import("../orchestrator/workspace.js");
    const ws = await createWorkspace("T42", testWorkspaceRoot);

    expect(existsSync(ws.path)).toBe(true);
    expect(existsSync(`${ws.path}/output`)).toBe(true);
    expect(ws.taskId).toBe("T42");
    expect(ws.path).toContain("T42");

    rmSync(testWorkspaceRoot, { recursive: true, force: true });
  });

  test("injectArtifacts copies upstream results into workspace", async () => {
    const { createWorkspace, injectArtifacts } = await import("../orchestrator/workspace.js");

    // Create upstream workspace with result
    const upstream = await createWorkspace("T40", testWorkspaceRoot);
    writeFileSync(`${upstream.path}/output/result.json`, JSON.stringify({ verdict: "pass", findings: [] }));

    // Create downstream workspace
    const downstream = await createWorkspace("T42", testWorkspaceRoot);

    // Inject
    await injectArtifacts(downstream.path, [{ taskId: "T40", resultPath: `${upstream.path}/output/result.json` }]);

    const injected = JSON.parse(readFileSync(`${downstream.path}/input/T40-result.json`, "utf-8"));
    expect(injected.verdict).toBe("pass");

    rmSync(testWorkspaceRoot, { recursive: true, force: true });
  });

  test("cleanupWorkspace removes directory", async () => {
    const { createWorkspace, cleanupWorkspace } = await import("../orchestrator/workspace.js");
    const ws = await createWorkspace("T99", testWorkspaceRoot);
    expect(existsSync(ws.path)).toBe(true);

    await cleanupWorkspace(ws.path);
    expect(existsSync(ws.path)).toBe(false);

    rmSync(testWorkspaceRoot, { recursive: true, force: true });
  });
});

// --- T6: Retry tests ---

describe("Retry", () => {
  test("shouldRetry returns true when attempts < max", async () => {
    const { shouldRetry } = await import("../orchestrator/retry.js");
    expect(shouldRetry(1, 3)).toBe(true);
    expect(shouldRetry(2, 3)).toBe(true);
    expect(shouldRetry(3, 3)).toBe(false);
  });

  test("shouldRetry returns false for exit code 0", async () => {
    const { shouldRetry } = await import("../orchestrator/retry.js");
    expect(shouldRetry(1, 3, 0)).toBe(false);
  });

  test("backoffMs increases exponentially", async () => {
    const { backoffMs } = await import("../orchestrator/retry.js");
    const base = 10000;
    const b1 = backoffMs(1, base);
    const b2 = backoffMs(2, base);
    const b3 = backoffMs(3, base);

    // attempt 1: ~10000, attempt 2: ~20000, attempt 3: ~40000 (with jitter)
    expect(b1).toBeGreaterThanOrEqual(base * 0.8);
    expect(b1).toBeLessThanOrEqual(base * 1.2);
    expect(b2).toBeGreaterThan(b1);
    expect(b3).toBeGreaterThan(b2);
  });
});

// --- T4: Adapter Registry tests ---

describe("AdapterRegistry", () => {
  test("detectAdapters returns a map", async () => {
    const { detectAdapters } = await import("../adapters/adapter-registry.js");
    const adapters = detectAdapters();
    expect(adapters instanceof Map).toBe(true);
    // claude should be available on this machine
    expect(adapters.has("claude")).toBe(true);
  });

  test("resolveAdapter returns requested adapter if available", async () => {
    const { detectAdapters, resolveAdapter } = await import("../adapters/adapter-registry.js");
    const adapters = detectAdapters();
    const adapter = resolveAdapter(adapters, "claude");
    expect(adapter.name()).toBe("claude");
  });

  test("resolveAdapter falls back when requested not available", async () => {
    const { resolveAdapter } = await import("../adapters/adapter-registry.js");
    const adapters = new Map();
    const { ClaudeAdapter } = await import("../adapters/claude-adapter.js");
    adapters.set("claude", new ClaudeAdapter());

    const adapter = resolveAdapter(adapters, "nonexistent");
    expect(adapter.name()).toBe("claude");
  });

  test("resolveAdapter throws when no adapters available", async () => {
    const { resolveAdapter } = await import("../adapters/adapter-registry.js");
    const empty = new Map();
    expect(() => resolveAdapter(empty, "claude")).toThrow("No agent adapters available");
  });
});

// --- T7: Prompt Builder tests ---

describe("PromptBuilder", () => {
  test("builds basic prompt from task", async () => {
    const { buildAgentPrompt } = await import("../orchestrator/prompt-builder.js");
    const task: Task = {
      id: "T42", title: "Build login", description: "Implement login endpoint",
      status: "in_progress", depends_on: [], blocked_by: [], evidence: [],
      created_at: "", updated_at: "",
    };

    const prompt = buildAgentPrompt(task, null);
    expect(prompt).toContain("T42");
    expect(prompt).toContain("Build login");
    expect(prompt).toContain("Implement login endpoint");
    expect(prompt).toContain("TDD");
  });

  test("includes template role info", async () => {
    const { buildAgentPrompt } = await import("../orchestrator/prompt-builder.js");
    const task: Task = {
      id: "T1", title: "Test", description: "test",
      status: "in_progress", depends_on: [], blocked_by: [], evidence: [],
      created_at: "", updated_at: "",
    };

    const prompt = buildAgentPrompt(task, { name: "Security Reviewer", description: "Reviews for security issues" });
    expect(prompt).toContain("Security Reviewer");
    expect(prompt).toContain("Reviews for security issues");
  });

  test("includes retry context when attempt > 1", async () => {
    const { buildAgentPrompt } = await import("../orchestrator/prompt-builder.js");
    const task: Task = {
      id: "T1", title: "Test", description: "test",
      status: "in_progress", depends_on: [], blocked_by: [], evidence: [],
      created_at: "", updated_at: "",
    };

    const prompt = buildAgentPrompt(task, null, {
      attempt: 3,
      previousAttemptNotes: "Failed due to missing import",
    });
    expect(prompt).toContain("Attempt 3");
    expect(prompt).toContain("missing import");
  });

  test("includes DAG artifacts", async () => {
    const { buildAgentPrompt } = await import("../orchestrator/prompt-builder.js");
    const task: Task = {
      id: "T5", title: "Test", description: "test",
      status: "in_progress", depends_on: ["T3", "T4"], blocked_by: [], evidence: [],
      created_at: "", updated_at: "",
    };

    const prompt = buildAgentPrompt(task, null, {
      dagArtifacts: [
        { taskId: "T3", summary: "Auth module complete" },
        { taskId: "T4", summary: "Database schema migrated" },
      ],
    });
    expect(prompt).toContain("T3: Auth module complete");
    expect(prompt).toContain("T4: Database schema migrated");
  });

  test("loads persona content from file", async () => {
    const { buildAgentPrompt } = await import("../orchestrator/prompt-builder.js");
    const task: Task = {
      id: "T1", title: "Review", description: "review plan",
      status: "in_progress", depends_on: [], blocked_by: [], evidence: [],
      created_at: "", updated_at: "",
    };

    const prompt = buildAgentPrompt(task, { persona: "experts/technical-architect" });
    expect(prompt).toContain("Technical Architect");
    expect(prompt).toContain("Evaluation Perspective");
  });
});

// --- T8: Result Collector tests ---

describe("ResultCollector", () => {
  const testWs = ".test-result-ws";

  beforeEach(() => {
    rmSync(testWs, { recursive: true, force: true });
  });

  test("collectResult reads result.json from workspace", async () => {
    const { collectResult } = await import("../orchestrator/result-collector.js");

    mkdirSync(`${testWs}/output`, { recursive: true });
    writeFileSync(`${testWs}/output/result.json`, JSON.stringify({
      verdict: "pass",
      findings: [{ severity: "note", description: "Minor style issue" }],
    }));

    const result = collectResult(testWs, "T1", "claude", 0, 30);
    expect(result.verdict).toBe("pass");
    expect(result.findings).toHaveLength(1);
    expect(result.findings![0].severity).toBe("note");

    rmSync(testWs, { recursive: true, force: true });
  });

  test("collectResult falls back when no result.json", async () => {
    const { collectResult } = await import("../orchestrator/result-collector.js");

    mkdirSync(`${testWs}/output`, { recursive: true });
    const result = collectResult(testWs, "T1", "codex", 0, 15);
    expect(result.verdict).toBe("pass");
    expect(result.findings).toHaveLength(0);

    rmSync(testWs, { recursive: true, force: true });
  });

  test("synthesizeFindings merges and deduplicates", async () => {
    const { synthesizeFindings } = await import("../orchestrator/result-collector.js");

    const results = [
      {
        taskId: "T1", adapter: "claude", exitCode: 0, duration_s: 30,
        verdict: "pass" as const,
        findings: [
          { severity: "concern" as const, description: "Missing error handling" },
          { severity: "note" as const, description: "Consider adding docs" },
        ],
      },
      {
        taskId: "T1", adapter: "codex", persona: "security", exitCode: 0, duration_s: 25,
        verdict: "pass" as const,
        findings: [
          { severity: "blocker" as const, description: "SQL injection vulnerability" },
          { severity: "concern" as const, description: "Missing error handling" },  // duplicate
        ],
      },
    ];

    const synthesis = synthesizeFindings(results);
    expect(synthesis.verdict).toBe("fail"); // has blocker
    expect(synthesis.blockers).toHaveLength(1);
    expect(synthesis.concerns).toHaveLength(1); // deduplicated
    expect(synthesis.notes).toHaveLength(1);
    expect(synthesis.agents).toHaveLength(2);
    expect(synthesis.summary).toContain("2 agents reviewed");
  });
});
