import { taskList, taskAssign, taskStart, taskSubmit, taskVerify } from "./state/tasks.js";
import { loadConfig } from "./state/config.js";
import { appendJSONL } from "./utils/logger.js";
import { isoTimestamp } from "./utils/timestamp.js";
import { existsSync, readFileSync } from "fs";
import type { Task } from "./types/task.js";
import type { ApexConfig } from "./types/config.js";
import type { RuntimeAdapter, AgentHandle } from "./adapters/runtime.js";
import { detectAdapters, resolveAdapter } from "./adapters/adapter-registry.js";
import { createWorkspace, injectArtifacts, writePermissionConfig } from "./orchestrator/workspace.js";
import { shouldRetry, backoffMs } from "./orchestrator/retry.js";
import { buildAgentPrompt } from "./orchestrator/prompt-builder.js";
import { collectResult, synthesizeFindings, type AgentResult } from "./orchestrator/result-collector.js";
import { validateResult } from "./orchestrator/result-validator.js";

// --- Registry template types ---

export interface RegistryTemplate {
  id: string;
  name: string;
  triggers: string[];
  description: string;
  model_hint: string;
  estimated_tokens: number;
  skill?: string;
  persona?: string;
  dispatch_mode?: "same-model" | "cross-model";
}

// --- Running agent tracking ---

interface RunningAgentEntry {
  handle: AgentHandle;
  task: Task;
  template: RegistryTemplate | null;
  adapter: RuntimeAdapter;
}

// --- Registry loader (preserved from original) ---

function loadRegistry(): RegistryTemplate[] {
  const registryPath = "orchestration/registry-seeds.yaml";
  if (!existsSync(registryPath)) return [];
  try {
    const content = readFileSync(registryPath, "utf-8");
    const templates: RegistryTemplate[] = [];
    let current: Partial<RegistryTemplate> = {};
    for (const line of content.split("\n")) {
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^\s+-\s+id:\s+(.+)/))) {
        if (current.id) templates.push(current as RegistryTemplate);
        current = { id: m[1].trim(), triggers: [], model_hint: "balanced", estimated_tokens: 5000 };
      } else if ((m = line.match(/^\s+name:\s+(.+)/))) {
        current.name = m[1].trim();
      } else if ((m = line.match(/^\s+description:\s+(.+)/))) {
        current.description = m[1].trim();
      } else if ((m = line.match(/^\s+model_hint:\s+(.+)/))) {
        current.model_hint = m[1].trim();
      } else if ((m = line.match(/^\s+estimated_tokens:\s+(\d+)/))) {
        current.estimated_tokens = parseInt(m[1]);
      } else if ((m = line.match(/^\s+dispatch_mode:\s+(.+)/))) {
        current.dispatch_mode = m[1].trim() as "same-model" | "cross-model";
      } else if ((m = line.match(/^\s+skill:\s+(.+)/))) {
        current.skill = m[1].trim();
      } else if ((m = line.match(/^\s+persona:\s+(.+)/))) {
        current.persona = m[1].trim();
      } else if ((m = line.match(/^\s+-\s+"(.+)"/))) {
        current.triggers?.push(m[1].trim().toLowerCase());
      }
    }
    if (current.id) templates.push(current as RegistryTemplate);
    return templates;
  } catch { return []; }
}

