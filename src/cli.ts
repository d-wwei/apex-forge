#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { quickCheck } from "./adapters/update-adapter.js";
import { cmdHeal } from "./commands/heal.js";
import { cmdInit } from "./commands/init.js";
import { cmdMemory } from "./commands/memory.js";
import { cmdStatus } from "./commands/status.js";
import { cmdTask } from "./commands/task.js";
import { cmdTelemetry } from "./commands/telemetry.js";
import { cmdUpdate } from "./commands/update.js";
import { cmdWorktree } from "./commands/worktree.js";
import {
  checkGhCli,
  createTasksFromIssues,
  getIssue,
  listIssues,
  syncIssueStatus,
} from "./integrations/github.js";
import {
  addArtifact,
  addCompoundCheckpoint,
  addShipCheckpoint,
  addSkillInvocation,
  completeStage,
  getState,
  runStructuralGate,
  setStage,
} from "./state/state.js";
import {
  endSpan,
  getActiveSpans,
  getTraceSpans,
  listTraceSummaries,
  startSpan,
} from "./tracing.js";
import { ApexError } from "./utils/errors.js";
import { satisfies } from "./utils/semver.js";

const VERSION = "0.1.0";

async function startupQuickCheck() {
  try {
    const result = await quickCheck();
    if (result.status === "update_available") {
      console.error(
        `[apex-forge] Update available: v${result.currentVersion} → v${result.latestVersion}. Run: apex update apply`,
      );
    }
  } catch {
    // silent — never block normal CLI usage
  }
}

