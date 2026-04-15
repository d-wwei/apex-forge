# Phase 4-5 Implementation Plan

## Overview

Phase 4: 2 new CLI commands (orchestrate event, worker directive). Worker interrupt already done in Phase 1.
Phase 5: Force-takeover handle update, daemon recovery enhancement, protocol docs, tests.

## Task Breakdown

### T1: `apex orchestrate event` command
- **File**: `src/cli.ts` — modify existing `orchestrate` case (line 685-688)
- **What**: Route `apex orchestrate event <action> [--task <id>] [--detail <json>]` to new handler
- **Implementation**:
  - Before the existing `runOrchestrator(rest)`, check if `rest[0] === "event"`
  - If yes, parse action (rest[1]), --task flag, --detail flag (JSON.parse)
  - Call `appendEvent("state", "orchestration.event", { action, task, ...parsedDetail })`
  - Import `appendEvent` from `./state/event-log.js` (already imported in other files)
- **Test**: `src/__tests__/orchestrate-event.test.ts` — verify event written to state.jsonl

### T2: `apex worker directive` command
- **File**: `src/commands/worker.ts` — add `cmdDirective` function + register in switch
- **What**: `apex worker directive <task-id> <action> <content>`
- **Implementation**:
  - Validate action is one of: amend, pause, abort, info
  - Validate worker dir `.apex/workers/{task-id}` exists
  - Write `.apex/workers/{task-id}/directive.json`:
    ```json
    {
      "from": "plan-agent",
      "created_at": "<ISO>",
      "action": "<action>",
      "content": { "description": "<content>", "urgency": "normal" }
    }
    ```
  - If --urgent flag, set urgency to "high"
- **Test**: `src/commands/__tests__/worker-directive.test.ts`

### T3: `--force` Plan Agent handle update (orch.ts)
- **File**: `src/commands/orch.ts`
- **What**: When `--force` takes over, accept `--handle <json>` to register new Plan Agent terminal
- **Implementation**:
  - Add `--handle` flag parsing in `cmdStart`
  - Pass parsed handle to `acquireLock(sessionId, handle)`
  - Currently `acquireLock(sessionId, null)` — change to use parsed handle when provided
  - Also add `updateLock()` function that updates plan_agent_handle in existing lock file
- **Test**: `src/commands/__tests__/orch-lock.test.ts`

### T4: Daemon startup recovery enhancement
- **File**: `src/orchestrator/daemon.ts` — enhance `discoverWorkers`
- **What**: On startup, detect completed-but-unmerged workers and process them
- **Implementation**:
  - After discovering workers, check for result.json with verdict=pass where branch still exists
  - Log recovery actions for visibility
  - The tick loop already handles resultChecked=false, so the main enhancement is:
    - Check if worker terminal is still alive (may not be after daemon restart)
    - If terminal dead but result.json exists with pass → still process normally
- **Test**: Part of `src/orchestrator/__tests__/daemon-recovery.test.ts`

### T5: master.md recovery section
- **File**: `skill/roles/master.md`
- **What**: Add recovery flow section describing how to detect and recover from interrupted orchestration
- **Content**: Detection → options presentation → handle update → notification drain → M&C resume

### T6: master-recovery.md
- **File**: `skill/roles/master-recovery.md` (new)
- **What**: Dedicated cross-session recovery protocol for Plan Agent
- **Content**: Step-by-step recovery procedures per Spec Section 9.3

### T7: Tests
- `src/__tests__/orchestrate-event.test.ts` — orchestrate event CLI command
- `src/commands/__tests__/worker-directive.test.ts` — directive writing
- `src/commands/__tests__/orch-lock.test.ts` — lock acquire/release/force/handle update
- `src/orchestrator/__tests__/daemon-recovery.test.ts` — startup recovery with stale workers

## Execution Order

1. T1 + T2 (parallel — independent CLI commands)
2. T3 + T4 (parallel — orch.ts and daemon.ts are independent)
3. T5 + T6 (parallel — protocol docs)
4. T7 (tests, depends on T1-T4)

## Key Risks

- Dashboard hook may overwrite frontend files — no frontend changes needed here
- Event log imports must use existing `appendEvent` from event-log.ts
- Test setup must follow tmpDir pattern from existing tests (chdir to tmpDir, cleanup)
