---
name: apex-forge-retro
description: Engineering retrospective with git-driven metrics, team analysis, and persistent trend tracking
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Retro Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX RETRO ROLE ==="
apex_set_stage "retro"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "retro"

# ---------------------------------------------------------------------------
# Time range
# ---------------------------------------------------------------------------
RETRO_DAYS="${RETRO_DAYS:-7}"
SINCE_DATE=$(date -v-${RETRO_DAYS}d +%Y-%m-%d 2>/dev/null || date -d "${RETRO_DAYS} days ago" +%Y-%m-%d 2>/dev/null || echo "")

if [ -z "$SINCE_DATE" ]; then
  echo "[retro] WARNING: Could not compute date range. Using git log default."
  SINCE_FLAG=""
else
  SINCE_FLAG="--since=${SINCE_DATE}"
  echo "[retro] Period: ${SINCE_DATE} to today (${RETRO_DAYS} days)"
fi

# ---------------------------------------------------------------------------
# Git context
# ---------------------------------------------------------------------------
if ! command -v git &>/dev/null || ! git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  echo "[retro] ERROR: Not a git repository. Retro requires git history."
  echo "RETRO_READY=false"
else
  # Commit count
  COMMIT_COUNT=$(git log --oneline ${SINCE_FLAG} 2>/dev/null | wc -l | tr -d ' ')
  echo "[retro] Commits in period: $COMMIT_COUNT"

  # Authors
  AUTHORS=$(git log --format='%aN' ${SINCE_FLAG} 2>/dev/null | sort -u)
  AUTHOR_COUNT=$(echo "$AUTHORS" | grep -c . 2>/dev/null || echo "0")
  echo "[retro] Authors: $AUTHOR_COUNT"
  echo "$AUTHORS" | sed 's/^/  - /'

  # Files changed
  FILES_CHANGED=$(git log --name-only --format="" ${SINCE_FLAG} 2>/dev/null | sort -u | grep -c . 2>/dev/null || echo "0")
  echo "[retro] Unique files changed: $FILES_CHANGED"

  echo "RETRO_READY=true"
fi

# ---------------------------------------------------------------------------
# Persistent retro history
# ---------------------------------------------------------------------------
mkdir -p ".apex/retros" 2>/dev/null || true
WEEK_NUM=$(date +%Y-W%V 2>/dev/null || date +%Y-W%U 2>/dev/null || echo "unknown")
RETRO_FILE=".apex/retros/${WEEK_NUM}.md"

