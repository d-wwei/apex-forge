import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type {
  AdapterConfig,
  AdapterStatus,
  AgentHandle,
  RuntimeAdapter,
  TaskDispatchInfo,
} from "../adapters/runtime.js";
import {
  collectResult,
  synthesizeFindings,
} from "../orchestrator/result-collector.js";
import { validateResult } from "../orchestrator/result-validator.js";
import {
  cleanupWorkspace,
  createWorkspace,
} from "../orchestrator/workspace.js";

// Use tmp dir to avoid .apex/ conflicts with other test suites
const TMP_ROOT = "/tmp/apex-e2e-test";

/**
 * Create a mock adapter that spawns real shell processes.
 * Uses `sh -c` for flexibility.
 */
function createMockAdapter(name: string): RuntimeAdapter {
  let counter = 0;
  return {
    name: () => name,
    available: () => true,
    async spawn(
      task: TaskDispatchInfo,
      prompt: string,
      config: AdapterConfig,
    ): Promise<AgentHandle> {
      const logDir = join(TMP_ROOT, "logs");
      mkdirSync(logDir, { recursive: true });
      const logPath = join(logDir, `${task.id}-${name}.log`);
      const { appendFileSync } = await import("node:fs");

      const cmd = config.command;
      const args = config.args || [];
      if (prompt) args.push(prompt);

      const proc = spawn(cmd, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, APEX_TASK_ID: task.id },
        ...(config.cwd ? { cwd: config.cwd } : {}),
      });

      proc.stdout?.on("data", (chunk: Buffer) =>
        appendFileSync(logPath, chunk),
      );
      proc.stderr?.on("data", (chunk: Buffer) =>
        appendFileSync(logPath, chunk),
      );

      return {
        id: `${name}-${++counter}-${task.id}`,
        taskId: task.id,
        adapter: name,
        startedAt: Date.now(),
        attempt: 1,
        logPath,
        process: proc,
      };
    },
    monitor(handle: AgentHandle): AdapterStatus {
      if (!handle.process) return { state: "exited", exitCode: -1 };
      if (handle.process.exitCode !== null) {
        return { state: "exited", exitCode: handle.process.exitCode };
      }
      return { state: "running" };
    },
    output(handle: AgentHandle): string | null {
      try {
        return readFileSync(handle.logPath, "utf-8");
      } catch {
        return null;
      }
    },
    kill(handle: AgentHandle): void {
      if (handle.process && handle.process.exitCode === null) {
        handle.process.kill("SIGTERM");
      }
    },
    async resume(
      _sessionId: string,
      prompt: string,
      config: AdapterConfig,
    ): Promise<AgentHandle> {
      return this.spawn(
        { id: "resume", title: "Resume", description: "" },
        prompt,
        config,
      );
    },
  };
}

function waitForExit(handle: AgentHandle, timeoutMs = 5000): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = handle.process!;
    if (proc.exitCode !== null) return resolve(proc.exitCode);
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Process timed out"));
    }, timeoutMs);
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? -1);
    });
  });
}

