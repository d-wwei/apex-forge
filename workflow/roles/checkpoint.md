---
name: apex-forge-checkpoint
description: Save and resume working state checkpoints — captures git state, decisions, and remaining work so any future session can pick up exactly where you left off
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Checkpoint Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX CHECKPOINT ROLE ==="
apex_set_stage "checkpoint"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "checkpoint"

# ---------------------------------------------------------------------------
# Git context
# ---------------------------------------------------------------------------
if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
  echo "[checkpoint] Branch: $BRANCH"
else
  BRANCH="unknown"
  echo "[checkpoint] WARNING: Not a git repo"
fi

# ---------------------------------------------------------------------------
# Checkpoint storage
# ---------------------------------------------------------------------------
CHECKPOINT_DIR=".apex/checkpoints"
mkdir -p "$CHECKPOINT_DIR" 2>/dev/null || true

CHECKPOINT_COUNT=$(find "$CHECKPOINT_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
echo "[checkpoint] Existing checkpoints: $CHECKPOINT_COUNT"

LATEST_CP=$(find "$CHECKPOINT_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | xargs ls -1t 2>/dev/null | head -1)
if [ -n "$LATEST_CP" ]; then
  echo "[checkpoint] Latest: $LATEST_CP"
fi

apex_ensure_dirs
```

# Checkpoint Role

> apex-forge / workflow / roles / checkpoint
>
> Save and resume working state. Captures git state, decisions made,
> and remaining work so any future session can pick up where you left off.

---

## HARD GATE

Do NOT implement code changes. This role captures and restores context only.

---

## Detect Command

Parse the user's input to determine which command to run:

- `/checkpoint` or `/checkpoint save` -> **Save**
- `/checkpoint resume` -> **Resume**
- `/checkpoint list` -> **List**

If the user provides a title after the command (e.g., `/checkpoint auth refactor`),
use it as the checkpoint title. Otherwise, infer a title from the current work.

---

## SAVE FLOW

### Step 1: Gather State

Collect the current working state:

```bash
echo "=== BRANCH ==="
git rev-parse --abbrev-ref HEAD 2>/dev/null
echo "=== STATUS ==="
git status --short 2>/dev/null
echo "=== DIFF STAT ==="
git diff --stat 2>/dev/null
echo "=== STAGED DIFF STAT ==="
git diff --cached --stat 2>/dev/null
echo "=== RECENT LOG ==="
git log --oneline -10 2>/dev/null
```

### Step 2: Summarize Context

Using the gathered state plus conversation history, produce a summary covering:

1. **What's being worked on** -- the high-level goal or feature
2. **Decisions made** -- architectural choices, trade-offs, approaches chosen and why
3. **Remaining work** -- concrete next steps, in priority order
4. **Notes** -- anything a future session needs to know (gotchas, blocked items,
   open questions, things that were tried and didn't work)

If the user provided a title, use it. Otherwise, infer a concise title (3-6 words)
from the work being done.

### Step 3: Write Checkpoint File

```bash
CHECKPOINT_DIR=".apex/checkpoints"
mkdir -p "$CHECKPOINT_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
echo "CHECKPOINT_DIR=$CHECKPOINT_DIR"
echo "TIMESTAMP=$TIMESTAMP"
```

Write the checkpoint file to `{CHECKPOINT_DIR}/{TIMESTAMP}-{title-slug}.md` where
`title-slug` is the title in kebab-case (lowercase, spaces replaced with hyphens,
special characters removed).

### Checkpoint File Format

```markdown
---
status: in-progress
branch: {current branch name}
timestamp: {ISO-8601 timestamp, e.g. 2026-03-31T14:30:00-07:00}
files_modified:
  - path/to/file1
  - path/to/file2
---

## Working on: {title}

### Summary

{1-3 sentences describing the high-level goal and current progress}

### Decisions Made

{Bulleted list of architectural choices, trade-offs, and reasoning}

### Remaining Work

{Numbered list of concrete next steps, in priority order}

### Notes

{Gotchas, blocked items, open questions, things tried that didn't work}
```

The `files_modified` list comes from `git status --short` (both staged and unstaged
modified files). Use relative paths from the repo root.

### Step 4: Confirm

After writing, confirm to the user:

```
CHECKPOINT SAVED
========================================
Title:    {title}
Branch:   {branch}
File:     {path to checkpoint file}
Modified: {N} files
========================================
```

---

## RESUME FLOW

### Step 1: Find Checkpoints

```bash
CHECKPOINT_DIR=".apex/checkpoints"
if [ -d "$CHECKPOINT_DIR" ]; then
  find "$CHECKPOINT_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | xargs ls -1t 2>/dev/null | head -20
else
  echo "NO_CHECKPOINTS"
fi
```

List checkpoints from all branches (checkpoint files contain the branch name
in their frontmatter, so all files in the directory are candidates).

### Step 2: Load Checkpoint

If the user specified a checkpoint (by number, title fragment, or date), find the
matching file. Otherwise, load the most recent checkpoint.

Read the checkpoint file and present a summary:

```
RESUMING CHECKPOINT
========================================
Title:       {title}
Branch:      {branch from checkpoint}
Saved:       {timestamp, human-readable}
Status:      {status}
========================================

### Summary
{summary from checkpoint}

### Remaining Work
{remaining work items from checkpoint}

### Notes
{notes from checkpoint}
```

If the current branch differs from the checkpoint's branch, note this:
"This checkpoint was saved on branch `{branch}`. You are currently on
`{current branch}`. You may want to switch branches before continuing."

### Step 3: Offer Next Steps

After presenting the checkpoint, ask:

- A) Continue working on the remaining items
- B) Show the full checkpoint file
- C) Just needed the context, thanks

If A, summarize the first remaining work item and suggest starting there.

---

## LIST FLOW

### Step 1: Gather Checkpoints

```bash
CHECKPOINT_DIR=".apex/checkpoints"
if [ -d "$CHECKPOINT_DIR" ]; then
  echo "CHECKPOINT_DIR=$CHECKPOINT_DIR"
  find "$CHECKPOINT_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | xargs ls -1t 2>/dev/null
else
  echo "NO_CHECKPOINTS"
fi
```

### Step 2: Display Table

**Default behavior:** Show checkpoints for the current branch only.

If the user passes `--all` (e.g., `/checkpoint list --all`), show checkpoints
from all branches.

Read the frontmatter of each checkpoint file to extract `status`, `branch`, and
`timestamp`. Parse the title from the filename (the part after the timestamp).

Present as a table:

```
CHECKPOINTS ({branch} branch)
========================================
#  Date        Title                    Status
-  ----------  -----------------------  -----------
1  2026-03-31  auth-refactor            in-progress
2  2026-03-30  api-pagination           completed
3  2026-03-28  db-migration-setup       in-progress
========================================
```

If `--all` is used, add a Branch column:

```
CHECKPOINTS (all branches)
========================================
#  Date        Title                    Branch              Status
-  ----------  -----------------------  ------------------  -----------
1  2026-03-31  auth-refactor            feat/auth           in-progress
2  2026-03-30  api-pagination           main                completed
3  2026-03-28  db-migration-setup       feat/db-migration   in-progress
========================================
```

If there are no checkpoints, tell the user: "No checkpoints saved yet. Run
`/checkpoint` to save your current working state."

---

## RULES

- **Never modify code.** This role only reads state and writes checkpoint files.
- **Always include the branch name** in checkpoint files -- this enables
  cross-branch resume.
- **Checkpoint files are append-only.** Never overwrite or delete existing checkpoint
  files. Each save creates a new file.
- **Infer, don't interrogate.** Use git state and conversation context to fill in
  the checkpoint. Only ask the user if the title genuinely cannot be inferred.

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Checkpoint saved/resumed/listed successfully |
| **BLOCKED** | Not a git repo or checkpoint directory cannot be created |
| **NEEDS_CONTEXT** | Cannot infer what work is being done; need user to describe |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```
