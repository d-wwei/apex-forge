---
title: Multi-Session State Isolation
scope: Standard
status: approved
created: 2026-04-14
spec_source: docs/specs/multi-session-state-isolation.md
---

# Multi-Session State Isolation — Requirements

## Problem Statement

When multiple Claude Code sessions run apex-master (Plan Agent) in the same project directory,
they share a single `.apex/state.json` cache. `rebuildAndCache("state")` replays ALL events
into one `current_stage`, and the last writer wins — corrupting other sessions' pipeline state.
Secondary issue: concurrent `taskCreate()` calls can produce duplicate Task IDs (`T5` + `T5`),
with one silently discarded.

## Constraints

1. [已验证] Event log format (`.apex/log/state.jsonl`) must not change — append-only JSONL with session_id is already safe.
2. [已验证] Dashboard API (`/api/state`) return structure must not change — `sessionPipelines` already groups by session.
3. [已验证] Worker communication (`.apex/workers/`) must not change — isolated by task_id.
4. [已验证] Global `state.json` must be preserved — Dashboard's `deriveStageFromTasks` reads it as fallback.
5. [已验证] Task ID format must stay `T{N}` — no session prefix (too many downstream consumers).
6. [已验证] Backward compatible — graceful fallback when no per-session cache exists.

## Approaches

### A: Per-session state cache (spec's approach)
- `rebuildAndCache("state")` dual-writes: per-session `.apex/state.{sid}.json` + global `state.json`
- `loadState()` reads per-session first, falls back to global
- `currentSessionId()` stops reading from `state.json` (cross-session pollution source)
- Task ID: derive `maxId` from event log instead of cached `next_id`
- **Pros**: Minimal change ([假设] ~190 lines per spec estimate), backward compatible, Dashboard unaffected
- **Cons**: Per-session cache files accumulate (mitigated by cleanup in `apex init`)

### B: Database-backed state with locking
- Replace JSON files with SQLite for atomic reads/writes
- **Pros**: Proper concurrency, no cache files
- **Cons**: Major rewrite, breaks all existing tooling, overkill for the problem

### C: File locking on state.json
- Use `flock` or similar before read-modify-write cycles
- **Pros**: No new files
- **Cons**: Doesn't solve the fundamental issue (one global stage can't represent N sessions)

**Selected: Approach A** — solves the root cause (per-session isolation) with minimal blast radius.

## Acceptance Criteria

1. Two sessions writing different stages each read back their own stage (not the other's).
2. Session A's exit gate check is not affected by Session B's artifacts.
3. `loadState()` prefers per-session cache, falls back to global when per-session doesn't exist.
4. `currentSessionId()` never reads another session's ID from `state.json`.
5. Concurrent `taskCreate()` calls derive maxId from event log (not cached `next_id`). [假设] Residual micro-race window exists where two processes may read the same maxId — collisions are detected and annotated, not silently dropped. Full uniqueness guarantee would require random-suffix IDs (deferred as higher-cost change).
6. Duplicate task ID events are annotated with `[conflict]` marker and source session (not silently dropped).
7. Per-session cache files older than 7 days are cleaned up by `apex init`.
8. All existing tests continue to pass. [假设] Current count ~278, exact number to be verified at implementation time.

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Line numbers shifted in source files | Medium | Low | Match on code content, not line numbers. Verified: rebuildAndCache shifted ~10 lines. |
| Per-session cache files accumulate | Low | Low | Cleanup in `apex init` (7-day TTL) |
| `APEX_SESSION_ID` env var not set | Low | Medium | Graceful fallback: generate new ID per process. Worst case = fragmented events, not cross-pollution. |
| Task ID race window (two processes read same maxId) | Very Low | Medium | Event log dedup with conflict annotation instead of silent drop |

## Dependencies

| Dependency | Status |
|-----------|--------|
| `src/state/event-log.ts` (STATE_CACHE, currentSessionId, rebuildAndCache, materializeTasks) | [已验证] Available, line numbers confirmed |
| `src/state/state.ts` (loadState, STATE_PATH) | [已验证] Available |
| `src/state/tasks.ts` (taskCreate) | [已验证] Available |
| `src/commands/init.ts` (cmdInit) | [已验证] Available |
| `bun:test` framework | [已验证] Already used in project |

## Solution Shape

Four surgical changes to the state management layer:

1. **event-log.ts**: Add `sessionStateCachePath()`, modify `currentSessionId()` to stop reading state.json, modify `rebuildAndCache("state")` to dual-write per-session + global cache, modify `materializeTasks` dedup to annotate conflicts.
2. **state.ts**: Modify `loadState()` to prefer per-session cache with global fallback.
3. **tasks.ts**: Modify `taskCreate()` to derive maxId from event log instead of cached `next_id`.
4. **init.ts**: Add stale per-session cache cleanup (7-day TTL).
5. **New test file**: `session-isolation.test.ts` with 6 test cases covering isolation and collision resistance.

No new abstractions. No new dependencies. Existing tests unaffected.

## Confirmed Decisions

| # | Decision | Basis | Status |
|---|----------|-------|--------|
| D1 | Per-session cache approach over SQLite or file locking | [已验证] Root cause requires per-session isolation, not just atomicity | Confirmed |
| D2 | Global state.json preserved for Dashboard compatibility | [已验证] Dashboard's deriveStageFromTasks reads it | Confirmed |
| D3 | Task ID stays T{N} format, maxId from event log | [已验证] Too many downstream consumers for format change | Confirmed |
| D4 | currentSessionId stops reading state.json | [已验证] This is the cross-session pollution source (line 61-70) | Confirmed |
| D5 | rebuildAndCache line numbers shifted to 470-490 | [已验证] Spec says 460-480, actual is ~10 lines later | Confirmed |
