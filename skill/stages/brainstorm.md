---
name: brainstorm
description: Requirements exploration with hard gate -- no code before approval
---

# Brainstorm Stage

The design gate. No implementation begins until this stage produces
an approved requirements document.

Run `apex status` to check current stage before starting.

**On entry:** `apex stage set brainstorm`
**On completion:** `apex stage complete brainstorm` + `apex stage artifact brainstorm <requirements-file>`

---

## HARD GATE DECLARATION

```
================================================================
  THIS STAGE ENFORCES A HARD GATE.
  NO code, files, branches, worktrees, or PRs may be created.
  The ONLY outputs are: conversation + a requirements doc in docs/brainstorms/.
  Implementation begins at Execute stage, after requirements pass through Plan.
================================================================
```

Violation is a pipeline integrity failure. Stop, log the attempt, return to checklist.

---

## EVIDENTIARY DISCIPLINE

```
================================================================
  Tag ALL factual claims: [已验证] (investigated) or [假设] (unverified).
  Untagged assertions, deferred solutions labeled "solved", and API claims
  without docs are violations — same severity as "no code."
================================================================
```

---

## On Entry: Resume Check

1. Check `docs/brainstorms/` for existing artifacts matching the current task.
2. `status: draft` + modified within 7 days → offer to resume.
3. `status: approved` → offer to revise or proceed to Plan.

→ See `details/brainstorm-checklist.md` for the full Roadmap Context reading algorithm (snapshot mode, steps 5–9).

---

## Intent Routing

```
What is the user asking for?

→ Product decision / new product / "要不要做XX" / "写个 PRD" / market analysis
  → Route to /product-prd companion skill
  → Output: PRD document or validation summary

→ Specific development task / feature / bug fix / refactor
  → Continue with brainstorm checklist below
  → Output: requirements confirmation document
```

If ambiguous, ask: "PRD, or define development requirements directly?"

When routing to PRD path: `apex trace-skill brainstorm product-prd 2.0.0 <output_status> <af_mapping>`

---

## Scope Classification (Development Path)

| Scope | Criteria | Checklist | Typical Duration |
|-------|----------|-----------|-----------------|
| **Lightweight** | Single-file change, config update, bug fix with known cause, < 30 min effort | Abbreviated (steps 1, 3, 5, 8, 9) | 5-10 min |
| **Standard** | Multi-file feature, API addition, moderate refactor, 30 min - 4 hr effort | Full checklist | 15-30 min |
| **Deep** | Architecture change, new subsystem, multi-service coordination, 4+ hr effort | Full checklist + architecture diagram + risk matrix | 30-60 min |

If user claims Lightweight but signals indicate higher complexity, escalate to Standard.

---

## The Brainstorm Checklist

→ See `details/brainstorm-checklist.md` for full step descriptions, output requirements, and the Multi-Issue Discussion Protocol.

If any step surfaces > 5 open issues, switch to the Multi-Issue Discussion Protocol before continuing.

1. Clarify the Actual Problem (+ Evidence of Need)
2. Identify Constraints and Boundaries
3. Capability Audit (prove existing mechanisms don't cover the need)
4. Enumerate Approaches (Minimum 2)
5. Evaluate Trade-offs
6. Define Acceptance Criteria
7. Identify Risks and Mitigations (+ Anti-Double-Counting check)
8. Specify Dependencies
9. Draft the Solution Shape
10. User Approval Checkpoint

→ See `details/brainstorm-anti-patterns.md` for the Anti-Rationalization Table.

---

## Artifact Output

On Step 10 approval, write to `docs/brainstorms/{name}-requirements.md` (frontmatter: title, scope, status, dates, approval). Include "Confirmed Decisions" section if a decisions log was maintained.

→ See `details/brainstorm-decisions-log.md` for decisions log format and rules.

Register: `apex task create --stage brainstorm --artifact docs/brainstorms/{name}-requirements.md`

**Revisions**: Keep `status: draft`, apply changes, return to relevant step, re-present.
**Rejection**: Update `status: rejected`. Offer to restart or shelve.

---

## Exit Gate

Before `apex stage complete brainstorm`, run the Stage Exit Gate (`gates/stage-exit-gate.md`).

### Structural Checks

| # | Check | Criterion | Verification |
|---|-------|-----------|-------------|
| S1 | Artifact exists | `docs/brainstorms/{name}-requirements.md` exists | File read |
| S2 | Artifact registered | `apex stage artifact brainstorm` was called | .apex/state.json artifacts |
| S3 | Acceptance criteria | Document contains "Acceptance Criteria" section with >= 1 item | Section scan |
| S4 | Constraints | Document contains "Constraints" section | Section scan |
| S5 | Scope classification | Frontmatter contains `scope:` field (Lightweight/Standard/Deep) | Frontmatter check |
| S6 | Status approved | Frontmatter `status: approved` | Frontmatter check |
| S7 | Decisions transferred | If `{name}-decisions.md` exists, requirements doc contains "Confirmed Decisions" section | Conditional: file exists check + section scan |
| S8 | ADR written | If scope is Standard or Deep AND approaches section contains ≥2 rejected alternatives, then `docs/decisions/NNNN-*.md` must exist for this iteration. Lightweight scope is exempt. | Conditional: scope + approach count check + file glob |

### Substance Prompts (Tier 2+)

| # | Prompt | Cross-reference |
|---|--------|----------------|
| Q1 | Are the acceptance criteria specific and testable? Could a developer write a test for each one without asking clarifying questions? Flag any that are vague ("should be fast", "should look good"). | None |
| Q2 | Do the constraints reflect real project limitations? Is there evidence (codebase references, dependency versions, API contracts) backing each constraint, or are they assumptions? | Codebase scan |
| Q3 | Does every "resolved" / "solution provided" / "已解决" claim in the document contain the actual solution content? Flag any claim that says a problem is addressed but only defers it ("Phase 2 will handle this") or provides only a label without substance. | Line-by-line scan |
| Q4 | Are factual assertions tagged with their evidence basis ([已验证] or [假设])? Flag any untagged quantitative claim, API capability assertion, or behavioral prediction. | Line-by-line scan |

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