PREV_RETRO=""
for f in $(ls -r .apex/retros/*.md 2>/dev/null | head -5); do
  if [ "$f" != "$RETRO_FILE" ]; then
    PREV_RETRO="$f"
    break
  fi
done

if [ -n "$PREV_RETRO" ]; then
  echo "[retro] Previous retro found: $PREV_RETRO"
else
  echo "[retro] No previous retro found (first run)"
fi

apex_ensure_dirs
```

# Retro Role

> apex-forge / workflow / roles / retro
>
> Engineering retrospective driven by git data, not feelings.
> Metrics first, interpretation second, action items always.

---

## DATA COLLECTION

### Git Metrics

Gather these metrics for the retro period (default: last 7 days):

```bash
# Commits per day
git log --format='%ad' --date=short ${SINCE_FLAG} | sort | uniq -c | sort -rn

# Lines added/removed
git log --stat --format="" ${SINCE_FLAG} | tail -1
# Or per-commit:
git log --shortstat --format="" ${SINCE_FLAG}

# Files changed with frequency
git log --name-only --format="" ${SINCE_FLAG} | sort | uniq -c | sort -rn | head -20

# Per-author commit count
git shortlog -sn ${SINCE_FLAG}

# Per-author lines changed
git log --format='%aN' --shortstat ${SINCE_FLAG}

# Merge/PR activity (if using merge commits)
git log --merges --oneline ${SINCE_FLAG}

# Average time between commits (rough indicator of flow)
git log --format='%at' ${SINCE_FLAG}
```

### Derived Metrics

Calculate these from the raw git data:

| Metric | Formula | What It Tells You |
|--------|---------|-------------------|
| **Velocity** | commits / days in period | How fast work is landing |
| **Churn rate** | lines deleted / lines added | Stability vs rework |
| **Focus index** | unique files / commits | Scattered (high) vs focused (low) |
| **Hot files** | files changed > 3 times | Where the action (or trouble) is |
| **Commit cadence** | avg time between commits | Flow state indicator |

### PR Metrics (if GitHub/GitLab)

If `gh` CLI or `glab` is available:

```bash
# PRs merged in period
gh pr list --state merged --search "merged:>=${SINCE_DATE}" --json number,title,mergedAt,additions,deletions

# PR cycle time (created → merged)
gh pr list --state merged --json createdAt,mergedAt

# Review turnaround
gh pr list --state merged --json reviews
```

---

## TEAM BREAKDOWN

For each author in the period:

```
### {author name}

Commits: {n}
Lines added: {n} | Lines removed: {n}
Files touched: {list of top 5}
Focus areas: {inferred from file paths}

Highlights:
- {specific good commit/feature with commit hash}
- {pattern worth noting}

Growth areas:
- {concrete suggestion, not vague praise}
```

**Rules for team analysis**:
- Be specific. "Good commits" means nothing. Name the commit.
- Growth areas must be actionable. "Write more tests" is too vague.
  "Add integration tests for the API layer, which had 0 test changes
  despite 12 files modified" is actionable.
- If solo contributor, still do this analysis — it creates a record
  for self-reflection.

---

## THREE SECTIONS

### What Went Well

Identify from the data, not from memory:

1. **Velocity achievements**: Did the team ship more than usual?
   Compare commit count and merge frequency to previous retro.

2. **Quality signals**: Low churn rate, few reverts, test additions
   alongside feature code.

3. **Focus**: Low focus index means concentrated work on related files.
   High focus with high velocity means the team handled breadth well.

4. **Specific wins**: Name commits or PRs that were particularly well-done.
   Link to the actual commit hash.

### What Didn't Go Well

Identify from the data, not from feelings:

1. **Hot files**: Files changed 5+ times in the period are either
   actively developed or unstable. Determine which.

2. **Churn**: High delete/add ratio suggests rework. What was rewritten and why?

3. **Commit gaps**: Days with zero commits. Was this planned (weekend, holiday)
   or a blocker? Check if commit messages around gaps mention fixes or debugging.

4. **Reverts**: Any `git revert` commits? What went wrong?

5. **Test debt**: Features added without corresponding test files.
   List the specific files.

### Action Items

Every action item must be:
- **Specific**: not "improve testing" but "add integration tests for /api/v2/ routes"
- **Assigned**: who owns this (even if solo, name yourself)
- **Timeboxed**: by when (next retro, end of sprint, specific date)
- **Measurable**: how do we know it's done

```
Action format:
  [ ] {description} — Owner: {name} — Due: {date} — Done when: {criterion}
```

Aim for 3-5 action items. More than 7 means you're not prioritizing.

---

## TREND TRACKING

### Compare with Previous Retro

If a previous retro exists (`.apex/retros/*.md`), read it and compare:

| Metric | Previous | Current | Trend |
|--------|----------|---------|-------|
| Commits | {n} | {n} | up/down/stable |
| Velocity (commits/day) | {n} | {n} | up/down/stable |
| Files changed | {n} | {n} | up/down/stable |
| Churn rate | {n}% | {n}% | up/down/stable |
| Focus index | {n} | {n} | up/down/stable |
| Action items completed | {n}/{total} | — | — |

### Previous Action Item Review

Read the previous retro's action items. For each:
- **Completed**: Mark done. Celebrate briefly.
- **In progress**: Note status.
- **Not started**: Carry forward or explicitly drop with reason.

Do not silently drop action items. If they're being dropped, say so and say why.

---

## RETRO REPORT

Write to `.apex/retros/{YYYY-WXX}.md`:

```yaml
---
title: Retro — Week {WXX} {YYYY}
period: "{start_date} to {end_date}"
commits: {n}
authors: {n}
files_changed: {n}
lines_added: {n}
lines_removed: {n}
velocity: {commits_per_day}
churn_rate: {pct}
---
```

### Report Sections

1. **Metrics Dashboard**: The derived metrics table.
2. **Team Breakdown**: Per-author analysis.
3. **What Went Well**: Data-driven positives.
4. **What Didn't Go Well**: Data-driven concerns.
5. **Previous Action Items**: Status of last retro's items.
6. **New Action Items**: This retro's commitments.
7. **Trends**: Comparison table with previous retro.

Also register with state:
```
apex_add_artifact "retro" ".apex/retros/{YYYY-WXX}.md"
```

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Retro complete with metrics, analysis, and action items |
| **DONE_WITH_CONCERNS** | Retro complete but git data was incomplete (shallow clone, missing period) |
| **BLOCKED** | Not a git repo or git history insufficient for analysis |
| **NEEDS_CONTEXT** | Need user to specify retro period or team scope |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```