function matchTemplate(task: Task, registry: RegistryTemplate[]): RegistryTemplate | null {
  const text = `${task.title} ${task.description}`.toLowerCase();
  let bestMatch: RegistryTemplate | null = null;
  let bestScore = 0;

  for (const tmpl of registry) {
    let score = 0;
    for (const trigger of tmpl.triggers) {
      if (text.includes(trigger.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = tmpl;
    }
  }
  return bestScore > 0 ? bestMatch : null;
}

// --- Adapter resolution from model_hint ---

function resolveAdapterForTemplate(
  adapters: Map<string, RuntimeAdapter>,
  config: ApexConfig,
  template: RegistryTemplate | null,
): RuntimeAdapter {
  if (!template) return resolveAdapter(adapters);

  const hint = template.model_hint?.toLowerCase() || "";

  // Map model_hint to adapter names via config.agents
  if (config.agents) {
    if (hint.includes("review") && config.agents.review) {
      const name = config.agents.review.split(" ")[0];
      if (adapters.has(name)) return adapters.get(name)!;
    }
    if (hint.includes("challenge") && config.agents.challenge) {
      const name = config.agents.challenge.split(" ")[0];
      if (adapters.has(name)) return adapters.get(name)!;
    }
    if (hint.includes("consult") && config.agents.consult) {
      const name = config.agents.consult.split(" ")[0];
      if (adapters.has(name)) return adapters.get(name)!;
    }
  }

  return resolveAdapter(adapters);
}

// --- Main orchestrator ---

export async function runOrchestrator(args: string[]): Promise<void> {
  const config = await loadConfig();
  const dryRun = args.includes("--dry-run");
  const once = args.includes("--once");

  // Detect available adapters
  const adapters = detectAdapters();
  if (adapters.size === 0 && !dryRun) {
    console.log("No agent adapters available.");
    console.log("  Install at least one: Claude Code, Codex, or Gemini CLI.");
    return;
  }

  const adapterNames = Array.from(adapters.keys()).join(", ");
  console.log(`Adapters: ${adapterNames}`);

  // Load registry
  const registry = loadRegistry();
  if (registry.length > 0) {
    console.log(`Registry: ${registry.length} templates loaded`);
  }

  const running = new Map<string, RunningAgentEntry>();
  const retryQueue: Array<{ task: Task; attempt: number; retryAfter: number; template: RegistryTemplate | null }> = [];
  const completedResults = new Map<string, AgentResult[]>();
  let shuttingDown = false;

  process.on("SIGINT", () => { shuttingDown = true; });
  process.on("SIGTERM", () => { shuttingDown = true; });

  console.log(`Orchestrator started (max_concurrent: ${config.max_concurrent_agents}, poll: ${config.polling_interval_ms}ms)`);

  while (!shuttingDown) {
    await pollCycle(config, adapters, registry, running, retryQueue, completedResults, dryRun);

    if (once || dryRun) break;
    await Bun.sleep(config.polling_interval_ms);
  }

  // Drain: wait for running agents, then reap results
  if (running.size > 0) {
    // --once mode: wait for agents to finish their work (up to idle_timeout)
    // SIGINT/SIGTERM: short grace period (30s) then exit
    const drainTimeout = once ? config.idle_timeout_ms : 30000;
    console.log(`Waiting for ${running.size} running agent(s)... (timeout: ${Math.round(drainTimeout / 1000)}s)`);
    const deadline = Date.now() + drainTimeout;
    while ((running.size > 0 || retryQueue.length > 0) && Date.now() < deadline && !shuttingDown) {
      await Bun.sleep(1000);
      // Run a full poll cycle to reap completed agents, collect results, and handle retries
      await pollCycle(config, adapters, registry, running, retryQueue, completedResults, false);
    }
  }

  console.log("Orchestrator stopped");
}

async function pollCycle(
  config: ApexConfig,
  adapters: Map<string, RuntimeAdapter>,
  registry: RegistryTemplate[],
  running: Map<string, RunningAgentEntry>,
  retryQueue: Array<{ task: Task; attempt: number; retryAfter: number; template: RegistryTemplate | null }>,
  completedResults: Map<string, AgentResult[]>,
  dryRun: boolean,
) {
  // 1. Reap completed agents
  for (const [runKey, entry] of running) {
    const status = entry.adapter.monitor(entry.handle);
    if (status.state !== "exited") continue;

    // runKey is either "T5" (Mode 1) or "T5:claude" (Mode 2 composite)
    const baseTaskId = runKey.includes(":") ? runKey.split(":")[0] : runKey;
    const isCrossModel = runKey.includes(":");

    const duration = Math.round((Date.now() - entry.handle.startedAt) / 1000);
    const exitCode = status.exitCode ?? -1;

    // Validate result quality
    const wsPath = entry.task.workspace_path || `.workspaces/APEX-${runKey}`;
    const validation = validateResult(wsPath, exitCode);
    const effectiveSuccess = validation.status === "success";

    console.log(`  ${runKey}: ${effectiveSuccess ? "completed" : validation.status} (${duration}s, exit ${exitCode}, adapter: ${entry.adapter.name()}${validation.reason ? `, ${validation.reason}` : ""})`);

    // Collect result
    const result = collectResult(wsPath, baseTaskId, entry.adapter.name(), exitCode, duration, entry.template?.persona);

    // Store for synthesis (Mode 2 tasks may have multiple results)
    if (!completedResults.has(baseTaskId)) completedResults.set(baseTaskId, []);
    completedResults.get(baseTaskId)!.push(result);

    // Analytics
    appendJSONL(".apex/analytics/orchestrator.jsonl", {
      task_id: baseTaskId,
      run_key: runKey,
      adapter: entry.adapter.name(),
      persona: entry.template?.persona,
      outcome: effectiveSuccess ? "success" : validation.status,
      exit_code: exitCode,
      duration_s: duration,
      attempt: entry.handle.attempt,
      ts: isoTimestamp(),
    });

    // Retry logic for failures (only for Mode 1 single-adapter tasks)
    if (!effectiveSuccess && !isCrossModel && shouldRetry(entry.handle.attempt, config.max_retries, exitCode)) {
      const nextAttempt = entry.handle.attempt + 1;
      const delay = backoffMs(nextAttempt, config.retry_backoff_base_ms);
      console.log(`  ${runKey}: scheduling retry ${nextAttempt}/${config.max_retries} in ${Math.round(delay / 1000)}s`);
      retryQueue.push({
        task: entry.task,
        attempt: nextAttempt,
        retryAfter: Date.now() + delay,
        template: entry.template,
      });
    }

    // Transition successful Mode 1 tasks to done so downstream DAG unblocks
    // Mode 2 tasks are transitioned after all cross-model agents complete (in synthesis step)
    if (effectiveSuccess && !isCrossModel) {
      try {
        await taskSubmit(baseTaskId, `Agent completed (adapter: ${entry.adapter.name()}, ${duration}s)`);
        await taskVerify(baseTaskId, true);
        console.log(`  ${baseTaskId}: → done`);
      } catch (e: any) {
        console.log(`  ${baseTaskId}: state transition warning: ${e.message}`);
      }
    }

    running.delete(runKey);
  }

  // 2. Process retry queue
  const now = Date.now();
  const readyRetries = retryQueue.filter(r => r.retryAfter <= now);
  for (const retry of readyRetries) {
    const idx = retryQueue.indexOf(retry);
    retryQueue.splice(idx, 1);

    if (running.size >= config.max_concurrent_agents) break;

    const adapter = resolveAdapterForTemplate(adapters, config, retry.template);
    const prompt = buildAgentPrompt(retry.task, retry.template, {
      attempt: retry.attempt,
      previousAttemptNotes: `Previous attempt failed (attempt ${retry.attempt - 1}).`,
    });

    const handle = await adapter.spawn(
      { id: retry.task.id, title: retry.task.title, description: retry.task.description },
      prompt,
      { command: adapter.name(), args: [], cwd: retry.task.workspace_path },
    );
    handle.attempt = retry.attempt;

    running.set(retry.task.id, { handle, task: retry.task, template: retry.template, adapter });
    console.log(`  Retried ${retry.task.id} (attempt ${retry.attempt})`);
  }

  // 3. Find dispatchable tasks
  const availableSlots = config.max_concurrent_agents - running.size;
  if (availableSlots <= 0) {
    printStatus(running, config);
    return;
  }

  const allTasks = await taskList();
  const openTasks = allTasks.filter(t => t.status === "open");

  const dispatchable = openTasks.filter(t => {
    if (running.has(t.id)) return false;
    if (retryQueue.some(r => r.task.id === t.id)) return false;
    if (t.depends_on.length === 0) return true;
    return t.depends_on.every(depId => {
      const dep = allTasks.find(d => d.id === depId);
      return dep && dep.status === "done";
    });
  });

  if (dispatchable.length === 0 && openTasks.length === 0 && running.size === 0 && retryQueue.length === 0) {
    const remaining = allTasks.filter(t => t.status !== "done");
    if (remaining.length === 0) {
      console.log("All tasks complete.");
      return;
    }
  }

  // 4. Dispatch
  const toDispatch = dispatchable.slice(0, availableSlots);

  for (const task of toDispatch) {
    if (dryRun) {
      console.log(`  [dry-run] Would dispatch ${task.id}: ${task.title}`);
      continue;
    }

    await taskAssign(task.id);
    await taskStart(task.id);

    const template = matchTemplate(task, registry);
    if (template) {
      console.log(`    Template: ${template.name} (${template.model_hint}${template.dispatch_mode === "cross-model" ? ", cross-model" : ""})`);
    }

    // Prepare upstream artifacts
    const upstreamArtifacts = task.depends_on
      .map(depId => ({
        taskId: depId,
        resultPath: `.workspaces/APEX-${depId}/output/result.json`,
      }))
      .filter(a => existsSync(a.resultPath));

    const dagArtifacts = upstreamArtifacts.map(a => {
      try {
        const r = JSON.parse(readFileSync(a.resultPath, "utf-8"));
        return { taskId: a.taskId, summary: r.summary || r.verdict || "completed" };
      } catch {
        return { taskId: a.taskId, summary: "completed" };
      }
    });

    // Mode 2: Cross-model dispatch — fan out to multiple adapters
    if (template?.dispatch_mode === "cross-model" && adapters.size > 1) {
      const crossModelAdapters = Array.from(adapters.values());
      console.log(`    Cross-model: dispatching to ${crossModelAdapters.map(a => a.name()).join(", ")}`);

      for (const adapter of crossModelAdapters) {
        const compositeKey = `${task.id}:${adapter.name()}`;
        if (running.has(compositeKey)) continue;

        const ws = await createWorkspace(`${task.id}-${adapter.name()}`);
        writePermissionConfig(ws.path);
        if (upstreamArtifacts.length > 0) {
          await injectArtifacts(ws.path, upstreamArtifacts);
        }

        const prompt = buildAgentPrompt(task, template, {
          workspacePath: ws.path,
          attempt: 1,
          dagArtifacts: dagArtifacts.length > 0 ? dagArtifacts : undefined,
        });

        const handle = await adapter.spawn(
          { id: task.id, title: task.title, description: task.description },
          prompt,
          { command: adapter.name(), args: [], cwd: ws.path },
        );

        running.set(compositeKey, {
          handle,
          task: { ...task, workspace_path: ws.path, adapter: adapter.name() },
          template,
          adapter,
        });
        console.log(`    Dispatched ${compositeKey} (cross-model)`);
      }
    } else {
      // Mode 1: Single adapter dispatch
      const ws = await createWorkspace(task.id);
      writePermissionConfig(ws.path);
      if (upstreamArtifacts.length > 0) {
        await injectArtifacts(ws.path, upstreamArtifacts);
      }

      const adapter = resolveAdapterForTemplate(adapters, config, template);
      const prompt = buildAgentPrompt(task, template, {
        workspacePath: ws.path,
        attempt: 1,
        dagArtifacts: dagArtifacts.length > 0 ? dagArtifacts : undefined,
      });

      const handle = await adapter.spawn(
        { id: task.id, title: task.title, description: task.description },
        prompt,
        { command: adapter.name(), args: [], cwd: ws.path },
      );

      running.set(task.id, { handle, task: { ...task, workspace_path: ws.path }, template, adapter });
      console.log(`  Dispatched ${task.id}: ${task.title} (adapter: ${adapter.name()})`);
    }
  }

  // 5. Check for completed cross-model tasks — synthesize when all agents done
  for (const [taskId, results] of completedResults) {
    // Count how many cross-model agents are still running for this task
    const stillRunning = Array.from(running.keys()).filter(k => k.startsWith(`${taskId}:`));
    if (stillRunning.length > 0) continue;
    if (results.length <= 1) continue; // Not a cross-model task

    const synthesis = synthesizeFindings(results);
    console.log(`  ${taskId}: cross-model synthesis — ${synthesis.summary}`);
    console.log(`    Verdict: ${synthesis.verdict} (${synthesis.blockers.length} blockers, ${synthesis.concerns.length} concerns, ${synthesis.notes.length} notes)`);

    appendJSONL(".apex/analytics/orchestrator.jsonl", {
      task_id: taskId,
      event: "cross_model_synthesis",
      agents: synthesis.agents,
      verdict: synthesis.verdict,
      blocker_count: synthesis.blockers.length,
      concern_count: synthesis.concerns.length,
      note_count: synthesis.notes.length,
      ts: isoTimestamp(),
    });

    // Transition cross-model task to done
    try {
      await taskSubmit(taskId, `Cross-model synthesis: ${synthesis.summary}`);
      await taskVerify(taskId, synthesis.verdict !== "fail");
      console.log(`  ${taskId}: → ${synthesis.verdict === "fail" ? "needs attention" : "done"}`);
    } catch (e: any) {
      console.log(`  ${taskId}: state transition warning: ${e.message}`);
    }

    completedResults.delete(taskId);
  }

  printStatus(running, config);
}

function printStatus(running: Map<string, RunningAgentEntry>, config: ApexConfig) {
  const adaptersUsed = new Set(Array.from(running.values()).map(e => e.adapter.name()));
  const statusParts = [
    `running: ${running.size}/${config.max_concurrent_agents}`,
    `adapters: ${adaptersUsed.size > 0 ? Array.from(adaptersUsed).join("+") : "none"}`,
  ];
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${statusParts.join(" | ")}`);
}
