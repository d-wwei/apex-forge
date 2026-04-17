/**
 * Apex Forge — Audit Module
 *
 * Pipeline execution quality audit with 3-layer cross-verification.
 * Checks process integrity, artifact content quality, and cross-verifies
 * agent self-reported data against unforgeable sources (git, tests, timestamps).
 *
 * Read-only: does NOT modify .apex/, git, or artifact files.
 *
 * Usage: apex audit [--session ID] [--json] [--no-test] [--all]
 */

import { existsSync, readFileSync } from "fs";
import { execFileSync, execSync } from "child_process";
import { readEvents, materializePerSession } from "../state/event-log.js";
import type { StageHistory } from "../types/state.js";
import type { DomainEvent } from "../state/event-log.js";

// ─── Types ──────────────────────────────────────────────────────────

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Verdict = "PASS" | "WARN" | "FAIL" | "SKIP";

interface Check {
  id: string;
  category: string;
  description: string;
  severity: Severity;
  verdict: Verdict;
  detail: string;
}

interface CategoryScore {
  category: string;
  total: number;
  pass: number;
  warn: number;
  fail: number;
  skip: number;
  score: number;
}

interface PipelineSlice {
  sessionId: string;
  history: StageHistory[];
  artifacts: Record<string, string[]>;
  shipCheckpoints: string[];
  skillInvocations: Array<{ stage: string; skill: string }>;
  /** Pre-loaded events for this session (avoids re-reading from disk) */
  sessionEvents: DomainEvent[];
}

// ─── Constants ──────────────────────────────────────────────────────

const WEIGHT: Record<Severity, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0.5,
};

const ALL_STAGES = ["brainstorm", "plan", "execute", "review", "ship", "compound"];

const MIN_STAGE_DURATION_MS: Record<string, number> = {
  brainstorm: 2 * 60 * 1000,
  plan: 2 * 60 * 1000,
  execute: 5 * 60 * 1000,
  review: 3 * 60 * 1000,
  ship: 1 * 60 * 1000,
  compound: 1 * 60 * 1000,
};

const LAYER_WEIGHTS = { process: 0.3, content: 0.2, verified: 0.5 };

const ICONS: Record<Verdict, string> = {
  PASS: "\u2713",
  WARN: "\u26a0",
  FAIL: "\u2717",
  SKIP: "\u2500",
};

// ─── Frontmatter parser (local copy — avoids circular import from state.ts)

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
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        fm[key] = val;
      }
    }
    return fm;
  } catch { return {}; }
}

// ─── Git helpers (P0-1 fix: execFileSync, no shell) ─────────────────

function gitArgs(...args: string[]): string {
  try {
    return execFileSync("git", args, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10000,
    }).trim();
  } catch {
    return "";
  }
}

// ─── Session event extraction (shared helper — P1-4 fix) ────────────

function extractSessionExtras(sessionEvents: DomainEvent[]): {
  shipCheckpoints: string[];
  skillInvocations: Array<{ stage: string; skill: string }>;
} {
  const shipCheckpoints: string[] = [];
  const skillInvocations: Array<{ stage: string; skill: string }> = [];
  for (const evt of sessionEvents) {
    if (evt.type === "ship.checkpoint") {
      const name = evt.payload.name as string;
      if (!shipCheckpoints.includes(name)) shipCheckpoints.push(name);
    }
    if (evt.type === "skill.invoked") {
      skillInvocations.push({
        stage: evt.payload.stage as string,
        skill: evt.payload.skill as string,
      });
    }
  }
  return { shipCheckpoints, skillInvocations };
}

// ─── Pipeline resolution (P0-2 fix: events read once, passed in) ────

function findPipeline(
  events: DomainEvent[],
  targetSession?: string
): PipelineSlice | null {
  if (events.length === 0) return null;

  const pipelines = materializePerSession(events);
  if (pipelines.length === 0) return null;

  const match = targetSession
    ? pipelines.find((p) => p.session_id === targetSession)
    : pipelines[0];

  if (!match) return null;

  const sessionEvents = events.filter((e) => e.session_id === match.session_id);
  const { shipCheckpoints, skillInvocations } = extractSessionExtras(sessionEvents);

  return {
    sessionId: match.session_id,
    history: match.history,
    artifacts: match.artifacts,
    shipCheckpoints,
    skillInvocations,
    sessionEvents,
  };
}

// ─── Layer 1: Process Integrity ─────────────────────────────────────

