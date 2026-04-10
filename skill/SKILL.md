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

Unified execution protocol for AI coding agents. Three ideas:

1. **Execution discipline** — complexity routing, phase gates, evidence grading
2. **Persistent state** — tasks, memory, and analytics tracked across sessions via CLI
3. **Structured workflows** — brainstorm, plan, execute, review, ship, compound

This protocol is **rigid**. Follow it exactly. The only flexibility is the Complexity Router, which determines how much structure a task requires.

## Command Modes

| Command | Purpose | Sub-skill |
|---------|---------|-----------|
| `apex-forge` | Activate core protocol (auto Tier routing) | — (inline below) |
| **Pipeline Stages** | | |
| `apex-forge brainstorm` | Requirements exploration, no code | `stages/brainstorm.md` |
| `apex-forge plan` | Implementation planning, no code | `stages/plan.md` |
| `apex-forge execute` | TDD-first implementation | `stages/execute.md` |
| `apex-forge review` | Multi-persona quality gate | `stages/review.md` |
| `apex-forge ship` | Package, commit, PR, finish branch | `stages/ship.md` |
| `apex-forge compound` | Knowledge extraction and capture | `stages/compound.md` |
| **External Skills** (installed by `install.sh`, dispatched via `bindings.yaml`) | | |
| `/systematic-debugging` | Systematic debugging | External skill |
| `/thorough-code-review` | Code review (outgoing + incoming) | External skill |
| `/browser-qa-testing` | QA testing + browser automation | External skill |
| `/security-audit` | Security audit | External skill |
| `/tasteful-frontend` | Frontend design guidance | External skill |
| `/design-to-code-runner` | Design-to-code implementation | External skill |
| `/product-review` | Product experience review | External skill |
| **Internal Gates** | | |
| `design-baseline` | Objective design quality gate (WCAG, layout, readability) | `gates/design-baseline.md` |
| **Roles** | | |
| `apex-forge scope-lock` | Lock edits to a directory (prevent scope creep) | `roles/scope-lock.md` |
| **Orchestration** | | |
| `apex-forge parallel` | Dispatch 2+ independent tasks to parallel agents | `roles/parallel-dispatch.md` |
| `apex-forge subagent-dev` | Per-task subagent dispatch with two-stage review | `roles/subagent-dev.md` |
| `apex-forge cross-session` | Resume plan execution across session boundaries | `roles/cross-session-exec.md` |
| `apex-forge worktree` | Isolated git worktree for branch work | `roles/worktree.md` |
| **Meta** | | |
| `apex-forge skill-author` | Create new skills using TDD for docs | `roles/skill-author.md` |
| `apex-forge status` | Show current project state | Run: `apex status` |

When a sub-skill is listed, read and follow that file relative to this SKILL.md's directory.

---

## Setup (Auto on First Use)

On every invocation, run these checks silently. Do NOT ask the user for permission.

**Step 1 — Check CLI availability:**

```bash
which apex || echo "MISSING: add apex-forge to PATH"
```

If missing, tell the user:
> Apex Forge CLI not found. Run: `export PATH="$PATH:<apex-forge-repo>/dist"` or add it to your shell profile.

**Step 2 — Auto-initialize project state:**

```bash
apex init
```

Always run this. It is idempotent. Creates `.apex/` with `state.json`, `tasks.json`, `memory.json` if they don't exist. Does nothing if they already exist.

**Step 3 — Offer dashboard:**

If no dashboard is running for this project (check `curl -s http://localhost:$(apex dashboard --port-only 2>/dev/null || echo 0)/api/state` fails), ask the user:

> 要启动可视化面板吗？可以在浏览器里看到任务看板、pipeline 进度和遥测数据。（Y/n）

If yes:
```bash
nohup apex dashboard > /dev/null 2>&1 &
```
Then open the URL in the browser. If no, skip silently.

---

## Core Protocol

### 1. Complexity Router

Every task enters the router before any work begins. You do not skip the router.

