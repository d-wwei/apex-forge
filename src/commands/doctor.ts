/**
 * Apex Forge — Doctor Module
 *
 * Self-audit command that checks all enforcement layers are installed,
 * configured, and functional. Inspired by product-goal-based-audit pattern:
 * mine expectations → run checks → report PASS/WARN/FAIL → prescribe fixes.
 *
 * Usage: apex doctor [--fix]
 */

import { existsSync, readFileSync, lstatSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";
import { runStructuralGate } from "../state/state.js";

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
  fix?: string;
}

interface CategoryScore {
  category: string;
  total: number;
  pass: number;
  warn: number;
  fail: number;
  skip: number;
  score: number; // 0-100
}

// ─── Severity weights (same as product-goal-based-audit) ────────────

const WEIGHT: Record<Severity, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0.5,
};

// ─── Check runners ──────────────────────────────────────────────────

function checkPreToolUseHook(): Check[] {
  const checks: Check[] = [];
  const settingsPath = join(process.env.HOME || "/tmp", ".claude", "settings.json");

  // D1: settings.json exists
  const settingsExists = existsSync(settingsPath);
  checks.push({
    id: "D1",
    category: "L2-Deny",
    description: "Claude Code settings.json exists",
    severity: "CRITICAL",
    verdict: settingsExists ? "PASS" : "FAIL",
    detail: settingsExists ? settingsPath : "File not found",
    fix: "Run: bash ~/.claude/skills/apex-forge/skill/install.sh",
  });
  if (!settingsExists) return checks;

  // D2: PreToolUse hook registered
  let hasGateHook = false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    const pre = settings?.hooks?.PreToolUse || [];
    for (const rule of pre) {
      for (const h of rule?.hooks || []) {
        if ((h?.command || "").includes("apex-forge-gate")) {
          hasGateHook = true;
        }
      }
    }
  } catch { /* parse error */ }

  checks.push({
    id: "D2",
    category: "L2-Deny",
    description: "PreToolUse hook registered for Bash|Edit|Write",
    severity: "CRITICAL",
    verdict: hasGateHook ? "PASS" : "FAIL",
    detail: hasGateHook ? "apex-forge-gate.sh registered" : "Not found in settings.json",
    fix: 'Run: python3 -c "... register hook ..." or bash install.sh',
  });

  // D3: Hook script exists and is executable
  const hookPath = join(process.env.HOME || "/tmp", ".claude", "skills", "apex-forge", "hooks", "apex-forge-gate.sh");
  const hookExists = existsSync(hookPath);
  let hookExecutable = false;
  if (hookExists) {
    try {
      const stat = lstatSync(hookPath);
      hookExecutable = (stat.mode & 0o111) !== 0;
    } catch { /* ignore */ }
  }

  checks.push({
    id: "D3",
    category: "L2-Deny",
    description: "Gate hook script exists and is executable",
    severity: "CRITICAL",
    verdict: hookExists && hookExecutable ? "PASS" : "FAIL",
    detail: hookExists ? (hookExecutable ? hookPath : "Exists but not executable") : "File not found",
    fix: `chmod +x ${hookPath}`,
  });

  // D4: python3 available (hook dependency)
  let hasPython = false;
  try {
    execSync("python3 --version", { stdio: "pipe" });
    hasPython = true;
  } catch { /* missing */ }

  checks.push({
    id: "D4",
    category: "L2-Deny",
    description: "python3 available (hook dependency)",
    severity: "HIGH",
    verdict: hasPython ? "PASS" : "FAIL",
    detail: hasPython ? "python3 found" : "python3 not in PATH",
    fix: "Install Python 3: brew install python3",
  });

  return checks;
}

