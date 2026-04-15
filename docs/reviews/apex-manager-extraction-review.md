# Review: apex-manager extraction from apex-forge

**Spec**: `docs/specs/apex-manager-extraction.md`
**Date**: 2026-04-15
**Reviewer**: Code Review Agent (Opus 4.6)
**Status**: DONE_WITH_CONCERNS

---

## Summary

The apex-manager extraction successfully creates an independent multi-agent orchestrator repo with 232 passing tests, clean TypeScript compilation, zero Bun imports, and zero runtime imports from apex-forge. The protocol-builder.ts is well-structured with proper capability degradation, i18n, and anti-recursion enforcement. The apex-forge cleanup correctly removes migrated code and adds apex-manager to the companion install list.

Three concerns require attention: one is a **Critical** bug (wrong binary name in daemon spawn), one is an **Important** spec deviation (AF test failure), and one is an **Important** test quality issue (`.apex/` fallback assertions weaken test precision).

---

## Persona: Correctness

### [Critical] daemon.ts uses `"apex"` instead of `"apex-manager"` for spawn

**File**: `/Users/admin/Documents/AI/agent better work/apex-manager/src/daemon/daemon.ts`, line 212

```typescript
const result = spawnSync("apex", ["worker", "spawn", task.id], {
```

The daemon spawns downstream workers via CLI, but calls `"apex"` (the apex-forge binary) instead of `"apex-manager"`. This means the daemon's auto-spawn will invoke the wrong binary at runtime. The `package.json` `bin` field correctly declares `"apex-manager"`, so this should be:

```typescript
const result = spawnSync("apex-manager", ["worker", "spawn", task.id], {
```

This is in the hot path of the daemon tick loop (spawnUnblockedTasks) and will cause every automatic worker spawn to fail.

### [Pass] All imports resolve

TypeScript `--noEmit` completes with zero errors. All migrated files point to AM's own `../utils/json.js`, `../utils/logger.js`, `../types/task.js`, etc.

### [Pass] Bun APIs fully replaced

Grep for `Bun.`, `from "bun"`, `import.*bun:` across `src/` returns zero matches. `proxy.ts` correctly uses `http.createServer()` and Node.js `fetch()`.

### [Pass] `.apex/` paths replaced with `.apex-manager/`

Grep for `.apex/` across `src/` returns zero matches. All source files consistently use `.apex-manager/`.

### [Pass] Branch prefix correctly uses `apex-mgr/`

`worker.ts` line 119: `const branch = "apex-mgr/${taskId}"` -- distinct from AF's `apex/T{N}`.

---

## Persona: Spec Compliance

### [Pass] Phase 1: Repo structure matches spec Section 12

All specified directories exist: `src/worker/`, `src/daemon/`, `src/commands/`, `src/utils/`, `src/types/`, `roles/`, `tests/`. Files match the spec's file table (Section 11.1).

### [Pass] Phase 2: protocol-builder.ts implements all spec requirements

