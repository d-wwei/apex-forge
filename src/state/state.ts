/**
 * Apex Forge — Stage State
 *
 * Ports the stage management section of hooks/state-helper into TypeScript.
 * Manages current_stage, history, artifacts, and session identity.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { StageState } from "../types/state.js";
import { readJSON } from "../utils/json.js";
import { appendJSONL } from "../utils/logger.js";
import { isoTimestamp, sessionId } from "../utils/timestamp.js";
import {
  appendEvent,
  rebuildAndCache,
  sessionStateCachePath,
} from "./event-log.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Gate Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if a markdown file contains a section matching the given pattern.
 * Matches ## or # headers case-insensitively.
 */
function hasSection(filePath: string, sectionPattern: RegExp): boolean {
  if (!existsSync(filePath)) return false;
  try {
    const content = readFileSync(filePath, "utf-8");
    return sectionPattern.test(content);
  } catch {
    return false;
  }
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns key-value pairs from the --- delimited block.
 */
function parseFrontmatter(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  try {
    const content = readFileSync(filePath, "utf-8");
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};
    const fm: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        let val = line.slice(colonIdx + 1).trim();
        // Strip outer quotes (YAML allows "value" or 'value')
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (key) fm[key] = val;
      }
    }
    return fm;
  } catch {
    return {};
  }
}

const STATE_PATH = ".apex/state.json";

