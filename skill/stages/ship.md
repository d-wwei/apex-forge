---
name: ship
description: Package, commit, and deliver -- tests, version bump, changelog, commit, PR
---

# Ship Stage

The delivery gate. Tests pass, diff reviewed, version bumped,
changelog updated, committed, pushed, PR created.

---

## Entry Conditions

1. **Required upstream**: A review with status `DONE` or `DONE_WITH_CONCERNS`.
2. If no review found, tell the user to run the Review stage first.
   Do NOT ship unreviewed code.
3. If review status is `BLOCKED` or `NEEDS_CONTEXT`, resolve issues first.

---

## Pre-Flight Checks

Run these checks before any shipping actions. ALL must pass.

### Check 1: Tests Pass
Run the full test suite. ALL tests must pass. If any fail: STOP.

### Check 2: No Unexpected Changes
Every changed file should be traceable to the plan. Flag any file
changes NOT in the plan's file manifest. If unexpected files are found,
ask whether they are intentional.

### Check 3: Branch Hygiene
- Confirm NOT on main/master. If so, create a feature branch first.
- Confirm all changes are staged or committed.

### Check 4: Review Status Confirmed
Re-read the review artifact. Confirm status is DONE or DONE_WITH_CONCERNS.

### Check 5: Skill Invocation Trace & Binding Versions

**5a. Invocation trace completeness**

Run:
```bash
apex status --json | jq '.skill_invocations'
```

Or read `.apex/state.json` → `skill_invocations[]`. Verify that all required skills
from `bindings.yaml` (those with `concurrent: false`) were invoked during this
pipeline run. Missing invocations block ship.

After each external skill completes, the agent MUST record the trace:
```bash
apex trace-skill <stage> <skill> <version> <output_status> <af_mapping>
```

Example:
```bash
apex trace-skill review thorough-code-review 1.0.0 APPROVED af_review:pass
apex trace-skill review security-audit 1.2.0 PASS af_review:pass
```

Required checks:
- Execute stage: Was `systematic-debugging` invoked if bugs were encountered?
- Review stage: Was `thorough-code-review` (outgoing) invoked?
- Review stage: Was `security-audit` invoked if changes touch auth/data/network/deps?
- Review stage: Was `design-baseline` gate run if frontend files changed?

If any required skill invocation is missing, report which skill was skipped and
instruct the agent to return to the appropriate stage.

**5b. Binding version compliance**

Run:
```bash
apex check-bindings
```

This reads `bindings.yaml`, checks each skill's installed VERSION file against
the declared version constraint (e.g. `>=1.0.0`), and reports pass/fail.
Any version mismatch blocks ship.

---

## Ship Sequence

Execute in this exact order:

### Step 1: Version Bump

| Scope | Bump | Example |
|-------|------|---------|
| Lightweight | patch | 1.2.3 -> 1.2.4 |
| Standard | minor | 1.2.3 -> 1.3.0 |
| Deep | major (if breaking) or minor | 1.2.3 -> 2.0.0 or 1.3.0 |

Update `VERSION` file or `package.json` version field if they exist.

### Step 2: Changelog Update

Append an entry to `CHANGELOG.md` (create if needed) with version,
date, change summary, and links to pipeline artifacts.

### Step 3: Stage All Changes
Stage source files, test files, version/changelog updates, and
documentation artifacts.

### Step 4: Commit

Create a structured commit following conventional commits:

```
{type}({scope}): {short description}

{Body: what was built and why}

Requirements: docs/brainstorms/{name}-requirements.md
Plan: docs/plans/{name}-plan.md
Review: docs/reviews/{name}-review.md
```

Type mapping: feat (new feature), fix (bug fix), refactor, chore (config/build).

### Step 5: Push
Push the feature branch to remote. Skip if no remote is configured.

### Step 6: Pull Request
Create a PR with summary, review status, artifact links, and test results.
Use `gh pr create` if available; otherwise instruct the user.

---

## Branch Completion

After push/PR, present exactly these options to the user:

| Option | Action |
|--------|--------|
| **A. Merge locally** | `git checkout <base-branch> && git merge <feature-branch>` then clean up |
| **B. PR (already created)** | Keep branch, let reviewers handle merge |
| **C. Keep as-is** | Leave branch for later — no cleanup |
| **D. Discard** | `git branch -D <feature-branch>` and remove worktree if applicable |

Execute the chosen option. For options A, B, D: clean up worktree if one was used (`apex worktree cleanup <TASK_ID>`).

## Completion

After successful ship:

> **Shipped.** Commit `{hash}` on branch `{branch}`.
> {PR URL or "Push to remote and create PR manually."}
> Next: proceed to the Compound stage to capture learnings.

| Status | When |
|--------|------|
| **DONE** | Committed, pushed, PR created, branch handled. |
| **DONE_WITH_CONCERNS** | Shipped with acknowledged review concerns in PR. |
| **BLOCKED** | Pre-flight check failed. |
| **NEEDS_CONTEXT** | Missing review artifact or ambiguous status. |
