# Apex Forge: Stage Pipeline Definition

> The workflow layer of apex-forge. Defines the complete stage pipeline
> from idea to ship, with hard gates, proactive routing, and compound learning.

---

## Overview

Every task flows through a defined pipeline. Stages can be entered directly
(the user says "let's plan X") or sequentially. Each stage has:

- **Input contract**: what artifacts must exist before entering
- **Output contract**: what artifacts are produced
- **Gate condition**: what must be true before advancing
- **Skip condition**: when the stage can be bypassed

Not every task touches every stage. Trivial fixes skip to Execute.
Exploration stays in Ideate. The pipeline adapts to scope.

---

## Stage 0: Session Init

**Source**: superpowers + gstack

### Purpose
Bootstrap the session context. Every session begins here, even if the user
jumps straight to a task.

### Behavior

1. **SessionStart hook** fires automatically on first user message.
2. **Meta-skill injection**: the apex-forge system prompt, active workflow
   stage map, and proactive suggestion map are loaded into context.
3. **Iron Rule check**: verify the 1% skill check passes --- the agent can
   read its own configuration and confirm capability boundaries.
4. **Telemetry session ID** created (local only, no external reporting).
   Format: `apex-{YYYY-MM-DD}-{short-uuid}`
5. **Upstream artifact scan**: check `docs/plans/`, `docs/brainstorms/`,
   `docs/ideation/` for recent artifacts from previous sessions.
   - If found, surface them: "Found existing plan for X from {date}. Resume?"
6. **Environment snapshot**: working directory, git branch, dirty state,
   available tools.

### Output
- Session context object (internal, not written to disk)
- Resume suggestions if upstream artifacts exist

### Gate
- None. Session Init always completes. Failures here are logged but
  do not block the user.

---

## Stage 1: Ideate

**Source**: compound-engineering

### Purpose
Generate and filter ideas when the problem space is open-ended.

### Skip Condition
User already has a clear requirement or feature request. If the user says
"build X" or "fix Y", skip directly to Brainstorm or Plan.

### Behavior

1. **Parallel ideation**: 2-4 sub-agents independently generate ideas for
   the given problem space. Each operates with a different lens:
   - Lens A: User-centric (what does the end user need?)
   - Lens B: Technical-opportunistic (what does the tech make easy?)
   - Lens C: Contrarian (what assumption should we challenge?)
   - Lens D: Minimal (what is the smallest thing that matters?)
2. **Deduplication**: merge semantically similar ideas.
3. **Adversarial filter**: each idea is challenged with:
   - "Who specifically needs this?"
   - "What happens if we don't build it?"
   - "What is the cheapest way to test this?"
4. **Ranking**: surviving ideas ranked by impact / effort ratio.

### Output
- `docs/ideation/{name}-ideas.md`
- Contains: problem statement, idea list with one-line rationale each,
  recommended top pick, rejected ideas with rejection reason.

### Gate to Stage 2
- At least one idea survives the adversarial filter.
- User confirms which idea(s) to pursue.

---

## Stage 2: Brainstorm

**Source**: superpowers + compound-engineering

### Purpose
Translate an idea or requirement into a structured, reviewed design document.
This is the most important gate in the pipeline.

### HARD GATE

```
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  NO CODE. NO IMPLEMENTATION. NO FILE CREATION.
  Until the brainstorm output is explicitly approved by the user.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
```

This gate exists because premature implementation is the #1 cause of wasted
work in agent-assisted development.

### Behavior

1. **Resume check**: search `docs/brainstorms/` for a recent requirements doc
   matching the current topic. If found within 7 days, offer to continue
   from where it left off.
2. **Scope classification**:
   - **Lightweight** (< 30 min): single-file change, config update, bug fix.
     Abbreviated checklist (steps 1, 3, 5, 8, 9 only).
   - **Standard** (30 min - 4 hr): multi-file feature, API addition.
     Full 9-step checklist.
   - **Deep** (4+ hr): architecture change, new system, multi-service.
     Full checklist + architecture diagram + risk assessment.
3. **9-step checklist** (see `stages/brainstorm.md` for full detail):
   1. Clarify the actual problem
   2. Identify constraints and boundaries
   3. Enumerate approaches (minimum 2)
   4. Evaluate trade-offs
   5. Define acceptance criteria
   6. Identify risks and mitigations
   7. Specify dependencies
   8. Draft the solution shape
   9. User approval checkpoint
4. **Anti-rationalization**: reject attempts to skip brainstorm with
   excuses like "this is too simple" or "I already know what to do."

