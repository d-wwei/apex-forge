---
name: apex-forge-ship
description: Package, commit, and deliver — tests, version bump, changelog, commit, PR
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Ship Stage Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX SHIP STAGE ==="
apex_set_stage "ship"

# Verify review was done
REVIEW=$(apex_find_upstream "review")
if [ -n "$REVIEW" ]; then
  echo "[apex] Found review artifacts:"
  echo "$REVIEW"
  echo "REVIEW_FOUND=true"
else
  echo "[apex] WARNING: No review artifacts found in docs/reviews/"
  echo "REVIEW_FOUND=false"
fi

# Pre-flight environment check
if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
  DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  echo ""
  echo "[apex] Git status:"
  echo "  Branch: $BRANCH"
  echo "  Uncommitted changes: $DIRTY"
  echo "GIT_AVAILABLE=true"
else
  echo "[apex] Not a git repository."
  echo "GIT_AVAILABLE=false"
fi

apex_ensure_dirs
```

# Ship Stage

> apex-forge / workflow / stages / ship
>
> The delivery gate. Tests pass, diff reviewed, version bumped,
> changelog updated, committed, pushed, PR created.

---

## Entry Conditions

1. **Required upstream**: A review with status `DONE` or `DONE_WITH_CONCERNS`
   (user-acknowledged).
2. If `REVIEW_FOUND=false`:
   - "No review found. Run `/apex-forge-review` first to validate the implementation."
   - Do NOT ship unreviewed code.
3. If review exists, verify its status:
   - Read the review doc and check the `status` field.
   - If `BLOCKED` or `NEEDS_CONTEXT`: "Review status is {status}. Resolve the
     issues and re-review before shipping."

---

## Pre-Flight Checks

Run these checks before any shipping actions. ALL must pass.

### Check 1: Tests Pass

```
Run the full test suite.
- ALL tests must pass.
- If any test fails: STOP. Do not ship.
  Report the failure and suggest returning to Execute.
```

### Check 2: No Unexpected Changes

```
Run git diff (or equivalent).
- Every changed file should be traceable to the plan.
- Flag any file changes NOT in the plan's file manifest.
- If unexpected files are found:
  "These files were changed but are not in the plan: {list}.
   Intentional? If yes, document the reason. If no, revert."
```

### Check 3: Branch Hygiene

```
- Confirm you are NOT on main/master.
- If on main/master: create a feature branch first.
- Confirm the branch is clean (all changes staged or committed).
```

### Check 4: Review Status Confirmed

```
- Re-read the review artifact.
- Confirm status is DONE or DONE_WITH_CONCERNS.
- If DONE_WITH_CONCERNS: list the concerns in the commit/PR body.
```

If any check fails, stop and report. Do not proceed.

---

## Ship Sequence

Execute in this exact order:

### Step 1: VERSION Bump

Determine bump type from the plan's scope:

| Scope | Bump | Example |
|-------|------|---------|
| Lightweight | patch | 1.2.3 -> 1.2.4 |
| Standard | minor | 1.2.3 -> 1.3.0 |
| Deep | major (if breaking) or minor | 1.2.3 -> 2.0.0 or 1.3.0 |

- If a `VERSION` file exists, update it.
- If `package.json` exists, update its `version` field.
- If neither exists, skip this step and note it.

### Step 2: CHANGELOG Update

Append an entry to `CHANGELOG.md` (create if it does not exist):

```markdown
## [{version}] - {YYYY-MM-DD}

### {Added|Changed|Fixed|Removed}
- {Summary of changes from the plan/review}

**Requirements**: `docs/brainstorms/{name}-requirements.md`
**Plan**: `docs/plans/{name}-plan.md`
**Review**: `docs/reviews/{name}-review.md`
```

### Step 3: Stage All Changes

```
git add the relevant files:
- Source files changed during Execute
- Test files created/updated
- VERSION and CHANGELOG updates
- Documentation artifacts (brainstorm, plan, execution log, review)
```

### Step 4: Commit

Create a structured commit message following conventional commits:

```
{type}({scope}): {short description}

{Body: 1-2 paragraphs summarizing what was built and why}

Requirements: docs/brainstorms/{name}-requirements.md
Plan: docs/plans/{name}-plan.md
Review: docs/reviews/{name}-review.md

{If DONE_WITH_CONCERNS: list the acknowledged concerns}
```

Type mapping:
- New feature -> `feat`
- Bug fix -> `fix`
- Refactor -> `refactor`
- Config/build -> `chore`

### Step 5: Push

```
Push the feature branch to remote.
- If no remote is configured: skip and note it.
- If push fails: report the error, do not retry blindly.
```

### Step 6: Pull Request

Create a PR using `gh pr create` (if gh CLI is available):

```
Title: {type}({scope}): {short description}
Body:
  ## Summary
  {1-3 bullet points from plan}

  ## Review Status
  {DONE or DONE_WITH_CONCERNS with details}

  ## Artifacts
  - Requirements: docs/brainstorms/{name}-requirements.md
  - Plan: docs/plans/{name}-plan.md
  - Review: docs/reviews/{name}-review.md

  ## Test Results
  {test count} tests passing, {0} failures
```

If `gh` is not available, instruct the user to create the PR manually
with the above content.

---

## Artifact Registration

After shipping:

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "ship" "commit:{commit_hash}"
```

---

## Auto-Transition

After successful ship:

> **Shipped.** Commit `{hash}` on branch `{branch}`.
> {PR URL if created, or "Push to remote and create PR manually."}
>
> Next: run `/apex-forge-compound` to document what was learned.

If ship failed at any step:

> **Ship failed at Step {N}: {description}.**
> {Specific error and suggested fix.}

---

## Completion Status

| Status | When |
|--------|------|
| **DONE** | All ship steps completed — committed, pushed, PR created. |
| **DONE_WITH_CONCERNS** | Shipped but with acknowledged review concerns documented in PR. |
| **BLOCKED** | Pre-flight check failed (tests, review status, branch hygiene). |
| **NEEDS_CONTEXT** | Missing review artifact or ambiguous review status. |

---

## Integration Notes

- **From Review**: review must be DONE or DONE_WITH_CONCERNS.
- **To Compound**: compound auto-triggers after ship, or user invokes manually.
- **Artifacts**: all pipeline artifacts (brainstorm, plan, execution log, review)
  are referenced in the commit message and PR for full traceability.
