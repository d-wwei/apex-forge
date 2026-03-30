---
name: apex-forge-wave
description: Wave-based delivery subskill — project-scale work that crosses sessions with persistent state (Tier 3)
user-invocable: true
---

# Wave-Based Delivery (Tier 3)

## What This Is

When the Complexity Router assigns **Tier 3**, the task is project-scale. It crosses session
boundaries. It requires persistent state. Individual sessions cannot hold all the context.

A **wave** is a group of 3-5 rounds (using round-based-execution) focused on a coherent scope —
one feature, one component, one integration boundary. Waves are the unit of cross-session work.

You do not "just keep going" across sessions. You plan waves, execute waves, review waves,
and hand off between waves with explicit state persistence.

---

## Phase 0: System Mapping

Before any wave planning begins, map the system. This step runs once at the start of a
Tier 3 project — before Wave 1 planning, before scoping, before any execution. Skipping
this step is the single most expensive failure mode: building on wrong assumptions about
system structure.

### Actions

1. **Modules**: Identify all relevant modules, services, and components. What exists today?
   What are their boundaries? Read the directory structure, entry points, and configuration
   to build a concrete inventory — not a guess.

2. **Interfaces**: Document how modules communicate. APIs (REST, gRPC, GraphQL), event buses,
   message queues, shared databases, shared state, file system dependencies, environment
   variables. Map every communication path, not just the obvious ones.

3. **Dependencies**: Draw the dependency graph. Which modules depend on which? Are there
   circular dependencies? What are the external dependencies (third-party services, databases,
   infrastructure)? What breaks if module X goes down?

4. **Unknowns**: List what you do not know yet. These are not weaknesses — they are the
   highest-value items to investigate. Each unknown becomes a potential clarify round in
   Wave 1. Be specific: "I don't know how auth tokens are refreshed" is useful. "I don't
   fully understand the system" is not.

5. **Risk areas**: Where are the most fragile parts? Code with no tests, modules with many
   dependents, components last modified years ago, areas with known tech debt, integration
   points with external services that have no retry/fallback logic.

### Output

Write the mapping to `.apex/waves/MAP.md` with these sections:

```markdown
# System Map

## Modules
- [module name]: [purpose] — [key files/directories]

## Interfaces
- [module A] → [module B]: [protocol/mechanism] — [key endpoints or events]

## Dependency Graph
- [module]: depends on [list of modules and external services]

## Unknowns
- [specific unknown]: [why it matters] — [how to resolve]

## Risk Areas
- [area]: [risk level: high/medium/low] — [reason]
```

### Why This Exists

The mapping step prevents the most expensive failure mode in project-scale work: building
on wrong assumptions about system structure. A team that spends 30 minutes mapping before
starting avoids weeks of rework from misunderstood interfaces, missed dependencies, or
fragile areas that break under change.

Every unknown surfaced here is a problem caught before it becomes a blocked wave.

---

## Wave Lifecycle

Every wave follows four phases:

### Phase 1: Wave Planning

**Purpose**: Define what this wave will accomplish and how.

**Actions**:
1. Read previous wave state (if this is not Wave 1).
2. Review the assumption registry — which assumptions still hold?
3. Define the wave scope: which feature, component, or integration boundary.
4. Identify the rounds this wave will contain (3-5 rounds, using round types from round-based-execution).
5. Define wave success criteria: what must be true for this wave to be complete.
6. Identify cross-wave dependencies: what does this wave need from previous waves? What will future waves need from this one?

**Output**: Wave plan document including scope, round sequence, success criteria, and dependencies.

**Anti-pattern**: Waves with no clear boundary. "Work on the backend" is not a wave scope. "Implement user authentication API with JWT tokens" is a wave scope.

---

### Phase 2: Round Execution (3-5 rounds)

**Purpose**: Execute the wave's rounds using round-based-execution.