async function cmdConsensus(args: string[]) {
  const sub = args[0];
  if (sub === "test") {
    const { runTestCluster } = await import("./consensus/raft.js");
    const nodeCount = parseInt(args[1], 10) || 3;
    const entries = parseInt(args[2], 10) || 3;

    console.log(`Starting Raft consensus test with ${nodeCount} nodes...`);
    const result = await runTestCluster(nodeCount, entries);

    if (!result.leaderId) {
      console.error("Election failed: no leader elected within timeout.");
      process.exit(1);
    }

    console.log(
      `\nLeader elected: ${result.leaderId} (term ${result.leaderTerm})\n`,
    );
    console.log("Node states:");
    for (const n of result.nodes) {
      const marker = n.id === result.leaderId ? " <-- leader" : "";
      console.log(
        `  ${n.id}: state=${n.state}, term=${n.term}, log=${n.logLength}, committed=${n.commitIndex}${marker}`,
      );
    }

    const uniqueApplied = new Map<string, number>();
    for (const { nodeId } of result.appliedEntries) {
      uniqueApplied.set(nodeId, (uniqueApplied.get(nodeId) || 0) + 1);
    }
    console.log(`\nApplied entries:`);
    for (const [nodeId, count] of uniqueApplied) {
      console.log(`  ${nodeId}: ${count} entries applied`);
    }

    console.log(`\nTotal apply callbacks: ${result.appliedEntries.length}`);
    console.log("Consensus test passed.");
  } else if (sub === "test-bft") {
    const { runBftTest } = await import("./consensus/bft.js");
    const nodeCount = parseInt(args[1], 10) || 4;
    const proposals = parseInt(args[2], 10) || 3;

    console.log(`Starting BFT consensus test with ${nodeCount} nodes...`);
    const result = runBftTest(nodeCount, proposals);

    console.log(`\nPrimary: ${result.primaryId}`);
    console.log(`Max faulty tolerance: ${result.maxFaulty}`);
    console.log(`\nProposals:`);
    for (const p of result.proposals) {
      console.log(
        `  ${JSON.stringify(p.data)} -> ${p.success ? "COMMITTED" : "FAILED"}`,
      );
    }
    console.log(`\nCommitted entries: ${result.committed.length}`);
    console.log("BFT consensus test passed.");
  } else if (sub === "test-gossip") {
    const { runGossipTest } = await import("./consensus/gossip.js");
    const nodeCount = parseInt(args[1], 10) || 5;
    const keyCount = parseInt(args[2], 10) || 3;

    console.log(
      `Starting Gossip protocol test with ${nodeCount} nodes, ${keyCount} keys...`,
    );
    const result = runGossipTest(nodeCount, keyCount);

    console.log(`\nConverged: ${result.converged}`);
    console.log(`Rounds to converge: ${result.rounds}`);
    console.log(`Total state updates: ${result.totalUpdates}`);
    console.log(`Keys propagated: ${result.keys.join(", ")}`);
    console.log("Gossip protocol test passed.");
  } else if (sub === "test-crdt") {
    const { runCrdtTest } = await import("./consensus/crdt.js");

    console.log("Starting CRDT tests...\n");
    const result = runCrdtTest();

    console.log(
      `GCounter:    value=${result.gcounter.c1}, expected=${result.gcounter.expected} -> ${result.gcounter.pass ? "PASS" : "FAIL"}`,
    );
    console.log(
      `LWWRegister: value=${result.lwwRegister.value}, expected=${result.lwwRegister.expected} -> ${result.lwwRegister.pass ? "PASS" : "FAIL"}`,
    );
    console.log(
      `ORSet:       values=[${result.orSet.values}], expected=[${result.orSet.expected}] -> ${result.orSet.pass ? "PASS" : "FAIL"}`,
    );

    const allPass =
      result.gcounter.pass && result.lwwRegister.pass && result.orSet.pass;
    console.log(`\nAll CRDT tests ${allPass ? "passed" : "FAILED"}.`);
    if (!allPass) process.exit(1);
  } else if (sub === "test-all") {
    console.log("=== Running all consensus tests ===\n");

    // Raft
    console.log("--- Raft ---");
    const { runTestCluster } = await import("./consensus/raft.js");
    const raftResult = await runTestCluster(3, 3);
    console.log(
      `  Leader: ${raftResult.leaderId || "NONE"}, applied: ${raftResult.appliedEntries.length}`,
    );
    console.log(`  ${raftResult.leaderId ? "PASS" : "FAIL"}\n`);

    // BFT
    console.log("--- BFT ---");
    const { runBftTest } = await import("./consensus/bft.js");
    const bftResult = runBftTest(4, 3);
    const bftPass = bftResult.proposals.every((p) => p.success);
    console.log(
      `  Primary: ${bftResult.primaryId}, committed: ${bftResult.committed.length}`,
    );
    console.log(`  ${bftPass ? "PASS" : "FAIL"}\n`);

    // Gossip
    console.log("--- Gossip ---");
    const { runGossipTest } = await import("./consensus/gossip.js");
    const gossipResult = runGossipTest(5, 3);
    console.log(
      `  Converged: ${gossipResult.converged} in ${gossipResult.rounds} rounds`,
    );
    console.log(`  ${gossipResult.converged ? "PASS" : "FAIL"}\n`);

    // CRDT
    console.log("--- CRDT ---");
    const { runCrdtTest } = await import("./consensus/crdt.js");
    const crdtResult = runCrdtTest();
    const crdtPass =
      crdtResult.gcounter.pass &&
      crdtResult.lwwRegister.pass &&
      crdtResult.orSet.pass;
    console.log(
      `  GCounter=${crdtResult.gcounter.pass ? "OK" : "FAIL"} LWW=${crdtResult.lwwRegister.pass ? "OK" : "FAIL"} ORSet=${crdtResult.orSet.pass ? "OK" : "FAIL"}`,
    );
    console.log(`  ${crdtPass ? "PASS" : "FAIL"}\n`);

    const allPass =
      !!raftResult.leaderId && bftPass && gossipResult.converged && crdtPass;
    console.log(`=== All consensus tests ${allPass ? "PASSED" : "FAILED"} ===`);
    if (!allPass) process.exit(1);
  } else {
    console.log(`
apex consensus — distributed consensus protocols

Usage:
  apex consensus test [NODES] [ENTRIES]      Test Raft (default: 3 nodes, 3 entries)
  apex consensus test-bft [NODES] [PROPS]    Test BFT  (default: 4 nodes, 3 proposals)
  apex consensus test-gossip [NODES] [KEYS]  Test Gossip (default: 5 nodes, 3 keys)
  apex consensus test-crdt                   Test CRDTs (GCounter, LWW, ORSet)
  apex consensus test-all                    Run all four protocol tests
`);
  }
}

async function cmdDesign(args: string[]) {
  const { execSync } = await import("node:child_process");
  const sub = args[0];

  if (sub === "generate") {
    const prompt = args.slice(1).join(" ");
    if (!prompt) {
      console.error("Usage: apex design generate <prompt>");
      process.exit(1);
    }
    const { generateDesign } = await import("./design.js");
    const result = await generateDesign(prompt);
    console.log(`Generated: ${result.path}`);
  } else if (sub === "variants") {
    const prompt = args.slice(1).join(" ");
    if (!prompt) {
      console.error("Usage: apex design variants <prompt>");
      process.exit(1);
    }
    const { generateVariants, compareDesigns } = await import("./design.js");
    console.log("Generating design variants...");
    const results = await generateVariants(prompt);
    for (const r of results) console.log(`  ${r.path}`);
    const html = await compareDesigns(results.map((r) => r.path));
    console.log(`Comparison: ${html}`);
    try {
      execSync(`open "${html}"`);
    } catch {
      /* ignore if open fails */
    }
  } else if (sub === "list") {
    const { listDesigns } = await import("./design.js");
    const designs = listDesigns();
    if (designs.length === 0) {
      console.log(
        "No designs found. Use 'apex design generate <prompt>' to create one.",
      );
    } else {
      console.log(`Found ${designs.length} design(s):`);
      for (const d of designs) console.log(`  ${d}`);
    }
  } else if (sub === "compare") {
    const paths = args.slice(1);
    if (paths.length < 2) {
      console.error("Usage: apex design compare <path1> <path2> [path3...]");
      process.exit(1);
    }
    const { compareDesigns } = await import("./design.js");
    const html = await compareDesigns(paths);
    console.log(`Comparison: ${html}`);
    try {
      execSync(`open "${html}"`);
    } catch {
      /* ignore */
    }
  } else {
    console.log(`
apex design — AI-powered UI design generation (OpenAI GPT Image)

Usage:
  apex design generate <prompt>           Generate a UI mockup from prompt
  apex design variants <prompt>           Generate 3 style variants + comparison
  apex design compare <p1> <p2> [p3...]   Compare existing design images
  apex design list                        List generated designs

Requires: OPENAI_API_KEY environment variable
`);
  }
}