### Output
- `docs/brainstorms/{name}-requirements.md`
- YAML frontmatter with: scope, status, created, approver, stage
- Structured body: problem, constraints, approaches, decision, criteria,
  risks, dependencies, solution shape

### Terminal Action
- On approval: invoke Stage 3 (Plan).
- On rejection: loop back with feedback.

---

## Stage 3: Plan

**Source**: compound-engineering + gstack

### Purpose
Convert approved requirements into a concrete execution plan with file paths,
test paths, and sequenced tasks.

### Input Contract
- A requirements doc from Stage 2 (`docs/brainstorms/{name}-requirements.md`)
  with `status: approved`.
- If no requirements doc exists, offer to run Brainstorm inline before
  proceeding. Do NOT plan against unwritten requirements.

### Behavior

1. **Read upstream**: parse the requirements doc for problem frame,
   acceptance criteria, and solution shape.
2. **Plan quality bar** --- every plan MUST include:
   - Problem frame (1-2 sentences restating the core problem)
   - Exact file paths to create or modify
   - Exact test file paths
   - Key decisions with rationale (why X over Y)
   - Dependency order (what must be built first)
   - Test scenarios (at least one per acceptance criterion)
3. **NO implementation code**: plans contain directional pseudo-code at most.
   Actual code belongs in Stage 4.
4. **Scope challenge** (gstack rules):
   - **8-files rule**: if the plan touches more than 8 files, justify each
     one or split into sub-plans.
   - **2-classes rule**: if the plan introduces more than 2 new classes or
     modules, challenge whether the abstraction is necessary.
5. **Task decomposition**: break the plan into discrete tasks, each with:
   - Task ID (sequential)
   - Description
   - Files involved
   - Estimated complexity (trivial / small / medium / large)
   - Dependencies on other task IDs

### Output
- `docs/plans/{name}-plan.md`
- YAML frontmatter: scope, status, created, source-requirements, task-count
- Body: problem frame, task list, file manifest, test plan, decision log

### Gate to Stage 4
- Plan reviewed by user (or auto-approved for Lightweight scope).
- All acceptance criteria from requirements are traceable to test scenarios.

---

## Stage 4: Execute

**Source**: superpowers + compound-engineering + ruflo

### Purpose
Implement the plan. This is where code gets written.

### Input Contract
- An approved plan from Stage 3 (`docs/plans/{name}-plan.md`).
- For trivial tasks (typo fix, config change), plan may be implicit.

### Behavior

1. **Input triage** (determines dispatch strategy):
   - **Trivial** (1 file, < 20 lines changed): inline execution, no subagents.
   - **Small** (3-10 independent tasks): parallel subagents, each owns one task.
   - **Large** (10+ tasks or deep dependencies): hierarchical swarm with
     a coordinator agent dispatching to worker agents.
2. **Worktree isolation** (superpowers): before any code changes, create a
   git worktree or branch. Never modify the main branch directly during
   execution.
3. **Dispatch**:
   - Each task from the plan is assigned to an executor.
   - Executors receive: task description, file paths, acceptance criteria,
     test file paths.
   - Executors do NOT receive the full plan (reduces context pollution).
4. **Two-stage review per task**:
   - **Stage A**: spec compliance --- does the output match the task
     description and acceptance criteria?
   - **Stage B**: code quality --- clean code, no regressions, proper error
     handling.
5. **Cost-aware model routing**:
   - **Booster** (fast, cheap): mechanical transforms, renames, formatting.
   - **Haiku** (balanced): simple implementations, test writing, docs.
   - **Opus** (expensive, powerful): architecture decisions, complex logic,
     debugging failures.
6. **Progress tracking**: each task transitions through
   `pending -> in_progress -> review -> done | blocked`.

### Output
- Modified source files per the plan.
- Test files created or updated.
- Execution log: `docs/execution/{name}-log.md` with task status,
  time spent, model used, issues encountered.

### Gate to Stage 5
- All tasks in `done` state.
- No tasks in `blocked` state (or blocked tasks explicitly deferred by user).
- Tests pass locally.

---

## Stage 5: Review

**Source**: compound-engineering + superpowers

### Purpose
Multi-perspective review of the executed work before shipping.

### Mode System

| Mode | Behavior |
|------|----------|
| `interactive` | Present findings, wait for user response per issue |
| `autofix` | Fix non-controversial issues automatically, flag others |
| `report-only` | Generate report, make no changes |
| `headless` | Full auto: review + fix + report, no user interaction |

Default mode: `interactive` for Standard/Deep scope, `autofix` for Lightweight.

### Behavior