**Behavior**: This is standard round-based execution (see `round-based-execution.md`). All round
rules apply: named round types, entry/exit criteria, assumption registry updates between rounds,
5-round maximum, evidence grading requirements.

**Wave-specific additions**:
- Each round inherits the wave's assumption registry (not just the previous round's).
- If a round disproves a cross-wave assumption, the wave must pause and reassess scope.
- If a round hits the escalation ladder at L3+, consider whether the wave scope was too ambitious.

**Anti-pattern**: Running rounds without connecting them back to the wave plan. Every round should advance the wave toward its success criteria. If a round doesn't, stop and reassess.

---

### Phase 3: Wave Review

**Purpose**: Assess what the wave accomplished relative to its plan.

**Actions**:
1. Compare outcomes against wave success criteria.
2. Document what was completed, what was partially completed, what was not started.
3. Update the assumption registry: which assumptions were confirmed? Disproven? Still unverified?
4. Update the decision log: which decisions were made during this wave and why?
5. Identify technical debt introduced (if any) and document it explicitly.
6. Grade the wave: COMPLETE (all criteria met), PARTIAL (some criteria met), or BLOCKED (cannot proceed).

**Output**: Wave review document with completion assessment, updated assumptions, updated decisions.

---

### Phase 4: Wave Handoff

**Purpose**: Persist state so the next session can resume without loss.

**Actions**:
1. Write the wave state file (see State Persistence below).
2. Summarize the handoff: what's done, what's next, what assumptions need re-checking.
3. Identify the next wave's likely scope (if known).
4. Flag any time-sensitive items (e.g., assumptions that may decay, dependencies that may change).

**Output**: Wave state file in `.apex/waves/`. Handoff summary.

---

## State Persistence

All wave state persists in `.apex/waves/`. This directory is the source of truth for cross-session continuity.

### Directory Structure

```
.apex/
  waves/
    wave-1.json
    wave-2.json
    wave-{N}.json
    assumptions.json
    decisions.json
```

### wave-{N}.json

```json
{
  "wave_number": 1,
  "status": "complete | partial | blocked | in_progress",
  "scope": "Description of what this wave covers",
  "planned_rounds": [
    {"type": "explore", "description": "Map authentication codebase"},
    {"type": "planning", "description": "Design JWT integration"},
    {"type": "execution", "description": "Implement token generation"},
    {"type": "verification", "description": "Verify auth flow end-to-end"},
    {"type": "hardening", "description": "Edge cases and error handling"}
  ],
  "completed_rounds": [
    {
      "type": "explore",
      "summary": "Mapped auth module. 3 entry points, 2 middleware layers.",
      "assumptions_updated": ["auth-middleware-stateless: confirmed at E3"],
      "evidence_grade": "E3"
    }
  ],
  "success_criteria": [
    {"criterion": "JWT tokens issued on login", "status": "met", "evidence": "E3"},
    {"criterion": "Token refresh works", "status": "not_started", "evidence": "none"}
  ],
  "started_at": "2026-03-29T10:00:00Z",
  "completed_at": null,
  "handoff_notes": "Auth token generation works. Refresh flow is next wave."
}
```

### assumptions.json

Cross-wave assumption registry. This is the master record that persists across all waves.

```json
{
  "assumptions": [
    {
      "id": "auth-001",
      "statement": "The auth middleware is stateless",
      "status": "confirmed",
      "evidence_grade": "E3",
      "source": "Wave 1, explore round — read middleware source",
      "carry_forward": "safe_to_carry_forward",
      "first_appeared": "wave-1",
      "last_verified": "wave-1",
      "depends_on": [],
      "depended_by": ["auth-002", "auth-003"]
    }
  ]
}
```

### decisions.json

Key decisions with full rationale. Decisions are never implicit.

