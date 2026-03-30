---
name: apex-forge-brainstorm
description: Requirements exploration with hard gate — no code before approval
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Brainstorm Stage Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX BRAINSTORM STAGE ==="
apex_set_stage "brainstorm"

# Check for existing brainstorm artifacts
EXISTING=$(apex_find_upstream "brainstorm")
if [ -n "$EXISTING" ]; then
  echo ""
  echo "[apex] Found existing brainstorm artifacts:"
  echo "$EXISTING"
  echo ""
  echo "RESUME_AVAILABLE=true"
else
  echo "RESUME_AVAILABLE=false"
fi

apex_ensure_dirs
```

# Brainstorm Stage

> apex-forge / workflow / stages / brainstorm
>
> The design gate. No implementation begins until this stage produces
> an approved requirements document.

---

## HARD GATE DECLARATION

```
================================================================
  THIS STAGE ENFORCES A HARD GATE.

  While Brainstorm is active:
    - NO code files may be created or modified.
    - NO implementation work of any kind.
    - NO "let me just quickly scaffold" or "starter code."
    - NO pull requests, branches, or worktrees.

  The ONLY outputs are:
    - Conversation with the user.
    - A requirements document in docs/brainstorms/.

  Implementation begins at Execute stage, after the
  requirements pass through Plan.
================================================================
```

Violation of this gate is a pipeline integrity failure. If the agent
catches itself about to write implementation code during Brainstorm,
it must stop, log the violation attempt, and return to the checklist.

---

## On Entry: Resume Check

Before starting a new brainstorm:

1. The preamble scanned `docs/brainstorms/` for recent artifacts.
2. If `RESUME_AVAILABLE=true`, check each found file:
   - If a requirements doc has `status: draft` and was modified within
     the last 7 days:
     - Present it: "Found an in-progress requirements doc for **{name}**
       from {date}. Resume from where we left off?"
     - If user says yes: load the doc and continue from the last
       incomplete checklist step.
     - If user says no: archive the old doc (rename with `-archived` suffix)
       and start fresh.
   - If a requirements doc has `status: approved`:
     - "Requirements for **{name}** were already approved on {date}.
       Want to revise them, or proceed to planning with `/apex-plan`?"
3. If no matching artifacts exist, begin a fresh brainstorm.

---

## Scope Classification

Classify the request before running the checklist. Scope determines
checklist depth and downstream pipeline behavior.

| Scope | Criteria | Checklist | Typical Duration |
|-------|----------|-----------|-----------------|
| **Lightweight** | Single-file change, config update, bug fix with known cause, < 30 min effort | Abbreviated (steps 1, 3, 5, 8, 9) | 5-10 min |
| **Standard** | Multi-file feature, API addition, moderate refactor, 30 min - 4 hr effort | Full 9-step | 15-30 min |
| **Deep** | Architecture change, new subsystem, multi-service coordination, 4+ hr effort | Full 9-step + architecture diagram + risk matrix | 30-60 min |

### Scope Challenge

If the user claims something is Lightweight but the agent detects signals
of higher complexity (multiple files, unclear requirements, cross-cutting
concerns), escalate:

"You classified this as Lightweight, but I see {signals}. Want to
treat it as Standard to avoid surprises?"

---

## The 9-Step Checklist

### Step 1: Clarify the Actual Problem

- What is broken, missing, or suboptimal?
- Who is affected and how?
- What is the current behavior vs. desired behavior?
- Restate the problem in one sentence to confirm alignment.

**Output**: Problem statement (2-3 sentences max).

### Step 2: Identify Constraints and Boundaries

- What MUST NOT change? (existing contracts, public APIs, data formats)
- What are the performance, security, or compatibility requirements?
- What is explicitly out of scope?
- Time constraints or deadlines?

**Output**: Constraints list.

### Step 3: Enumerate Approaches (Minimum 2)

- Generate at least 2 distinct approaches to the problem.
- For Deep scope: generate at least 3.
- Each approach must be described in 2-4 sentences.
- Include the "do nothing" option if relevant.

**Output**: Numbered approach list with brief descriptions.

### Step 4: Evaluate Trade-offs

- For each approach, state:
  - Pros (what it gives you)
  - Cons (what it costs)
  - Risks (what could go wrong)
- Use a comparison table for Standard and Deep scope.

**Output**: Trade-off analysis (table or structured list).

### Step 5: Define Acceptance Criteria

- What must be true for the work to be considered done?
- Each criterion must be testable (manually or automatically).
- Minimum 3 criteria for Standard scope, 5 for Deep.
- Use "Given / When / Then" format where applicable.

**Output**: Numbered acceptance criteria list.

### Step 6: Identify Risks and Mitigations

- What could go wrong during implementation?
- What could go wrong after deployment?
- For each risk: probability (low/med/high), impact (low/med/high),
  mitigation strategy.
- Skip for Lightweight scope unless a risk is obvious.

**Output**: Risk table with mitigation column.

### Step 7: Specify Dependencies

- What existing code, services, or libraries does this depend on?
- What must be built first?
- Are there external dependencies (third-party APIs, human approvals)?
- Any blocking unknowns that need investigation first?

**Output**: Dependency list with status (available / needs-work / unknown).

### Step 8: Draft the Solution Shape

- Describe the chosen approach at a high level.
- Identify the key components, their responsibilities, and how they
  interact.
- For Standard+: include a rough component diagram (ASCII or description).
- NO implementation code. Directional descriptions only.
  - Good: "A middleware function that intercepts auth headers and
    validates JWTs against the key store."
  - Bad: `function authMiddleware(req, res, next) { ... }`

**Output**: Solution shape description.

### Step 9: User Approval Checkpoint

- Present the complete requirements summary.
- Ask explicitly: "Does this capture what you want to build? Any changes
  before we move to planning?"
- Wait for explicit approval, modification request, or rejection.
- Do NOT auto-approve. Do NOT interpret silence as approval.

**Output**: User's decision (approved / revise / reject).

---

## Anti-Rationalization Table

The agent (or user) may attempt to skip or abbreviate the brainstorm.
These are the common rationalizations and the correct response.

| Rationalization | Why It Fails | Correct Response |
|----------------|-------------|-----------------|
| "This is too simple for brainstorming" | Simple tasks have hidden complexity. The 2-minute brainstorm catches it. | Use Lightweight scope. Steps 1, 3, 5, 8, 9 take under 5 minutes. |
| "I already know exactly what to do" | Confirmation bias. You know what you THINK you need. | "Great, then the brainstorm will be quick. Let me confirm the criteria." |
| "We're wasting time, just start coding" | Premature coding wastes more time than a 10-minute brainstorm. | "The brainstorm protects your coding time. 10 minutes now saves hours later." |
| "Let me just prototype first" | Prototypes become production code. The brainstorm ensures you prototype the right thing. | "What specifically do you want to learn from the prototype? Let me capture that as acceptance criteria." |
| "The requirements are obvious" | Obvious to whom? Unstated requirements cause scope creep. | "Let me write them down so we agree. Takes 3 minutes." |
| "We already brainstormed this" | Check: is there an approved doc? If not, it was a conversation, not a brainstorm. | Resume check: look for existing docs. If none, it was not captured. |
| "This is just a bug fix" | Bug fixes still need: root cause hypothesis, verification criteria, regression scope. | Lightweight scope covers this. Problem + approach + criteria. |
| "The user is waiting" | Shipping the wrong thing is slower than brainstorming the right thing. | "5-minute Lightweight brainstorm. The user waits less when we ship correctly." |

---

## Artifact Output

When the user approves the requirements (Step 9 = approved):

### 1. Write the Requirements Document

Write to `docs/brainstorms/{name}-requirements.md` using the template below.
The `{name}` is a kebab-case slug derived from the feature/problem name.

```markdown
---
title: "{Feature Name} Requirements"
scope: lightweight | standard | deep
status: approved
created: YYYY-MM-DD
updated: YYYY-MM-DD
approver: "{user name or role}"
source_idea: "{link to ideation doc, if any}"
stage: brainstorm
apex_version: "0.1.0"
---