1. **Multi-persona parallel review**: 3 sub-agents review simultaneously:
   - **Correctness reviewer**: Does the code do what the spec says?
   - **Security reviewer**: injection risks, auth gaps, data exposure?
   - **Adversarial reviewer**: edge cases, race conditions, failure modes?
2. **Verification gate**: before any reviewer can claim "looks good",
   they must pass the 5-step verification function (see `stages/verify.md`):
   1. State the specific claim
   2. Describe the evidence needed
   3. Gather fresh evidence (re-read files, re-run tests)
   4. Compare evidence against claim
   5. Render verdict with evidence citation
3. **Finding classification**:
   - **BLOCKER**: must fix before ship
   - **CONCERN**: should fix, can ship with documented risk
   - **NOTE**: informational, no action required
4. **Completion status**:
   - `DONE` --- all reviewers pass, no blockers
   - `DONE_WITH_CONCERNS` --- no blockers, but concerns documented
   - `BLOCKED` --- blocker(s) found, must return to Execute
   - `NEEDS_CONTEXT` --- reviewer cannot assess without more information

### Output
- `docs/reviews/{name}-review.md`
- Contains: per-reviewer findings, verification evidence, completion status,
  recommended next action.

### Gate to Stage 6
- Completion status is `DONE` or `DONE_WITH_CONCERNS` (user-acknowledged).

---

## Stage 6: Ship

**Source**: gstack

### Purpose
Package, commit, and deliver the work.

### Input Contract
- Review status is `DONE` or `DONE_WITH_CONCERNS`.
- All tests pass.

### Behavior

1. **Test gate**: run full test suite. If any test fails, return to Execute
   with the failure context.
2. **Diff review**: generate a human-readable diff summary. Flag any
   unexpected file changes (files not in the plan).
3. **VERSION bump**: determine bump type from the plan scope:
   - Lightweight: patch
   - Standard: minor
   - Deep: major (or minor if non-breaking)
4. **CHANGELOG update**: append entry with date, version, summary of changes.
5. **Commit**: structured commit message following conventional commits.
6. **Push + PR**: push branch and create pull request with:
   - Title from plan name
   - Body from review summary
   - Link to requirements doc and plan
7. **Proactive suggestion**: before ship, suggest `/qa` if no QA stage was
   explicitly run. "Tests pass, but want to run a broader QA sweep first?"

### Output
- Git commit(s) on feature branch
- Pull request (if remote exists)
- Updated VERSION and CHANGELOG files

---

## Stage 7: Compound

**Source**: compound-engineering

### Purpose
Extract reusable knowledge from the completed work. This is how the system
gets smarter over time.

### Trigger
Auto-triggers after a task reaches `DONE` status in Review or after Ship.
Can also be manually invoked.

### Behavior

1. **Parallel extraction** via 3 sub-agents:
   - **Context Analyzer**: what was the situation and why did it arise?
   - **Solution Extractor**: what was done and what patterns emerged?
   - **Related Docs Finder**: what existing docs should be updated or linked?
2. **Overlap check**: before writing a new solution doc, search existing
   `docs/solutions/` for semantic overlap. If a similar solution exists,
   update it rather than creating a duplicate.
3. **Write solution doc**: `docs/solutions/{category}/{name}.md`
   - YAML frontmatter: title, category, tags, created, source-task,
     confidence (high/medium/low)
   - Body: context, problem, solution, caveats, related docs
4. **Selective refresh**: if related docs are stale (referenced files have
   changed since the doc was written), flag them for refresh.
5. **Index update**: update `docs/solutions/INDEX.md` with the new entry.

### Output
- New or updated solution doc in `docs/solutions/`
- Updated solution index
- Stale doc warnings (if any)

---

## Pipeline Diagram