```json
{
  "decisions": [
    {
      "id": "dec-001",
      "wave": 1,
      "round": "hypothesis",
      "decision": "Use JWT with short-lived access tokens + refresh tokens",
      "rationale": "Stateless middleware confirmed. Session-based auth would require middleware rewrite.",
      "alternatives_considered": [
        {"option": "Session-based auth", "rejected_because": "Requires stateful middleware rewrite"},
        {"option": "API keys only", "rejected_because": "No token rotation, poor security posture"}
      ],
      "depends_on_assumptions": ["auth-001"],
      "reversible": true
    }
  ]
}
```

---

## Cross-Session Resume Protocol

At the start of every session that continues a Tier 3 task:

### Step 1: Read Wave State

Read the most recent `wave-{N}.json`. Understand where the project stands.

### Step 2: Verify Assumptions

Review `assumptions.json`. For each assumption carried forward:

| Assumption Status | Action Required |
|---|---|
| confirmed (E3+) | No action. Safe to build on. |
| confirmed (E2) | Quick re-verification. Has the context changed since last session? |
| unverified | Must be verified before any round depends on it. |
| deferred | Re-evaluate: is it still safe to defer? |

**Critical rule**: Assumptions do NOT gain credibility through time. An E2 assumption from 3 sessions ago is still E2. It may even be weaker if the codebase has changed.

### Step 3: Check for External Changes

Before resuming:
- Has the codebase changed since the last wave? (git log, file timestamps)
- Have dependencies been updated?
- Have requirements changed?

If external changes affect any carried-forward assumption, re-verify before proceeding.

### Step 4: Resume or Re-plan

- If the wave is `in_progress`: resume from the last completed round.
- If the wave is `partial`: assess whether to continue or re-scope.
- If the wave is `blocked`: present the blocker to the human before proceeding.
- If a new wave is needed: run Wave Planning (Phase 1).

---

## Handoff Format

When a session ends mid-project, the handoff must be explicit:

```markdown
## Wave Handoff — Wave {N}

### Completed
- [List of completed items with evidence grades]

### In Progress
- [List of items started but not finished, with current state]

### Not Started
- [List of planned items not yet touched]

### Assumptions Needing Re-check
- [List of assumptions that should be verified at session start]
  - Especially: assumptions older than 1 session, assumptions at E2

### Recommended Next Action
- [Specific action to start the next session with]

### Known Risks
- [Anything that might go wrong or has changed since planning]
```

---

## Exit Criteria

A Tier 3 task is complete when:

1. **All waves complete**: Every wave's success criteria are met.
2. **All assumptions confirmed at E3+**: No unverified assumptions remain in the registry.
3. **All decisions documented**: `decisions.json` captures every non-trivial choice.
4. **Verification gate passed**: The full integrated result passes the Verification Gate from the core protocol.
5. **No known gaps**: Technical debt is documented, edge cases are handled or explicitly out-of-scope.

If any of these are not met, the task is not DONE. It is PARTIAL or BLOCKED.

---

## Wave Limits

There is no hard maximum on waves (unlike the 5-round limit within a wave), because
project-scale work genuinely varies in size. However:

- **Review after every 3 waves**: Is the project on track? Should the scope be revised?
- **Re-plan after every 5 waves**: Mandatory reassessment. Are the original goals still correct?
- **Escalate if stalled**: If two consecutive waves are PARTIAL or BLOCKED, escalate to the human. The project may need re-scoping.

---

## Integration with Core Protocol

- Wave-based delivery is the Tier 3 execution model defined in Section 2 of SKILL.md.
- Each wave uses round-based-execution (Tier 2) internally for its rounds.
- Evidence Grading (Section 5) governs all evidence within and across waves.
- Assumption Registry (Section 6) is the cross-wave master record in `assumptions.json`.
- Escalation Ladder (Section 7) applies within rounds. If a wave itself is blocked, escalate at the wave level.
- Phase Discipline (Section 3) still applies — waves do not bypass Brainstorm/Plan/Execute separation.
- Completion Status (Section 12) is reported per-wave and at project completion.