function checkPreCommitHook(): Check[] {
  const checks: Check[] = [];
  const gitDir = join(process.cwd(), ".git");
  const isGitRepo = existsSync(gitDir) && lstatSync(gitDir).isDirectory();

  if (!isGitRepo) {
    checks.push({
      id: "D5",
      category: "L2-Deny",
      description: "Git pre-commit hook installed",
      severity: "HIGH",
      verdict: "SKIP",
      detail: "Not a git repository",
    });
    return checks;
  }

  const hookPath = join(gitDir, "hooks", "pre-commit");
  const hookExists = existsSync(hookPath);

  checks.push({
    id: "D5",
    category: "L2-Deny",
    description: "Git pre-commit hook installed",
    severity: "HIGH",
    verdict: hookExists ? "PASS" : "FAIL",
    detail: hookExists ? hookPath : "No pre-commit hook",
    fix: "Run: apex init",
  });

  if (hookExists) {
    // D6: Hook contains stage check (not just memory curation)
    let hasStageCheck = false;
    try {
      const content = readFileSync(hookPath, "utf-8");
      hasStageCheck = content.includes("current_stage") || content.includes("COMMIT BLOCKED");
    } catch { /* unreadable */ }

    checks.push({
      id: "D6",
      category: "L2-Deny",
      description: "Pre-commit hook checks pipeline stage",
      severity: "HIGH",
      verdict: hasStageCheck ? "PASS" : "WARN",
      detail: hasStageCheck ? "Stage gate logic present" : "Hook exists but may be outdated (no stage check)",
      fix: "Re-run: apex init (or copy updated hook from skill/hooks/pre-commit)",
    });
  }

  return checks;
}

async function checkCLIGates(): Promise<Check[]> {
  const checks: Check[] = [];

  // Expected check counts per stage (from stage .md files)
  // S4/S5 in ship are intentionally omitted (external tool deps) — not counted as missing
  const expectations: Record<string, { defined: number; ids: string[]; omitted?: string[] }> = {
    brainstorm: { defined: 7, ids: ["S1", "S2", "S3", "S4", "S5", "S6", "S7"] },
    plan: { defined: 7, ids: ["S1", "S2", "S3", "S4", "S5", "S6", "S7"] },
    execute: { defined: 3, ids: ["S1", "S2", "S3"] },
    review: { defined: 9, ids: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"], omitted: ["S9"] },
    ship: { defined: 8, ids: ["S1", "S2", "S3", "S6", "S7", "S8"], omitted: ["S4", "S5"] },
    compound: { defined: 6, ids: ["S1", "S2", "S3", "S4", "S5", "S6"] },
  };

  // Use the internal API directly — no state mutation, no shell-out
  for (const [stage, spec] of Object.entries(expectations)) {
    try {
      const gate = await runStructuralGate(stage);
      const checkIds = gate.items.map((i) => i.id);
      const implemented = checkIds.length;
      const expectedCount = spec.ids.length; // excluding intentionally omitted

      const coverage = expectedCount > 0 ? Math.round((implemented / expectedCount) * 100) : 0;
      const verdict: Verdict = coverage >= 90 ? "PASS" : coverage >= 50 ? "WARN" : "FAIL";

      const missing = spec.ids.filter((id) => !checkIds.includes(id));
      const omittedNote = spec.omitted ? ` (${spec.omitted.join(",")} intentionally omitted)` : "";

      checks.push({
        id: `G-${stage}`,
        category: "L4-Gate",
        description: `${stage} gate: ${implemented}/${expectedCount} checks${omittedNote}`,
        severity: stage === "ship" || stage === "review" ? "CRITICAL" : "HIGH",
        verdict,
        detail: missing.length > 0 ? `Missing: ${missing.join(", ")}` : `All ${implemented} checks implemented`,
        fix: missing.length > 0 ? `Implement ${missing.join(", ")} in runStructuralGate("${stage}")` : undefined,
      });
    } catch {
      checks.push({
        id: `G-${stage}`,
        category: "L4-Gate",
        description: `${stage} gate check`,
        severity: "HIGH",
        verdict: "FAIL",
        detail: "runStructuralGate threw an error",
        fix: "Check state.ts for errors",
      });
    }
  }

  return checks;
}

function checkProjectState(): Check[] {
  const checks: Check[] = [];
  const apexDir = ".apex";

  // P1: .apex/ directory exists
  const apexExists = existsSync(apexDir);
  checks.push({
    id: "P1",
    category: "Project",
    description: ".apex/ directory initialized",
    severity: "MEDIUM",
    verdict: apexExists ? "PASS" : "FAIL",
    detail: apexExists ? resolve(apexDir) : "Not initialized",
    fix: "Run: apex init",
  });

  if (!apexExists) return checks;

  // P2: State files exist and are valid JSON
  for (const file of ["state.json", "tasks.json", "memory.json"]) {
    const fp = join(apexDir, file);
    let valid = false;
    if (existsSync(fp)) {
      try {
        JSON.parse(readFileSync(fp, "utf-8"));
        valid = true;
      } catch { /* corrupt */ }
    }
    checks.push({
      id: `P2-${file}`,
      category: "Project",
      description: `${file} exists and valid`,
      severity: file === "state.json" ? "HIGH" : "MEDIUM",
      verdict: valid ? "PASS" : existsSync(fp) ? "WARN" : "FAIL",
      detail: valid ? "OK" : existsSync(fp) ? "Corrupt JSON" : "Missing",
      fix: existsSync(fp) ? "Run: apex recover" : "Run: apex init",
    });
  }

  // P3: .gitignore includes .apex/
  const gitignorePath = ".gitignore";
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    const hasApex = content.includes(".apex");
    checks.push({
      id: "P3",
      category: "Project",
      description: ".apex/ in .gitignore",
      severity: "MEDIUM",
      verdict: hasApex ? "PASS" : "WARN",
      detail: hasApex ? "Present" : ".apex/ not in .gitignore — state may be committed",
      fix: 'echo ".apex/" >> .gitignore',
    });
  }

  return checks;
}

