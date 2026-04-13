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

<!-- PostToolUse hook (hooks/apex-forge-dashboard.sh) is backup for programmatic Skill tool invocations.
     For slash command invocations (/apex-forge), the dashboard gate below is the primary mechanism. -->

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

Then check `apex status --json` for interrupted sessions. Also check memory backend:
- Agent Recall backend: `getActiveTask()` returns cross-session task state across all platforms.
- Local fallback: reads `.apex/tasks.json` for `in_progress` tasks.

### Task state reconciliation (MANDATORY before resuming)

If there are tasks that are NOT `done` (i.e. `open`, `assigned`, `in_progress`, `to_verify`):

1. **Cross-check each incomplete task against the actual codebase:**
   - Read the task's description and target files
   - Check if those files exist, have been modified, or committed via `git log --oneline -5` / `git diff --stat`
   - If the code is already done but the task status is stale (e.g. sub-agent completed in a worktree but status was never updated), fix it:
     ```bash
     apex task assign T{N} && apex task start T{N} && apex task submit T{N} "evidence: code verified in repo" && apex task verify T{N} pass
     ```

2. **After reconciliation**, report the corrected state to the user.

This handles: sub-agent work merged but not reflected in dashboard, user commits outside AF, stale status from crashes.

If stage is not `idle` or tasks are `in_progress`/`to_verify` (after reconciliation):
> 上次中断在 {stage} 阶段。{N} 个任务未完成（{task IDs}）。要继续还是重新开始？

### Compound stage reminder (fallback)

If stage is `ship` and all tasks are `done`, but history does NOT include `compound`:
Call `AskUserQuestion` with:
- question: "上次交付已完成但未进行复盘。是否现在进入复盘迭代？"
- header: "Compound"
- options:
  1. label: "进入复盘 (Recommended)", description: "提取经验教训，更新路线图"
  2. label: "跳过，开始新任务", description: "跳过复盘，重置为 idle"

If "进入复盘": `apex stage set compound`, then follow `stages/compound.md`.
If "跳过": `apex stage set idle`.

### Pipeline re-entry (CRITICAL)

**The protocol does NOT "turn off" after one pipeline cycle.** After Compound completes,
the agent MUST ask the user: start a new iteration or end this round.

- User chooses "新迭代" → `apex stage set idle` → next task enters Complexity Router fresh.
- User chooses "结束" → stage stays at `compound` → user sees completed state when they return.

If stage is `idle` and user gives a new task: run the Complexity Router (Section 1).
If stage is `compound` and user gives a new task (without being asked): ask first, then route.
If stage is stuck at any non-idle value with no active work: ask user whether to reset, then re-enter.

**One pipeline per task. One task at a time. Pipeline resets between tasks.**

### Background update check

After init, unconditionally spawn a **background Agent** (fire-and-forget) with this prompt:

> Check `.apex/update-check.json` (written by session-start hook).
> If the file does not exist or `updates_available` is empty, exit silently.
> If updates are available, run `bash {PLUGIN_ROOT}/skill/install.sh update`.
> After each skill updates successfully, read its README.md (or SKILL.md) and write a brief
> upgrade note to `.apex/upgrade-notes/{skill-name}.md` covering: what changed,
> new outputs/assets, and how to use them. Keep each note under 200 words.
> Delete `.apex/update-check.json` when done.

**The main agent MUST NOT read the JSON, check conditions, or do any update logic itself.**
All update-related work is isolated in the sub-agent. If the sub-agent fails, the main agent is unaffected.

**Stage-aware update adoption:**

- **Current stage already using that skill** → Do NOT interrupt. Finish the current stage with the loaded version.
- **Skill not yet used / will be used in a later stage** → No action now. The upgrade notes at
  `.apex/upgrade-notes/` will be checked automatically when that skill is invoked (per "Upgrade notes" below).
  This gives the user better results without disruption.
- **Sub-agent completion notifications** → Ignore them. All information flows through `.apex/upgrade-notes/`,
  not through notification events. Never interrupt the user's flow to announce updates.

### Upgrade notes

Before invoking any external skill from `bindings.yaml`, check if `.apex/upgrade-notes/{skill-name}.md` exists.
If it does, read it and surface the content as context before the skill runs.
After surfacing, rename to `.apex/upgrade-notes/{skill-name}.surfaced.md` to avoid repeating.

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

