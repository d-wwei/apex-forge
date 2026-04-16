---
name: apex-forge
description: |
  Unified execution protocol for AI coding agents. Enforces discipline at the protocol level:
  complexity routing, phase gates, TDD, evidence grading, verification gates, multi-persona review.
  Use when: any non-trivial coding task, multi-step implementation, debugging, feature development,
  or when the agent needs structured execution discipline.
  Works with any AI agent (Claude Code, Codex, Gemini, Cursor, OpenCode, Windsurf, etc).
argument-hint: "[brainstorm|plan|execute|review|ship|investigate|status|compound]"
---

# Apex Forge

Unified execution protocol. **Rigid** — follow exactly.

## Dashboard Gate (BEFORE anything else)

Call `AskUserQuestion` with:
- question: "是否启动可视化面板？"
- header: "Dashboard"
- options:
  1. label: "启动 Dashboard (Recommended)", description: "在浏览器里查看任务看板、pipeline 进度和遥测数据"
  2. label: "跳过", description: "不启动，直接开始工作"

If user selects "启动 Dashboard": run `apex dashboard 2>&1 &` — it auto-registers the project, starts Hub if needed, and opens the PWA app (or browser). No need to report a URL.
If user selects "跳过": proceed silently.

## Initialization (silent, every invocation)

```bash
which apex || echo "MISSING: add apex-forge to PATH"
apex init
apex memory backend
apex check-bindings 2>/dev/null
```

Then check `apex status --json` for interrupted sessions (Agent Recall: `getActiveTask()`; local fallback: `.apex/tasks.json`).

### Task state reconciliation (MANDATORY before resuming)

→ See details/session-resume.md for cross-check procedure, stale-status fix commands, and reconciliation report format.

If stage is not `idle` or tasks are `in_progress`/`to_verify` (after reconciliation):
> 上次中断在 {stage} 阶段。{N} 个任务未完成（{task IDs}）。要继续还是重新开始？

### Compound stage reminder (fallback)

If stage is `ship` and all tasks are `done`, but history does NOT include `compound`:

> 上次交付已完成但未进行复盘。现在进入复盘阶段。

Compound is mandatory — no skip option. `apex stage set compound`, then follow `stages/compound.md`.

### Pipeline re-entry (CRITICAL)

**One pipeline per task. One task at a time. Pipeline resets between tasks. Protocol does NOT turn off after Compound.**

After Compound, ask user for next step (3 options in `stages/compound.md`):
- "继续下一个迭代" → `apex stage set idle` → Complexity Router fresh.
- "在新进程中继续 roadmap" → generate continuation prompt → new session → `apex stage set idle`.
- "结束本轮" → stage stays `compound`.

- `idle` + new task → Complexity Router (Section 1) immediately. No skip — Router decides, not the agent.
- `compound` + new task (unsolicited) → ask first, then route.
- Stuck non-idle with no active work → ask user to reset, then re-enter.

### Background update check

→ See details/session-resume.md for sub-agent prompt, stage-aware adoption rules, and isolation contract.

### Upgrade notes

→ See details/session-resume.md for check/surface/rename procedure before invoking external skills.

---

## Command Modes

| Command | Purpose | Sub-skill |
|---------|---------|-----------|
| `apex-forge` | Activate protocol (auto Tier routing) | — (inline below) |
| `apex-forge brainstorm` | Requirements exploration, no code | `stages/brainstorm.md` |
| `apex-forge plan` | Implementation planning, no code | `stages/plan.md` |
| `apex-forge execute` | TDD-first implementation | `stages/execute.md` |
| `apex-forge review` | Multi-persona quality gate | `stages/review.md` |
| `apex-forge ship` | Package, commit, PR | `stages/ship.md` |
| `apex-forge compound` | Knowledge extraction | `stages/compound.md` |
| `apex-forge parallel` | Parallel agent dispatch | `roles/parallel-dispatch.md` |
| `apex-forge subagent-dev` | Per-task subagent dispatch | `roles/subagent-dev.md` |
| `apex-forge cross-session` | Resume across sessions | `roles/cross-session-exec.md` |
| `apex-forge worktree` | Isolated git worktree | `roles/worktree.md` |
| `apex-forge scope-lock` | Lock edits to a directory | `roles/scope-lock.md` |
| `apex-forge skill-author` | Create new skills | `roles/skill-author.md` |
| `apex-forge status` | Show project state | Run: `apex status` |
| `apex-master` | Multi-worker team manager | `roles/master.md` |

External skills (via `bindings.yaml`): `/systematic-debugging`, `/thorough-code-review`, `/browser-qa-testing`, `/security-audit`, `/tasteful-frontend`, `/design-to-code-runner`, `/product-review`.

Internal gate: `design-baseline` → `gates/design-baseline.md`.

When a sub-skill is listed, read and follow that file relative to this SKILL.md's directory.

### Explicit Stage Commands Bypass the Complexity Router

Named stage commands (`apex-forge ship`, `apex-forge review`, etc.) skip the Router entirely. Read the stage file, execute every step top to bottom, do NOT self-classify as Tier 1 to skip steps.

**This is a hard rule.** → See details/stage-bypass-rules.md for the three invalid rationalizations and why each fails.

---

## Core Protocol

### 1. Complexity Router

