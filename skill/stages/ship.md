---
name: ship
description: Package, commit, and deliver -- tests, version bump, changelog, commit, PR
---

# Ship Stage

The delivery gate. Tests pass, diff reviewed, version bumped,
changelog updated, committed, pushed, PR created.

---

**On entry:** `apex stage set ship`
**On completion:** `apex stage complete ship`

## Entry Conditions

1. **Required upstream**: A review with status `DONE` or `DONE_WITH_CONCERNS`.
2. If no review found, tell the user to run the Review stage first.
   Do NOT ship unreviewed code.
3. If review status is `BLOCKED` or `NEEDS_CONTEXT`, resolve issues first.

### Upstream Entry Verification

Before starting Ship work, verify Review artifact completeness:

1. `docs/reviews/{name}-review.md` must exist.
2. Status must be DONE or DONE_WITH_CONCERNS.
3. No finding with severity P0 may have unresolved status.
4. If status is BLOCKED or NEEDS_CONTEXT: instruct user to resolve Review issues first.
5. If any check fails: report which check failed. Do NOT ship unreviewed code.

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

### Check 6: Opensource Preflight Scan

Invoke the `opensource-preflight` companion skill in **quick + diff mode**:

```
/opensource-preflight --mode quick --scope diff
```

This scans staged and modified files for secrets, PII, internal references, and local paths.

**Verdict mapping:**
- `✗ 未就绪` (any CRITICAL) → **STOP**. Do NOT proceed to Ship Sequence.
- `⚠ 需审查` (HIGH, no CRITICAL) → Report findings. Ask user whether to proceed or fix first.
- `✓ 就绪` → Proceed.

Fix all CRITICAL/HIGH issues, re-stage, then re-run scan. Only proceed when verdict is `✓` or user explicitly accepts `⚠`.

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

### Step 3: README & Repository Presentation

Detect repository status:

```bash
# Check if remote repo exists
gh repo view 2>/dev/null && echo "EXISTING" || echo "NEW_OR_NO_REMOTE"
```

**Path A — New repository** (no remote, or user is about to `gh repo create`):

**A0. Repository Naming (mandatory, cannot be skipped)**

Analyze the project (directory name, package.json name, README title, code purpose) and
generate 3-4 candidate repository names. Call `AskUserQuestion`:
- question: "新仓库叫什么名字？"
- header: "Repo Name"
- options (generate based on project analysis):
  1. label: "{kebab-case-name}", description: "基于项目目录名/包名"
  2. label: "{descriptive-name}", description: "基于项目功能描述"
  3. label: "{short-brand-name}", description: "简短品牌化命名"

User can also type a custom name via "Other".

**Naming conventions to follow when generating candidates:**
- kebab-case (lowercase, hyphens)
- Concise (1-3 words preferred, max 4)
- Descriptive but not generic (avoid `my-project`, `app`, `tool`)
- Check availability: `gh repo view {owner}/{name} 2>/dev/null` — if taken, don't suggest it

Record the chosen name in `.apex/ship-metadata.json` as `"repo_name": "..."`.
This name will be used in Step 6 (`gh repo create`) and Step 8 (metadata).

**A1. README Generation (mandatory, cannot be skipped)**

Invoke the `great-writer` skill in **GitHub README mode**. This step is mandatory for ALL new
repositories — no exceptions. "SKILL.md is the docs" or "README not requested" are not valid
reasons to skip. Every public repo must have a proper README.

Output:
   - `README.md` (English) — project overview, features, quickstart, architecture, usage
   - `README_CN.md` or `README.zh-CN.md` (Chinese) — same content, native Chinese (not a translation)
**A2.** Prepare repository metadata for Step 8:
   - **Tags/topics**: 5-10 relevant topics (e.g., `cli`, `typescript`, `ai-agent`)
   - **Description**: one-line repo description (under 350 chars)
   - Write to `.apex/ship-metadata.json`:
     ```json
     { "topics": [...], "description": "...", "homepage": "..." }
     ```

**Path B — Existing repository** (remote exists, has commit history):

Evaluate by calling `AskUserQuestion`:
- question: "仓库已存在。是否需要更新展示信息？"
- header: "Repo Info"
- options:
  1. label: "重写 README (Recommended)", description: "用 GreatWriter 重写中英文 README，更新标签和描述"
  2. label: "仅更新标签和描述", description: "README 不动，只更新 GitHub 仓库标签和描述"
  3. label: "评估 Release", description: "评估是否需要发布新 Release（含 README 更新评估）"
  4. label: "跳过", description: "不修改任何展示信息"

Execute the user's choice:
- **重写 README**: invoke `great-writer` in GitHub README mode, same as Path A step 1.
- **仅更新标签和描述**: prepare metadata in `.apex/ship-metadata.json`.
- **评估 Release**: check `git log` since last tag, evaluate if changes warrant a release. If yes, prepare release notes and write to `.apex/ship-release.json`. Also evaluate README freshness.
- **跳过**: proceed to Step 4.

### Step 4: Stage All Changes
Stage source files, test files, version/changelog updates,
README changes (if any), and documentation artifacts.

### Step 5: Commit

Create a structured commit following conventional commits:

```
{type}({scope}): {short description}

{Body: what was built and why}

Requirements: docs/brainstorms/{name}-requirements.md
Plan: docs/plans/{name}-plan.md
Review: docs/reviews/{name}-review.md
```

Type mapping: feat (new feature), fix (bug fix), refactor, chore (config/build).

### Step 6: Push (requires user confirmation)

**6a. Iteration Summary (mandatory, before Push prompt)**

Before asking about push, output a plain-language summary for the user. Write it like you're telling a colleague what happened — no jargon, no filler, concrete.

Four sections, each 2-5 sentences:

