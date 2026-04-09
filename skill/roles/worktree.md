---
name: apex-forge-worktree
description: "Create isolated git worktrees for branch work. Use when starting feature work that needs isolation from the current workspace."
---

# Worktree — Isolated Development

Git worktrees create isolated workspaces sharing the same repository. Work on multiple branches simultaneously without stashing or switching.

## When to Use

- Starting feature work that should not affect the main workspace
- Running parallel implementations (multiple approaches)
- Isolating risky changes
- Working on a task while another task is in code review

## CLI Commands

```bash
apex worktree create <TASK_ID>     # Create worktree for a task
apex worktree list                  # List active worktrees
apex worktree cleanup <TASK_ID>    # Remove worktree after completion
```

## Full Workflow

### 1. Create Worktree

```bash
# Creates .apex/worktrees/<task-id>/ with a new branch
apex worktree create T3

# Or manually with git:
git worktree add .apex/worktrees/T3 -b feature/T3-description
```

### 2. Setup the Worktree

```bash
cd .apex/worktrees/T3

# Auto-detect and run project setup
if [ -f package.json ]; then npm install; fi
if [ -f Cargo.toml ]; then cargo build; fi
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f go.mod ]; then go mod download; fi
```

### 3. Verify Baseline

Before writing any code, confirm the worktree starts clean:

```bash
# Run tests — must pass before you start
bun test  # or npm test, cargo test, pytest, etc.
```

If tests fail at baseline, the worktree is not clean. Do NOT proceed — fix the baseline first or report it.

### 4. Work in Isolation

All changes happen in the worktree. The main workspace is untouched.

```bash
# Track progress
apex task start T3

# ... implement ...

apex task submit T3 "Feature implemented, tests pass"
```

### 5. Complete and Clean Up

After verification, choose one:

```bash
# Option A: Merge back to main branch
cd /path/to/main/workspace
git merge feature/T3-description
apex worktree cleanup T3

# Option B: Push and create PR
cd .apex/worktrees/T3
git push -u origin feature/T3-description
gh pr create --title "T3: description" --body "..."
apex worktree cleanup T3

# Option C: Keep for later
# Do nothing — worktree stays

# Option D: Discard
apex worktree cleanup T3
```

## Directory Strategy

| Location | When | Gitignore needed? |
|---|---|---|
| `.apex/worktrees/` (project-local) | Default — keeps worktrees near the project | Yes — `.apex/` should be in `.gitignore` |
| `~/.apex-forge/worktrees/` (global) | When project dir is read-only or shared | No |

`apex init` already adds `.apex/` to `.gitignore`.

## Safety Rules

- **Never create a project-local worktree without verifying it's gitignored**
- **Never skip baseline test verification** — you can't distinguish new bugs from existing ones
- **Never proceed with failing baseline tests** without asking the user
- **Always clean up** worktrees after merge/discard — stale worktrees accumulate
