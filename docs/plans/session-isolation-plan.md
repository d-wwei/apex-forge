---
title: Multi-Session State Isolation — Implementation Plan
scope: Standard
status: approved
created: 2026-04-14
source: docs/brainstorms/session-isolation-requirements.md
spec: docs/specs/multi-session-state-isolation.md
task_count: 8
complexity: medium
---

# Multi-Session State Isolation — Plan

## Problem Frame

Multiple concurrent Claude Code sessions sharing `.apex/state.json` corrupt each
other's pipeline stage. The cache layer materializes all events into one global
stage; last writer wins. Secondary: concurrent `taskCreate()` reads stale `next_id`
from cache, producing duplicate Task IDs with silent loss.

## Decision Log

| # | Decision | Rationale | Rejected Alternative |
|---|----------|-----------|---------------------|
| D1 | Per-session cache files (`state.{sid}.json`) alongside global | Isolates sessions without breaking Dashboard's global read | SQLite (overkill), file locking (doesn't solve multi-stage problem) |
| D2 | `currentSessionId()` stops reading `state.json` | state.json is the cross-session pollution vector (event-log.ts:61-70) | Keep reading but filter — adds complexity without benefit |
| D3 | Dual-write: per-session + global in `rebuildAndCache` | Dashboard backward compatible; CLI reads per-session | Per-session only — breaks Dashboard fallback |
| D4 | Task ID maxId from event log replay, not cached `next_id` | Event log is the source of truth; cache can be stale | Random suffix IDs — changes T{N} format, too many downstream consumers |
| D5 | Conflict annotation instead of silent dedup drop | Preserves both tasks' info; makes race visible | Silent drop (current behavior) — causes task loss |

## File Manifest

### Modified Files

| File | Function(s) Changed | Change Summary |
|------|---------------------|----------------|
| `src/state/event-log.ts` | `sessionStateCachePath()` (new), `_resetSessionIdCache()` (new), `currentSessionId()`, `rebuildAndCache()`, `materializeTasks()` | Add per-session cache path helper, test reset helper, remove state.json read from session ID, dual-write state cache, conflict-annotate duplicate task IDs |
| `src/state/state.ts` | `loadState()` | Prefer per-session cache, fallback to global |
| `src/state/tasks.ts` | `taskCreate()` | Derive maxId from event log instead of `store.next_id` |
| `src/commands/init.ts` | `cmdInit()` | Add stale per-session cache cleanup (7-day TTL) |

### New Files

| File | Purpose |
|------|---------|
| `src/__tests__/session-isolation.test.ts` | 8 test cases for session isolation + task ID collision |

### Files NOT Changed (by design)

`dashboard.ts`, `frontend/app.js`, worker files — per constraints in requirements doc.

## Task Decomposition

### T1: Export session cache helpers (event-log.ts)
- **Files**: `src/state/event-log.ts`
- **Test files**: `src/__tests__/session-isolation.test.ts` (scaffold + first test)
- **Complexity**: trivial
- **Dependencies**: none
- **AC**: Foundation for AC 1-4
- **What**: Add `sessionStateCachePath(sid?)` function that returns `.apex/state.{sid}.json`. Add `_resetSessionIdCache()` for test support. Export both.