function checkLayer1(pipeline: PipelineSlice): Check[] {
  const checks: Check[] = [];
  const { history, shipCheckpoints, skillInvocations, sessionEvents } = pipeline;

  // L1-stages: All 6 stages present
  const stagesPresent = ALL_STAGES.filter((s) =>
    history.some((h) => h.stage === s)
  );
  const missing = ALL_STAGES.filter((s) => !stagesPresent.includes(s));
  checks.push({
    id: "L1-stages",
    category: "Process",
    description: "All 6 pipeline stages present",
    severity: "CRITICAL",
    verdict: missing.length === 0 ? "PASS" : "FAIL",
    detail:
      missing.length === 0
        ? `All stages: ${stagesPresent.join(", ")}`
        : `Missing: ${missing.join(", ")}`,
  });

  // L1-gates: Each stage completed via gate (not transition)
  const transitioned: string[] = [];
  for (const h of history) {
    if (h.completed_via === "transition" && ALL_STAGES.includes(h.stage)) {
      transitioned.push(h.stage);
    }
  }
  checks.push({
    id: "L1-gates",
    category: "Process",
    description: "All stages completed via gate",
    severity: "HIGH",
    verdict: transitioned.length === 0 ? "PASS" : "WARN",
    detail:
      transitioned.length === 0
        ? "All stages completed via gate"
        : `Bypassed gate (transition): ${transitioned.join(", ")}`,
  });

  // L1-ship-cp: Ship checkpoints present
  const requiredCps = ["iteration-summary", "push-prompt", "compound-transition"];
  const missingCps = requiredCps.filter((cp) => !shipCheckpoints.includes(cp));
  checks.push({
    id: "L1-ship-cp",
    category: "Process",
    description: "Ship checkpoints complete",
    severity: "HIGH",
    verdict: missingCps.length === 0 ? "PASS" : "FAIL",
    detail:
      missingCps.length === 0
        ? `${shipCheckpoints.length}/${requiredCps.length} checkpoints`
        : `Missing: ${missingCps.join(", ")}`,
  });

  // L1-review-skill: thorough-code-review invoked
  const hasReviewSkill = skillInvocations.some(
    (si) => si.skill === "thorough-code-review"
  );
  checks.push({
    id: "L1-review-skill",
    category: "Process",
    description: "thorough-code-review invoked",
    severity: "MEDIUM",
    verdict: hasReviewSkill ? "PASS" : "WARN",
    detail: hasReviewSkill ? "Skill invoked during review" : "Not invoked",
  });

  // L1-skip-gate: No --skip-gate usage (uses pre-loaded sessionEvents — P0-2 fix)
  const hasSkipGate = sessionEvents.some(
    (e) =>
      JSON.stringify(e.payload).includes("skip-gate") ||
      JSON.stringify(e.payload).includes("skip_gate")
  );
  checks.push({
    id: "L1-skip-gate",
    category: "Process",
    description: "No --skip-gate usage",
    severity: "CRITICAL",
    verdict: hasSkipGate ? "FAIL" : "PASS",
    detail: hasSkipGate ? "--skip-gate detected in event log" : "Clean",
  });

  // L1-timeline: Stages are sequential (review before ship commit)
  const reviewCompleted = history
    .filter((h) => h.stage === "review" && h.completed)
    .map((h) => h.completed!)
    .sort()
    .pop();
  const shipStarted = history
    .filter((h) => h.stage === "ship")
    .map((h) => h.started)
    .sort()
    .pop();

  if (reviewCompleted && shipStarted) {
    const reviewOk = reviewCompleted <= shipStarted;
    checks.push({
      id: "L1-timeline",
      category: "Process",
      description: "Review completed before ship",
      severity: "CRITICAL",
      verdict: reviewOk ? "PASS" : "FAIL",
      detail: reviewOk
        ? "Timeline correct"
        : `Review completed ${reviewCompleted}, ship started ${shipStarted}`,
    });
  } else {
    checks.push({
      id: "L1-timeline",
      category: "Process",
      description: "Review completed before ship",
      severity: "CRITICAL",
      verdict: "SKIP",
      detail: "Could not determine review/ship timestamps",
    });
  }

  return checks;
}

// ─── Layer 2: Artifact Content Quality ──────────────────────────────

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function extractSection(content: string, heading: RegExp): string {
  const lines = content.split("\n");
  let inSection = false;
  const sectionLines: string[] = [];
  for (const line of lines) {
    if (heading.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,3}\s/.test(line)) break;
    if (inSection) sectionLines.push(line);
  }
  return sectionLines.join("\n").trim();
}