async function cmdSandbox(args: string[]) {
  const lang = args[0] as "javascript" | "typescript" | "python" | "bash";
  const codeOrFile = args.slice(1).join(" ");

  if (!lang || !codeOrFile) {
    console.log(`
apex sandbox — run untrusted code in isolation

Usage:
  apex sandbox <language> <code-or-file>

Languages: javascript, typescript, python, bash

Examples:
  apex sandbox javascript "console.log('hello')"
  apex sandbox python script.py
  apex sandbox bash "echo hello world"
`);
    return;
  }

  const { runInSandbox } = await import("./sandbox.js");

  let code: string;
  if (existsSync(codeOrFile)) {
    code = readFileSync(codeOrFile, "utf-8");
  } else {
    code = codeOrFile;
  }

  const result = await runInSandbox(code, lang);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  console.log(
    `\nExit: ${result.exitCode} (${result.duration_ms}ms${result.timedOut ? ", TIMEOUT" : ""})`,
  );
  process.exit(result.exitCode);
}

async function cmdIssues(args: string[]) {
  const sub = args[0];

  if (!checkGhCli()) {
    console.error("GitHub CLI (gh) not found or not authenticated.");
    console.error("Install: https://cli.github.com/  then run: gh auth login");
    process.exit(1);
  }

  if (sub === "sync" || sub === "list") {
    const stateIdx = args.indexOf("--state");
    const state = (stateIdx >= 0 ? args[stateIdx + 1] : "open") as
      | "open"
      | "closed"
      | "all";
    const labelIdx = args.indexOf("--label");
    const label = labelIdx >= 0 ? args[labelIdx + 1] : undefined;

    const issues = listIssues({ state, label });
    if (issues.length === 0) {
      console.log("No issues found.");
    } else {
      console.log(`Found ${issues.length} ${state} issue(s):`);
      for (const i of issues) {
        const labels = i.labels.length > 0 ? ` [${i.labels.join(", ")}]` : "";
        const assignee = i.assignee ? ` (@${i.assignee})` : "";
        console.log(`  #${i.number}: ${i.title}${labels}${assignee}`);
      }
    }
  } else if (sub === "import") {
    const label = args[1] || "apex";
    console.log(`Importing issues with label "${label}"...`);
    const issues = listIssues({ label, state: "open" });
    if (issues.length === 0) {
      console.log(`No open issues with label "${label}".`);
    } else {
      const result = await createTasksFromIssues(issues);
      if (result.imported.length > 0) {
        console.log(`Imported ${result.imported.length} task(s):`);
        for (const line of result.imported) console.log(`  ${line}`);
      }
      if (result.errors.length > 0) {
        console.error(`Errors (${result.errors.length}):`);
        for (const line of result.errors) console.error(`  ${line}`);
      }
    }
  } else if (sub === "status") {
    const taskId = args[1];
    const issueNum = parseInt(args[2], 10);
    const status = args[3];
    if (!taskId || !issueNum || !status) {
      console.error("Usage: apex issues status TASK_ID ISSUE_NUMBER STATUS");
      process.exit(1);
    }
    const ok = syncIssueStatus(taskId, issueNum, status);
    console.log(
      ok ? `Commented on #${issueNum}` : `Failed to comment on #${issueNum}`,
    );
  } else if (sub === "view") {
    const num = parseInt(args[1], 10);
    if (!num) {
      console.error("Usage: apex issues view ISSUE_NUMBER");
      process.exit(1);
    }
    const issue = getIssue(num);
    if (!issue) {
      console.error(`Issue #${num} not found.`);
      process.exit(1);
    }
    console.log(`#${issue.number}: ${issue.title}`);
    console.log(`State: ${issue.state}`);
    if (issue.labels.length) console.log(`Labels: ${issue.labels.join(", ")}`);
    if (issue.assignee) console.log(`Assignee: ${issue.assignee}`);
    console.log(`URL: ${issue.url}`);
    if (issue.body) console.log(`\n${issue.body}`);
  } else {
    console.log(`
apex issues — GitHub issue integration

Usage:
  apex issues list [--state open|closed|all] [--label LABEL]
                                    List issues from GitHub
  apex issues import [LABEL]        Import issues as apex tasks (default label: apex)
  apex issues view ISSUE_NUMBER     View a single issue
  apex issues status TASK_ID NUM STATUS
                                    Comment task status on a GitHub issue
`);
  }
}