### T2: Isolate currentSessionId (event-log.ts)
- **Files**: `src/state/event-log.ts`
- **Test files**: `src/__tests__/session-isolation.test.ts`
- **Complexity**: small
- **Dependencies**: T1
- **AC**: 4 (currentSessionId never reads another session's ID)
- **What**: Remove the state.json read fallback (lines 61-70). Keep: env var → cached → generate new. Three-step only.

### T3: Dual-write rebuildAndCache state (event-log.ts)
- **Files**: `src/state/event-log.ts`
- **Test files**: `src/__tests__/session-isolation.test.ts`
- **Complexity**: medium
- **Dependencies**: T1, T2
- **AC**: 1 (two sessions read own stage), 2 (gate isolation)
- **What**: In `rebuildAndCache("state")` (line ~479), filter events by `session_id` for per-session cache, write both per-session and global.

### T4: Per-session loadState preference (state.ts)
- **Files**: `src/state/state.ts`
- **Test files**: `src/__tests__/session-isolation.test.ts`
- **Complexity**: small
- **Dependencies**: T3
- **AC**: 3 (loadState prefers per-session, falls back to global)
- **What**: In `loadState()` (line 42), check `sessionStateCachePath()` first with `existsSync`, fall back to `STATE_PATH`.

### T5: Task ID from event log maxId (tasks.ts)
- **Files**: `src/state/tasks.ts`
- **Test files**: `src/__tests__/session-isolation.test.ts`
- **Complexity**: small
- **Dependencies**: none (independent of T1-T4)
- **AC**: 5 (concurrent taskCreate derives maxId from event log)
- **What**: In `taskCreate()` (line 110), scan `readEvents("task")` for max numeric ID instead of using `store.next_id`.

### T6: Conflict annotation in materializeTasks (event-log.ts)
- **Files**: `src/state/event-log.ts`
- **Test files**: `src/__tests__/session-isolation.test.ts`
- **Complexity**: small
- **Dependencies**: none (can parallel with T5)
- **AC**: 6 (duplicate IDs annotated, not silently dropped)
- **What**: In `materializeTasks()` (line ~180), change `if (store.tasks.some(...)) break` to find + annotate `[conflict]` with source session_id.

### T7: Stale cache cleanup in init (init.ts)
- **Files**: `src/commands/init.ts`
- **Test files**: `src/__tests__/session-isolation.test.ts`
- **Complexity**: trivial
- **Dependencies**: none
- **AC**: 7 (per-session cache files >7 days cleaned by init)
- **What**: At end of `cmdInit()`, scan `.apex/` for `state.apex-*.json` files older than 7 days, delete them.

### T8: Full regression verification
- **Files**: none (read-only)
- **Test files**: all test files
- **Complexity**: trivial
- **Dependencies**: T1-T7
- **AC**: 8 (all existing tests pass)
- **What**: Run `bun test` and verify full green. Count should be >= previous count.

## Test Plan

| AC | Test Scenario | Test File | Given/When/Then |
|----|--------------|-----------|-----------------|
| 1 | Two sessions write different stages | `session-isolation.test.ts` | Given session A sets brainstorm and session B sets execute / When each reads their per-session cache / Then A sees brainstorm and B sees execute |
| 2 | Gate isolation | `session-isolation.test.ts` | Given session B registers a brainstorm artifact / When session A checks its per-session state / Then session A's state has no artifacts from B |
| 3 | loadState fallback | `session-isolation.test.ts` | Given only global state.json exists (no per-session) / When loadState() is called / Then it returns the global state |
| 3 | loadState preference | `session-isolation.test.ts` | Given both global (stage=review) and per-session (stage=plan) exist / When loadState() is called / Then it returns plan |
| 4 | currentSessionId isolation | `session-isolation.test.ts` | Given state.json contains session_id="other-session" / When currentSessionId() is called with no env var and cleared cache / Then it returns a newly generated ID, not "other-session" |
| 5 | Task ID sequential derivation | `session-isolation.test.ts` | Given session A creates T1 via event log / When session B calls taskCreate / Then B derives maxId=1 from event log and creates T2 (not T1) |
| 6 | Duplicate ID conflict annotation | `session-isolation.test.ts` | Given two task.created events with id="T1" are injected into the event log / When materializeTasks runs / Then first T1 is preserved and second is annotated with [conflict] marker |
| 7 | Stale cache cleanup | `session-isolation.test.ts` | Given `.apex/state.apex-old.json` with mtime 8 days ago / When `cmdInit()` runs / Then the file is deleted |
| 8 | Regression | Full test suite | When `bun test` runs / Then all tests pass |

## Dependency Graph

```
T1 (helpers) ──→ T2 (sessionId) ──→ T3 (rebuildAndCache) ──→ T4 (loadState)
                                                                     │
T5 (taskCreate maxId) ─────────────────────────────────────────────┐ │
T6 (conflict annotation) ─────────────────────────────────────────┤ │
T7 (init cleanup) ────────────────────────────────────────────────┤ │
                                                                   ▼ ▼
                                                           T8 (regression)
```

T1→T2→T3→T4 is the critical chain. T5, T6, T7 are independent and parallelizable.
