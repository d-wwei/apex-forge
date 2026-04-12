---
title: "Multi-Agent Orchestration Redesign"
scope: deep
status: approved
approved_by: user
approved_at: 2026-04-12
created: 2026-04-12
last_modified: 2026-04-12
author: user + claude
roadmap_ref: "Phase 3: Multi-Agent Automatic Orchestration"
---

# Multi-Agent Orchestration Redesign

## Problem Statement

apex-forge's current orchestrator (`src/orchestrator.ts`, 271 lines) only implements ~20% of the
architecture design (`orchestration/ARCHITECTURE.md`). Agents are one-shot `--print` mode processes
that can't interact, can't recover from failures, can't see each other's progress, and all use the
same model — producing parallel speed but not diverse perspectives. The orchestration layer needs to
become a real multi-agent coordination system that works on any platform without external dependencies.

## Constraints

- **Must not break**: Pipeline stage model (brainstorm → plan → execute → review → ship)
- **Must not break**: Task state machine (open → assigned → in_progress → to_verify → done)
- **Must not break**: CLI interface (`apex orchestrate`, `apex task`, etc.)
- **Zero required dependencies**: Must work on any terminal (CMD, PowerShell, iTerm2, Ghostty, native Terminal)
- **No mandatory external tools**: cmux, tmux, Muster are optional enhancements, never required
- **Out of scope (this iteration)**:
  - Distributed multi-machine deployment (Raft/BFT)
  - Muster server integration
  - Cloud dashboard
  - Post-release user simulation testing (noted for future iteration)

---

## Core Architecture: Protocol + Adapter + Skill

### Design Philosophy

apex-forge is a **protocol orchestrator**, not a process manager. Its core value is execution
discipline (complexity routing, phase gates, TDD, evidence grading, verification gates), not
terminal management. Terminal management is delegated to pluggable adapters.

### Three Core Concepts + One Auxiliary

| Concept | Role | Example |
|---------|------|---------|
| **Task** | What to do | "Implement login API endpoint" |
| **Skill** | How to do it (process, format, gates) | `thorough-code-review`, `expert-panel-review` |
| **Adapter** | What runtime to use | ClaudeAdapter, CodexAdapter, GeminiAdapter |
| **Persona** (auxiliary) | What perspective to evaluate from | `technical-architect`, `first-time-user` |

Persona is NOT a separate architectural layer. It is an optional context module referenced by
evaluation/review Skills. Execution Skills (write code, run tests) do not use Personas.

---

## Two Orchestration Modes

### Mode 1: Parallel Dispatch (Horizontal Scaling)

Same agent type, different tasks, purpose: **speed**.

```
orchestrator → claude agent A → Task 1 (implement auth)
             → claude agent B → Task 2 (implement API)
             → claude agent C → Task 3 (implement UI)
```

All three agents may share the same model and same blind spots. This mode parallelizes
independent work items from the task DAG.

### Mode 2: Multi-Perspective (Vertical Depth)

Different agents/models/personas evaluating the same artifact, purpose: **eliminate blind spots**.

```
orchestrator → claude  + thorough-code-review(focus=maintainability)
             → codex   + thorough-code-review(focus=security)
             → gemini  + thorough-code-review(focus=performance)
```

Or with richer Personas for non-code review:

```
orchestrator → claude  + expert-panel-review + technical-architect persona
             → codex   + expert-panel-review + business-strategist persona
             → gemini  + expert-panel-review + ux-researcher persona
```

Mode 2 produces genuine multi-perspective evaluation, not just "same opinion from different models."

### Task Router

The router decides which mode to use based on task type and risk level:

| Task Type | Mode | Rationale |
|-----------|------|-----------|
| Implementation tasks (independent) | Mode 1 | Parallelism, same process |
| Code review (low risk) | Mode 1 | Single reviewer sufficient |
| Code review (high risk) | Mode 2 | Multiple perspectives needed |
| Plan/architecture review | Mode 2 | Expert panel review |
| Pre-ship user evaluation | Mode 2 | User perspective diversity |
| Bug diagnosis (stuck) | Mode 2 | Different model may see what current one missed |