async function cmdTrace(args: string[]) {
  const sub = args[0];

  if (sub === "start") {
    const name = args.slice(1).join(" ") || "unnamed-span";
    const parentIdx = args.indexOf("--parent");
    const parentId = parentIdx >= 0 ? args[parentIdx + 1] : undefined;
    const spanId = startSpan(name, parentId);
    console.log(`Started span: ${spanId} (${name})`);
  } else if (sub === "end") {
    const spanId = args[1];
    const status = (args[2] || "ok") as "ok" | "error";
    if (!spanId) {
      console.error("Usage: apex trace end SPAN_ID [ok|error]");
      process.exit(1);
    }
    endSpan(spanId, status);
    console.log(`Ended span: ${spanId} (${status})`);
  } else if (sub === "active") {
    const spans = getActiveSpans();
    if (spans.length === 0) {
      console.log("No active spans.");
    } else {
      console.log(`${spans.length} active span(s):`);
      for (const s of spans) {
        console.log(`  ${s.span_id}: ${s.name} (started ${s.started_at})`);
      }
    }
  } else if (sub === "list") {
    const limit = parseInt(args[1], 10) || 20;
    const summaries = listTraceSummaries(limit);
    if (summaries.length === 0) {
      console.log("No traces recorded yet.");
    } else {
      console.log(`Recent traces (${summaries.length}):`);
      console.log(
        "Trace ID                     Root Span           Spans  Duration   Errors",
      );
      console.log("\u2500".repeat(78));
      for (const t of summaries) {
        const dur =
          t.total_duration_ms != null ? `${t.total_duration_ms}ms` : "-";
        const err = t.has_errors ? "YES" : "-";
        console.log(
          `${t.trace_id.padEnd(29)} ${t.root_span.slice(0, 20).padEnd(20)} ${String(t.span_count).padEnd(7)} ${dur.padEnd(10)} ${err}`,
        );
      }
    }
  } else if (sub === "view") {
    const traceId = args[1];
    if (!traceId) {
      console.error("Usage: apex trace view TRACE_ID");
      process.exit(1);
    }
    const spans = getTraceSpans(traceId);
    if (spans.length === 0) {
      console.log(`No spans found for trace: ${traceId}`);
    } else {
      console.log(`Trace: ${traceId} (${spans.length} spans)\n`);
      for (const s of spans) {
        const dur = s.duration_ms != null ? `${s.duration_ms}ms` : "running";
        const parent = s.parent_id ? ` (parent: ${s.parent_id})` : " (root)";
        const meta = s.metadata ? ` ${JSON.stringify(s.metadata)}` : "";
        console.log(
          `  [${s.status.toUpperCase()}] ${s.name} - ${dur}${parent}${meta}`,
        );
      }
    }
  } else {
    console.log(`
apex trace — lightweight observability

Usage:
  apex trace start <name> [--parent SPAN_ID]  Start a new span
  apex trace end SPAN_ID [ok|error]            End a span
  apex trace active                            Show running spans
  apex trace list [LIMIT]                      List recent traces (default: 20)
  apex trace view TRACE_ID                     View all spans in a trace
`);
  }
}

