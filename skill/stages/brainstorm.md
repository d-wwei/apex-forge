---
name: brainstorm
description: Requirements exploration with hard gate -- no code before approval
---

# Brainstorm Stage

The design gate. No implementation begins until this stage produces
an approved requirements document.

Run `apex status` to check current stage before starting.

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

## On Entry: Resume Check + Roadmap Context

Before starting a new brainstorm:

1. Check `docs/brainstorms/` for recent artifacts.
2. If a requirements doc has `status: draft` and was modified within
   the last 7 days, offer to resume from where it left off.
3. If a requirements doc has `status: approved`, offer to revise or
   proceed to planning.
4. If no matching artifacts exist, begin a fresh brainstorm.

### Roadmap Awareness

5. Check if `docs/iteration-roadmap.md` exists.
6. If it exists, read the **当前状态速览** and **建议的下一个迭代** sections.
7. If the user's request aligns with a Roadmap item, mention it:
   > "This aligns with a Roadmap item from the last iteration: {item}. I'll use that context."
8. If the user starts a fresh brainstorm without a specific request, surface
   the top 3 Roadmap items as suggestions:
   > "The Roadmap from previous iterations suggests these priorities: ..."
9. Do NOT auto-select a Roadmap item. The user decides what to work on next.

---

## Intent Routing

Before classifying scope, determine the user's intent:

```
What is the user asking for?

→ Product decision / new product / "要不要做XX" / "写个 PRD" / market analysis
  → Route to /product-prd (companion skill)
  → Output: PRD document or validation summary
  → After PRD approved → proceed to Plan stage

→ Specific development task / "做一个XX功能" / bug fix / refactor
  → Continue with the 9-step checklist below
  → Output: requirements confirmation document
  → After requirements approved → proceed to Plan stage
```

**Signal phrases for PRD path**: "写 PRD", "做需求文档", "要不要做", "新功能规划",
"产品决策", "市场分析", "这个产品方向", "写个产品需求文档"

**Signal phrases for development path**: "帮我做一个", "加一个功能", "修这个 bug",
"重构", "优化性能", "添加 API", specific technical tasks

If ambiguous, ask: "This sounds like it could be a product-level decision or a
development task. Should I help with a PRD, or should we define the development
requirements directly?"

### Skill Dispatch (PRD Path)

When routing to PRD path, invoke the product-prd companion skill:

```bash
# Record invocation after completion
apex trace-skill brainstorm product-prd 2.0.0 <output_status> <af_mapping>
```

---

## Scope Classification (Development Path)

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
concerns), escalate and suggest treating it as Standard.

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

**Output**: Constraints list.

### Step 3: Enumerate Approaches (Minimum 2)
- Generate at least 2 distinct approaches (3 for Deep scope).
- Each approach described in 2-4 sentences.
- Include the "do nothing" option if relevant.

**Output**: Numbered approach list with brief descriptions.

### Step 4: Evaluate Trade-offs
- For each approach: Pros, Cons, Risks.
- Use a comparison table for Standard and Deep scope.

**Output**: Trade-off analysis.

### Step 5: Define Acceptance Criteria
- What must be true for the work to be considered done?
- Each criterion must be testable. Minimum 3 for Standard, 5 for Deep.
- Use "Given / When / Then" format where applicable.

**Output**: Numbered acceptance criteria list.

### Step 6: Identify Risks and Mitigations
- What could go wrong during implementation or after deployment?
- For each risk: probability, impact, mitigation strategy.
- Skip for Lightweight scope unless a risk is obvious.

**Output**: Risk table with mitigation column.

### Step 7: Specify Dependencies
- What existing code, services, or libraries does this depend on?
- What must be built first? Any blocking unknowns?

**Output**: Dependency list with status (available / needs-work / unknown).

### Step 8: Draft the Solution Shape
- Describe the chosen approach at a high level.
- Identify key components, responsibilities, and interactions.
- NO implementation code. Directional descriptions only.

**Output**: Solution shape description.

### Step 9: User Approval Checkpoint
- Present the complete requirements summary.
- Ask explicitly for approval.
- Do NOT auto-approve. Do NOT interpret silence as approval.

**Output**: User's decision (approved / revise / reject).

---

## Anti-Rationalization Table

| Rationalization | Why It Fails | Correct Response |
|----------------|-------------|-----------------|
| "This is too simple for brainstorming" | Simple tasks have hidden complexity. | Use Lightweight scope. Steps 1, 3, 5, 8, 9 take under 5 minutes. |
| "I already know exactly what to do" | Confirmation bias. | "Great, then the brainstorm will be quick. Let me confirm the criteria." |
| "We're wasting time, just start coding" | Premature coding wastes more time. | "10 minutes now saves hours later." |
| "Let me just prototype first" | Prototypes become production code. | "What do you want to learn? Let me capture that as acceptance criteria." |
| "The requirements are obvious" | Unstated requirements cause scope creep. | "Let me write them down so we agree. Takes 3 minutes." |
| "We already brainstormed this" | If no approved doc exists, it was not captured. | Check for existing docs. If none, start fresh. |
| "This is just a bug fix" | Bug fixes still need root cause + verification criteria. | Lightweight scope covers this. |
| "The user is waiting" | Shipping the wrong thing is slower. | "5-minute Lightweight brainstorm." |

---

## Artifact Output

When the user approves (Step 9 = approved), write to
`docs/brainstorms/{name}-requirements.md` with frontmatter including
title, scope, status, dates, and approval info. The document captures
all 9 checklist outputs.

After writing, register with: `apex task create --stage brainstorm --artifact docs/brainstorms/{name}-requirements.md`

### Revisions
Keep `status: draft`, apply changes, return to the relevant step, re-present for approval.

### Rejection
Update `status: rejected`. Offer to start over or shelve.

---

## Completion

After writing the approved artifact:

> **Requirements captured.** Written to `docs/brainstorms/{name}-requirements.md`.
> Next: proceed to the Plan stage to create the implementation plan.

Do NOT auto-advance to Plan. The user invokes the next stage explicitly.

| Status | When |
|--------|------|
| **DONE** | Requirements approved and written to artifact file. |
| **DONE_WITH_CONCERNS** | Approved with noted caveats or open questions. |
| **BLOCKED** | User rejected and chose to shelve. |
| **NEEDS_CONTEXT** | Cannot complete checklist without additional info. |
