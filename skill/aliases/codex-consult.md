---
name: apex-forge-codex-consult
description: "Builtin: dispatches code review to an independent second-opinion agent (Codex, Gemini, or sub-agent)"
---

**This command obtains an independent second opinion on the current review.**

## When to Use

After `thorough-code-review` (outgoing) completes, dispatch the review artifact and diff to an independent agent for a fresh perspective.

## Dispatch Flow

1. **Gather inputs:**
   - `docs/reviews/{name}-review.md` (the review artifact)
   - `git diff` of all changed files
   - The original plan from `docs/plans/`

2. **Select dispatch method** (in order of preference):
   a. **Codex CLI** — if `codex` is available: `codex -q "Review this diff independently..."`
   b. **Sub-agent** — spawn an Agent with `isolation: "worktree"` for independent review
   c. **Manual** — present the review artifact and ask the user to get a second opinion

3. **Brief the reviewer:**
   ```
   You are an independent code reviewer. You have NOT seen the prior review.
   Review this diff for: correctness, security, performance, and maintainability.
   For each finding, cite file:line and severity (P0-P3).
   ```

4. **Collect and reconcile:**
   - Compare independent findings against existing review
   - Flag any P0/P1 findings that the original review missed
   - Flag any false positives in the original review
   - Append a "Second Opinion" section to the review artifact

## Output

Appends to `docs/reviews/{name}-review.md`:

```markdown
## Second Opinion (Independent Agent)

**Agent**: {codex | sub-agent | manual}
**Agreement rate**: {N}% of original findings confirmed
**New findings**: {list of findings not in original review}
**Disputed findings**: {list of original findings the second reviewer disagrees with}
```