```
                         APEX PROTOCOL PIPELINE
  ================================================================

  +------------------+
  | Stage 0: Init    |  <-- Every session starts here
  | - Meta-skill     |
  | - Artifact scan  |
  | - Env snapshot   |
  +--------+---------+
           |
           v
  +------------------+     skip if clear requirement
  | Stage 1: Ideate  | - - - - - - - - - - - - - - - +
  | - Parallel ideas |                                |
  | - Adversarial    |                                |
  +--------+---------+                                |
           |                                          |
           | user picks idea                          |
           v                                          v
  +------------------+                       +------------------+
  | Stage 2:         |  HARD GATE            | (direct entry)   |
  | Brainstorm       | ==================    |                  |
  | - 9-step check   |  NO CODE BEFORE      +--------+---------+
  | - Scope classify |  APPROVAL                      |
  +--------+---------+                                |
           |                                          |
           | approved                                 |
           v                                          |
  +------------------+                                |
  | Stage 3: Plan    |  <----------------------------+
  | - File paths     |
  | - Task decomp    |
  | - Scope challenge|
  +--------+---------+
           |
           | approved (or auto for Lightweight)
           v
  +------------------+
  | Stage 4: Execute |
  | - Triage         |
  | - Worktree       |
  | - Dispatch       |
  | - 2-stage review |
  +--------+---------+
           |
           | all tasks done + tests pass
           v
  +------------------+
  | Stage 5: Review  |
  | - Multi-persona  |
  | - Verify gate    |
  | - Findings       |
  +--------+---------+
           |
           | DONE or DONE_WITH_CONCERNS
           v
  +------------------+
  | Stage 6: Ship    |
  | - Tests          |
  | - Version bump   |
  | - Commit + PR    |
  +--------+---------+
           |
           | auto-trigger
           v
  +------------------+
  | Stage 7:         |
  | Compound         |
  | - Extract        |
  | - Deduplicate    |
  | - Index          |
  +------------------+

  ================================================================
  Gates: ===== (hard, blocks all progress)
         ----- (soft, can be overridden by user)
```

---

## Proactive Routing Map

The agent monitors conversation context and suggests the appropriate stage
when it detects intent signals.

| Signal | Suggested Stage | Agent Prompt |
|--------|----------------|--------------|
| "I have an idea" / "what if we..." / "explore" | Ideate | "Want to run a structured ideation session?" |
| "let's build X" / "I need a feature for..." | Brainstorm | "Let me draft requirements before we code." |
| "how should we..." / "what's the best approach" | Plan | "I'll create an execution plan for this." |
| Debugging / errors / stack traces | Execute with `/investigate` | "Let me investigate this systematically." |
| "does this work" / "is this correct" / "review" | Review | "I'll run a multi-perspective review." |
| "run tests" / "check quality" | Review (QA mode) | "Running QA sweep." |
| "ready to ship" / "let's merge" / "deploy" | Ship | "Let me run pre-ship checks first." |
| "that fixed it" / "resolved" / task completion | Compound | "Let me capture what we learned." |
| "continue" / "pick up where we left off" | (resume detection) | "Found artifacts from last session. Resume?" |

### Routing Rules

1. **Never auto-advance past a hard gate.** The Brainstorm gate requires
   explicit user approval before Plan.
2. **Suggest, don't force.** The agent proposes a stage; the user can
   override. "I see you want to build X. Normally I'd brainstorm first,
   but if you want to jump to planning, say the word."
3. **Scope-sensitive shortcuts.** For Lightweight scope, the agent may
   suggest collapsing Brainstorm + Plan into a single step.
4. **Re-entry is normal.** Review can send work back to Execute. Ship
   failures return to Execute. This is not an error; it is the pipeline
   working as designed.

---

## Artifact Directory Structure

```
docs/
  ideation/          # Stage 1 outputs
    {name}-ideas.md
  brainstorms/       # Stage 2 outputs
    {name}-requirements.md
  plans/             # Stage 3 outputs
    {name}-plan.md
  execution/         # Stage 4 logs
    {name}-log.md
  reviews/           # Stage 5 outputs
    {name}-review.md
  solutions/         # Stage 7 outputs
    INDEX.md
    {category}/
      {name}.md
```

---

## Cross-Stage Contracts

| From | To | Artifact | Required Fields |
|------|----|----------|----------------|
| Ideate | Brainstorm | `*-ideas.md` | selected idea, problem statement |
| Brainstorm | Plan | `*-requirements.md` | status: approved, acceptance criteria |
| Plan | Execute | `*-plan.md` | task list, file manifest, test plan |
| Execute | Review | source files + `*-log.md` | all tasks done, tests pass |
| Review | Ship | `*-review.md` | status: DONE or DONE_WITH_CONCERNS |
| Ship | Compound | git commit | merged or PR created |
| Any | Compound | resolution context | problem + solution pair |

---

## Configuration

Pipeline behavior can be tuned per-project in `.apex/config.yaml`:

```yaml
pipeline:
  default_scope: standard          # lightweight | standard | deep
  auto_compound: true              # trigger Stage 7 automatically
  review_mode: interactive         # interactive | autofix | report-only | headless
  brainstorm_gate: hard            # hard | soft (soft allows skip with warning)
  model_routing:
    trivial: haiku
    standard: sonnet
    complex: opus
  max_parallel_agents: 4
  worktree_isolation: true
```