```
## 这轮做了什么
[具体说：加了什么功能、修了什么 bug、改了什么结构。用动词开头，一件事一句话。
 不要写"优化了系统架构"——说"把 X 从 A 改成了 B，因为 C"]

## 现在能干什么
[改完之后用户能做什么、系统行为有什么不同。从用户视角说，不从代码视角说。
 不要写"提升了可维护性"——说"下次改 X 的时候不用同时改 Y 了"]

## 怎么试
[具体的命令、操作步骤、或测试方法。能复制粘贴直接跑的。
 如果有测试套件，给出运行命令和预期结果]

## 注意事项
[破坏性变更、已知限制、需要手动操作的事。没有就写"无"，不要凑字数]
```

**Style rules** (from ljg-plain):
- 口语检验：读出声来，你会这样跟朋友说话吗？
- 零术语：聪明的 12 岁孩子能复述
- 一句一事：每句只推进一步
- 具体：名词看得见，动词有力气
- 不填充：每句都在干活，删开场白和拐杖词

**6b. Push prompt**

After the summary, call `AskUserQuestion` with:
- question: "是否推送到远程仓库？"
- header: "Push"
- options:
  1. label: "推送 (Recommended)", description: "git push 到 remote，准备创建 PR"
  2. label: "暂不推送", description: "仅保留本地提交，稍后手动推送"

If user selects "推送": push the feature branch to remote.
If user selects "暂不推送": skip push, Steps 7-9. Record in ship result.
Skip entirely if no remote is configured.

**New repository creation**: if no remote exists and user wants to push,
create the repo first via `gh repo create` (public/private per user choice),
then push.

### Step 7: CI Status Check

Only runs if push succeeded (Step 6 completed). Detect whether the repo has CI configured and wait for results.

**Detection:**

```bash
# Check for CI configuration (zsh-safe: no glob expansion)
find .github/workflows \( -name '*.yml' -o -name '*.yaml' \) 2>/dev/null; test -f .gitlab-ci.yml && echo .gitlab-ci.yml; test -f Jenkinsfile && echo Jenkinsfile; test -f .circleci/config.yml && echo .circleci/config.yml
```

If no CI config found → skip this step.

**If CI is configured:**

```bash
# Wait for checks to start (may take a few seconds after push)
sleep 5
# Poll CI status
gh run list --branch $(git branch --show-current) --limit 1 --json status,conclusion,name,databaseId
```

**Poll loop** (max 10 minutes, check every 30 seconds):

```bash
gh run watch <run_id> --exit-status 2>&1
```

Or manual polling:
```bash
gh run view <run_id> --json status,conclusion
```

**Verdict mapping:**

| CI Result | Action |
|-----------|--------|
| All checks pass | Proceed to Step 8 |
| Some checks fail | **STOP**. Report failed jobs with `gh run view <id> --log-failed`. Ask user: |
| Timeout (10 min) | Report current status, ask user whether to wait or proceed |

When checks fail, call `AskUserQuestion`:
- question: "CI 检查未通过。{N} 个 job 失败。如何处理？"
- header: "CI"
- options:
  1. label: "查看失败日志并修复 (Recommended)", description: "查看失败的 job 日志，修复后重新推送"
  2. label: "中止 Ship", description: "回到 Execute 阶段修复问题"

**No bypass option.** CI must pass before Ship can complete. "继续创建 PR with failing CI" is not offered.

- **查看失败日志并修复**: run `gh run view <id> --log-failed`, diagnose, fix, amend commit, force push, re-run this step.
- **继续创建 PR**: proceed but add CI failure notice to PR body.
- **中止 Ship**: `apex stage set execute`, return to execute stage.

**GitLab 适配**: if `.gitlab-ci.yml` exists instead of GitHub Actions, use:
```bash
glab ci status
glab ci view
```

### Step 8: GitHub Repository Metadata

Only runs if push succeeded (Step 6 completed). Read `.apex/ship-metadata.json` if it exists.

**For new repositories** (just created in Step 6):

```bash
# Set description and homepage
gh repo edit --description "{description}" --homepage "{homepage}"

# Set topics (one command per topic, or comma-separated)
gh repo edit --add-topic topic1 --add-topic topic2 ...
```

Both description and topics are **mandatory** for new repos. If `.apex/ship-metadata.json`
was not prepared in Step 3, prepare it now before proceeding.

**For existing repositories**:

If `.apex/ship-metadata.json` exists (user chose to update in Step 3):
```bash
gh repo edit --description "{description}"
gh repo edit --add-topic ...
```

If `.apex/ship-release.json` exists (user chose Release evaluation in Step 3):
```bash
# Create release with auto-generated notes or prepared notes
gh release create v{version} --title "v{version}" --notes-file .apex/ship-release-notes.md
```

**Cleanup**: delete `.apex/ship-metadata.json` and `.apex/ship-release.json` after use.

### Step 9: Pull Request
Create a PR with summary, review status, artifact links, and test results.
Use `gh pr create` if available; otherwise instruct the user.

CI must pass before reaching this step. If CI failed, Ship is blocked at Step 7.

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

**No skip option.** Every iteration walks all six stages. Compound may be brief (one sentence: "无特别经验"), but it cannot be skipped. This is enforced by the Exit Gate (S3).

Record that the transition was announced. This MUST happen before the Exit Gate runs.

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

Compound is mandatory. After Ship completes:
```bash
apex stage set compound
```
Then follow `stages/compound.md`.

| Status | When |
|--------|------|
| **DONE** | Committed, pushed, PR created, branch handled. |
| **DONE_WITH_CONCERNS** | Shipped with acknowledged review concerns in PR. |
| **BLOCKED** | Pre-flight check failed. |
| **NEEDS_CONTEXT** | Missing review artifact or ambiguous status. |
