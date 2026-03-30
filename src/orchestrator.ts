import { taskList, taskAssign, taskStart } from "./state/tasks.js";
import { loadConfig } from "./state/config.js";
import { appendJSONL } from "./utils/logger.js";
import { isoTimestamp } from "./utils/timestamp.js";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import { existsSync, readFileSync } from "fs";
import type { Task } from "./types/task.js";
import type { ApexConfig } from "./types/config.js";

// Registry template matching
interface RegistryTemplate {
  id: string;
  name: string;
  triggers: string[];
  description: string;
  model_hint: string;
  estimated_tokens: number;
}

function loadRegistry(): RegistryTemplate[] {
  const registryPath = "orchestration/registry-seeds.yaml";
  if (!existsSync(registryPath)) return [];
  try {
    const content = readFileSync(registryPath, "utf-8");
    // Simple YAML parse: extract id, triggers, model_hint for each template
    const templates: RegistryTemplate[] = [];
    let current: Partial<RegistryTemplate> = {};
    for (const line of content.split("\n")) {
      if (line.match(/^\s+-\s+id:\s+(.+)/)) {
        if (current.id) templates.push(current as RegistryTemplate);
        current = { id: RegExp.$1.trim(), triggers: [], model_hint: "balanced", estimated_tokens: 5000 };
      } else if (line.match(/^\s+name:\s+(.+)/)) {
        current.name = RegExp.$1.trim();
      } else if (line.match(/^\s+description:\s+(.+)/)) {
        current.description = RegExp.$1.trim();
      } else if (line.match(/^\s+model_hint:\s+(.+)/)) {
        current.model_hint = RegExp.$1.trim();
      } else if (line.match(/^\s+estimated_tokens:\s+(\d+)/)) {
        current.estimated_tokens = parseInt(RegExp.$1);
      } else if (line.match(/^\s+-\s+"(.+)"/)) {
        current.triggers?.push(RegExp.$1.trim().toLowerCase());
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

interface RunningAgent {
  taskId: string;
  process: ChildProcess;
  startedAt: number;
  attempt: number;
}

export async function runOrchestrator(args: string[]): Promise<void> {
  const config = await loadConfig();
  const dryRun = args.includes("--dry-run");
  const once = args.includes("--once");  // single poll cycle then exit

  // Verify agent command is available before starting
  const agentBase = config.agent_command.split(" ")[0];
  const agentAvailable = spawnSync("which", [agentBase], { encoding: "utf-8" }).status === 0;
  if (!agentAvailable && !dryRun) {
    console.log(`Warning: '${agentBase}' CLI not found in PATH.`);
    console.log("  Install Claude Code to enable agent dispatch: https://docs.anthropic.com/en/docs/claude-code");
    console.log("  Or set agent_command in .apex/config.yaml to your preferred agent CLI.");
    return;
  }

  const running = new Map<string, RunningAgent>();
  let shuttingDown = false;

  // Graceful shutdown
  process.on("SIGINT", () => { shuttingDown = true; });
  process.on("SIGTERM", () => { shuttingDown = true; });

  // Load agent template registry for capability-based routing
  const registry = loadRegistry();
  if (registry.length > 0) {
    console.log(`Registry: ${registry.length} templates loaded`);
  }

  console.log(`Orchestrator started (agent: ${config.agent_command}, max_concurrent: ${config.max_concurrent_agents}, poll: ${config.polling_interval_ms}ms)`);

  while (!shuttingDown) {
    await pollCycle(config, running, dryRun, registry);

    if (once || dryRun) break;

    // Wait for next poll
    await Bun.sleep(config.polling_interval_ms);
  }

  // Drain running agents
  if (running.size > 0) {
    console.log(`Waiting for ${running.size} running agent(s) to finish...`);
    // Give them 30 seconds
    const deadline = Date.now() + 30000;
    while (running.size > 0 && Date.now() < deadline) {
      await Bun.sleep(1000);
      // Check completions
      for (const [taskId, agent] of running) {
        if (agent.process.exitCode !== null) {
          running.delete(taskId);
        }
      }
    }
  }

  console.log("Orchestrator stopped");
}

async function pollCycle(config: ApexConfig, running: Map<string, RunningAgent>, dryRun: boolean, registry: RegistryTemplate[] = []) {
  // 1. Check for completed agents
  for (const [taskId, agent] of running) {
    if (agent.process.exitCode !== null) {
      const duration = Math.round((Date.now() - agent.startedAt) / 1000);
      const success = agent.process.exitCode === 0;
      console.log(`  ${taskId}: ${success ? "completed" : "failed"} (${duration}s, exit ${agent.process.exitCode})`);

      appendJSONL(".apex/analytics/orchestrator.jsonl", {
        task_id: taskId,
        outcome: success ? "success" : "error",
        exit_code: agent.process.exitCode,
        duration_s: duration,
        attempt: agent.attempt,
        ts: isoTimestamp(),
      });

      running.delete(taskId);
    }
  }

  // 2. Find dispatchable tasks
  const availableSlots = config.max_concurrent_agents - running.size;
  if (availableSlots <= 0) return;

  const allTasks = await taskList();
  const openTasks = allTasks.filter(t => t.status === "open");

  // Filter: dependencies must be done, not already running
  const dispatchable = openTasks.filter(t => {
    if (running.has(t.id)) return false;
    if (t.depends_on.length === 0) return true;
    return t.depends_on.every(depId => {
      const dep = allTasks.find(d => d.id === depId);
      return dep && dep.status === "done";
    });
  });

  if (dispatchable.length === 0 && openTasks.length === 0 && running.size === 0) {
    const remaining = allTasks.filter(t => t.status !== "done");
    if (remaining.length === 0) {
      console.log("All tasks complete.");
      return;
    }
  }

  // 3. Dispatch up to available slots
  const toDispatch = dispatchable.slice(0, availableSlots);

  for (const task of toDispatch) {
    if (dryRun) {
      console.log(`  [dry-run] Would dispatch ${task.id}: ${task.title}`);
      continue;
    }

    // Assign and start
    await taskAssign(task.id);
    await taskStart(task.id);

    // Build prompt from task
    // Match task to best registry template for capability-aware prompting
    const template = matchTemplate(task, registry);
    if (template && !dryRun) {
      console.log(`    Matched template: ${template.name} (${template.model_hint})`);
    }
    const prompt = buildPrompt(task, config, template);

    // Spawn agent — build the command based on the configured agent
    const [cmd, ...cmdArgs] = config.agent_command.split(" ");
    // Use --print flag for non-interactive output, -p for prompt input
    const agentArgs = cmd === "claude"
      ? [...cmdArgs, "--print", "-p", prompt]
      : [...cmdArgs, prompt];

    const proc = spawn(cmd, agentArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, APEX_TASK_ID: task.id },
    });

    // Log stdout/stderr to task-specific file
    const logPath = `.apex/orchestrator-logs/${task.id}.log`;
    const { appendFileSync, mkdirSync } = await import("fs");
    mkdirSync(".apex/orchestrator-logs", { recursive: true });

    proc.stdout?.on("data", (chunk: Buffer) => {
      appendFileSync(logPath, chunk);
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      appendFileSync(logPath, chunk);
    });

    running.set(task.id, {
      taskId: task.id,
      process: proc,
      startedAt: Date.now(),
      attempt: 1,
    });

    console.log(`  Dispatched ${task.id}: ${task.title}`);
  }

  // Status line
  const statusParts = [
    `running: ${running.size}/${config.max_concurrent_agents}`,
    `open: ${openTasks.length}`,
    `dispatchable: ${dispatchable.length}`,
  ];
  console.log(`[${new Date().toISOString().slice(11,19)}] ${statusParts.join(" | ")}`);
}

function buildPrompt(task: Task, _config: ApexConfig, template: RegistryTemplate | null): string {
  const lines = [
    `You are an AI agent executing task ${task.id}.`,
    ``,
    `## Task`,
    `Title: ${task.title}`,
    `Description: ${task.description}`,
    task.depends_on.length > 0 ? `Dependencies: ${task.depends_on.join(", ")} (already completed)` : "",
  ];

  if (template) {
    lines.push(
      ``,
      `## Agent Role: ${template.name}`,
      `${template.description}`,
      `Model hint: ${template.model_hint}`,
    );
  }

  lines.push(
    ``,
    `## Rules`,
    `1. Follow TDD: write failing test first, then implement`,
    `2. Stay scoped: only work on this task`,
    `3. When done, exit with code 0`,
    `4. If blocked, exit with code 1`,
  );

  return lines.filter(Boolean).join("\n");
}