External skills (via `bindings.yaml`): `/systematic-debugging`, `/thorough-code-review`, `/browser-qa-testing`, `/security-audit`, `/tasteful-frontend`, `/design-to-code-runner`, `/product-review`.

Internal gate: `design-baseline` → `gates/design-baseline.md`.

When a sub-skill is listed, read and follow that file relative to this SKILL.md's directory.

---

## Core Protocol

### 1. Complexity Router

Every task enters the router first. No exceptions.

```
Single verified pass possible? → YES → Tier 1 (Single Pass)
                                  NO → Multiple sessions needed? → YES → Tier 3 (Wave-Based)
                                                                    NO → Tier 2 (Round-Based)
```

- **Tier 1**: One action, one verification, done.
- **Tier 2**: PDCA rounds (clarify → explore → hypothesis → planning → execution → verification → hardening). Max 5 rounds.
- **Tier 3**: Waves of 3-5 rounds. Each wave reads/writes state.

### 2. Phase Discipline

Hard-gated. No leaking between phases. **Track every transition:**

- **Brainstorm (WHAT)** — No code. Output: requirements, constraints, success criteria.
- **Plan (HOW)** — Exact file paths, function signatures, test scenarios. No implementation.
- **Execute (DO)** — Build per plan. Tests first. No design decisions.
- **Review (CHECK)** — Multi-persona quality gate. Execute completes → must enter Review. No skipping.
- **Ship (DELIVER)** — Package and deliver. Review passes → then commit/push/PR. All git ops happen here.
- **Compound (LEARN)** — Knowledge extraction. Ship completes → prompt user for reflection. User may decline, but must be asked.

#### Tier-Based Pipeline Paths

Not every task walks the full chain. The Complexity Router (Section 1) determines which path:

```
Tier 1 (Single Pass):   Execute → Ship
Tier 2 (Round-Based):   Brainstorm → Plan → Execute → Review → Ship → Compound
Tier 3 (Wave-Based):    Brainstorm → Plan → Execute → Review → Ship → Compound (+ Wave management)
```

Tier 1 skips Brainstorm, Plan, Review, and Compound because the task is trivially verifiable in a single pass. Tier 2 and Tier 3 MUST walk the full six-step chain. No exceptions.

#### Git Operations Interlock

When a pipeline is active (stage != `idle`), git operations are locked to the Ship stage:

- `git commit`, `git push`, `gh pr create` → **ONLY inside Ship stage**.
- User says "提交" / "commit" / "push" / "ship it" → This is a request to **enter Ship stage**, NOT authorization to bypass Review.
- If current stage is `execute` (Tier 2/3): respond "Execute 完成，需要先过 Review 再提交。"
- If current stage is `review` and review is not DONE/DONE_WITH_CONCERNS: respond "Review 尚未通过，不能提交。"

**Tier 1 exemption**: Tier 1 tasks do not use stage tracking (stage remains `idle`), so this interlock does not apply to them. Tier 1 commits directly after verification — no Review gate, no stage transitions.

This is a push-based blocker: the forbidden action is blocked regardless of how the agent tries to reach it.

#### Pipeline Architecture: Backbone + Sidecar

**Backbone** (hard-gated, mandatory): Protects quality baselines that apply to ALL code changes.
```
Brainstorm → Plan → Execute → Review → Ship → [Compound: prompted]
```

**Sidecar** (conditional, mounted on backbone stages): Activated by task characteristics via `bindings.yaml`.
- Execute sidecars: Design sub-flow, Browser QA, ...
- Review sidecars: Design baseline gate, Security audit, SQL safety, ...

Sidecar characteristics:
- Trigger condition not met → sidecar does not run (not a hard gate)
- Can be added/removed without touching backbone definition
- Declared in `bindings.yaml`, not hardcoded in Phase Discipline

#### Phase Violations

| Violation | Example | Correction |
|-----------|---------|------------|
| Code in Brainstorm | Writing a prototype during requirements | Delete the code. Finish requirements first. |
| Design in Execute | "I think we should restructure this..." | Stop. Return to Plan phase. Document the decision. |
| Skipping Plan | Going from "what" directly to code | Stop. Produce a plan. Even a brief one. |
| Ship without Review | Execute done → git commit | Stop. Enter Review stage. Code cannot be committed without review. |
| Git ops outside Ship | git commit/push while stage != ship | Stop. Git operations only execute inside Ship stage. |
| Skip Compound prompt | Ship done → end session without asking | Must call AskUserQuestion for Compound. User may decline, but must be asked. |

