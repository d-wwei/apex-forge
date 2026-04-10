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

<CRITICAL>
BEFORE doing ANYTHING else — before checking CLI, before running any command, before saying "ready" —
you MUST call the AskUserQuestion tool with this exact question:

Question: "是否启动可视化面板？"
Header: "Dashboard"
Options:
  - label: "启动 Dashboard (Recommended)", description: "在浏览器里查看任务看板、pipeline 进度和遥测数据"
  - label: "跳过", description: "不启动，直接开始工作"

If "启动 Dashboard": run `nohup apex dashboard > /dev/null 2>&1 &` then open the printed URL.
If "跳过": proceed silently.

This is a BLOCKING GATE. You CANNOT proceed without the user's answer.
Do NOT say "ready", do NOT say "give me a task", do NOT run the Complexity Router until this is done.
</CRITICAL>

## Initialization (silent, every invocation)

```bash
which apex || echo "MISSING: add apex-forge to PATH"
apex init
apex memory backend
apex check-bindings 2>/dev/null
```

Then check `apex status --json` — if interrupted session exists, ask user to resume or restart.

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

Hard-gated. No leaking between phases.

- **Brainstorm (WHAT)** — No code. Output: requirements, constraints, success criteria.
- **Plan (HOW)** — Exact file paths, function signatures, test scenarios. No implementation.
- **Execute (DO)** — Build per plan. Tests first. No design decisions.

Code in Brainstorm → delete it. Design in Execute → return to Plan. Skipping Plan → stop, produce one.

### 3. TDD Iron Law

Write test → RED (fails correctly) → Write code → GREEN → Refactor. Exceptions: confirmed prototypes, tested generators only.

### 4. Evidence Grading

E0 (guess) → E1 (indirect) → E2 (direct) → E3 (multi-source) → E4 (validated + reproduced).
Thresholds: facts → E2, decisions → E2, verification → E3, closing DONE → E3.

### 5. Escalation Ladder

L0 normal → L1 (2nd fail: different approach) → L2 (3rd: 3 hypotheses) → L3 (4th: 7-point checklist) → L4 (5th: escalate to human).

### 6. Verification Gate

Before ANY success claim: (1) Identify proving command (2) Run it fresh (3) Read full output (4) Binary confirm (5) Only then claim. Skip any step = lying.

### 7. Completion Status

DONE (all E3+) | DONE_WITH_CONCERNS (flagged issues) | BLOCKED (tried, need X) | NEEDS_CONTEXT (missing info).

### 8. Anti-Patterns (Hard Stops)

"Done" without proof → run gate. Micro-tweaks → escalation ladder. Advice not action → execute it. Waiting for user → take initiative. Premature surrender → try 3 approaches. Phase leaking → return to correct phase. Scope creep → check plan.

---

## Reference

- CLI commands: `references/cli-reference.md`
- Platform setup: `references/platform-setup.md`

```
ROUTER:    Tier 1 → Tier 2 → Tier 3
PHASES:    Brainstorm → Plan → Execute
TDD:       Test → RED → Code → GREEN → Refactor
EVIDENCE:  E0 → E1 → E2 → E3 → E4
ESCALATE:  L0 → L1 → L2 → L3 → L4
GATE:      Identify → Run → Read → Confirm → Claim
STATUS:    DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
```