function checkBindings(): Check[] {
  const checks: Check[] = [];
  const skillDir = join(process.env.HOME || "/tmp", ".claude", "skills");

  if (!existsSync(skillDir)) {
    checks.push({
      id: "B1",
      category: "Bindings",
      description: "Skills directory exists",
      severity: "HIGH",
      verdict: "FAIL",
      detail: `${skillDir} not found`,
      fix: "Run: bash ~/.claude/skills/apex-forge/skill/install.sh",
    });
    return checks;
  }

  // Check key companion skills
  const required = [
    "systematic-debugging",
    "thorough-code-review",
    "iteration-reflector",
    "great-writer",
  ];

  for (const skill of required) {
    const sp = join(skillDir, skill);
    const installed = existsSync(sp);
    checks.push({
      id: `B-${skill}`,
      category: "Bindings",
      description: `${skill} installed`,
      severity: skill === "thorough-code-review" ? "HIGH" : "MEDIUM",
      verdict: installed ? "PASS" : "WARN",
      detail: installed ? sp : "Not installed",
      fix: `git clone https://github.com/d-wwei/${skill} ${sp}`,
    });
  }

  return checks;
}

function checkCheckpointMechanism(): Check[] {
  const checks: Check[] = [];

  // C1: apex ship checkpoint command works
  let shipCpWorks = false;
  try {
    execSync("apex ship checkpoint invalid-test-name 2>&1", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    });
  } catch (err: any) {
    const output = (err.stdout || "") + (err.stderr || "");
    shipCpWorks = output.includes("Invalid ship checkpoint");
  }

  checks.push({
    id: "C1",
    category: "Checkpoints",
    description: "apex ship checkpoint command functional",
    severity: "HIGH",
    verdict: shipCpWorks ? "PASS" : "FAIL",
    detail: shipCpWorks ? "Validates checkpoint names correctly" : "Command not working",
    fix: "Rebuild: cd apex-forge && bun run build",
  });

  // C2: apex compound checkpoint command works
  let compoundCpWorks = false;
  try {
    execSync("apex compound checkpoint invalid-test-name 2>&1", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    });
  } catch (err: any) {
    const output = (err.stdout || "") + (err.stderr || "");
    compoundCpWorks = output.includes("Invalid compound checkpoint");
  }

  checks.push({
    id: "C2",
    category: "Checkpoints",
    description: "apex compound checkpoint command functional",
    severity: "HIGH",
    verdict: compoundCpWorks ? "PASS" : "FAIL",
    detail: compoundCpWorks ? "Validates checkpoint names correctly" : "Command not working",
    fix: "Rebuild: cd apex-forge && bun run build",
  });

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
      score: totalWeight > 0 ? Math.round(((passWeight + warnWeight) / totalWeight) * 100) : 100,
    });
  }
  return scores;
}