#### Stage Gates: Exit + Entry Verification

Each stage has two automated quality checks run by SubAgents:

**Exit Gate** (at `apex stage complete <stage>`):
Dispatches SubAgents per `gates/stage-exit-gate.md` to validate output artifact quality.
Two layers: structural (binary, 1 SubAgent) → substance (qualitative, N SubAgents parallel).

| Tier / Scope | Structural | Substance | Evidence Grade |
|-------------|-----------|-----------|----------------|
| Tier 1 / Lightweight | 1 SubAgent | 0 (skip) | E2 |
| Tier 2 / Standard | 1 SubAgent | 2 SubAgents | E3 |
| Tier 3 / Deep | 1 SubAgent | 3 SubAgents | E3+ |

Substance confidence aggregation:
- All agree + high confidence → PASS (DONE)
- Majority agree + medium+ → PASS_WITH_NOTE (DONE_WITH_CONCERNS)
- No majority or low confidence → ESCALATE (NEEDS_CONTEXT)
- Any P0 + high confidence → BLOCK (BLOCKED)

**Upstream Entry Verification** (BEFORE `apex stage set <stage>`):
Inline check (no SubAgent). Verifies previous stage's artifact exists and is structurally complete.
Run upstream check first. Only call `apex stage set` after all checks pass. This prevents Dashboard from showing a stage the agent hasn't actually entered.

| Stage | Upstream Artifact Required |
|-------|--------------------------|
| Brainstorm | None (first stage) |
| Plan | Brainstorm requirements with `status: approved` |
| Execute | Plan with `status: approved` + tasks registered |
| Review | All tasks `done` + execution log exists + tests pass |
| Ship | Review artifact with status DONE or DONE_WITH_CONCERNS |
| Compound | Git commit exists + review artifact confirmed |

Gate procedure: `gates/stage-exit-gate.md`. Per-stage checklists: each stage file's "Exit Gate" section.

**State tracking (mandatory — Dashboard reads from these):**
- Entering a stage: `apex stage set <name>` (e.g., `apex stage set brainstorm`)
- Completing a stage: `apex stage complete <name>`
- Recording deliverables: `apex stage artifact <stage> <path>`

**Task management: use `apex task` CLI, NOT Claude Code's TaskCreate/TaskUpdate.**
Claude Code's built-in task tools write to an internal store invisible to the Dashboard.
`apex task` writes to `.apex/tasks.json` which the Dashboard reads in real-time.
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

L3 checklist: (1) restate goal (2) list all attempts (3) find common thread of failures (4) challenge the shared assumption (5) search prior art (6) propose fundamentally new approach (7) if still stuck, prepare BLOCKED report.

### 6. Verification Gate

Before ANY success claim: (1) Identify proving command (2) Run it fresh (3) Read full output (4) Binary confirm (5) Only then claim. Skip any step = lying.

### 7. Completion Status

DONE (all E3+) | DONE_WITH_CONCERNS (flagged issues) | BLOCKED (tried, need X) | NEEDS_CONTEXT (missing info).

### 8. Anti-Patterns (Hard Stops)

"Done" without proof → run gate. Micro-tweaks → escalation ladder. Advice not action → execute it. Waiting for user → take initiative. Premature surrender → try 3 approaches. Phase leaking → return to correct phase. Scope creep → check plan. Ship without review → enter Review stage first. Git ops outside Ship → only inside Ship stage.

---

## Reference

- CLI commands: `references/cli-reference.md`
- Platform setup: `references/platform-setup.md`

```
ROUTER:    Tier 1 → Tier 2 → Tier 3
PHASES:    Brainstorm → Plan → Execute → Review → Ship → Compound
TIER 1:    Execute → Ship
TIER 2/3:  Brainstorm → Plan → Execute → Review → Ship → Compound
TDD:       Test → RED → Code → GREEN → Refactor
EVIDENCE:  E0 → E1 → E2 → E3 → E4
ESCALATE:  L0 → L1 → L2 → L3 → L4
GATE:      Identify → Run → Read → Confirm → Claim
GIT LOCK:  git commit/push/pr → ONLY inside Ship stage
GATES:     Structural (1 SubAgent) → Substance (2-3 SubAgents) → Aggregate → Verdict
STATUS:    DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
```
