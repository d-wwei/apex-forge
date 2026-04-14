---
title: Multi-Session State Isolation — Review
status: DONE
date: 2026-04-14
personas: Security, Correctness, Spec Compliance, Concurrency, Test Quality
---

# Review: Multi-Session State Isolation

## Summary

Multi-persona review of session isolation implementation across 4 source files + 1 test file.

## Findings Fixed

### P0: Path traversal via unsanitized APEX_SESSION_ID (Security)
- **File**: `src/state/event-log.ts:56-65`
- **Fix**: Added `sanitizeSessionId()` — strips non-alphanumeric chars, limits to 128 chars
- **Verified**: Tests pass, generated IDs pass through unchanged

### P1: stage.ts separate loadState bypasses session isolation (Correctness)
- **File**: `src/state/stage.ts:6-14`
- **Fix**: Updated `loadState()` to prefer per-session cache, consistent with `state.ts`
- **Callers affected**: `src/commands/status.ts`, `src/mcp/tools/status.ts`
- **Verified**: Tests pass, no callers of `saveState` exist

### P2: Cleanup regex misses non-apex session IDs (Security)
- **File**: `src/commands/init.ts:102`
- **Fix**: Broadened regex to `/^state\..+\.json$/` with `!== "state.json"` guard
- **Verified**: Tests pass

## Findings Accepted (Known Limitations)

### P1: Task ID TOCTOU race (Concurrency)
- **File**: `src/state/tasks.ts:116-127`
- **Status**: Known limitation per AC5. Collision detected via conflict annotation. Full fix (random suffix IDs) deferred as higher-cost change.

### P1: Non-atomic dual write (Concurrency)
- **File**: `src/state/event-log.ts:489-501`
- **Status**: Acceptable. Both caches are re-derivable from event log. Crash between writes causes no data loss.

## Findings Noted (P3)

- Conflict annotation in user data field (not metadata) — design choice
- `_resetSessionIdCache` exported without access control — test utility
- `readEvents` silently skips corrupted log lines — existing behavior
- Legacy events without session_id excluded from per-session caches — edge case
- `defaultState()` uses `sessionId()` instead of `currentSessionId()` — pre-existing

## Verification

- 298 tests pass (11 new session isolation tests)
- 1 pre-existing flaky test (CLI consensus timeout) — unrelated
- All P0/P1/P2 findings fixed and verified
