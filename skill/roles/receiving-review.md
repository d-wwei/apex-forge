---
name: apex-forge-receiving-review
description: "Use when receiving code review feedback, before implementing suggestions. Enforces technical rigor: verify feedback against codebase reality, push back when wrong, clarify before implementing, reject YAGNI."
---

# Receiving Review

Evaluate review feedback with technical rigor before implementing. Verify claims against the codebase. Push back when wrong. Clarify when unclear. Never implement blindly.

---

## FORBIDDEN RESPONSES

These are symptoms of performative agreement, not technical evaluation:

- "You're absolutely right!" (without verification)
- "Great point!" / "Excellent feedback!" (flattery, not analysis)
- "Let me implement that now" (before checking the codebase)
- Implementing every suggestion without evaluating any

**Instead**: Restate the technical requirement. Verify it. Then act or push back.

---

## PROCESS — Per Review Comment

```
FOR EACH review comment:

1. READ    — Understand the claim. Restate it in your own words.
2. VERIFY  — Check the claim against the actual codebase.
             grep for usage, read the code, trace the flow.
3. CLASSIFY:
   - VALID FIX       — Correct, actionable. Implement it.
   - VALID BUT YAGNI — Correct in theory, but the code is unused.
   - INCORRECT       — Wrong for this codebase. Push back with evidence.
   - UNCLEAR         — Cannot evaluate without more information.
4. ACT     — Based on classification (see below).
```

---

## CLASSIFICATION ACTIONS

### Valid Fix
Implement it. Keep acknowledgment factual:
- "Fixed. Changed X to Y in `path/file.ext`."
- "Good catch — [specific issue]. Fixed in [location]."
- Or just fix it silently — the code speaks.

### Valid but YAGNI
```
IF reviewer suggests "proper implementation" of something:
  grep the codebase for actual usage

  IF no callers exist:
    "Grepped for usage — nothing calls this. Remove it (YAGNI)?"
  IF callers exist:
    Implement properly.
```

Do not build infrastructure for code nobody uses because a reviewer called it "the right way."

### Incorrect
Push back with technical evidence, not defensiveness:
- Reference working tests, existing behavior, or architectural constraints.
- Ask specific questions that expose the gap in the reviewer's understanding.
- Cite the actual code: file, line, what it does.

```
Example:
  Reviewer: "Remove this legacy code path"
  You: "Checked — build target is 10.15+, this API requires 13+.
        Legacy path is needed for backward compat.
        The bundle ID is wrong though — fix that, or drop pre-13 support?"
```

### Unclear
**STOP. Do not implement anything yet.**

Items may be interdependent. Partial understanding produces wrong implementations.

```
Example:
  Reviewer gives items 1-6.
  You understand 1, 2, 3, 6. Unclear on 4 and 5.

  WRONG: Implement 1, 2, 3, 6 now. Ask about 4, 5 later.
  RIGHT: "I understand 1, 2, 3, 6. Need clarification on 4 and 5
          before proceeding — they may affect how I implement the others."
```

---

## REVIEWER SOURCE HANDLING

### Internal Reviewer (Team Lead / Project Owner)
- Higher trust baseline — implement after understanding.
- Still verify if something seems off. Trust does not override correctness.
- Skip performative language. Go straight to action or technical response.
- If a suggestion conflicts with prior architectural decisions, raise it.

### External Reviewer
Apply extra scrutiny. External reviewers lack full project context.

```
BEFORE implementing external feedback:
  1. Technically correct for THIS codebase? (not just in general)
  2. Breaks existing functionality or tests?
  3. Reason the current implementation exists? (check git blame/log)
  4. Works across all supported platforms/versions?
  5. Does the reviewer understand the full context?

IF conflicts with project owner's prior decisions:
  Flag it. Do not silently override architectural choices.
```

---

## IMPLEMENTATION ORDER

For multi-item feedback, after all items are classified:

```
1. Clarify all unclear items FIRST (do not start partial work)
2. Implement in priority order:
   a. Blocking issues (security, data loss, crashes)
   b. Simple fixes (typos, imports, naming)
   c. Complex fixes (refactoring, logic changes)
3. Test each fix individually
4. Verify no regressions after the full set
```

---

## WHEN TO PUSH BACK

Push back when:
- Suggestion breaks existing functionality (cite the test or behavior)
- Reviewer lacks context on why the code exists (cite git history)
- YAGNI — feature/code is unused (cite grep results)
- Technically incorrect for this stack/version (cite docs or constraints)
- Conflicts with established architectural decisions

**How**: Technical reasoning only. Reference code, tests, history. No defensiveness.

**If you pushed back and were wrong**:
- "Checked again — you're right. [Reason my initial read was wrong]. Implementing."
- No long apologies. State the correction, move on.

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | All comments classified, valid fixes implemented, pushbacks sent with evidence |
| **DONE_WITH_CONCERNS** | Implemented but disagree with some accepted changes — documented reasoning |
| **BLOCKED** | Unclear items remain after asking for clarification |
| **NEEDS_CONTEXT** | Cannot evaluate feedback without understanding the original requirements |