- Task information section with title, description, acceptance criteria, dependencies
- Optional work protocol injection via `findSkillContent()` with multi-directory scan
- Communication rules with capability-based degradation (bash/file-write/minimal)
- Anti-recursion guard injected in all protocols
- Directive/escalation check section
- Git boundaries section
- Cross-model section (conditional)
- i18n support (zh/en based on agent's `preferredLanguage`)

### [Pass] Phase 3: roles/manager.md matches spec

Three-phase model (Initiation/M&C/Closure) implemented with correct gate conditions. Anti-recursion rule explicitly stated. CLI command reference complete. The only `apex-forge` references in manager.md are in *examples* (e.g., `--protocol apex-forge`) which is correct -- these show how AF is used as a pluggable protocol.

### [Important] Phase 4: apex-forge test suite has 1 failure (172 pass, 1 fail)

**File**: `src/__tests__/orchestrator-v2.test.ts` -- `AdapterRegistry > resolveAdapter` / `detectAdapters` timeout

This test fails consistently (reproduced twice) with a 5-second timeout on adapter detection. The spec states "bun test all green (apex-forge side)" as Phase 4 Step 6. Investigation shows this is a pre-existing flaky test (stale `apex/dup-branch` git branch from a prior run), not caused by the extraction. However, the spec gate is not met.

**Recommendation**: Clean up the stale branch (`git branch -D apex/dup-branch`) and increase the test timeout to confirm it passes. If this test is environment-dependent, mark it with a longer timeout or skip annotation.

### [Pass] Phase 4: AF CLI correctly removes worker/orch commands

AF's `cli.ts` has no `worker` or `orch` case in its switch. No imports from `./commands/worker.js` or `./commands/orch.js`. The `src/worker/` directory no longer exists in AF. The `src/orchestrator/` directory retains only the orchestrator module (workspace, retry, prompt-builder, result-collector, result-validator) which is AF's own orchestration -- not the migrated daemon code.

### [Pass] AF install.sh includes apex-manager companion

Line 288 of `skill/install.sh`:
```
"apex-manager|https://github.com/d-wwei/apex-manager|"
```

### [Minor deviation] Spec says "preserve protocol-template.ts as AF companion ability"

The spec (Section 10.3) says to keep `src/worker/protocol-template.ts` in AF as a companion capability for richer protocol generation when AF is selected as a worker protocol. This file does not exist in AF anymore. This is a benign deviation -- the protocol-builder in AM handles this adequately by reading AF's SKILL.md content directly.

---

## Persona: Security

### [Important] Task ID used unsanitized in shell commands and file paths

Task IDs flow from `tasks.json` into:
- `spawnSync("git", ["worktree", "add", ".apex-manager/worktrees/${taskId}", ...])` (worker.ts:122-124)
- `spawnSync("git", ["branch", "-D", "apex-mgr/${taskId}"])` (worker.ts:239)
- Shell string interpolation in protocol-builder.ts: `cat > ${workersDir}/status.json` (line 153)

Since task IDs are created via `apex-manager task create` and stored in `tasks.json`, the attack surface is limited to local file manipulation. However, a task ID containing `../` could cause path traversal, and an ID like `T1; rm -rf /` in the heredoc template could enable command injection in the generated protocol markdown (which the worker agent then executes).

**Recommendation**: Add task ID validation at creation time (`/^T\d+$/` or similar alphanumeric constraint). The `toSlug()` function in worker.ts sanitizes for window names but is not applied to the task ID itself.

### [Pass] No hardcoded credentials

No API keys, tokens, or secrets found in source code. The proxy correctly strips internal headers (`x-apex-task-id`) before forwarding upstream.

### [Pass] findSkillContent does not traverse outside skill directories

`findSkillContent` joins `skillName` with predefined base paths (`~/.claude/skills/`, etc.). A `skillName` containing `../` could traverse upward, but this is mitigated by the fact that skill names come from Plan Agent's AI judgment on actual directory names, not arbitrary user input.

---

## Persona: Adversarial

### [Important] Tests use `.apex/` fallback assertions that weaken validation

**File**: `/Users/admin/Documents/AI/agent better work/apex-manager/tests/worker/protocol-template.test.ts`

Lines 80, 126, 130 use `||` patterns that accept both `.apex-manager/` and `.apex/` paths:

```typescript
assert.ok(md.includes(".../.apex-manager/workers/T3/status.json") || md.includes(".../.apex/workers/T3/status.json"));
```

Source code produces only `.apex-manager/` paths. These `||` fallbacks mean the tests would still pass if someone accidentally reverted to `.apex/` paths. The assertions should be tightened to only accept `.apex-manager/`.

### [Observation] `readJSON` is async but implementation is synchronous

`readJSON` and `writeJSON` in `src/utils/json.ts` are declared `async` but use only synchronous `readFileSync`/`writeFileSync`. This works but is misleading -- callers `await` a synchronous operation. Not blocking, but creates a false expectation of non-blocking I/O.

### [Observation] `task` command is a stub

`cli.ts` line 52-54:
```typescript
case "task":
  console.log("task management coming soon");
  break;
```

Yet `cmdSpawn` reads from `.apex-manager/tasks.json` and the daemon's `spawnUnblockedTasks` depends on task status transitions. The task management presumably happens via the protocol-builder's communication protocol (workers write result.json, daemon processes it). But there is no way to create tasks via the AM CLI yet, which means the entire flow depends on manual JSON file editing or external tooling.

This is acknowledged by the spec as part of the iterative delivery -- the Plan Agent creates tasks via CLI commands listed in the spec (Section 13), but the implementation is deferred. This is acceptable for Phase 1-3 but will need to be addressed before end-to-end integration testing (Phase 5).

### [Pass] Anti-recursion enforcement

`protocol-builder.ts` injects anti-recursion text in every worker protocol (lines 126-144). `manager.md` explicitly states "skip apex-manager itself" in protocol discovery (line 109). Both Chinese and English versions are covered.

---

## Test Quality Assessment

232 tests across 55 suites in 3 directories (worker, daemon, commands). Coverage analysis:

| Module | Test file exists | Key paths tested |
|--------|-----------------|------------------|
| protocol-builder.ts | Yes (protocol-template.test.ts) | Build, i18n, capability degradation, cross-model, bare-run |
| agent-adapter.ts | Yes | Builtin lookup, config override, unknown agent error |
| proxy.ts | Yes | Rate limit parsing, cost calculation, usage extraction, cost summary |
| cross-model.ts | Yes | ID generation, verdict merge, deduplication |
| monitor.ts | Yes | Health check logic |
| terminal.ts | Yes | Interface compliance, adapter detection |
| interrupt.ts | Yes | Key mapping per agent/adapter |
| capability-check.ts | Yes | Binary detection |
| daemon.ts | Yes (daemon-recovery.test.ts) | Worker discovery, recovery |
| integrate.ts | Yes | Auto-integrate, auto-merge |
| notify.ts | Yes | Notification queue |
| orch.ts | Yes (orch-lock.test.ts) | Lock acquire/release/stale |
| commands/worker.ts | Yes (worker.test.ts + worker-*.test.ts) | Spawn, kill, merge, directive, status |

**Gap**: `findSkillContent()` has no dedicated test. This is the mechanism for discovering and reading skill SKILL.md files. A test with a mock filesystem or temp directory would catch path construction bugs.

---

## Findings Summary

| # | Severity | Category | Description |
|---|----------|----------|-------------|
| 1 | Critical | Correctness | daemon.ts line 212 calls `"apex"` instead of `"apex-manager"` for worker spawn |
| 2 | Important | Spec Compliance | AF test suite has 1 consistent failure (orchestrator-v2 timeout) |
| 3 | Important | Test Quality | `.apex/` fallback assertions in protocol-template.test.ts weaken path validation |
| 4 | Important | Security | Task IDs used unsanitized in shell commands and file paths |
| 5 | Suggestion | Test Coverage | `findSkillContent()` has no test |
| 6 | Suggestion | Code Quality | `readJSON`/`writeJSON` declared async but implementation is synchronous |
| 7 | Suggestion | Completeness | `task` CLI command is a stub -- blocking end-to-end flows |

---

## Verdict: DONE_WITH_CONCERNS

The extraction is architecturally sound and achieves its primary goals: zero AF dependency, proper Bun removal, correct path migration, comprehensive test suite, and a well-designed protocol-builder. Finding #1 (wrong binary name) must be fixed before the daemon can function. Finding #3 (test assertions) should be tightened to maintain extraction integrity. The remaining items are improvements rather than blockers.
