---
name: apex-forge-tasks
description: Manage project tasks — list, create, assign, start, submit, verify, block
user-invocable: true
argument-hint: "[list|create|next|get|assign|start|submit|verify|block] [args...]"
---

# Tasks

Manage Apex Forge project tasks. Tasks follow a state machine: `open → assigned → in_progress → to_verify → done`.

## Commands

### List tasks

```bash
apex task list
apex task list --status in_progress
```

### Show next available task

```bash
apex task next
```

Returns the next unblocked, unassigned task respecting dependency order.

### Create a task

```bash
apex task create "TITLE" "DESCRIPTION" [DEP_IDS...]
```

Dependencies are task IDs that must complete before this task can start.

### View task details

```bash
apex task get TASK_ID
```

### State transitions

```bash
apex task assign TASK_ID          # open → assigned
apex task start TASK_ID           # assigned → in_progress
apex task submit TASK_ID EVIDENCE # in_progress → to_verify
apex task verify TASK_ID pass     # to_verify → done
apex task verify TASK_ID fail     # to_verify → in_progress
apex task block TASK_ID REASON    # any → blocked
apex task release TASK_ID         # assigned → open
```

## Argument routing

Parse the user's command and run the corresponding `apex task` subcommand. Present the output.

If no argument given, default to `apex task list`.