function overallGrade(checks: Check[], scores: CategoryScore[]): string {
  const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / Math.max(scores.length, 1);
  const hasCriticalFail = checks.some((c) => c.severity === "CRITICAL" && c.verdict === "FAIL");

  let grade: string;
  if (avgScore >= 90) grade = "A";
  else if (avgScore >= 75) grade = "B";
  else if (avgScore >= 60) grade = "C";
  else if (avgScore >= 40) grade = "D";
  else grade = "F";

  // Critical fail caps at C
  if (hasCriticalFail && grade < "C") grade = "C";
  if (hasCriticalFail && (grade === "A" || grade === "B")) grade = "C";

  return grade;
}

// ─── Output formatting ──────────────────────────────────────────────

const ICONS: Record<Verdict, string> = {
  PASS: "✓",
  WARN: "⚠",
  FAIL: "✗",
  SKIP: "─",
};

function formatReport(checks: Check[], scores: CategoryScore[], grade: string): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("╔══════════════════════════════════════════════════╗");
  lines.push("║          APEX FORGE — DOCTOR REPORT             ║");
  lines.push("╚══════════════════════════════════════════════════╝");
  lines.push("");

  // Per-category results
  let currentCategory = "";
  for (const check of checks) {
    if (check.category !== currentCategory) {
      currentCategory = check.category;
      lines.push(`── ${currentCategory} ${"─".repeat(Math.max(0, 45 - currentCategory.length))}`);
    }
    const icon = ICONS[check.verdict];
    const sev = check.severity.padEnd(8);
    lines.push(`  ${icon} [${check.id}] ${check.description}`);
    lines.push(`    ${sev} ${check.detail}`);
    if (check.verdict === "FAIL" && check.fix) {
      lines.push(`    FIX: ${check.fix}`);
    }
  }

  lines.push("");
  lines.push("── Scores ─────────────────────────────────────────");
  for (const s of scores) {
    const bar = "█".repeat(Math.round(s.score / 5)) + "░".repeat(20 - Math.round(s.score / 5));
    lines.push(`  ${s.category.padEnd(14)} ${bar} ${s.score}%  (${s.pass}✓ ${s.warn}⚠ ${s.fail}✗ ${s.skip}─)`);
  }

  lines.push("");
  const totalPass = checks.filter((c) => c.verdict === "PASS").length;
  const totalFail = checks.filter((c) => c.verdict === "FAIL").length;
  lines.push(`  Overall: Grade ${grade}  (${totalPass}/${checks.length} pass, ${totalFail} fail)`);

  if (totalFail > 0) {
    lines.push("");
    lines.push("── Fix Priority ───────────────────────────────────");
    const fails = checks
      .filter((c) => c.verdict === "FAIL" && c.fix)
      .sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity]);
    for (let i = 0; i < fails.length; i++) {
      lines.push(`  ${i + 1}. [${fails[i].severity}] ${fails[i].description}`);
      lines.push(`     → ${fails[i].fix}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// ─── Main ───────────────────────────────────────────────────────────

export async function cmdDoctor(args: string[]): Promise<void> {
  const gateChecks = await checkCLIGates();
  const checks: Check[] = [
    ...checkPreToolUseHook(),
    ...checkPreCommitHook(),
    ...gateChecks,
    ...checkCheckpointMechanism(),
    ...checkBindings(),
    ...checkProjectState(),
  ];

  const scores = scoreByCategory(checks);
  const grade = overallGrade(checks, scores);
  const report = formatReport(checks, scores, grade);

  console.log(report);

  // JSON output option
  if (args.includes("--json")) {
    console.log(JSON.stringify({ checks, scores, grade }, null, 2));
  }

  // Exit code based on grade
  if (grade === "F" || grade === "D") {
    process.exit(1);
  }
}