---

## RuntimeAdapter Interface

Unified interface for all agent runtimes. Five methods:

```
spawn(task, prompt, config) → AgentHandle
monitor(handle) → Status        // running | idle | exited(code)
output(handle) → string         // stdout, output file, or structured result
kill(handle) → void
resume(handle, sessionId) → AgentHandle
```

### Adapter Implementations

| Adapter | Dependencies | Agent Capability | Priority |
|---------|-------------|-----------------|----------|
| **SpawnAdapter** | None (zero-dep) | `claude --print` child process | P0 — must ship |
| **CodexAdapter** | Codex CLI | `codex -q` child process | P0 — must ship |
| **GeminiAdapter** | Gemini CLI | `gemini-cli` child process | P1 — important |
| **TmuxAdapter** | tmux (optional) | Full interactive sessions | P2 — nice to have |
| **CmuxAdapter** | cmux (optional) | Full interactive + UI | P2 — nice to have |
| **ACPAdapter** | ACP protocol | Any ACP-compliant agent | P3 — future |
| **MusterAdapter** | Muster server | Enterprise heartbeat model | P3 — future |

SpawnAdapter is the default on all platforms. Other adapters auto-detected at startup:
if tmux is available, offer TmuxAdapter; if cmux is available, offer CmuxAdapter; etc.

### SpawnAdapter Design (Zero-Dependency Default)

The SpawnAdapter improves on the current `--print` spawn by adding:

1. **Workspace isolation**: Each task gets `.workspaces/APEX-{N}/` with git worktree
2. **Retry + backoff**: Exponential backoff `base * 2^(attempt-1)` with jitter, max 3 retries
3. **Structured output**: Agent writes `result.json` to workspace; orchestrator reads it
4. **Session continuity**: Uses `claude --continue` or `claude --resume {sessionId}` for retries
5. **Progress file**: Agent writes `progress.log` to workspace; orchestrator reads for monitoring
6. **DAG artifact injection**: When task B depends on task A, orchestrator copies A's output
   into B's workspace before spawning B

These capabilities come from Claude Code CLI features + file system conventions.
No terminal multiplexer needed.

---

## Skill + Persona System

### Skill Integration with Orchestration

Skills define the agent's behavior. When the orchestrator dispatches an agent, it injects:

```
Agent Prompt = Task Description + Skill Content + Persona Content (if applicable) + Workspace Context
```

Registry templates bind tasks to Skills:

```yaml
- id: code-review-security
  skill: thorough-code-review
  focus: security                     # Skill parameter (lightweight)
  model_hint: capable
  dispatch_mode: same-model           # Mode 1

- id: plan-expert-review-tech
  skill: expert-panel-review
  persona: experts/technical-architect  # Persona reference (rich context)
  model_hint: capable
  dispatch_mode: cross-model           # Mode 2
```

### Persona as Optional Context Module

Personas live in `skill/personas/` as lightweight YAML files (~15 lines each):

```
skill/personas/
  experts/
    technical-architect.yaml
    business-strategist.yaml
    ux-researcher.yaml
    security-engineer.yaml
  users/
    first-time-user.yaml
    power-user.yaml
```

Skills declare whether they need a Persona:

```yaml
# expert-panel-review skill
requires_persona: true

# thorough-code-review skill
requires_persona: false
accepts_focus: [security, performance, maintainability]
```

Initial set: 6 Personas (4 expert + 2 user). Expand based on actual need.

### Persona File Structure

```yaml
# skill/personas/experts/technical-architect.yaml
name: Technical Architect
background: "15 years distributed systems experience, survived 3 major rewrite failures"
evaluates_from: "Technical feasibility, system complexity, long-term maintenance cost"
typical_questions:
  - "Will this scale to 10x current data volume?"
  - "What is the biggest technical risk? Is there a fallback?"
  - "Can the current team's tech stack support this? How steep is the learning curve?"
blind_spots: "May undervalue market timing, tendency toward over-engineering"
output_format: "feasibility verdict + risk list + effort estimate"
```

