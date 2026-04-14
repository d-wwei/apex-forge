/**
 * Cross-model spawn and synthesis for worker agents.
 *
 * When --cross-model is used, multiple agents (claude, codex, gemini)
 * each get their own worktree and independently review the same task.
 * The synthesize command merges their results into a single verdict.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";
import { readJSON, writeJSON } from "../utils/json.js";
import { generateWorkerProtocol, agentStartCommand } from "./protocol-template.js";
import { detectAdapter } from "./terminal.js";
import type { WorkerResult } from "./monitor.js";
import type { TaskStore } from "../types/task.js";
import type { ProtocolOptions } from "./protocol-template.js";

// Re-export type for findings used in deduplication
export interface FindingLike {
  description: string;
  severity: "blocker" | "concern" | "note";
  source?: string;
}

// ── Pure helpers (exported for testing) ──────────────────────────────

export function generateCrossModelIds(taskId: string, agents: string[]): string[] {
  return agents.map((a) => `${taskId}-${a}`);
}

export function mergeVerdicts(verdicts: Record<string, string>): string {
  const vals = Object.values(verdicts);
  if (vals.length === 0) return "mixed";
  if (vals.every((v) => v === "pass")) return "pass";
  if (vals.some((v) => v === "fail")) return "fail";
  return "mixed";
}

export function deduplicateFindings(findings: FindingLike[]): FindingLike[] {
  const seen = new Set<string>();
  const result: FindingLike[] = [];
  for (const f of findings) {
    const key = f.description.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(f);
    }
  }
  return result;
}

// ── Default agent list ───────────────────────────────────────────────

const DEFAULT_AGENTS = ["claude", "codex", "gemini"];

function parseAgentList(args: string[]): string[] {
  const idx = args.indexOf("--agent");
  if (idx >= 0 && args[idx + 1]) {
    return args[idx + 1].split(",").map((a) => a.trim()).filter(Boolean);
  }
  return DEFAULT_AGENTS;
}

// ── spawnCrossModel ──────────────────────────────────────────────────

export async function spawnCrossModel(
  taskId: string,
  agents: string[],
  args: string[],
): Promise<void> {
  const projectRoot = process.cwd();
  const store = await readJSON<TaskStore>(".apex/tasks.json", { tasks: [], next_id: 1 });
  const task = store.tasks.find((t) => t.id === taskId);
  if (!task) {
    console.error(`Task ${taskId} not found in .apex/tasks.json`);
    process.exit(1);
  }

  const completedDeps = store.tasks
    .filter((t) => task.depends_on.includes(t.id) && t.status === "done")
    .map((t) => t.id);

  const isDryRun = args.includes("--dry-run");
  const ids = generateCrossModelIds(taskId, agents);

  for (const subId of ids) {
    const agent = subId.slice(taskId.length + 1); // extract agent name after "<taskId>-"
    const worktreeRel = `.apex/worktrees/${subId}`;
    const worktreePath = resolve(projectRoot, worktreeRel);
    const branch = `apex/${subId}`;

    // Create worktree
    if (!existsSync(worktreePath)) {
      let result = spawnSync("git", ["worktree", "add", worktreeRel, "-b", branch]);
      if (result.status !== 0) {
        result = spawnSync("git", ["worktree", "add", worktreeRel, branch]);
        if (result.status !== 0) {
          mkdirSync(worktreePath, { recursive: true });
        }
      }
    }

    // Init worktree
    const worktreeApex = join(worktreePath, ".apex");
    mkdirSync(worktreeApex, { recursive: true });
    spawnSync("apex", ["init"], { cwd: worktreePath });

    // Generate protocol with crossModel flag
    const opts: ProtocolOptions = {
      task,
      projectRoot,
      worktreePath,
      completedDeps,
      crossModel: true,
      agent,
    };
    const protocol = generateWorkerProtocol(opts);
    writeFileSync(join(worktreeApex, "worker-protocol.md"), protocol);

    // Register worker
    const workersDir = join(projectRoot, ".apex", "workers", subId);
    mkdirSync(workersDir, { recursive: true });
    const meta = {
      task_id: subId,
      window_handle: null as null,
      worktree_path: worktreeRel,
      branch,
      started_at: new Date().toISOString(),
      agent,
    };
    await writeJSON(join(workersDir, "meta.json"), meta);

    if (isDryRun) {
      console.log(`[dry-run] ${subId}: agent=${agent}, worktree=${worktreeRel}`);
      continue;
    }

    // Launch terminal
    const adapter = detectAdapter();
    const handle = await adapter.createWindow(`${subId}`, agentStartCommand(agent, worktreePath));
    meta.window_handle = handle as null; // stored as opaque JSON
    await writeJSON(join(workersDir, "meta.json"), meta);
  }

  console.log(`Cross-model spawn: ${ids.length} workers for ${taskId}`);
  for (const id of ids) {
    console.log(`  - ${id}`);
  }
}

// ── synthesizeResults ────────────────────────────────────────────────

export async function synthesizeResults(taskId: string): Promise<void> {
  const projectRoot = process.cwd();
  const workersBase = join(projectRoot, ".apex", "workers");

  // Find all cross-model result files matching <taskId>-*
  let dirs: string[];
  try {
    dirs = readdirSync(workersBase).filter((d) => d.startsWith(`${taskId}-`));
  } catch {
    console.error(`No workers directory found at ${workersBase}`);
    process.exit(1);
    return;
  }

  if (dirs.length === 0) {
    console.error(`No cross-model workers found for ${taskId} (expected .apex/workers/${taskId}-*)`);
    process.exit(1);
  }

  // Read results
  const verdicts: Record<string, string> = {};
  const allFindings: FindingLike[] = [];
  const agents: string[] = [];

  for (const dir of dirs) {
    const agent = dir.slice(taskId.length + 1);
    agents.push(agent);

    const resultPath = join(workersBase, dir, "result.json");
    if (!existsSync(resultPath)) {
      verdicts[agent] = "missing";
      continue;
    }

    try {
      const raw: WorkerResult = JSON.parse(readFileSync(resultPath, "utf-8"));
      verdicts[agent] = raw.verdict || "unknown";
      for (const f of raw.findings || []) {
        if (typeof f === "string") {
          allFindings.push({ description: f, severity: "note", source: agent });
        } else {
          allFindings.push({ ...f, source: (f as FindingLike).source || agent });
        }
      }
    } catch {
      verdicts[agent] = "error";
    }
  }

  // Try to use synthesizeFindings from result-collector for richer output
  let usedCollector = false;
  try {
    const { synthesizeFindings } = await import("../orchestrator/result-collector.js");
    if (typeof synthesizeFindings === "function") {
      usedCollector = true;
      // Adapter: convert our data to AgentResult format
      const agentResults = dirs.map((dir) => {
        const agent = dir.slice(taskId.length + 1);
        const resultPath = join(workersBase, dir, "result.json");
        let raw: WorkerResult = { task_id: dir, verdict: "fail" };
        try {
          raw = JSON.parse(readFileSync(resultPath, "utf-8"));
        } catch { /* use defaults */ }
        return {
          taskId,
          adapter: agent,
          verdict: raw.verdict,
          findings: raw.findings || [],
          exitCode: raw.verdict === "fail" ? 1 : 0,
          duration_s: 0,
        };
      });
      const synth = synthesizeFindings(agentResults as any);
      // Write enriched synthesis
      const synthesis = {
        task_id: taskId,
        agents,
        verdicts,
        overall_verdict: synth.verdict,
        findings: [...synth.blockers, ...synth.concerns, ...synth.notes],
        summary: synth.summary,
        synthesized_at: new Date().toISOString(),
      };
      const outDir = join(workersBase, taskId);
      mkdirSync(outDir, { recursive: true });
      await writeJSON(join(outDir, "synthesis.json"), synthesis);
    }
  } catch {
    // Fall through to simple synthesis
  }

  if (!usedCollector) {
    // Simple synthesis fallback
    const unique = deduplicateFindings(allFindings);
    const overall = mergeVerdicts(verdicts);
    const synthesis = {
      task_id: taskId,
      agents,
      verdicts,
      overall_verdict: overall,
      findings: unique,
      synthesized_at: new Date().toISOString(),
    };
    const outDir = join(workersBase, taskId);
    mkdirSync(outDir, { recursive: true });
    await writeJSON(join(outDir, "synthesis.json"), synthesis);
  }

  // Print summary
  console.log(`Synthesis for ${taskId}:`);
  console.log(`  Agents: ${agents.join(", ")}`);
  for (const [agent, verdict] of Object.entries(verdicts)) {
    console.log(`  ${agent}: ${verdict}`);
  }
  const synthPath = join(workersBase, taskId, "synthesis.json");
  const synthData = JSON.parse(readFileSync(synthPath, "utf-8"));
  console.log(`  Overall: ${synthData.overall_verdict}`);
  console.log(`  Findings: ${synthData.findings.length}`);
  console.log(`  Written to: ${synthPath}`);
}

// ── Exported entry point for worker.ts integration ───────────────────

export function parseCrossModelArgs(args: string[]): { agents: string[] } {
  return { agents: parseAgentList(args) };
}