async function cmdCheckBindings(): Promise<void> {
  const bindingsPath = "skill/bindings.yaml";
  if (!existsSync(bindingsPath)) {
    console.error("bindings.yaml not found at skill/bindings.yaml");
    process.exit(1);
  }

  const content = readFileSync(bindingsPath, "utf-8");
  const home = process.env.HOME || "/tmp";
  const skillsDir = `${home}/.claude/skills`;

  // Simple YAML extraction: find lines with "skill:" and "version:"
  interface Binding {
    skill: string;
    version: string;
  }
  const bindings: Binding[] = [];
  let currentSkill = "";

  for (const line of content.split("\n")) {
    const skillMatch = line.match(/^\s+skill:\s+(.+)/);
    if (skillMatch) {
      currentSkill = skillMatch[1].trim();
    }
    const versionMatch = line.match(/^\s+version:\s+"?([^"]+)"?/);
    if (versionMatch && currentSkill) {
      bindings.push({ skill: currentSkill, version: versionMatch[1].trim() });
      currentSkill = "";
    }
  }

  if (bindings.length === 0) {
    console.log("No version-constrained bindings found.");
    return;
  }

  console.log("Checking skill bindings...\n");
  console.log("Skill                    Constraint    Installed    Status");
  console.log("\u2500".repeat(65));

  let failures = 0;

  for (const b of bindings) {
    const versionFile = `${skillsDir}/${b.skill}/VERSION`;
    let installed = "not found";
    let ok = false;

    if (existsSync(versionFile)) {
      installed = readFileSync(versionFile, "utf-8").trim();
      ok = satisfies(installed, b.version);
    }

    const status = ok ? "PASS" : "FAIL";
    if (!ok) failures++;

    console.log(
      `${b.skill.padEnd(25)} ${b.version.padEnd(14)} ${installed.padEnd(13)} ${status}`,
    );
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} binding(s) failed version check.`);
    process.exit(1);
  } else {
    console.log(`All ${bindings.length} bindings pass.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const rest = args.slice(1);

  // Fire-and-forget update check (non-blocking, cached <5ms)
  const updateCheckPromise = startupQuickCheck();

  try {
    switch (command) {
      case "init":
        await cmdInit();
        break;
      case "status":
        await cmdStatus(rest);
        break;
      case "update":
        await cmdUpdate(rest);
        break;
      case "heal":
        await cmdHeal(rest);
        break;
      case "task":
        await cmdTask(rest);
        break;
      case "memory":
        await cmdMemory(rest);
        break;
      case "telemetry":
        await cmdTelemetry(rest);
        break;
      case "worktree":
        await cmdWorktree(rest);
        break;
      case "ship": {
        const sub = rest[0];
        if (sub === "checkpoint") {
          const name = rest[1];
          if (!name) {
            console.error("Usage: apex ship checkpoint <name>");
            process.exit(1);
          }
          try {
            await addShipCheckpoint(name);
            console.log(`Ship checkpoint recorded: ${name}`);
          } catch (err: any) {
            console.error(err.message);
            process.exit(1);
          }
        } else {
          console.error(`Unknown ship subcommand: ${sub}`);
          console.error("Usage: apex ship checkpoint <name>");
          process.exit(1);
        }
        break;
      }
      case "compound": {
        const sub = rest[0];
        if (sub === "checkpoint") {
          const name = rest[1];
          if (!name) {
            console.error("Usage: apex compound checkpoint <name>");
            process.exit(1);
          }
          try {
            await addCompoundCheckpoint(name);
            console.log(`Compound checkpoint recorded: ${name}`);
          } catch (err: any) {
            console.error(err.message);
            process.exit(1);
          }
        } else {
          console.error(`Unknown compound subcommand: ${sub}`);
          console.error("Usage: apex compound checkpoint <name>");
          process.exit(1);
        }
        break;
      }
      case "stage": {
        const sub = rest[0];
        if (sub === "set") {
          const name = rest[1];
          if (!name) {
            console.error("Usage: apex stage set <name>");
            process.exit(1);
          }
          try {
            const st = await setStage(name);
            console.log(`Stage set to: ${st.current_stage}`);
            if (st.current_stage !== "idle") {
              console.log(
                `⚠ MANDATORY: Read stages/${st.current_stage}.md before proceeding — contains required steps and exit gates.`,
              );
              // T1: Print inline key requirements per stage
              const stageReqs: Record<string, string[]> = {
                brainstorm: [
                  "NO code — only conversation + requirements document",
                  "Tag all claims: [已验证] or [假设]",
                  "Run 9-step checklist (→ details/brainstorm-checklist.md)",
                  "Get explicit user approval before completing",
                ],
                plan: [
                  "Every task traces to an acceptance criterion",
                  "Exact file paths — no placeholders",
                  "Test scenarios in Given/When/Then",
                  "NO implementation code — directional only",
                ],
                execute: [
                  "TDD: Write test → RED → Code → GREEN → Refactor",
                  "No design decisions — follow the plan",
                  "Submit evidence with apex task submit",
                ],
                review: [
                  "Read each changed file fresh — not from memory",
                  "Security + Correctness + Spec Compliance + Adversarial",
                  "Every finding needs file:line evidence",
                  "Fix all P0-P2 before completing",
                ],
                ship: [
                  "Pre-flight: tests pass, no unexpected changes, review confirmed",
                  "Commit format: type(scope): description",
                  "Plain-language iteration summary before push",
                  "Ask user before pushing to remote",
                ],
                compound: [
                  "Write solution doc to docs/solutions/",
                  "Memory Write HARD GATE — extract lessons to .apex/memory/",
                  "Ask user: continue, new session, or end",
                ],
              };
              const reqs = stageReqs[st.current_stage];
              if (reqs) {
                console.log("\n  Key requirements:");
                for (const r of reqs) {
                  console.log(`    • ${r}`);
                }
              }
              // T2: Auto-create artifact template if none exists
              const projectId =
                st.session_id?.replace(/^apex-/, "") || "project";
              const templateMap: Record<
                string,
                { dir: string; file: string; content: string }
              > = {
                brainstorm: {
                  dir: "docs/brainstorms",
                  file: `docs/brainstorms/${projectId}-requirements.md`,
                  content: `---\ntitle: ${projectId} Requirements\nscope: Standard\nstatus: draft\ncreated: ${new Date().toISOString().split("T")[0]}\n---\n\n## Problem Statement\n\n## Constraints\n\n## Approaches\n\n## Acceptance Criteria\n\n## Solution Shape\n`,
                },
                plan: {
                  dir: "docs/plans",
                  file: `docs/plans/${projectId}-plan.md`,
                  content: `---\ntitle: ${projectId} Plan\nscope: Standard\nstatus: draft\ncreated: ${new Date().toISOString().split("T")[0]}\nsource: docs/brainstorms/${projectId}-requirements.md\ntasks: 0\ncomplexity: medium\n---\n\n## Problem Frame\n\n## Decision Log\n\n## File Manifest\n\n## Task Decomposition\n\n## Test Plan\n`,
                },
                review: {
                  dir: "docs/reviews",
                  file: `docs/reviews/${projectId}-review.md`,
                  content: `---\ntitle: ${projectId} Review\nstatus: PENDING\nreviewer: self\ncreated: ${new Date().toISOString().split("T")[0]}\n---\n\n## Summary\n\n## Security Reviewer\n\n## Correctness Reviewer\n\n## Spec Compliance Reviewer\n\n## Adversarial Reviewer\n\n## Verdict\n`,
                },
              };
              const tmpl = templateMap[st.current_stage];
              if (tmpl && !existsSync(tmpl.file)) {
                mkdirSync(tmpl.dir, { recursive: true });
                writeFileSync(tmpl.file, tmpl.content);
                console.log(`\n  📄 Template created: ${tmpl.file}`);
              }
            }
          } catch (err: any) {
            console.error(err.message);
            process.exit(1);
          }
        } else if (sub === "complete") {
          const name = rest[1];
          if (!name) {
            console.error("Usage: apex stage complete <name>");
            process.exit(1);
          }
          try {
            const gate = await runStructuralGate(name);
            for (const item of gate.items) {
              const icon = item.pass ? "✓" : "✗";
              console.log(`  ${icon} ${item.id}: ${item.reason}`);
            }
            if (!gate.pass) {
              console.error(
                `\nGate BLOCKED — fix the issues above, then retry.`,
              );
              process.exit(1);
            }
            await completeStage(name, true); // gate already checked above
            console.log(`\nStage completed: ${name}`);
            // Compliance report on ship complete
            if (name === "ship") {
              try {
                const st = await getState();
                const stages = [
                  "brainstorm",
                  "plan",
                  "execute",
                  "review",
                  "ship",
                ];
                const report: string[] = ["\n── Pipeline Compliance ──"];
                let totalPass = 0;
                let totalChecks = 0;
                for (const s of stages) {
                  const arts =
                    (st.artifacts as Record<string, string[]>)?.[s] || [];
                  const hasArtifact = arts.length > 0;
                  if (s === name) {
                    // Ship stage — use actual gate results
                    const sPass = gate.items.filter(
                      (i: { pass: boolean }) => i.pass,
                    ).length;
                    report.push(
                      `  ${s}: ${sPass}/${gate.items.length} ${sPass === gate.items.length ? "✓" : "⚠"}`,
                    );
                    totalPass += sPass;
                    totalChecks += gate.items.length;
                  } else {
                    // Other stages — check if artifact was registered
                    report.push(`  ${s}: ${hasArtifact ? "✓" : "—"}`);
                    totalPass += hasArtifact ? 1 : 0;
                    totalChecks += 1;
                  }
                }
                const pct =
                  totalChecks > 0
                    ? Math.round((totalPass / totalChecks) * 100)
                    : 0;
                const grade =
                  pct >= 90 ? "A" : pct >= 75 ? "B" : pct >= 60 ? "C" : "D";
                report.push(`  Overall: ${grade} (${pct}%)`);
                console.log(report.join("\n"));
              } catch {
                /* non-critical — skip if state read fails */
              }
            }
          } catch (err: any) {
            console.error(err.message);
            process.exit(1);
          }
        } else if (sub === "artifact") {
          const [stage, ...pathParts] = rest.slice(1);
          const path = pathParts.join(" ");
          if (!stage || !path) {
            console.error("Usage: apex stage artifact <stage> <path>");
            process.exit(1);
          }
          await addArtifact(stage, path);
          console.log(`Artifact added to ${stage}: ${path}`);
        } else if (sub === "get" || !sub) {
          const st = await getState();
          console.log(JSON.stringify(st, null, 2));
        } else {
          console.error(`Unknown stage subcommand: ${sub}`);
          console.error("Usage: apex stage [set|complete|artifact|get]");
          process.exit(1);
        }
        break;
      }
      case "session": {
        const sub = rest[0];
        if (sub === "summary") {
          const en =
            rest.find((_: string, i: number) => rest[i - 1] === "--en") || "";
          const zh =
            rest.find((_: string, i: number) => rest[i - 1] === "--zh") || "";
          if (!en && !zh) {
            console.error(
              'Usage: apex session summary --en "English summary" --zh "中文摘要"',
            );
            process.exit(1);
          }
          const { appendEvent, rebuildAndCache } = await import(
            "./state/event-log.js"
          );
          const payload: Record<string, unknown> = {};
          if (en) payload.en = en;
          if (zh) payload.zh = zh;
          appendEvent("state", "session.summary", payload);
          await rebuildAndCache("state");
          console.log(
            "Session summary set" +
              (en ? ` [en] ${en}` : "") +
              (zh ? ` [zh] ${zh}` : ""),
          );
        } else {
          console.error("Usage: apex session [summary]");
          process.exit(1);
        }
        break;
      }
      case "consensus":
        await cmdConsensus(rest);
        break;
      case "design":
        await cmdDesign(rest);
        break;
      case "sandbox":
        await cmdSandbox(rest);
        break;
      case "issues":
        await cmdIssues(rest);
        break;
      case "trace":
        await cmdTrace(rest);
        break;
      case "trace-skill": {
        const [stage, skill, version, outputStatus, afMapping] = rest;
        if (!stage || !skill || !version || !outputStatus || !afMapping) {
          console.error(
            "Usage: apex trace-skill <stage> <skill> <version> <output_status> <af_mapping>",
          );
          process.exit(1);
        }
        const st = await addSkillInvocation(
          stage,
          skill,
          version,
          outputStatus,
          afMapping,
        );
        console.log(
          `Traced: ${skill}@${version} in ${stage} → ${outputStatus} (${afMapping})`,
        );
        console.log(`Total invocations: ${st.skill_invocations?.length ?? 0}`);
        break;
      }
      case "check-bindings":
        await cmdCheckBindings();
        break;
      case "dashboard": {
        const { startDashboard, startHub } = await import("./dashboard.js");
        if (rest[0] === "hub") {
          await startHub();
        } else {
          const portIdx = rest.indexOf("--port");
          const port =
            portIdx >= 0 ? parseInt(rest[portIdx + 1], 10) : undefined;
          const daemon = rest.includes("--daemon");
          const projIdx = rest.indexOf("--project");
          const projectPath = projIdx >= 0 ? rest[projIdx + 1] : undefined;
          await startDashboard(port, { daemon, projectPath });
        }
        // Keep process alive while server runs
        await new Promise(() => {});
        break;
      }
      case "daemon": {
        const { cmdDaemon } = await import("./commands/daemon.js");
        await cmdDaemon(rest);
        break;
      }
      case "convert": {
        const { main: runConverter } = await import("./converter.js");
        await runConverter(rest);
        break;
      }
      case "doctor": {
        const { cmdDoctor } = await import("./commands/doctor.js");
        await cmdDoctor(rest);
        break;
      }
      case "audit": {
        const { cmdAudit } = await import("./commands/audit.js");
        await cmdAudit(rest);
        break;
      }
      case "recover": {
        // Handle --rebuild flag for event log cache rebuild
        if (rest.includes("--rebuild")) {
          const { rebuildAndCache, rebuildAllCaches } = await import(
            "./state/event-log.js"
          );
          const domain = rest.find((r) =>
            ["task", "state", "memory"].includes(r),
          );
          if (domain) {
            await rebuildAndCache(domain as "task" | "state" | "memory");
            console.log(`Rebuilt ${domain} cache from event log.`);
          } else {
            await rebuildAllCaches();
            console.log("Rebuilt all caches from event logs.");
          }
          break;
        }
        const { recoverState } = await import("./state/recovery.js");
        const issues = await recoverState();
        if (issues.length === 0) {
          console.log("No issues found. State is clean.");
        } else {
          console.log(`Fixed ${issues.length} issue(s):`);
          for (const i of issues) console.log(`  - ${i}`);
        }
        break;
      }
      case "orchestrate":
        if (rest[0] === "event") {
          const { cmdOrchestrateEvent } = await import(
            "./commands/orchestrate-event.js"
          );
          await cmdOrchestrateEvent(rest.slice(1));
        } else {
          const { runOrchestrator } = await import("./orchestrator.js");
          await runOrchestrator(rest);
        }
        break;
      case "version":
      case "--version":
      case "-v":
        console.log(`apex-forge v${VERSION}`);
        break;
      case "help":
      case "--help":
      case "-h":
      case undefined:
        printHelp();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof ApexError) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await updateCheckPromise.catch(() => {});
  }
}