function defaultState(): StageState {
  return {
    current_stage: "idle",
    last_updated: isoTimestamp(),
    session_id: sessionId(),
    artifacts: {
      brainstorm: [],
      plan: [],
      execute: [],
      review: [],
      solutions: [],
    },
    history: [],
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadState(): Promise<StageState> {
  // Prefer per-session cache (isolates concurrent sessions)
  const sessionPath = sessionStateCachePath();
  if (existsSync(sessionPath)) {
    return readJSON<StageState>(sessionPath, defaultState());
  }
  // Fallback to global cache (first startup, legacy sessions)
  return readJSON<StageState>(STATE_PATH, defaultState());
}

// saveState removed — writes go through event log + rebuildAndCache

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read or create the default stage state.
 */
export async function getState(): Promise<StageState> {
  return loadState();
}

/**
 * Stage ordering: each stage requires its predecessor to be completed.
 * idle and brainstorm are always allowed. orchestrate:* stages bypass ordering.
 */
const STAGE_ORDER: Record<string, string> = {
  plan: "brainstorm",
  execute: "plan",
  review: "execute",
  ship: "review",
  compound: "ship",
};

/**
 * Set the current stage and record a new history entry.
 * Enforces stage ordering — rejects if predecessor stage was not completed.
 * idle, brainstorm, and orchestrate:* stages bypass ordering.
 */
export async function setStage(stage: string): Promise<StageState> {
  const state = await loadState();

  // Enforce stage ordering (skip for idle, brainstorm, orchestrate:*)
  // Only enforce when there IS an active pipeline (history has entries).
  // Fresh projects with no history can set any stage freely.
  const predecessor = STAGE_ORDER[stage];
  if (
    predecessor &&
    !stage.startsWith("orchestrate:") &&
    state.history.length > 0
  ) {
    // Accept: completed_via === "gate" (explicit gate pass) or undefined (legacy history pre-migration)
    // Reject: completed_via === "transition" (auto-closed by stage change — idle-toggle bypass)
    const wasGateCompleted = state.history.some(
      (h) =>
        h.stage === predecessor &&
        h.completed &&
        h.completed_via !== "transition",
    );
    if (!wasGateCompleted) {
      throw new Error(
        `Cannot enter '${stage}' — '${predecessor}' stage has not been completed. ` +
          `Complete it first: apex stage complete ${predecessor}`,
      );
    }
  }

  appendEvent("state", "stage.set", {
    stage,
    previous: state.current_stage,
  });

  await rebuildAndCache("state");
  return loadState();
}

/**
 * Structural gate check result for a single item.
 */
export interface GateCheckItem {
  id: string;
  pass: boolean;
  reason: string;
}

/**
 * Run structural gate checks for a stage before allowing completion.
 * Returns { pass, items } where items lists each check with pass/fail and reason.
 */
export async function runStructuralGate(
  stage: string,
): Promise<{ pass: boolean; items: GateCheckItem[] }> {
  const state = await loadState();
  const items: GateCheckItem[] = [];

  const stageArtifacts = state.artifacts[stage] ?? [];
  const hasArtifact = stageArtifacts.length > 0;

  // Load task store for task-related checks
  const taskStore = await readJSON<{
    tasks: Array<{ id: string; status: string; depends_on: string[] }>;
  }>(".apex/tasks.json", { tasks: [] });
  const allTasks = taskStore.tasks;

  switch (stage) {
    case "brainstorm": {
      // S1: Artifact file exists on disk
      const bArtifact = stageArtifacts[stageArtifacts.length - 1];
      const bFileExists = bArtifact ? existsSync(bArtifact) : false;
      items.push({
        id: "S1",
        pass: bFileExists,
        reason: bFileExists
          ? `File exists: ${bArtifact}`
          : "Artifact file not found on disk",
      });

      // S2: Artifact registered in state
      items.push({
        id: "S2",
        pass: hasArtifact,
        reason: hasArtifact
          ? "Artifact registered"
          : "No artifact registered (run: apex stage artifact brainstorm <path>)",
      });

      // S3: Acceptance criteria section exists
      const bHasAC = bArtifact
        ? hasSection(bArtifact, /##?\s+acceptance\s+criteria/i)
        : false;
      items.push({
        id: "S3",
        pass: bHasAC,
        reason: bHasAC
          ? "Acceptance Criteria section found"
          : "No Acceptance Criteria section in artifact",
      });

      // S4: Constraints section exists
      const bHasConstraints = bArtifact
        ? hasSection(bArtifact, /##?\s+constraints/i)
        : false;
      items.push({
        id: "S4",
        pass: bHasConstraints,
        reason: bHasConstraints
          ? "Constraints section found"
          : "No Constraints section in artifact",
      });

      // S5: Scope classification in frontmatter
      const bFm = bArtifact ? parseFrontmatter(bArtifact) : {};
      const bHasScope = !!bFm.scope;
      items.push({
        id: "S5",
        pass: bHasScope,
        reason: bHasScope
          ? `Scope: ${bFm.scope}`
          : "No scope field in frontmatter",
      });

      // S6: Status approved
      const bApproved = bFm.status === "approved";
      items.push({
        id: "S6",
        pass: bApproved,
        reason: bApproved
          ? "Status: approved"
          : `Status: ${bFm.status || "missing"} (needs approved)`,
      });

      // S7: Decisions transferred (conditional)
      // If a decisions file exists, the requirements doc must have Confirmed Decisions section
      const bDecisionsFile = bArtifact
        ? bArtifact.replace("-requirements.md", "-decisions.md")
        : "";
      const bDecisionsExist = bDecisionsFile
        ? existsSync(bDecisionsFile)
        : false;
      if (bDecisionsExist) {
        const bHasDecisions = hasSection(
          bArtifact!,
          /##?\s+confirmed\s+decisions/i,
        );
        items.push({
          id: "S7",
          pass: bHasDecisions,
          reason: bHasDecisions
            ? "Confirmed Decisions section found"
            : "Decisions file exists but no Confirmed Decisions section in requirements",
        });
      } else {
        items.push({
          id: "S7",
          pass: true,
          reason: "No decisions file — check skipped",
        });
      }

      // CQ1: Acceptance criteria count >= 3 (content quality gate)
      let bAcCount = 0;
      if (bArtifact && existsSync(bArtifact)) {
        try {
          const bContent = readFileSync(bArtifact, "utf-8");
          const acMatch = bContent.match(
            /##?\s+acceptance\s+criteria\s*\n([\s\S]*?)(?=\n##|\n---|$)/i,
          );
          if (acMatch) {
            bAcCount = (acMatch[1].match(/^\s*\d+\./gm) || []).length;
          }
        } catch {
          /* ignore */
        }
      }
      items.push({
        id: "CQ1",
        pass: bAcCount >= 3,
        reason:
          bAcCount >= 3
            ? `${bAcCount} acceptance criteria (>= 3)`
            : `Only ${bAcCount} acceptance criteria (need >= 3). Add specific, testable criteria.`,
      });

      // ADV1: Adversarial verification file (Tier 2+ only — skip for Lightweight scope)
      const bIsLightweight = bFm.scope?.toLowerCase() === "lightweight";
      if (bIsLightweight) {
        items.push({
          id: "ADV1",
          pass: true,
          reason: "Lightweight scope — adversarial verification skipped",
        });
      } else {
        const bAdvFile = join(
          ".apex",
          "verifications",
          "brainstorm-adversarial.md",
        );
        const bAdvExists = existsSync(bAdvFile);
        items.push({
          id: "ADV1",
          pass: bAdvExists,
          reason: bAdvExists
            ? "Adversarial verification file exists"
            : `BLOCKED: Spawn a sub-agent to verify this brainstorm. Prompt: "Read ${bArtifact}. Challenge every assumption, find gaps in acceptance criteria, and identify unstated constraints. Write your findings to ${bAdvFile}."`,
        });
      }

      break;
    }
    case "plan": {
      // S1: Artifact file exists
      const pArtifact = stageArtifacts[stageArtifacts.length - 1];
      const pFileExists = pArtifact ? existsSync(pArtifact) : false;
      items.push({
        id: "S1",
        pass: pFileExists,
        reason: pFileExists
          ? `File exists: ${pArtifact}`
          : "Artifact file not found on disk",
      });

      // S2: Artifact registered in state
      items.push({
        id: "S2",
        pass: hasArtifact,
        reason: hasArtifact
          ? "Artifact registered"
          : "No artifact registered (run: apex stage artifact plan <path>)",
      });

      // S3: File manifest section
      const pHasManifest = pArtifact
        ? hasSection(
            pArtifact,
            /##?\s+(file\s+manifest|files?\s+(to\s+)?(change|modify|create|touch))/i,
          )
        : false;
      items.push({
        id: "S3",
        pass: pHasManifest,
        reason: pHasManifest
          ? "File manifest section found"
          : "No file manifest section in plan",
      });

      // S4: Test file paths section
      const pHasTests = pArtifact
        ? hasSection(pArtifact, /##?\s+test/i)
        : false;
      items.push({
        id: "S4",
        pass: pHasTests,
        reason: pHasTests
          ? "Test section found"
          : "No test file paths section in plan",
      });

      // S5: Task decomposition section
      const pHasTasks = pArtifact
        ? hasSection(pArtifact, /##?\s+task/i)
        : false;
      items.push({
        id: "S5",
        pass: pHasTasks,
        reason: pHasTasks
          ? "Task decomposition section found"
          : "No task decomposition section in plan",
      });

      // S6: Tasks registered in apex task list
      items.push({
        id: "S6",
        pass: allTasks.length > 0,
        reason:
          allTasks.length > 0
            ? `${allTasks.length} tasks registered`
            : "No tasks registered (run: apex task create)",
      });

      // S7: Status approved in frontmatter
      const pFm = pArtifact ? parseFrontmatter(pArtifact) : {};
      const pApproved = pFm.status === "approved";
      items.push({
        id: "S7",
        pass: pApproved,
        reason: pApproved
          ? "Status: approved"
          : `Status: ${pFm.status || "missing"} (needs approved)`,
      });

      break;
    }
    case "execute": {
      // S1: All tasks done
      if (allTasks.length === 0) {
        items.push({
          id: "S1",
          pass: false,
          reason: "No tasks registered — create tasks first (apex task create)",
        });
      } else {
        const nonDone = allTasks.filter(
          (t) => t.status !== "done" && t.status !== "blocked",
        );
        const allDone = nonDone.length === 0;
        items.push({
          id: "S1",
          pass: allDone,
          reason: allDone
            ? `All ${allTasks.length} tasks done`
            : `${nonDone.length} task(s) not done: ${nonDone.map((t) => t.id).join(", ")}`,
        });
      }

      // S2: Test files exist — check plan artifact for test paths
      const planArtifacts = state.artifacts.plan ?? [];
      const planPath = planArtifacts[0];
      if (planPath && existsSync(planPath)) {
        // Look for .test. or .spec. files mentioned in the plan
        try {
          const planContent = readFileSync(planPath, "utf-8");
          const testFileMatches =
            planContent.match(/[\w/.-]+\.(?:test|spec)\.\w+/g) || [];
          const uniqueTestFiles = [...new Set(testFileMatches)];
          if (uniqueTestFiles.length > 0) {
            const missing = uniqueTestFiles.filter((f) => !existsSync(f));
            const allExist = missing.length === 0;
            items.push({
              id: "S2",
              pass: allExist,
              reason: allExist
                ? `${uniqueTestFiles.length} test file(s) exist`
                : `Missing test files: ${missing.join(", ")}`,
            });
          } else {
            items.push({
              id: "S2",
              pass: true,
              reason: "No test file paths found in plan — check skipped",
            });
          }
        } catch {
          items.push({
            id: "S2",
            pass: true,
            reason: "Could not read plan — check skipped",
          });
        }
      } else {
        items.push({
          id: "S2",
          pass: true,
          reason: "No plan artifact — check skipped",
        });
      }

      // S3: Execution log exists
      const execArtifacts = stageArtifacts;
      let hasExecLog = false;
      if (execArtifacts.length > 0) {
        hasExecLog = execArtifacts.some((a) => existsSync(a));
      }
      // Also check for any execution log in docs/execution/
      if (!hasExecLog) {
        try {
          const files = await readdir("docs/execution");
          hasExecLog = files.some((f) => f.toString().endsWith(".md"));
        } catch {
          /* dir doesn't exist */
        }
      }
      items.push({
        id: "S3",
        pass: hasExecLog,
        reason: hasExecLog
          ? "Execution log exists"
          : "No execution log found (docs/execution/{name}-log.md)",
      });

      break;
    }
    case "review": {
      // S1: Artifact file exists
      const rArtifact = stageArtifacts[stageArtifacts.length - 1];
      const rFileExists = rArtifact ? existsSync(rArtifact) : false;
      items.push({
        id: "S1",
        pass: rFileExists,
        reason: rFileExists
          ? `File exists: ${rArtifact}`
          : "Review artifact file not found",
      });

      // S2: Artifact registered in state
      items.push({
        id: "S2",
        pass: hasArtifact,
        reason: hasArtifact
          ? "Artifact registered"
          : "No review artifact registered",
      });

      // S3: Security reviewer section
      const rHasSecurity = rArtifact
        ? hasSection(rArtifact, /##?\s+security/i)
        : false;
      items.push({
        id: "S3",
        pass: rHasSecurity,
        reason: rHasSecurity
          ? "Security section found"
          : "No Security Reviewer section",
      });

      // S4: Correctness reviewer section
      const rHasCorrectness = rArtifact
        ? hasSection(rArtifact, /##?\s+correctness/i)
        : false;
      items.push({
        id: "S4",
        pass: rHasCorrectness,
        reason: rHasCorrectness
          ? "Correctness section found"
          : "No Correctness Reviewer section",
      });

      // S5: Spec compliance reviewer section
      const rHasSpec = rArtifact
        ? hasSection(rArtifact, /##?\s+(spec\b|specification)\s*(compliance)?/i)
        : false;
      items.push({
        id: "S5",
        pass: rHasSpec,
        reason: rHasSpec
          ? "Spec Compliance section found"
          : "No Spec Compliance Reviewer section",
      });

      // S6: Adversarial reviewer section
      const rHasAdversarial = rArtifact
        ? hasSection(rArtifact, /##?\s+adversarial/i)
        : false;
      items.push({
        id: "S6",
        pass: rHasAdversarial,
        reason: rHasAdversarial
          ? "Adversarial section found"
          : "No Adversarial Reviewer section",
      });

      // S7: Status field is DONE or DONE_WITH_CONCERNS
      const rFm = rArtifact ? parseFrontmatter(rArtifact) : {};
      const rStatusOk =
        rFm.status === "DONE" || rFm.status === "DONE_WITH_CONCERNS";
      items.push({
        id: "S7",
        pass: rStatusOk,
        reason: rStatusOk
          ? `Status: ${rFm.status}`
          : `Status: ${rFm.status || "missing"} (needs DONE or DONE_WITH_CONCERNS)`,
      });

      // S8: No unresolved P0
      let rHasP0 = false;
      if (rArtifact && existsSync(rArtifact)) {
        try {
          const rContent = readFileSync(rArtifact, "utf-8");
          // Check for P0 that is NOT resolved/fixed
          const p0Lines = rContent.split("\n").filter((l) => /\bP0\b/i.test(l));
          rHasP0 = p0Lines.some(
            (l) => !/\b(resolved|fixed|closed|done)\b/i.test(l),
          );
        } catch {
          /* ignore */
        }
      }
      items.push({
        id: "S8",
        pass: !rHasP0,
        reason: !rHasP0
          ? "No unresolved P0 findings"
          : "Unresolved P0 finding detected — must fix before shipping",
      });

      // S9: No unresolved P2 (all must be resolved or converted to task)
      // This is a softer check — P2s should be addressed but won't block in programmatic gate.
      // Left to SubAgent substance check for nuanced evaluation.

      // CQ3: Each persona section must have substantive content (> 50 chars)
      const rPersonas = [
        "Security",
        "Correctness",
        "Spec Compliance",
        "Adversarial",
      ];
      const rShallow: string[] = [];
      if (rArtifact && existsSync(rArtifact)) {
        try {
          const rContentCQ = readFileSync(rArtifact, "utf-8");
          for (const p of rPersonas) {
            const re = new RegExp(
              `##?\\s+${p}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##|$)`,
              "i",
            );
            const m = rContentCQ.match(re);
            const body = m ? m[1].trim() : "";
            if (body.length < 50) rShallow.push(p);
          }
        } catch {
          /* ignore */
        }
      }
      items.push({
        id: "CQ3",
        pass: rShallow.length === 0,
        reason:
          rShallow.length === 0
            ? "All persona sections have substantive content (> 50 chars)"
            : `Shallow sections (< 50 chars): ${rShallow.join(", ")}. Add specific findings with file:line evidence.`,
      });

      // ADV2: Adversarial verification file (Tier 2+ only)
      // Determine scope from the brainstorm artifact in this pipeline
      const bArts = state.artifacts.brainstorm ?? [];
      const latestB = bArts.filter((a: string) => a.endsWith(".md")).pop();
      const bScope = latestB ? parseFrontmatter(latestB) : {};
      const rIsLightweight = bScope.scope?.toLowerCase() === "lightweight";
      if (rIsLightweight) {
        items.push({
          id: "ADV2",
          pass: true,
          reason: "Lightweight scope — adversarial verification skipped",
        });
      } else {
        const rAdvFile = join(
          ".apex",
          "verifications",
          "review-adversarial.md",
        );
        const rAdvExists = existsSync(rAdvFile);
        items.push({
          id: "ADV2",
          pass: rAdvExists,
          reason: rAdvExists
            ? "Adversarial verification file exists"
            : `BLOCKED: Spawn a sub-agent to verify this review. Prompt: "Read ${rArtifact}. For each persona section, verify the findings are real (check file:line references). Identify any risks the review missed. Write findings to ${rAdvFile}."`,
        });
      }

      break;
    }
    case "ship": {
      // S1: Review artifact exists in state
      const reviewArtifacts = state.artifacts.review ?? [];
      const hasReview = reviewArtifacts.length > 0;
      items.push({
        id: "S1",
        pass: hasReview,
        reason: hasReview
          ? "Review artifact confirmed"
          : "No review artifact — complete Review first",
      });

      // S2: Git commit exists (at least one commit in the repo)
      let hasCommit = false;
      try {
        const gitLog = execSync("git log -1 --oneline", {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        hasCommit = gitLog.length > 0;
      } catch {
        /* no git or no commits */
      }
      items.push({
        id: "S2",
        pass: hasCommit,
        reason: hasCommit
          ? "Git commit exists"
          : "No git commit found — commit your changes first",
      });

      // S3: Compound transition announced (checkpoint)
      const checkpoints = state.ship_checkpoints ?? [];
      const hasCompoundTransition = checkpoints.includes("compound-transition");
      items.push({
        id: "S3",
        pass: hasCompoundTransition,
        reason: hasCompoundTransition
          ? "Compound transition announced"
          : "Compound transition not announced (run: apex ship checkpoint compound-transition)",
      });

      // S4 (preflight scan) and S5 (CI green) intentionally omitted from programmatic gate —
      // they depend on external tools (opensource-preflight, gh CLI) that may not be available.
      // These are checked by the SubAgent-based substance gate in ship.md instead.

      // S6: README.md exists in repo root
      const hasReadme = existsSync("README.md");
      items.push({
        id: "S6",
        pass: hasReadme,
        reason: hasReadme
          ? "README.md exists"
          : "README.md not found in repo root",
      });

      // S7: Push prompt was issued (checkpoint)
      const hasPushPrompt = checkpoints.includes("push-prompt");
      items.push({
        id: "S7",
        pass: hasPushPrompt,
        reason: hasPushPrompt
          ? "Push prompt issued"
          : "Push prompt not issued (run: apex ship checkpoint push-prompt)",
      });

      // S8: Iteration summary was issued (checkpoint)
      const hasIterationSummary = checkpoints.includes("iteration-summary");
      items.push({
        id: "S8",
        pass: hasIterationSummary,
        reason: hasIterationSummary
          ? "Iteration summary issued"
          : "Iteration summary not issued (run: apex ship checkpoint iteration-summary)",
      });

      break;
    }
    case "compound": {
      // S1: Solution doc exists (this iteration)
      let hasSolution = false;
      try {
        const files = await readdir("docs/solutions", { recursive: true });
        hasSolution = files.some((f) => f.toString().endsWith(".md"));
      } catch {
        /* dir doesn't exist */
      }
      items.push({
        id: "S1",
        pass: hasSolution,
        reason: hasSolution
          ? "Solution doc exists"
          : "No solution doc found (docs/solutions/{category}/{name}.md)",
      });

      // S2: Root Cause / Problem section
      const cArtifacts = stageArtifacts;
      const cArtifact = cArtifacts[0];
      const cHasRootCause = cArtifact
        ? hasSection(cArtifact, /##?\s+(root\s+cause|problem|根因)/i)
        : false;
      items.push({
        id: "S2",
        pass: cHasRootCause,
        reason: cHasRootCause
          ? "Root Cause section found"
          : "No Root Cause/Problem section in solution doc",
      });

      // S3: Prevention section
      const cHasPrevention = cArtifact
        ? hasSection(cArtifact, /##?\s+(prevention|预防|防止)/i)
        : false;
      items.push({
        id: "S3",
        pass: cHasPrevention,
        reason: cHasPrevention
          ? "Prevention section found"
          : "No Prevention section in solution doc",
      });

      // S4: Roadmap snapshot exists
      let hasRoadmap = false;
      try {
        const files = await readdir("docs/roadmaps");
        hasRoadmap = files.some((f) => f.toString().endsWith(".md"));
      } catch {
        /* dir doesn't exist */
      }
      items.push({
        id: "S4",
        pass: hasRoadmap,
        reason: hasRoadmap
          ? "Roadmap snapshot exists"
          : "No roadmap snapshot found (docs/roadmaps/roadmap-*.md)",
      });

      // S5: Memory entry written this session
      let hasMemory = false;
      try {
        const memStore = await readJSON<{ facts: Array<{ id: string }> }>(
          ".apex/memory.json",
          { facts: [] },
        );
        hasMemory = memStore.facts.length > 0;
      } catch {
        /* ignore */
      }
      items.push({
        id: "S5",
        pass: hasMemory,
        reason: hasMemory
          ? "Memory entries exist"
          : "No memory entries — write at least 1 learning (apex memory add)",
      });

      // S6: Re-entry prompt was issued (checkpoint)
      const cCheckpoints = state.compound_checkpoints ?? [];
      const hasReentry = cCheckpoints.includes("re-entry-prompt");
      items.push({
        id: "S6",
        pass: hasReentry,
        reason: hasReentry
          ? "Re-entry prompt issued"
          : "Re-entry prompt not issued (run: apex compound checkpoint re-entry-prompt)",
      });

      break;
    }
    default: {
      if (stage.startsWith("orchestrate:")) {
        // Orchestration stages: check artifact registered
        items.push({
          id: "S1",
          pass: hasArtifact,
          reason: hasArtifact
            ? "Artifact registered"
            : "No artifact registered for orchestration stage",
        });
        const subStage = stage.slice("orchestrate:".length);
        // For brainstorm/plan sub-stages, also check file exists
        if (
          (subStage === "brainstorm" || subStage === "plan") &&
          stageArtifacts[0]
        ) {
          const fileExists = existsSync(stageArtifacts[0]);
          items.push({
            id: "S2",
            pass: fileExists,
            reason: fileExists
              ? `File exists: ${stageArtifacts[0]}`
              : "Artifact file not found on disk",
          });
        }
      } else {
        // Unknown stage — pass through (no gate defined)
        items.push({
          id: "S0",
          pass: true,
          reason: `No structural gate defined for stage: ${stage}`,
        });
      }
    }
  }

  const pass = items.every((i) => i.pass);
  return { pass, items };
}

/**
 * Mark the current history entry for a stage as completed.
 * Runs structural gate checks first — refuses if any check fails.
 */
export async function completeStage(
  stage: string,
  skipGate = false,
): Promise<StageState> {
  if (!skipGate) {
    const gate = await runStructuralGate(stage);
    if (!gate.pass) {
      const failed = gate.items.filter((i) => !i.pass);
      const msg = failed.map((i) => `  ${i.id}: FAIL — ${i.reason}`).join("\n");
      throw new Error(
        `Stage gate BLOCKED for '${stage}':\n${msg}\n\nFix the issues above, then retry.`,
      );
    }
  }
  appendEvent("state", "stage.completed", { stage });
  await rebuildAndCache("state");
  return loadState();
}

/**
 * Add an artifact path to a stage's list. No duplicates.
 */
export async function addArtifact(
  stage: string,
  path: string,
): Promise<StageState> {
  appendEvent("state", "artifact.added", { stage, path });
  await rebuildAndCache("state");
  return loadState();
}

/**
 * Get artifact paths for a given stage.
 */
export async function getArtifacts(stage: string): Promise<string[]> {
  const state = await loadState();
  return state.artifacts[stage] ?? [];
}

/**
 * Format a human-readable status summary (same format as `apex status`).
 */
export async function statusSummary(): Promise<string> {
  const state = await loadState();

  const totalArtifacts = Object.values(state.artifacts).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );
  const completedStages = state.history.filter((h) => h.completed).length;

  const lines = [
    `Session: ${state.session_id}`,
    `Stage: ${state.current_stage}`,
    `Updated: ${state.last_updated}`,
    `Artifacts: ${totalArtifacts} total`,
    `History: ${completedStages} stages completed, ${state.history.length} total entries`,
  ];

  return lines.join("\n");
}

/**
 * Return the full state as a plain object (for session-start hook injection).
 */
export async function statusJSON(): Promise<object> {
  return loadState();
}

// ---------------------------------------------------------------------------
// Ship Checkpoints
// ---------------------------------------------------------------------------

/** Valid checkpoint names for the Ship stage. */
const VALID_SHIP_CHECKPOINTS = [
  "iteration-summary", // S8: Step 6a iteration summary was output
  "push-prompt", // S7: Step 6b push prompt was issued via AskUserQuestion
  "compound-transition", // S3: Compound transition message was output
] as const;

export type ShipCheckpointName = (typeof VALID_SHIP_CHECKPOINTS)[number];

/**
 * Record a Ship stage checkpoint event.
 * The structural gate checks for these to verify conversation-flow steps happened.
 */
export async function addShipCheckpoint(name: string): Promise<StageState> {
  if (!VALID_SHIP_CHECKPOINTS.includes(name as ShipCheckpointName)) {
    throw new Error(
      `Invalid ship checkpoint: "${name}". Valid: ${VALID_SHIP_CHECKPOINTS.join(", ")}`,
    );
  }

  appendEvent("state", "ship.checkpoint", { name });
  await rebuildAndCache("state");
  return loadState();
}

// ---------------------------------------------------------------------------
// Compound Checkpoints
// ---------------------------------------------------------------------------

const VALID_COMPOUND_CHECKPOINTS = [
  "re-entry-prompt", // S6: The 3-option re-entry AskUserQuestion was called
] as const;

export type CompoundCheckpointName =
  (typeof VALID_COMPOUND_CHECKPOINTS)[number];

/**
 * Record a Compound stage checkpoint event.
 */
export async function addCompoundCheckpoint(name: string): Promise<StageState> {
  if (!VALID_COMPOUND_CHECKPOINTS.includes(name as CompoundCheckpointName)) {
    throw new Error(
      `Invalid compound checkpoint: "${name}". Valid: ${VALID_COMPOUND_CHECKPOINTS.join(", ")}`,
    );
  }

  appendEvent("state", "compound.checkpoint", { name });
  await rebuildAndCache("state");
  return loadState();
}

// ---------------------------------------------------------------------------
// Skill Invocation Trace
// ---------------------------------------------------------------------------

const ANALYTICS_FILE = ".apex/analytics/usage.jsonl";

/**
 * Record a skill invocation trace into state.json and simultaneously
 * write a telemetry record to .apex/analytics/usage.jsonl.
 */
export async function addSkillInvocation(
  stage: string,
  skill: string,
  version: string,
  outputStatus: string,
  afMapping: string,
): Promise<StageState> {
  const now = isoTimestamp();

  appendEvent("state", "skill.invoked", {
    stage,
    skill,
    version,
    output_status: outputStatus,
    af_mapping: afMapping,
  });

  await rebuildAndCache("state");

  // Auto-write telemetry record
  appendJSONL(ANALYTICS_FILE, {
    skill,
    duration_s: 0,
    outcome: outputStatus,
    ts: now,
  });

  return loadState();
}