Every task enters the router first. No exceptions — **unless an explicit stage command was used** (see above).

Single verified pass? → Tier 1. Multiple sessions needed? → Tier 3. Otherwise → Tier 2.

All tiers walk the full six-stage pipeline. Tier only determines **Execute strategy**: Tier 1 = single pass, Tier 2 = PDCA rounds (max 5), Tier 3 = waves of 3-5 rounds.

### 2. Phase Discipline

Hard-gated. No leaking between phases. **Track every transition:**

- **Brainstorm (WHAT)** — No code. Output: requirements, constraints, success criteria.
- **Plan (HOW)** — Exact file paths, function signatures, test scenarios. No implementation.
- **Execute (DO)** — Build per plan. Tests first. No design decisions.
- **Review (CHECK)** — Multi-persona quality gate. Execute completes → must enter Review. No skipping.
- **Ship (DELIVER)** — Package and deliver. Review passes → then commit/push/PR. All git ops happen here.
- **Compound (LEARN)** — Knowledge extraction. Ship completes → prompt user for reflection. User may decline, but must be asked.

#### Git Operations Interlock

git operations locked to Ship stage while pipeline active (stage != `idle`). No tier exemptions.
- `git commit`, `git push`, `gh pr create` → **ONLY inside Ship stage**.
- User says "提交" / "commit" / "push" / "ship it" → request to **enter Ship stage**, NOT bypass Review.
- Stage `execute` (Tier 2/3): "Execute 完成，需要先过 Review 再提交。"
- Stage `review` not DONE/DONE_WITH_CONCERNS: "Review 尚未通过，不能提交。"

#### Pipeline Architecture: Backbone + Sidecar
→ See details/pipeline-architecture.md for backbone/sidecar structure and sidecar trigger rules.

#### Phase Violations
→ See details/phase-violations.md for the full violations table.

#### Stage Gates: Exit + Entry Verification
→ See details/pipeline-architecture.md for SubAgent dispatch tables, confidence aggregation formulas, and upstream artifact requirements.

**State tracking (mandatory — Dashboard reads from these):**
- Entering a stage: `apex stage set <name>` (e.g., `apex stage set brainstorm`)
- Completing a stage: `apex stage complete <name>`
- Recording deliverables: `apex stage artifact <stage> <path>`

**Task management: use `apex task` CLI, NOT Claude Code's TaskCreate/TaskUpdate** (Dashboard reads `.apex/tasks.json`, not Claude's internal store).
- Create: `apex task create "title" "description" [DEP1 DEP2]`
- Start: `apex task start T{N}`
- Done: `apex task submit T{N} "evidence" && apex task verify T{N} pass`
- List: `apex task list`

### 3. TDD Iron Law
Write test → RED (fails correctly) → Write code → GREEN → Refactor. Exceptions: confirmed prototypes, tested generators only.

### 4. Evidence Grading
E0 (guess) → E1 (indirect) → E2 (direct) → E3 (multi-source) → E4 (validated + reproduced).
Thresholds: facts → E2, decisions → E2, verification → E3, closing DONE → E3.

### 5. Escalation Ladder
L0 normal → L1 (2nd fail: different approach) → L2 (3rd: 3 hypotheses) → L3 (4th: 7-point checklist) → L4 (5th: escalate to human).
→ See details/phase-violations.md for the L3 7-point checklist.

### 6. Verification Gate
Before ANY success claim: (1) Identify proving command (2) Run it fresh (3) Read full output (4) Binary confirm (5) Only then claim. Skip any step = lying.

### 7. Completion Status
DONE (all E3+) | DONE_WITH_CONCERNS (flagged issues) | BLOCKED (tried, need X) | NEEDS_CONTEXT (missing info).

### 8. Anti-Patterns (Hard Stops)

"Done" without proof → run gate. Micro-tweaks → escalation ladder. Advice not action → execute it. Waiting for user → take initiative. Premature surrender → try 3 approaches. Phase leaking → return to correct phase. Scope creep → check plan. Ship without review → enter Review stage first. Git ops outside Ship → only inside Ship stage. **Skipping stages via low Tier → INVALID. All tiers walk the full six-stage pipeline. Tier only controls Execute strategy. Self-classifying as Tier 1 to skip Brainstorm/Plan/Review/Compound is a protocol violation.** Explicit stage commands (`/apex-forge ship`, etc.) bypass the Complexity Router but still execute the full stage protocol.

---

## Reference

- CLI commands: `references/cli-reference.md`
- Platform setup: `references/platform-setup.md`

```
ROUTER:    Tier 1 → Tier 2 → Tier 3
PHASES:    Brainstorm → Plan → Execute → Review → Ship → Compound (ALL tiers)
EXECUTE:   Tier 1 = single pass | Tier 2 = PDCA rounds | Tier 3 = waves
TDD:       Test → RED → Code → GREEN → Refactor
EVIDENCE:  E0 → E1 → E2 → E3 → E4
ESCALATE:  L0 → L1 → L2 → L3 → L4
GATE:      Identify → Run → Read → Confirm → Claim
GIT LOCK:  git commit/push/pr → ONLY inside Ship stage
GATES:     Structural (1 SubAgent) → Substance (2-3 SubAgents) → Aggregate → Verdict
STATUS:    DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
```