function checkLayer2(pipeline: PipelineSlice): Check[] {
  const checks: Check[] = [];
  const { artifacts } = pipeline;

  // Brainstorm artifact
  const brainstormPaths = (artifacts.brainstorm || []).filter(
    (p) => p.endsWith("-requirements.md") && existsSync(p)
  );
  if (brainstormPaths.length > 0) {
    const content = readFileSync(brainstormPaths[0], "utf-8");
    const acSection = extractSection(content, /^#+\s*Acceptance\s*Criteria/i);
    const acLines = acSection
      .split("\n")
      .filter((l) => /^\d+\.|^-\s/.test(l.trim()));
    const acCount = acLines.length;
    const shortAcs = acLines.filter((l) => countWords(l) < 20);

    checks.push({
      id: "L2-bs-ac-count",
      category: "Content",
      description: "Brainstorm: AC count",
      severity: "MEDIUM",
      verdict: acCount >= 3 ? "PASS" : "WARN",
      detail: `${acCount} ACs found${acCount < 3 ? " (< 3)" : ""}`,
    });

    checks.push({
      id: "L2-bs-ac-depth",
      category: "Content",
      description: "Brainstorm: AC depth (> 20 words each)",
      severity: "LOW",
      verdict: shortAcs.length === 0 ? "PASS" : "WARN",
      detail:
        shortAcs.length === 0
          ? "All ACs > 20 words"
          : `${shortAcs.length} ACs < 20 words (possible placeholders)`,
    });

    const constraints = extractSection(content, /^#+\s*Constraints/i);
    checks.push({
      id: "L2-bs-constraints",
      category: "Content",
      description: "Brainstorm: Constraints section non-empty",
      severity: "LOW",
      verdict: constraints.length > 0 ? "PASS" : "WARN",
      detail: constraints.length > 0 ? `${countWords(constraints)} words` : "Empty",
    });
  } else {
    checks.push({
      id: "L2-bs-missing",
      category: "Content",
      description: "Brainstorm artifact exists",
      severity: "MEDIUM",
      verdict: "SKIP",
      detail: "No brainstorm artifact found on disk",
    });
  }

  // Plan artifact
  const planPaths = (artifacts.plan || []).filter(
    (p) => p.endsWith("-plan.md") && existsSync(p)
  );
  if (planPaths.length > 0) {
    const content = readFileSync(planPaths[0], "utf-8");
    const taskLines = content
      .split("\n")
      .filter((l) => /^###?\s*T\d+/i.test(l.trim()));

    checks.push({
      id: "L2-plan-tasks",
      category: "Content",
      description: "Plan: task count",
      severity: "MEDIUM",
      verdict: taskLines.length >= 2 ? "PASS" : "WARN",
      detail: `${taskLines.length} tasks${taskLines.length < 2 ? " (< 2)" : ""}`,
    });
  } else {
    checks.push({
      id: "L2-plan-missing",
      category: "Content",
      description: "Plan artifact exists",
      severity: "MEDIUM",
      verdict: "SKIP",
      detail: "No plan artifact found on disk",
    });
  }

  // Review artifact
  const reviewPaths = (artifacts.review || []).filter(
    (p) => p.endsWith("-review.md") && existsSync(p)
  );
  if (reviewPaths.length > 0) {
    const content = readFileSync(reviewPaths[0], "utf-8");
    const personaSections = content
      .split("\n")
      .filter((l) => /^#{2,3}\s*(Persona|Reviewer|审查)/i.test(l));
    const totalWords = countWords(content);
    const fileRefs = content.match(
      /[a-zA-Z0-9_\-/.]+\.(ts|js|tsx|jsx|py|go|rs|md)/g
    );

    checks.push({
      id: "L2-review-depth",
      category: "Content",
      description: "Review: substantive content",
      severity: "HIGH",
      verdict: totalWords > 200 ? "PASS" : "WARN",
      detail: `${totalWords} words, ${personaSections.length} persona sections${totalWords < 200 ? " (shallow)" : ""}`,
    });

    checks.push({
      id: "L2-review-refs",
      category: "Content",
      description: "Review: file/code references",
      severity: "MEDIUM",
      verdict: fileRefs && fileRefs.length > 0 ? "PASS" : "WARN",
      detail:
        fileRefs && fileRefs.length > 0
          ? `${fileRefs.length} file references`
          : "No file references (may not have read code)",
    });
  } else {
    checks.push({
      id: "L2-review-missing",
      category: "Content",
      description: "Review artifact exists",
      severity: "HIGH",
      verdict: "SKIP",
      detail: "No review artifact found on disk",
    });
  }

  // Ship artifact (P1-2 fix: check ship summary)
  const shipPaths = (artifacts.ship || []).filter(
    (p) => typeof p === "string" && p.endsWith(".md") && existsSync(p)
  );
  if (shipPaths.length > 0) {
    const content = readFileSync(shipPaths[0], "utf-8");
    const sections = ["改了什么", "为什么", "怎么试", "已知"].filter((s) =>
      content.includes(s)
    );
    checks.push({
      id: "L2-ship-summary",
      category: "Content",
      description: "Ship: iteration summary sections",
      severity: "MEDIUM",
      verdict: sections.length >= 3 ? "PASS" : "WARN",
      detail: `${sections.length}/4 sections present`,
    });
  }

  // Compound artifact (P1-2 fix: check root cause depth)
  const compoundPaths = (artifacts.compound || []).filter(
    (p) => typeof p === "string" && p.endsWith(".md") && existsSync(p)
  );
  if (compoundPaths.length > 0) {
    const content = readFileSync(compoundPaths[0], "utf-8");
    const rootCause = extractSection(content, /^#+\s*(Root\s*Cause|根因)/i);
    checks.push({
      id: "L2-compound-depth",
      category: "Content",
      description: "Compound: Root Cause depth",
      severity: "MEDIUM",
      verdict: countWords(rootCause) > 30 ? "PASS" : "WARN",
      detail: `${countWords(rootCause)} words${countWords(rootCause) < 30 ? " (< 30)" : ""}`,
    });
  }

  return checks;
}

// ─── Layer 3: Cross-Verification ────────────────────────────────────

function checkLayer3(pipeline: PipelineSlice, runTests: boolean): Check[] {
  const checks: Check[] = [];
  const { artifacts, history } = pipeline;

  // 3a: Plan vs Git Diff
  const planPaths = (artifacts.plan || []).filter(
    (p) => p.endsWith("-plan.md") && existsSync(p)
  );
  const shipCommits = (artifacts.ship || []).filter((a) =>
    /^[0-9a-f]{7,40}$/.test(a)
  );

  if (planPaths.length > 0 && shipCommits.length > 0) {
    const planContent = readFileSync(planPaths[0], "utf-8");
    const plannedFiles =
      planContent
        .match(/`([a-zA-Z0-9_\-/.]+\.(ts|js|tsx|jsx|py|go|rs))`/g)
        ?.map((m) => m.replace(/`/g, "")) || [];

    const firstCommit = shipCommits[0];
    // P0-1 fix: use execFileSync instead of shell string
    const diffFiles = gitArgs("diff", "--name-only", `${firstCommit}~1`, firstCommit)
      .split("\n")
      .filter(Boolean);

    if (plannedFiles.length > 0 && diffFiles.length > 0) {
      const hits = plannedFiles.filter((f) =>
        diffFiles.some((d) => d.includes(f) || f.includes(d))
      );
      const hitRate = hits.length / plannedFiles.length;
      checks.push({
        id: "L3-plan-diff",
        category: "Verified",
        description: "Plan vs Git Diff alignment",
        severity: "HIGH",
        verdict: hitRate >= 0.5 ? "PASS" : "WARN",
        detail: `${hits.length}/${plannedFiles.length} planned files in diff (${Math.round(hitRate * 100)}%)`,
      });
    } else {
      checks.push({
        id: "L3-plan-diff",
        category: "Verified",
        description: "Plan vs Git Diff alignment",
        severity: "HIGH",
        verdict: "SKIP",
        detail: "Could not extract planned files or diff",
      });
    }
  } else {
    checks.push({
      id: "L3-plan-diff",
      category: "Verified",
      description: "Plan vs Git Diff alignment",
      severity: "HIGH",
      verdict: "SKIP",
      detail: "No plan artifact or ship commits found",
    });
  }

  // 3b: AC vs Code — keywords from ACs grepped in diff (P2-1 fix: hoist diff)
  const brainstormPaths = (artifacts.brainstorm || []).filter(
    (p) => p.endsWith("-requirements.md") && existsSync(p)
  );
  if (brainstormPaths.length > 0 && shipCommits.length > 0) {
    const content = readFileSync(brainstormPaths[0], "utf-8");
    const acSection = extractSection(content, /^#+\s*Acceptance\s*Criteria/i);
    const acLines = acSection
      .split("\n")
      .filter((l) => /^\d+\.|^-\s/.test(l.trim()));

    const stopwords = new Set([
      "the", "and", "that", "this", "with", "from", "should", "must", "when",
      "then", "given", "have", "been", "will", "each", "after", "before",
      "into", "more", "than", "also", "only", "does", "make", "about",
    ]);

    // Fetch diff once, not per-AC (P2-1 fix)
    const firstCommit = shipCommits[0];
    const diff = gitArgs("diff", `${firstCommit}~1`, firstCommit).toLowerCase();

    let totalAc = 0;
    let foundAc = 0;
    for (const acLine of acLines) {
      totalAc++;
      const words = acLine
        .replace(/[^a-zA-Z\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 4 && !stopwords.has(w.toLowerCase()))
        .map((w) => w.toLowerCase());
      const unique = [...new Set(words)].slice(0, 5);
      if (unique.length === 0) continue;

      if (unique.some((kw) => diff.includes(kw))) foundAc++;
    }

    if (totalAc > 0) {
      const rate = foundAc / totalAc;
      checks.push({
        id: "L3-ac-code",
        category: "Verified",
        description: "AC vs Code alignment",
        severity: "HIGH",
        verdict: rate >= 0.5 ? "PASS" : "WARN",
        detail: `${foundAc}/${totalAc} ACs have keywords in diff (${Math.round(rate * 100)}%)`,
      });
    }
  } else {
    checks.push({
      id: "L3-ac-code",
      category: "Verified",
      description: "AC vs Code alignment",
      severity: "HIGH",
      verdict: "SKIP",
      detail: "No brainstorm artifact or ship commits",
    });
  }

  // 3c: Review vs Diff
  const reviewPaths = (artifacts.review || []).filter(
    (p) => p.endsWith("-review.md") && existsSync(p)
  );
  if (reviewPaths.length > 0 && shipCommits.length > 0) {
    const content = readFileSync(reviewPaths[0], "utf-8");
    const fileRefs =
      content.match(/[a-zA-Z0-9_\-/.]+\.(ts|js|tsx|jsx|py|go|rs)/g) || [];
    const firstCommit = shipCommits[0];
    const diffFiles = gitArgs("diff", "--name-only", `${firstCommit}~1`, firstCommit)
      .split("\n")
      .filter(Boolean);

    if (fileRefs.length > 0 && diffFiles.length > 0) {
      const valid = fileRefs.filter((ref) =>
        diffFiles.some((d) => d.includes(ref) || ref.includes(d))
      );
      const rate = valid.length / fileRefs.length;
      checks.push({
        id: "L3-review-diff",
        category: "Verified",
        description: "Review vs Diff alignment",
        severity: "MEDIUM",
        verdict: rate >= 0.5 ? "PASS" : "WARN",
        detail: `${valid.length}/${fileRefs.length} review refs in diff (${Math.round(rate * 100)}%)`,
      });
    } else {
      checks.push({
        id: "L3-review-diff",
        category: "Verified",
        description: "Review vs Diff alignment",
        severity: "MEDIUM",
        verdict: "SKIP",
        detail: "No file refs in review or no diff available",
      });
    }
  } else {
    checks.push({
      id: "L3-review-diff",
      category: "Verified",
      description: "Review vs Diff alignment",
      severity: "MEDIUM",
      verdict: "SKIP",
      detail: "No review artifact or ship commits",
    });
  }

  // 3d: Test verification
  if (runTests) {
    try {
      execSync("bun test 2>&1", {
        encoding: "utf-8",
        timeout: 60000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      checks.push({
        id: "L3-tests",
        category: "Verified",
        description: "Tests pass",
        severity: "CRITICAL",
        verdict: "PASS",
        detail: "bun test passed",
      });
    } catch {
      checks.push({
        id: "L3-tests",
        category: "Verified",
        description: "Tests pass",
        severity: "CRITICAL",
        verdict: "FAIL",
        detail: "bun test failed",
      });
    }
  } else {
    checks.push({
      id: "L3-tests",
      category: "Verified",
      description: "Tests pass",
      severity: "CRITICAL",
      verdict: "SKIP",
      detail: "Skipped (--no-test)",
    });
  }

  // 3e: Stage duration reasonableness
  for (const h of history) {
    if (!h.completed || !ALL_STAGES.includes(h.stage)) continue;
    const durationMs =
      new Date(h.completed).getTime() - new Date(h.started).getTime();
    const minMs = MIN_STAGE_DURATION_MS[h.stage] || 0;
    if (durationMs < minMs) {
      checks.push({
        id: `L3-duration-${h.stage}`,
        category: "Verified",
        description: `${h.stage} duration >= ${minMs / 60000}min`,
        severity: "LOW",
        verdict: "WARN",
        detail: `${Math.round(durationMs / 1000)}s (minimum ${minMs / 60000}min)`,
      });
    }
  }

  return checks;
}

// ─── Scoring ────────────────────────────────────────────────────────

function scoreByCategory(checks: Check[]): CategoryScore[] {
  const categories = new Map<string, Check[]>();
  for (const c of checks) {
    const arr = categories.get(c.category) || [];
    arr.push(c);
    categories.set(c.category, arr);
  }

  const scores: CategoryScore[] = [];
  for (const [category, items] of categories) {
    const scorable = items.filter((c) => c.verdict !== "SKIP");
    const totalWeight = scorable.reduce((sum, c) => sum + WEIGHT[c.severity], 0);
    const passWeight = scorable
      .filter((c) => c.verdict === "PASS")
      .reduce((sum, c) => sum + WEIGHT[c.severity], 0);
    const warnWeight = scorable
      .filter((c) => c.verdict === "WARN")
      .reduce((sum, c) => sum + WEIGHT[c.severity] * 0.5, 0);

    scores.push({
      category,
      total: items.length,
      pass: items.filter((c) => c.verdict === "PASS").length,
      warn: items.filter((c) => c.verdict === "WARN").length,
      fail: items.filter((c) => c.verdict === "FAIL").length,
      skip: items.filter((c) => c.verdict === "SKIP").length,
      score:
        totalWeight > 0
          ? Math.round(((passWeight + warnWeight) / totalWeight) * 100)
          : 100,
    });
  }
  return scores;
}

function computeOverall(scores: CategoryScore[]): number {
  const byName: Record<string, number> = {};
  for (const s of scores) byName[s.category] = s.score;

  return Math.round(
    (byName["Process"] ?? 100) * LAYER_WEIGHTS.process +
    (byName["Content"] ?? 100) * LAYER_WEIGHTS.content +
    (byName["Verified"] ?? 100) * LAYER_WEIGHTS.verified
  );
}

function overallGrade(checks: Check[], scores: CategoryScore[]): string {
  const overall = computeOverall(scores);
  const hasL3Fail = checks.some(
    (c) => c.category === "Verified" && c.verdict === "FAIL"
  );

  let grade: string;
  if (overall >= 90) grade = "A";
  else if (overall >= 75) grade = "B";
  else if (overall >= 60) grade = "C";
  else if (overall >= 40) grade = "D";
  else grade = "F";

  // Layer 3 FAIL caps at C
  if (hasL3Fail && (grade === "A" || grade === "B")) grade = "C";

  return grade;
}

// ─── Output ─────────────────────────────────────────────────────────

function formatReport(
  pipeline: PipelineSlice,
  checks: Check[],
  scores: CategoryScore[],
  grade: string
): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("\u2554" + "\u2550".repeat(50) + "\u2557");
  lines.push(
    "\u2551        APEX FORGE \u2014 PIPELINE AUDIT" +
      " ".repeat(12) +
      "\u2551"
  );
  lines.push(
    `\u2551        Session: ${pipeline.sessionId.slice(0, 30).padEnd(30)}\u2551`
  );
  lines.push("\u255a" + "\u2550".repeat(50) + "\u255d");
  lines.push("");

  let currentCat = "";
  for (const check of checks) {
    if (check.category !== currentCat) {
      currentCat = check.category;
      const label =
        currentCat === "Process"
          ? "Layer 1: Process Integrity"
          : currentCat === "Content"
          ? "Layer 2: Artifact Content"
          : "Layer 3: Cross-Verification";
      lines.push(
        `\u2500\u2500 ${label} ${"\u2500".repeat(Math.max(0, 44 - label.length))}`
      );
    }
    const icon = ICONS[check.verdict];
    lines.push(`  ${icon} ${check.description}`);
    lines.push(`    ${check.detail}`);
  }

  lines.push("");
  lines.push("\u2500\u2500 Score " + "\u2500".repeat(43));
  for (const s of scores) {
    const bar =
      "\u2588".repeat(Math.round(s.score / 5)) +
      "\u2591".repeat(20 - Math.round(s.score / 5));
    const warnings =
      s.warn > 0 ? `  (${s.warn} warning${s.warn > 1 ? "s" : ""})` : "";
    lines.push(
      `  ${s.category.padEnd(14)} ${bar} ${String(s.score).padStart(3)}%${warnings}`
    );
  }

  const overall = computeOverall(scores);
  lines.push("");
  lines.push(`  Overall: Grade ${grade} (${overall}%)`);

  const hasL3Fail = checks.some(
    (c) => c.category === "Verified" && c.verdict === "FAIL"
  );
  if (hasL3Fail) {
    lines.push("  \u26a0 Layer 3 FAIL detected \u2014 grade capped at C");
  }

  const actionable = checks.filter(
    (c) => c.verdict === "FAIL" || c.verdict === "WARN"
  );
  if (actionable.length > 0) {
    lines.push("");
    lines.push("\u2500\u2500 Actions " + "\u2500".repeat(41));
    for (const a of actionable) {
      lines.push(
        `  ${ICONS[a.verdict]} [${a.id}] ${a.description}: ${a.detail}`
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

// ─── --all mode (P1-1 fix: L1-only scoring, no inflated L2/L3) ─────

interface SessionSummary {
  session_id: string;
  grade: string;
  stage: string;
  l1_score: number;
}

function auditAll(events: DomainEvent[]): {
  checks: Check[];
  scores: CategoryScore[];
  grade: string;
  sessions: SessionSummary[];
} {
  const pipelines = materializePerSession(events);
  const sessions: SessionSummary[] = [];

  for (const p of pipelines.slice(0, 20)) {
    const sessionEvents = events.filter((e) => e.session_id === p.session_id);
    const { shipCheckpoints, skillInvocations } = extractSessionExtras(sessionEvents);

    const slice: PipelineSlice = {
      sessionId: p.session_id,
      history: p.history,
      artifacts: p.artifacts,
      shipCheckpoints,
      skillInvocations,
      sessionEvents,
    };

    const l1 = checkLayer1(slice);
    const s = scoreByCategory(l1);
    // --all mode uses L1 score only (not the 3-layer weighted formula)
    const l1Score = s.find((x) => x.category === "Process")?.score ?? 100;
    let grade: string;
    if (l1Score >= 90) grade = "A";
    else if (l1Score >= 75) grade = "B";
    else if (l1Score >= 60) grade = "C";
    else if (l1Score >= 40) grade = "D";
    else grade = "F";

    sessions.push({
      session_id: p.session_id,
      grade,
      stage: p.current_stage,
      l1_score: l1Score,
    });
  }

  return { checks: [], scores: [], grade: "-", sessions };
}

// ─── Quick Summary (human decision support) ───────────────────────

function formatQuickSummary(pipeline: PipelineSlice): string {
  const lines: string[] = [];
  const { artifacts, history } = pipeline;

  // ── Header: task name + scope
  let taskName = pipeline.sessionId;
  let scope = "Unknown";
  const bPaths = (artifacts.brainstorm || []).filter((p: string) => p.endsWith(".md") && existsSync(p));
  if (bPaths.length > 0) {
    const bFm = parseFrontmatter(bPaths[0]);
    taskName = bFm.title || taskName;
    scope = bFm.scope || scope;
  }

  lines.push(`\n═══ Pipeline Audit ═══════════════════════════════`);
  lines.push(`任务: ${taskName}`);

  // Tier + scope + file count
  const shipCommits = (artifacts.ship || []).filter((a: string) => /^[0-9a-f]{7,40}$/.test(a));
  let diffStat = "";
  if (shipCommits.length > 0) {
    diffStat = gitArgs("diff", "--stat", `${shipCommits[0]}~1`, shipCommits[0]);
  }
  const fileCount = diffStat ? diffStat.split("\n").filter((l: string) => l.includes("|")).length : 0;
  lines.push(`范围: ${scope} | ${fileCount} files changed`);
  lines.push("");

  // ── AC checklist
  if (bPaths.length > 0) {
    const bContent = readFileSync(bPaths[0], "utf-8");
    const acSection = extractSection(bContent, /^#+\s*Acceptance\s*Criteria/i);
    const acLines = acSection.split("\n").filter((l: string) => /^\s*\d+\./.test(l));
    if (acLines.length > 0) {
      lines.push("── 验收标准 ──");
      // Check if all tasks are done as a proxy for AC satisfaction
      const allDone = pipeline.history.some((h: StageHistory) => h.stage === "ship" && h.completed);
      for (const ac of acLines) {
        const icon = allDone ? "✓" : "?";
        lines.push(`  ${icon} ${ac.trim()}`);
      }
      lines.push("");
    }
  }

  // ── Changes (git diff --stat, condensed)
  if (diffStat) {
    lines.push("── 变更 ──");
    const statLines = diffStat.split("\n").filter((l: string) => l.includes("|"));
    for (const sl of statLines.slice(0, 8)) {
      lines.push(`  ${sl.trim()}`);
    }
    if (statLines.length > 8) lines.push(`  ... and ${statLines.length - 8} more files`);
    lines.push("");
  }

  // ── Sub-agent findings
  const advFiles = [
    ".apex/verifications/brainstorm-adversarial.md",
    ".apex/verifications/review-adversarial.md",
  ].filter((f: string) => existsSync(f));

  if (advFiles.length > 0) {
    lines.push("── Sub-agent 发现 ──");
    for (const advFile of advFiles) {
      const content = readFileSync(advFile, "utf-8");
      // Extract lines that look like findings (bullets with ⚠, *, -)
      const findings = content.split("\n")
        .filter((l: string) => /^\s*[-*⚠•]\s/.test(l) || /^\s*\d+\.\s+\*\*/.test(l))
        .map((l: string) => l.trim())
        .slice(0, 5);
      for (const f of findings) {
        lines.push(`  ${f}`);
      }
    }
    lines.push("");
  }

  // ── Gate status per stage
  lines.push("── 门控状态 ──");
  const stageNames = ["brainstorm", "plan", "execute", "review", "ship", "compound"];
  for (const s of stageNames) {
    const stageHistory = history.find((h: StageHistory) => h.stage === s);
    const hasArt = (artifacts[s] || []).length > 0;
    const completed = stageHistory?.completed;
    let icon = "—";
    if (completed) icon = "✓";
    else if (hasArt) icon = "◐";
    lines.push(`  ${s.padEnd(12)} ${icon}`);
  }
  lines.push("");

  // ── Decision prompt
  lines.push("── 决定 ──");
  lines.push("  [ ] 批准    [ ] 需要修改    [ ] 驳回");
  lines.push("");

  return lines.join("\n");
}


// ─── Main ───────────────────────────────────────────────────────────

export async function cmdAudit(args: string[]): Promise<void> {
  const jsonMode = args.includes("--json");
  const noTest = args.includes("--no-test");
  const allMode = args.includes("--all");
  const quickMode = args.includes("--quick");
  const sessionIdx = args.indexOf("--session");
  const targetSession =
    sessionIdx >= 0 && args[sessionIdx + 1] ? args[sessionIdx + 1] : undefined;

  // P0-2 fix: read events once, pass to all functions
  const events = readEvents("state");

  if (allMode) {
    const result = auditAll(events);
    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("\nAPEX FORGE \u2014 PIPELINE TRENDS\n");
      for (const s of result.sessions) {
        console.log(`  ${s.grade} ${s.session_id} (${s.stage}) L1:${s.l1_score}%`);
      }
      console.log("");
    }
    return;
  }

  const pipeline = findPipeline(events, targetSession);
  if (!pipeline) {
    console.error(
      "No pipeline found. Run apex init and complete a pipeline first."
    );
    process.exit(1);
  }

  if (quickMode) {
    if (jsonMode) {
      const summary = formatQuickSummary(pipeline);
      console.log(JSON.stringify({ format: "quick", summary, session: pipeline.sessionId }, null, 2));
    } else {
      console.log(formatQuickSummary(pipeline));
    }
    return;
  }

  const l1Checks = checkLayer1(pipeline);
  const l2Checks = checkLayer2(pipeline);
  const l3Checks = checkLayer3(pipeline, !noTest);
  const allChecks = [...l1Checks, ...l2Checks, ...l3Checks];

  const scores = scoreByCategory(allChecks);
  const grade = overallGrade(allChecks, scores);

  if (jsonMode) {
    console.log(
      JSON.stringify(
        { checks: allChecks, scores, grade, session: pipeline.sessionId },
        null,
        2
      )
    );
  } else {
    console.log(formatReport(pipeline, allChecks, scores, grade));
  }

  if (grade === "F") process.exit(1);
}
