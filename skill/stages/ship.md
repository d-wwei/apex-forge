---
name: ship
description: Package, commit, and deliver -- tests, version bump, changelog, commit, PR
---

# Ship Stage

The delivery gate. Tests pass, diff reviewed, version bumped, changelog updated, committed, pushed, PR created.

**On entry:** `apex stage set ship`
**On completion:** `apex stage complete ship`

---

## Entry Conditions

1. `docs/reviews/{name}-review.md` must exist with status DONE or DONE_WITH_CONCERNS.
2. No finding with severity P0 may have unresolved status.
3. If status is BLOCKED or NEEDS_CONTEXT: resolve Review issues first. Do NOT ship.
4. If no review found: instruct user to run the Review stage first.
5. If any check fails: report which check failed. Do NOT ship unreviewed code.

---

## Pre-Flight Checks — ALL must pass before any shipping actions

**Check 1: Tests Pass** — Run the full test suite. ALL tests must pass. If any fail: STOP.
**Check 2: No Unexpected Changes** — Every changed file must be traceable to the plan. Flag files NOT in the manifest; ask if intentional.
**Check 3: Branch Hygiene** — Confirm NOT on main/master. Confirm all changes are staged or committed.
**Check 4: Review Status Confirmed** — Re-read review artifact. Status must be DONE or DONE_WITH_CONCERNS.
**Checks 5–6** → `details/ship-sequence.md` (Check 5: Skill Invocation Trace & Binding Versions; Check 6: Opensource Preflight Scan).

---

## Ship Sequence — execute in this exact order

**Step 1: Version Bump**

| Scope | Bump | Example |
|-------|------|---------|
| Lightweight | patch | 1.2.3 -> 1.2.4 |
| Standard | minor | 1.2.3 -> 1.3.0 |
| Deep | major (if breaking) or minor | 1.2.3 -> 2.0.0 or 1.3.0 |

Update `VERSION` file or `package.json` version field if they exist.

**Step 2: Changelog Update** — Append entry to `CHANGELOG.md` (create if needed): version, date, summary, artifact links.
**Step 3: README & Repository Presentation** → `details/ship-sequence.md` (Path A: new repo — naming + README + metadata; Path B: existing repo — update options).
**Step 4: Stage All Changes** — Source, tests, version/changelog, README, docs artifacts.
**Step 5: Commit**

```
{type}({scope}): {short description}

{Body: what was built and why}

Requirements: docs/brainstorms/{name}-requirements.md
Plan: docs/plans/{name}-plan.md
Review: docs/reviews/{name}-review.md
```

Type mapping: feat / fix / refactor / chore.

**Step 6: Push (requires user confirmation)** — Output mandatory iteration summary (4 sections: 做了什么 / 能干什么 / 怎么试 / 注意事项), then call `AskUserQuestion` for push confirmation.
→ `details/ship-sequence.md` (summary template, style rules, push prompt options, checkpoint command).
**Step 7: CI Status Check** — Only runs if push succeeded. Detect CI config, poll up to 10 min. No bypass — CI must pass.
→ `details/ship-sequence.md` (detection script, poll loop, verdict mapping, repair options, GitLab adaption).
**Step 8: GitHub Repository Metadata** — Only runs if push succeeded. Apply description, topics, release from `.apex/ship-metadata.json` / `.apex/ship-release.json`. Cleanup after use.
→ `details/ship-sequence.md` (bash commands for new vs existing repos, release creation).
**Step 9: Pull Request** — Create PR with summary, review status, artifact links, test results. Use `gh pr create`; otherwise instruct user. CI must pass before this step.

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

---

## Compound Transition (mandatory, before Exit Gate)

After branch completion, Compound is the next stage — not optional. Inform the user:

> 交付完成。进入复盘阶段（Compound）。

**No skip option.** Every iteration walks all six stages. Compound may be brief (one sentence: "无特别经验"), but it cannot be skipped. This is enforced by the Exit Gate (S3). Record that the transition was announced — this MUST happen before the Exit Gate runs.

---

## Exit Gate

Before `apex stage complete ship`, run the Stage Exit Gate (`gates/stage-exit-gate.md`).

### Structural Checks

| # | Check | Criterion | Verification |
|---|-------|-----------|-------------|
| S1 | Git commit exists | `git log -1 --oneline` returns a commit for this pipeline | git log |
| S2 | Review status confirmed | Review artifact status is DONE or DONE_WITH_CONCERNS | File re-read |
| S3 | Compound transition announced | The mandatory Compound transition message was **actually output** (not deferred or skipped). | Flow check: transition message present in conversation |
| S4 | Preflight scan passed | No CRITICAL findings in committed files | Re-run `/opensource-preflight --mode quick --scope diff HEAD~1` |
| S5 | CI green | If repo has CI: all checks must pass. No bypass. If no CI configured: auto-pass. | `gh run list --limit 1` status check |
| S6 | README exists | If pushed to a public repo: `README.md` must exist in the repo root. New repos must also have `README_CN.md` or `README.zh-CN.md`. | `git show HEAD:README.md` |
| S7 | Push prompt issued | AskUserQuestion for push (Step 6) was **actually called** and user responded. "暂不推送" is a valid response; silently skipping the prompt is not. | Flow check: user response recorded |
| S8 | Iteration summary issued | Step 6a iteration summary (4 sections: 做了什么/能干什么/怎么试/注意事项) was **actually output** before the push prompt. Cannot be skipped. | Flow check: summary text present in conversation |

### Substance Prompts (Tier 2+)

| # | Prompt | Cross-reference |
|---|--------|----------------|
| Q1 | Does the commit message accurately describe what changed? Read `git log -1` and `git diff HEAD~1 --stat`. Does the message cover the actual scope, or is it generic? | git log, git diff |
| Q2 | Are all changed files traceable to the plan? Read `git diff HEAD~1 --stat` and cross-reference against the plan's file manifest. Flag any changed file not in the plan (excluding version/changelog files). | `docs/plans/{name}-plan.md`, git diff |
| Q3 | If pushed to a public repo: is README present and up-to-date? Does the repo have topics and description set? Check via `gh repo view --json description,repositoryTopics`. | gh repo view |

---

## Completion

After successful Exit Gate:

> **Shipped.** Commit `{hash}` on branch `{branch}`.
> {PR URL or "Push to remote and create PR manually."}

### Ship → Compound Interlock (HARD GATE)

```
================================================================
  After Ship completes, the ONLY permitted next action is:

    apex stage set compound

  The following are PROHIBITED until Compound completes:
    - Asking "继续下一个迭代?" or any re-entry question
    - Asking "结束本轮?" or any session-end question
    - Setting stage to idle
    - Processing a new task

  Re-entry questions belong to Compound's Completion section.
  Ship does NOT own the pipeline lifecycle decision.
================================================================
```

Run `apex stage set compound`, then follow `stages/compound.md`.

| Status | When |
|--------|------|
| **DONE** | Committed, pushed, PR created, branch handled. |
| **DONE_WITH_CONCERNS** | Shipped with acknowledged review concerns in PR. |
| **BLOCKED** | Pre-flight check failed. |
| **NEEDS_CONTEXT** | Missing review artifact or ambiguous status. |