```
Can this task be completed in a single verified pass?
  YES → Tier 1 (Single Pass)
  NO  → Does it span multiple sessions or require persistent state?
    YES → Tier 3 (Wave-Based)
    NO  → Tier 2 (Round-Based)
```

**Tier 1 — Single Pass**: One action, one verification. Run the Verification Gate. Report with Completion Status. No rounds, no overhead.

**Tier 2 — Round-Based**: PDCA rounds with named types:

| Round Type | Entry | Exit |
|---|---|---|
| clarify | Ambiguous requirements | Requirements unambiguous |
| explore | Unknown territory | Hypothesis at E2+ |
| hypothesis | Evidence gathered | One approach selected with rationale |
| planning | Approach selected | Plan approved |
| execution | Plan exists | All items implemented |
| verification | Implementation complete | All claims at E3+ |
| hardening | Verification passed | No known gaps |
| recovery | Round failed | New viable approach identified |

Max 5 rounds per task. After round 5, escalate (BLOCKED).

**Tier 3 — Wave-Based**: Project-scale. Decompose into waves of 3-5 rounds. Each wave reads previous wave state, writes state file on exit.

### 2. Phase Discipline

Three phases. Hard-gated. No leaking.

**Brainstorm (WHAT)** — No code. No file paths. Output: requirements, constraints, success criteria.

**Plan (HOW)** — Exact file paths. Exact function signatures. Exact test scenarios. Every decision includes rationale. No implementation code.

**Execute (DO)** — Build per plan. Write tests first. Do not make design decisions. Deviations from plan must be documented.

| Violation | Correction |
|---|---|
| Code in Brainstorm | Delete the code. Finish requirements first. |
| Design in Execute | Stop. Return to Plan. Document the decision. |
| Skipping Plan | Stop. Produce a plan. Even a brief one. |

### 3. TDD Iron Law

1. Write the test.
2. Run it. Confirm RED (fails for the right reason).
3. Write minimum code to pass (GREEN).
4. Refactor. Tests stay green.

Exceptions: (1) Human-confirmed throwaway prototypes. (2) Generated code where the generator is tested. No others.

### 4. Evidence Grading

| Grade | Definition |
|---|---|
| E0 | Guess or assumption |
| E1 | Single indirect evidence |
| E2 | Direct evidence from one source |
| E3 | Confirmed from multiple sources |
| E4 | Multi-source validation + reproduction |

**Minimum thresholds**: Stating facts → E2. Execution decisions → E2. Verification claims → E3. Closing as DONE → E3.

E0 and E1 are never sufficient for action. Only for forming hypotheses.

### 5. Escalation Ladder

| Level | Trigger | Response |
|---|---|---|
| L0 | Normal | Standard protocol |
| L1 | 2nd failure | Fundamentally different approach. Not parameter tweaks. |
| L2 | 3rd failure | 3 distinct testable hypotheses. Test most likely first. |
| L3 | 4th failure | 7-point recovery checklist (restate goal, list attempts, find common thread, challenge shared assumption, search prior art, propose new approach, or prepare BLOCKED report) |
| L4 | 5th failure | Minimal reproduction case. Escalate to human with full context. |

### 6. Verification Gate

The 5-step gate runs before ANY success claim. No exceptions.

```
1. Identify what command/test PROVES the claim.
2. Run it. Fresh. In THIS context.
3. Read the FULL output.
4. Does it confirm? Yes or No. Not "probably."
5. Only if Yes, make the claim.
```

Skip any step → you are lying, not verifying.

### 7. Multi-Persona Review

For complex work, run three parallel review personas:

- **adversarial-reviewer**: Failure scenarios, cascade failures, abuse scenarios
- **security-reviewer**: Injection, SSRF, auth gaps, secret exposure
- **correctness-reviewer**: Edge cases, state consistency, contract violations, error paths

Findings use severity P0-P3 and autofix class (safe_auto / gated_auto / manual / advisory).

### 8. Completion Status

Every task ends with exactly one status:

| Status | Requirements |
|---|---|
| **DONE** | All verified at E3+, gate passed |
| **DONE_WITH_CONCERNS** | Complete but flagged issues listed |
| **BLOCKED** | What was tried, what is needed, recommended next step |
| **NEEDS_CONTEXT** | What info is missing and why |