describe("Orchestrator E2E", () => {
  beforeEach(() => {
    rmSync(TMP_ROOT, { recursive: true, force: true });
    mkdirSync(TMP_ROOT, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  // Test 1: Two independent tasks dispatch and complete
  test("two independent tasks dispatch and complete in parallel", async () => {
    const adapter = createMockAdapter("mock-agent");
    const wsRoot = join(TMP_ROOT, "workspaces");

    // Create workspaces
    const ws1 = await createWorkspace("E2E-1", wsRoot);
    const ws2 = await createWorkspace("E2E-2", wsRoot);

    // Spawn two agents that write result.json using relative paths (tests cwd works)
    const script1 = `mkdir -p output && echo '{"verdict":"pass","findings":[]}' > output/result.json`;
    const script2 = `mkdir -p output && echo '{"verdict":"pass","findings":[]}' > output/result.json`;

    const handle1 = await adapter.spawn(
      { id: "E2E-1", title: "Task 1", description: "First task" },
      script1,
      { command: "sh", args: ["-c"], cwd: ws1.path },
    );
    const handle2 = await adapter.spawn(
      { id: "E2E-2", title: "Task 2", description: "Second task" },
      script2,
      { command: "sh", args: ["-c"], cwd: ws2.path },
    );

    // Wait for both
    const [exit1, exit2] = await Promise.all([
      waitForExit(handle1),
      waitForExit(handle2),
    ]);

    expect(exit1).toBe(0);
    expect(exit2).toBe(0);

    // Validate results
    const v1 = validateResult(ws1.path, exit1);
    const v2 = validateResult(ws2.path, exit2);
    expect(v1.valid).toBe(true);
    expect(v1.status).toBe("success");
    expect(v2.valid).toBe(true);
    expect(v2.status).toBe("success");

    // Cleanup
    await cleanupWorkspace(ws1.path);
    await cleanupWorkspace(ws2.path);
  });

  // Test 2: A→B dependency chain — B waits for A
  test("dependency chain: B starts only after A completes", async () => {
    const adapter = createMockAdapter("mock-agent");
    const wsRoot = join(TMP_ROOT, "workspaces");

    // Task A produces result
    const wsA = await createWorkspace("DEP-A", wsRoot);
    const scriptA = `mkdir -p ${wsA.path}/output && echo '{"verdict":"pass","findings":[],"summary":"A done"}' > ${wsA.path}/output/result.json`;
    const handleA = await adapter.spawn(
      { id: "DEP-A", title: "Task A", description: "Upstream task" },
      scriptA,
      { command: "sh", args: ["-c"], cwd: wsA.path },
    );
    const exitA = await waitForExit(handleA);
    expect(exitA).toBe(0);

    // Verify A completed before starting B
    const vA = validateResult(wsA.path, exitA);
    expect(vA.valid).toBe(true);

    // Now start B — it reads A's result
    const wsB = await createWorkspace("DEP-B", wsRoot);
    // Copy A's result into B's input (simulating injectArtifacts)
    const { injectArtifacts } = await import("../orchestrator/workspace.js");
    await injectArtifacts(wsB.path, [
      { taskId: "DEP-A", resultPath: join(wsA.path, "output", "result.json") },
    ]);

    // Verify artifact was injected
    const injectedPath = join(wsB.path, "input", "DEP-A-result.json");
    expect(existsSync(injectedPath)).toBe(true);
    const injected = JSON.parse(readFileSync(injectedPath, "utf-8"));
    expect(injected.summary).toBe("A done");

    // B uses injected data
    const scriptB = `mkdir -p ${wsB.path}/output && echo '{"verdict":"pass","findings":[],"summary":"B done using A"}' > ${wsB.path}/output/result.json`;
    const handleB = await adapter.spawn(
      { id: "DEP-B", title: "Task B", description: "Downstream task" },
      scriptB,
      { command: "sh", args: ["-c"], cwd: wsB.path },
    );
    const exitB = await waitForExit(handleB);
    expect(exitB).toBe(0);
    expect(validateResult(wsB.path, exitB).valid).toBe(true);

    await cleanupWorkspace(wsA.path);
    await cleanupWorkspace(wsB.path);
  });

  // Test 3: Failed task triggers retry
  test("failed task can be retried", async () => {
    const adapter = createMockAdapter("mock-agent");
    const wsRoot = join(TMP_ROOT, "workspaces");
    const { shouldRetry, backoffMs } = await import("../orchestrator/retry.js");

    const ws = await createWorkspace("FAIL-1", wsRoot);

    // First attempt: exit 1 (failure)
    const handle1 = await adapter.spawn(
      { id: "FAIL-1", title: "Failing Task", description: "Will fail" },
      "exit 1",
      { command: "sh", args: ["-c"], cwd: ws.path },
    );
    const exit1 = await waitForExit(handle1);
    expect(exit1).toBe(1);

    // Validate failure
    const v1 = validateResult(ws.path, exit1);
    expect(v1.status).toBe("failure");

    // Check retry logic
    expect(shouldRetry(1, 3, exit1)).toBe(true);
    expect(backoffMs(2, 1000)).toBeGreaterThan(0);

    // Retry (attempt 2): succeeds
    const script2 = `mkdir -p ${ws.path}/output && echo '{"verdict":"pass","findings":[]}' > ${ws.path}/output/result.json`;
    const handle2 = await adapter.spawn(
      { id: "FAIL-1", title: "Failing Task", description: "Retry" },
      script2,
      { command: "sh", args: ["-c"], cwd: ws.path },
    );
    handle2.attempt = 2;
    const exit2 = await waitForExit(handle2);
    expect(exit2).toBe(0);
    expect(validateResult(ws.path, exit2).valid).toBe(true);

    await cleanupWorkspace(ws.path);
  });

  // Test 4: Cross-model dispatch and synthesizeFindings
  test("cross-model dispatch synthesizes findings from multiple adapters", async () => {
    const adapterA = createMockAdapter("claude");
    const adapterB = createMockAdapter("codex");
    const wsRoot = join(TMP_ROOT, "workspaces");

    // Two adapters review the same task
    const wsA = await createWorkspace("CROSS-1-claude", wsRoot);
    const wsB = await createWorkspace("CROSS-1-codex", wsRoot);

    const scriptA = `mkdir -p ${wsA.path}/output && echo '${JSON.stringify({
      verdict: "pass",
      findings: [
        { severity: "concern", description: "Missing input validation" },
        { severity: "note", description: "Consider caching" },
      ],
    })}' > ${wsA.path}/output/result.json`;

    const scriptB = `mkdir -p ${wsB.path}/output && echo '${JSON.stringify({
      verdict: "pass",
      findings: [
        { severity: "blocker", description: "SQL injection risk" },
        { severity: "concern", description: "Missing input validation" }, // duplicate
      ],
    })}' > ${wsB.path}/output/result.json`;

    const handleA = await adapterA.spawn(
      { id: "CROSS-1", title: "Review", description: "Security review" },
      scriptA,
      { command: "sh", args: ["-c"], cwd: wsA.path },
    );
    const handleB = await adapterB.spawn(
      { id: "CROSS-1", title: "Review", description: "Security review" },
      scriptB,
      { command: "sh", args: ["-c"], cwd: wsB.path },
    );

    const [exitA, exitB] = await Promise.all([
      waitForExit(handleA),
      waitForExit(handleB),
    ]);
    expect(exitA).toBe(0);
    expect(exitB).toBe(0);

    // Collect results from both
    const resultA = collectResult(wsA.path, "CROSS-1", "claude", exitA, 10);
    const resultB = collectResult(
      wsB.path,
      "CROSS-1",
      "codex",
      exitB,
      8,
      "security",
    );

    // Synthesize
    const synthesis = synthesizeFindings([resultA, resultB]);
    expect(synthesis.taskId).toBe("CROSS-1");
    expect(synthesis.agents).toHaveLength(2);
    expect(synthesis.verdict).toBe("fail"); // has blocker
    expect(synthesis.blockers).toHaveLength(1);
    expect(synthesis.concerns).toHaveLength(1); // deduplicated
    expect(synthesis.notes).toHaveLength(1);
    expect(synthesis.contributed).toHaveLength(2);
    expect(synthesis.summary).toContain("2/2 agents contributed");

    await cleanupWorkspace(wsA.path);
    await cleanupWorkspace(wsB.path);
  });
});