# {Feature Name} Requirements

## Problem Statement
{Step 1 output}

## Constraints
{Step 2 output}

## Approaches Considered
{Step 3 output}

## Trade-off Analysis
{Step 4 output}

## Acceptance Criteria
{Step 5 output}

## Risks and Mitigations
{Step 6 output}

## Dependencies
{Step 7 output}

## Solution Shape
{Step 8 output}

## Approval
- **Status**: approved
- **Decision date**: {YYYY-MM-DD}
- **Notes**: {any conditions or modifications from the approver}
```

### 2. Register the Artifact

After writing the file, run the state update:

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "brainstorm" "docs/brainstorms/{name}-requirements.md"
```

### 3. Handle Revisions

When the user requests revisions:

1. Keep `status: draft`.
2. Apply the requested changes.
3. Return to the relevant checklist step.
4. Re-present for approval.

### 4. Handle Rejection

When the user rejects:

1. Update `status: rejected`.
2. Ask: "Want to start over with a different approach, or shelve this?"
3. If starting over: archive current doc (`-archived` suffix) and begin fresh.
4. If shelving: leave the doc as rejected for future reference.

---

## Auto-Transition

After writing the approved artifact, tell the user:

> **Requirements captured.** Written to `docs/brainstorms/{name}-requirements.md`.
>
> Next: run `/apex-plan` to create the implementation plan.

Do NOT auto-advance to Plan. The user invokes the next stage explicitly.

---

## Completion Status

| Status | When |
|--------|------|
| **DONE** | Requirements approved and written to artifact file. |
| **DONE_WITH_CONCERNS** | Requirements approved with noted caveats or open questions. |
| **BLOCKED** | User rejected the requirements and chose to shelve the idea. |
| **NEEDS_CONTEXT** | Cannot complete checklist without additional information from user. |

---

## Integration Notes

- **From Ideate**: if an ideation doc exists, pre-populate Step 1 (problem)
  and Step 3 (approaches) from the selected idea.
- **To Plan**: the requirements doc is the sole input contract for Plan.
  The plan must trace every task back to an acceptance criterion.
- **Compound**: after the full pipeline completes, Compound may reference
  the brainstorm doc to extract problem-solution patterns.
