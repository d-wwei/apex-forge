---
name: master-recovery
description: "Plan Agent cross-session recovery protocol. Restores orchestration state when Plan Agent session is interrupted and a new session resumes."
---

# Plan Agent Recovery Protocol

When a new Plan Agent session detects an interrupted orchestration (stage is `orchestrate:*`, not `idle`), follow this protocol to restore the management context.

## Prerequisites

All recovery information is in the file system — no external state needed:

| Information | Source |
|---|---|
| Current macro-phase | `.apex/state.json` → `current_stage` |
| Task queue and status | `.apex/tasks.json` |
| Worker status | `.apex/workers/*/status.json` + `result.json` |
| Unprocessed escalations | `.apex/workers/*/escalation.json` (not renamed to `.processed.json`) |
| Daemon running? | `.apex/orch.lock` → PID alive check |
| Event history | `.apex/log/state.jsonl` → `orchestration.event` entries |
| Requirements & plan | `docs/orchestrations/{name}-requirements.md` + `{name}-plan.md` |
| Pending notifications | `.apex/notifications/*.json` (not `.processed.json`) |

## Step 1: Assess State

```bash
# 1a. Read current stage
apex status --json
# Look for: stage, tasks summary (total/done/in_progress/open)

# 1b. Check daemon
# If .apex/orch.lock exists:
#   Read PID → kill -0 PID → alive or dead?

# 1c. List workers
apex worker list
# Note: which are running, completed, crashed, stale

# 1d. Count pending notifications
apex orch status
# Shows pending notification count
```

## Step 2: Present to User

Use `AskUserQuestion` with three options:

1. **恢复编排 (Recommended)** — Takeover daemon, drain notifications, resume M&C
2. **查看状态** — Show full details before deciding
3. **重新开始** — Kill all workers, reset to idle

## Step 3a: Resume (user chose option 1)

### 3a.1 Takeover Daemon

```bash
# Start daemon with force (kills old if alive, clears stale lock if dead)
apex orch start --force --handle '<plan_agent_handle_json>'
```

The `--handle` flag registers this session's terminal so daemon notifications reach the new Plan Agent.

### 3a.2 Drain Pending Notifications

The daemon queues notifications to `.apex/notifications/` when Plan Agent is disconnected. Read them chronologically:

```bash
apex orch status
# If pending > 0, present each to user:
# - Worker completions (pass/fail)
# - Crashes
# - Escalations
# - Closure condition met
```

### 3a.3 Process Unprocessed Escalations

Scan for any `.apex/workers/*/escalation.json` files that were not renamed to `.processed.json`:

```bash
# For each unprocessed escalation:
# 1. Read the escalation content
# 2. Present to user with context (task title, worker agent, escalation type)
# 3. Decide: reply via directive (action: info) or re-plan
```

### 3a.4 Generate Status Summary

Present a consolidated view:

```
恢复完成。状态摘要：
  ✓ 已完成: T1 (claude), T2 (codex) — 已 merge
  ▶ 进行中: T4 (claude, execute 阶段)
  ○ 待开始: T5 (依赖 T4)
  ⚠ 通知: 2 条待处理
  ⚠ Escalation: T4 — scope_question (API 端点不存在)

建议下一步: 处理 T4 的 escalation，然后继续监控。
```

### 3a.5 Enter M&C

```bash
apex stage set orchestrate:monitoring
```

Resume the event-driven monitoring loop as described in `master.md` Phase 2.

## Step 3b: View Status (user chose option 2)

Show detailed information, then re-present the three options:

```bash
# Full task list with dependencies
apex task list

# Each worker's detailed status
apex worker list
# For active workers:
apex worker status <task-id>

# Recent orchestration events
# (read from .apex/log/state.jsonl, filter orchestration.event)

# Pending notifications count
apex orch status
```

## Step 3c: Restart (user chose option 3)

```bash
# 1. Kill all active workers
apex worker list
# For each running worker:
apex worker kill <task-id>

# 2. Stop daemon
apex orch stop

# 3. Reset stage
apex stage set idle

# 4. Inform user
# "所有 Worker 已终止，状态已重置。任务保留在 tasks.json 中。"
# "要清除任务列表重新开始，还是基于现有任务重新规划？"
```

## Data Safety

When the daemon is down but Workers are still running:

- Workers write `status.json` / `result.json` normally — **files persist**
- Completed workers not merged — **daemon catches up on restart**
- Escalations not processed — **Plan Agent reads on recovery**
- New ready tasks not spawned — **daemon catches up on restart**

**No data is lost.** Worst case is delayed processing. The file system is the source of truth.

## Difference from cross-session-exec.md

`cross-session-exec.md` recovers a **Worker Agent** (resumes implementation plan steps).
This file recovers a **Plan Agent** (resumes management context: who is doing what, what needs attention).

| | Worker Recovery | Plan Agent Recovery |
|---|---|---|
| Recovers | Implementation plan execution | Orchestration management context |
| State source | `.apex/worker-protocol.md` + git diff | `.apex/tasks.json` + workers/ + notifications/ |
| Key action | Resume coding from last completed step | Resume monitoring from accumulated events |
| Scope | Single task in single worktree | All tasks across all workers |
