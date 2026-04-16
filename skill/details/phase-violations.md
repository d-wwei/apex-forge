# Phase Violations — Reference Table and L3 Checklist

## Phase Violations Table

| Violation | Example | Correction |
|-----------|---------|------------|
| Code in Brainstorm | Writing a prototype during requirements | Delete the code. Finish requirements first. |
| Design in Execute | "I think we should restructure this..." | Stop. Return to Plan phase. Document the decision. |
| Skipping Plan | Going from "what" directly to code | Stop. Produce a plan. Even a brief one. |
| Ship without Review | Execute done → git commit | Stop. Enter Review stage. Code cannot be committed without review. |
| Git ops outside Ship | git commit/push while stage != ship | Stop. Git operations only execute inside Ship stage. |
| Skip Compound prompt | Ship done → end session without asking | Must call AskUserQuestion for Compound. User may decline, but must be asked. |
| Re-entry before Compound | Ship done → ask "继续下一个迭代?" | Stop. Enter Compound first. Re-entry questions belong to Compound's Completion section. |

---

## L3 Escalation Checklist (7 points)

Triggered at the 4th consecutive failure on the same problem (L3 on the Escalation Ladder).

1. **Restate the goal** — Write out what "done" looks like in one sentence. Not the approach, the outcome.
2. **List all attempts** — Every approach tried so far, in order. Be specific: what was tried, what happened.
3. **Find the common thread of failures** — What do all the failed attempts have in common? What assumption is shared?
4. **Challenge the shared assumption** — If that assumption is wrong, what would be true instead? Is there evidence it is actually wrong?
5. **Search prior art** — Check codebase history (`git log`), existing patterns, documentation, or external references for a solved version of this problem.
6. **Propose a fundamentally new approach** — Not a variation of what was tried. A different strategy that does not share the failing assumption.
7. **If still stuck, prepare a BLOCKED report** — State exactly what is needed from a human: the specific question, the specific blocker, and what was already ruled out.

This checklist is mandatory at L3. Skipping to step 7 without completing steps 1-6 is a protocol violation.