function printHelp() {
  console.log(`
apex-forge v${VERSION} — Unified execution framework for AI coding agents

Usage: apex <command> [args]

Commands:
  init                          Initialize .apex/ directory
  status [--json]               Show current state
  task create TITLE [DESC] [DEPS...]  Create a task
  task assign TASK_ID           Assign a task (open -> assigned)
  task start TASK_ID            Start work (assigned -> in_progress)
  task submit TASK_ID EVIDENCE  Submit for review (in_progress -> to_verify)
  task verify TASK_ID [pass|fail]  Verify (to_verify -> done or in_progress)
  task block TASK_ID REASON     Block a task
  task release TASK_ID          Release assignment (assigned -> open)
  task list [--status STATUS]   List tasks
  task next                     Show next available task
  task get TASK_ID              Show task details
  memory add FACT CONF [TAGS...] Add a fact with confidence
  memory list [--min N]         List facts
  memory search QUERY           Search facts
  memory remove FACT_ID         Remove a fact
  memory inject                 Output facts for context injection
  memory prune                  Remove low-confidence facts
  memory curate                 Auto-extract facts from recent activity
  memory extract-llm [--stdin]  LLM-powered fact extraction (needs ANTHROPIC_API_KEY)
  telemetry start SKILL         Start tracking a skill run
  telemetry end OUTCOME         End tracking (success|error|abort)
  telemetry report              Show usage analytics
  telemetry sync                Upload analytics to remote endpoint
  stage set NAME                Set current pipeline stage (brainstorm, plan, execute, etc.)
  stage complete NAME           Mark a stage as completed
  stage artifact STAGE PATH     Add an artifact to a stage
  stage get                     Show current stage state as JSON
  ship checkpoint NAME          Record a ship-stage checkpoint (iteration-summary, push-prompt, compound-transition)
  compound checkpoint NAME      Record a compound-stage checkpoint (re-entry-prompt)
  audit [--session ID] [--json] [--no-test] [--all]  Audit pipeline execution quality
  doctor [--json]               Audit all enforcement layers (hooks, gates, bindings, state)
  worktree create TASK_ID       Create git worktree for task
  worktree list                 List worktrees
  worktree cleanup TASK_ID      Remove worktree
  consensus test [N] [E]       Test Raft consensus (default: 3 nodes, 3 entries)
  consensus test-bft [N] [P]   Test BFT consensus (default: 4 nodes, 3 proposals)
  consensus test-gossip [N] [K] Test Gossip protocol (default: 5 nodes, 3 keys)
  consensus test-crdt           Test CRDTs (GCounter, LWW, ORSet)
  consensus test-all            Run all four consensus protocol tests
  design generate <prompt>      Generate UI mockup via OpenAI GPT Image
  design variants <prompt>      Generate style variants + comparison page
  design compare <p1> <p2>...   Compare existing design images
  design list                   List generated designs
  sandbox <lang> <code|file>    Run code in sandbox (js/ts/python/bash)
  issues list [--state S]       List GitHub issues
  issues import [LABEL]         Import GitHub issues as apex tasks
  issues view NUM               View a GitHub issue
  issues status TID NUM STATUS  Post task status to a GitHub issue
  trace start <name>            Start a tracing span
  trace end SPAN_ID [ok|error]  End a span
  trace active                  Show running spans
  trace list [LIMIT]            List recent traces
  trace view TRACE_ID           View spans in a trace
  trace-skill STAGE SKILL VER STATUS MAPPING
                                Record a skill invocation trace
  update check [--json]         Check for available updates
  update apply [--json]         Apply available update
  update rollback [--json]      Rollback to previous version
  heal check [--json]           Check upstream for updates + changelog
  heal analyze --error "msg"    Diagnose an error
  heal run --error "msg"        Full self-heal loop
  heal issue-draft --error "msg" Draft a GitHub issue
  heal contribute [--summary]   Contribute local fix as PR
  check-bindings                Verify skill versions against bindings.yaml
  dashboard [--port PORT]       Start project dashboard (auto-port from path)
  dashboard hub                 Start hub page listing all active dashboards
  convert --platform PLATFORM  Convert skills for cursor|codex|factory|gemini|windsurf
  convert --list               List all discovered skills
  orchestrate [--dry-run] [--once]   Run task orchestrator
  orchestrate event ACTION [--task ID] [--detail JSON]
                                Record orchestration event
  recover                       Recover from crashes (clean stale state)
  version                       Show version
  help                          Show this help
`);
}

main();