---

## Pipeline Integration: New Review Stages

Two new multi-agent review points in the pipeline, both using Mode 2:

```
brainstorm → plan → [Expert Panel Review] → execute → [User Panel Review] → review → ship
                           ↑                              ↑
                      Mode 2: 3-4 agents             Mode 2: 2-3 agents
                      different expert Personas      different user Personas
                      optionally different models    optionally different models
```

### Expert Panel Review (post-plan)

Triggered when: plan scope is Standard or Deep (not Lightweight).
Default panel: technical-architect + business-strategist + ux-researcher.
Each panelist produces: verdict (GO / CAUTION / NO-GO) + findings + recommendations.
Orchestrator synthesizes: if any NO-GO → return to plan with feedback.

### User Panel Review (post-execute, pre-ship)

Triggered when: task involves user-facing changes.
Default panel: first-time-user + power-user.
Each panelist produces: task completion journal + confusion points + improvement suggestions.
Orchestrator synthesizes: blockers → must fix before ship; suggestions → create follow-up tasks.

Both panels are skippable via config or CLI flag for speed-critical situations.

---

## Implementation Priority

### Phase 1: Foundation (must ship)

1. `RuntimeAdapter` interface definition
2. `SpawnAdapter` implementation (improved --print with workspace + retry + structured output)
3. `CodexAdapter` implementation (Codex as cross-model reviewer)
4. Task Router (Mode 1 + Mode 2 routing logic)
5. Workspace isolation (git worktree per task)
6. Retry + exponential backoff
7. Structured result collection (result.json convention)
8. DAG artifact injection (A's output → B's input)

### Phase 2: Multi-Perspective (important)

9. `GeminiAdapter` implementation
10. Persona file system (`skill/personas/`)
11. `expert-panel-review` Skill
12. `user-panel-review` Skill
13. 6 initial Persona definitions
14. Expert Panel Review pipeline integration
15. User Panel Review pipeline integration

### Phase 3: Enhanced Runtime (nice to have)

16. `TmuxAdapter` (optional, auto-detected)
17. `CmuxAdapter` (optional, auto-detected)
18. Orchestrator terminal dashboard (`apex orchestrate --dashboard`)
19. Budget/cost tracking per agent
20. Coalesce + Defer (prevent duplicate dispatch)

### Phase 4: Future

21. `ACPAdapter` (when ACP standard matures)
22. `MusterAdapter` (enterprise integration)
23. Post-release user simulation testing (simulate diverse user cohorts using the product)
24. Raft/BFT (multi-machine deployment)

---

## Acceptance Criteria

1. `apex orchestrate` can dispatch 3 independent tasks to 3 parallel Claude agents (Mode 1)
   and all complete successfully with results collected
2. `apex orchestrate` can send a code review task to both Claude and Codex (Mode 2)
   and synthesize their findings into a unified report
3. Each task runs in an isolated git worktree; parallel tasks never interfere
4. A failed task is automatically retried up to 3 times with exponential backoff
5. When task B depends on task A, B's agent can access A's output artifacts
6. The entire system works on macOS, Linux, and Windows without any external tool dependency
7. Expert Panel Review can be triggered after plan stage with 3+ different Personas
8. Orchestrator logs structured analytics to `.apex/analytics/orchestrator.jsonl`

---

## Open Questions (for future iterations)

1. **Post-release simulation testing**: After ship, can we simulate a diverse cohort of
   "users" (via Personas) actually using the product and reporting bugs/UX issues?
   This extends the User Panel Review from "evaluate the artifact" to "use the product."
2. **ACP timeline**: When will ACP be mature enough to replace manual adapters?
3. **Cost optimization**: Should Mode 2 have a budget ceiling? Should cheap models
   handle simple reviews while expensive models handle complex ones?
4. **Skill parameter standardization**: Should `focus` be a first-class Skill parameter
   with a defined vocabulary, or remain free-form?