### 9. Anti-Patterns (Hard Stops)

| # | Pattern | Correction |
|---|---|---|
| 1 | "Done" without proof | Run the Verification Gate now |
| 2 | Repeated micro-tweaks | Invoke the Escalation Ladder |
| 3 | Advice instead of execution | Execute it. Don't suggest it. |
| 4 | Waiting for user to steer | Take initiative. Act. Verify. Report. |
| 5 | Premature surrender | Try 3 different approaches before escalating |
| 6 | Assumption laundering | Check evidence grade. Unverified ≠ fact. |
| 7 | Phase leaking | Return to correct phase |
| 8 | Scope creep | Check the plan. Return to Plan if needed. |
| 9 | Evidence downgrade | Gather additional evidence to meet threshold |
| 10 | Optimism bias | Binary: does it work? Prove it. |

---

## CLI Quick Reference

All state management goes through the `apex` CLI. Run commands in the shell.

```
# Project
apex init                              Initialize .apex/ directory
apex status [--json]                   Show current state
apex dashboard [--port PORT]           Start visual dashboard

# Tasks (state machine: open → assigned → in_progress → to_verify → done)
apex task create TITLE [DESC] [DEPS]   Create a task (DEPS = task IDs)
apex task assign TASK_ID               Assign (open → assigned)
apex task start TASK_ID                Start work (assigned → in_progress)
apex task submit TASK_ID EVIDENCE      Submit for review (in_progress → to_verify)
apex task verify TASK_ID [pass|fail]   Verify (to_verify → done or back to in_progress)
apex task block TASK_ID REASON         Block a task
apex task release TASK_ID              Release assignment
apex task list [--status STATUS]       List tasks, optionally filter
apex task next                         Show next available task (respects dependencies)
apex task get TASK_ID                  Show task details

# Memory (persistent facts with confidence scoring)
apex memory add FACT CONFIDENCE [TAGS] Add fact (confidence: 0.0-1.0)
apex memory list [--min N]             List facts, optionally filter by confidence
apex memory search QUERY               Search facts
apex memory inject                     Output facts as XML for prompt injection
apex memory prune                      Remove low-confidence facts
apex memory remove FACT_ID             Delete a specific fact

# Telemetry
apex telemetry start SKILL             Start tracking a skill run
apex telemetry end OUTCOME             End tracking (success|error|abort)
apex telemetry report                  Show usage analytics

# Recovery
apex recover                           Clean stale state, fix stuck tasks
```

---

## Cross-Agent Compatibility

This skill works with any AI agent that can execute shell commands. The protocol instructions above are universal. State management always goes through the `apex` CLI.

**Tool mapping — use whatever your agent provides:**

| Operation | What to do |
|---|---|
| Read a file | Use your agent's file-read capability |
| Execute a shell command | Use your agent's shell/terminal tool |
| Search code | Use your agent's code search capability |
| Track progress | Use `apex task` CLI commands via shell |
| Store knowledge | Use `apex memory` CLI commands via shell |

**Platform-specific installation:** See `references/platform-setup.md` in this skill's directory.

**Key principle:** The protocol (complexity routing, phase gates, TDD, evidence grading, verification) is pure instruction that works in any agent. The CLI handles state persistence. No agent-specific features required.

---

## Quick Reference Card

```
ROUTER:    Tier 1 (Single Pass) → Tier 2 (Round-Based) → Tier 3 (Wave-Based)
PHASES:    Brainstorm (WHAT) → Plan (HOW) → Execute (DO)
TDD:       Write test → RED → Write code → GREEN → Refactor
EVIDENCE:  E0 (guess) → E1 (indirect) → E2 (direct) → E3 (multi) → E4 (validated)
ESCALATE:  L0 (normal) → L1 (different approach) → L2 (3 hypotheses) → L3 (checklist) → L4 (human)
GATE:      Identify → Run → Read → Confirm → Claim
STATUS:    DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
```
