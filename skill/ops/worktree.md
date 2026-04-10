---
name: apex-forge-worktree-ops
description: Manage git worktrees for task isolation — create, list, cleanup
user-invocable: true
argument-hint: "[create|list|cleanup] [TASK_ID]"
---

# Worktree Operations

Manage git worktrees tied to Apex Forge tasks.

## Commands

### Create worktree for a task

```bash
apex worktree create TASK_ID
```

Creates an isolated git worktree for the given task. The branch name and directory are auto-derived from the task ID.

### List active worktrees

```bash
apex worktree list
```

### Cleanup worktree after task completion

```bash
apex worktree cleanup TASK_ID
```

Removes the worktree directory and branch.

## Argument routing

Parse the user's command and run the corresponding `apex worktree` subcommand.
