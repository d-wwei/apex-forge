---
title: "Multi-Agent Orchestration Implementation Plan"
scope: deep
status: approved
approved_by: user
approved_at: 2026-04-12
created: 2026-04-12
source_requirements: "docs/brainstorms/multi-agent-orchestration-requirements.md"
task_count: 14
complexity_estimate: "Phase 1: ~1200 lines new/modified, Phase 2: ~800 lines new"
---

# Multi-Agent Orchestration — Implementation Plan

## Problem Frame

The orchestrator needs to evolve from a 290-line skeleton (spawn → wait → reap) into a
real multi-agent coordination system with: pluggable runtime adapters, heterogeneous agent
support (Claude + Codex + Gemini), workspace isolation, retry/backoff, structured result
collection, and Persona-driven multi-perspective review. All without mandatory external
dependencies.

---

## Decision Log

| # | Decision | Rationale | Rejected Alternative |
|---|----------|-----------|---------------------|
| D1 | RuntimeAdapter as TypeScript interface, not abstract class | Lighter, testable with plain objects, no inheritance chain | Abstract class with shared implementation |
| D2 | One adapter file per agent type | Each CLI has different invocation, output parsing, and capability set | Single generic "process adapter" with config |
| D3 | Persona files in `skill/personas/` as YAML | Reusable across Skills, user-customizable, lightweight | Inline in Skill files (would duplicate across Skills) |
| D4 | Task Router lives inside orchestrator, not as separate module | Router logic is <100 lines, tightly coupled with dispatch loop | Separate `src/router.ts` module |
| D5 | Extend existing `Task` type with `adapter` and `persona` fields | Minimal change to event log schema, backward compatible | New TaskDispatch type alongside Task |
| D6 | Keep event-sourcing contract for all state mutations | Existing `appendEvent()` + `rebuildAndCache()` is the architectural invariant | Direct file writes |
| D7 | Rewrite orchestrator.ts in place, not new file | Keep the CLI entry point (`case "orchestrate"`) unchanged | New `src/orchestrator-v2.ts` |

---

## File Manifest

### New Files — Create

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `src/adapters/runtime.ts` | RuntimeAdapter interface + AgentHandle + AdapterStatus types | ~50 |
| `src/adapters/claude-adapter.ts` | ClaudeAdapter: spawn `claude --print`, parse output, support `--resume` | ~120 |
| `src/adapters/codex-adapter.ts` | CodexAdapter: spawn `codex -q`, parse output | ~100 |
| `src/adapters/gemini-adapter.ts` | GeminiAdapter: spawn `gemini-cli`, parse output | ~100 |
| `src/adapters/adapter-registry.ts` | Detect available adapters at startup, resolve by name | ~60 |
| `src/orchestrator/workspace.ts` | Per-task workspace creation (git worktree), cleanup, artifact injection | ~120 |
| `src/orchestrator/retry.ts` | Retry logic: exponential backoff, attempt tracking, session resume | ~80 |
| `src/orchestrator/result-collector.ts` | Parse structured result.json from workspace, synthesize multi-agent findings | ~100 |
| `src/orchestrator/prompt-builder.ts` | Build agent prompt from: task + skill + persona + workspace context + DAG artifacts | ~100 |
| `skill/personas/experts/technical-architect.yaml` | Expert persona | ~15 |
| `skill/personas/experts/business-strategist.yaml` | Expert persona | ~15 |
| `skill/personas/experts/ux-researcher.yaml` | Expert persona | ~15 |
| `skill/personas/experts/security-engineer.yaml` | Expert persona | ~15 |
| `skill/personas/users/first-time-user.yaml` | User persona | ~15 |
| `skill/personas/users/power-user.yaml` | User persona | ~15 |
| `src/__tests__/adapters.test.ts` | Tests for RuntimeAdapter implementations | ~150 |
| `src/__tests__/orchestrator-v2.test.ts` | Tests for rewritten orchestrator (routing, retry, workspace) | ~200 |

### Existing Files — Modify

| File | Change | Est. Delta |
|------|--------|-----------|
| `src/orchestrator.ts` | Rewrite: use RuntimeAdapter, add router, retry, workspace, prompt-builder | Major rewrite (~290→~350) |
| `src/types/config.ts` | Extend `ApexConfig` with `adapters` map, extend `AgentMap` | +30 lines |
| `src/types/task.ts` | Add `adapter?`, `persona?`, `skill?`, `attempt?`, `workspace_path?` fields to `Task` | +10 lines |
| `src/state/tasks.ts` | Support new Task fields in create/transition | +20 lines |
| `src/state/event-log.ts` | Handle new task fields in materializer | +10 lines |
| `orchestration/registry-seeds.yaml` | Add `skill`, `persona`, `dispatch_mode` fields to templates | +~200 lines (across 115 templates) |

---

## Task Decomposition

### Phase 1: Foundation

#### T1: RuntimeAdapter Interface + Type Definitions
- **Description**: Define the adapter interface, AgentHandle, AdapterStatus types. Extend Task and Config types.
- **Files create**: `src/adapters/runtime.ts`
- **Files modify**: `src/types/config.ts`, `src/types/task.ts`
- **Test files**: `src/__tests__/adapters.test.ts` (interface contract tests)
- **Complexity**: small
- **Dependencies**: none
- **Acceptance criteria**: AC1 (adapter interface), AC6 (cross-platform types)

RuntimeAdapter interface:

```
spawn(task, prompt, config) → AgentHandle
monitor(handle) → AdapterStatus { state: "running"|"idle"|"exited", exitCode? }
output(handle) → string | null
kill(handle) → void
resume(sessionId, prompt, config) → AgentHandle
name() → string          // "claude", "codex", "gemini"
available() → boolean    // CLI exists in PATH?
```

AgentHandle:

```
{ id: string, taskId: string, adapter: string, process?: ChildProcess,
  sessionId?: string, startedAt: number, attempt: number, logPath: string }
```

Extended ApexConfig.adapters:

```
adapters: {
  claude: { command: "claude", args: ["--print"], available: true },
  codex: { command: "codex", args: ["-q"], available: false },
  gemini: { command: "gemini-cli", args: [], available: false },
}
```

Extended Task fields:

```
adapter?: string       // which adapter was used
persona?: string       // persona file path (if any)
skill?: string         // skill reference (if any)
attempt?: number       // current attempt number
workspace_path?: string // workspace directory
session_id?: string    // for resume
```

#### T2: ClaudeAdapter Implementation
- **Description**: Implement ClaudeAdapter using `spawn("claude", ["--print", "-p", prompt])`. Support `--resume` for retry continuation. Capture stdout/stderr to log file. Parse exit code.
- **Files create**: `src/adapters/claude-adapter.ts`
- **Files modify**: none
- **Test files**: `src/__tests__/adapters.test.ts` (add Claude-specific tests)
- **Complexity**: medium
- **Dependencies**: T1
- **Acceptance criteria**: AC1 (dispatch Claude agents), AC4 (retry via --resume)

Key behaviors:
- `spawn()`: `child_process.spawn("claude", ["--print", "-p", prompt], { stdio, env: { APEX_TASK_ID } })`
- `resume()`: `child_process.spawn("claude", ["--print", "--resume", sessionId, "-p", prompt])`
- `monitor()`: check `process.exitCode`
- `output()`: read from log file at `handle.logPath`
- `available()`: `spawnSync("which", ["claude"]).status === 0`

#### T3: CodexAdapter Implementation
- **Description**: Implement CodexAdapter for Codex CLI. Different invocation pattern, different output parsing.
- **Files create**: `src/adapters/codex-adapter.ts`
- **Files modify**: none
- **Test files**: `src/__tests__/adapters.test.ts` (add Codex-specific tests)
- **Complexity**: medium
- **Dependencies**: T1
- **Acceptance criteria**: AC2 (cross-model review with Codex)

#### T4: Adapter Registry
- **Description**: Auto-detect available adapters at startup. Resolve adapter by name. Fallback chain: requested → default → error.
- **Files create**: `src/adapters/adapter-registry.ts`
- **Files modify**: none
- **Test files**: `src/__tests__/adapters.test.ts` (add registry tests)
- **Complexity**: small
- **Dependencies**: T2, T3
- **Acceptance criteria**: AC6 (works on all platforms — graceful degradation when adapters unavailable)

`detectAdapters()` → checks PATH for each CLI, returns `Map<string, RuntimeAdapter>`.
`resolve(name?)` → returns adapter or throws with helpful message.

#### T5: Workspace Isolation
- **Description**: Create per-task workspace using git worktree. Inject upstream task artifacts. Clean up on task completion.
- **Files create**: `src/orchestrator/workspace.ts`
- **Files modify**: none
- **Test files**: `src/__tests__/orchestrator-v2.test.ts` (workspace tests)
- **Complexity**: medium
- **Dependencies**: T1
- **Acceptance criteria**: AC3 (isolated worktrees), AC5 (DAG artifact injection)

Functions:
- `createWorkspace(taskId)` → creates `.workspaces/APEX-{taskId}/` with git worktree on branch `apex/{taskId}`
- `injectArtifacts(taskId, dependencyOutputs)` → copies upstream `result.json` into workspace
- `cleanupWorkspace(taskId, keep: boolean)` → remove worktree or archive

#### T6: Retry + Backoff
- **Description**: Implement retry logic with exponential backoff. Track attempts. Use `--resume` when adapter supports it.
- **Files create**: `src/orchestrator/retry.ts`
- **Files modify**: none
- **Test files**: `src/__tests__/orchestrator-v2.test.ts` (retry tests)
- **Complexity**: small
- **Dependencies**: T1
- **Acceptance criteria**: AC4 (3 retries with backoff)

Functions:
- `shouldRetry(taskId, exitCode, attempt, maxRetries)` → boolean
- `backoffMs(attempt, baseMs)` → `baseMs * 2^(attempt-1)` + random jitter (0-20%)
- `prepareRetryContext(workspace)` → reads previous attempt log, builds retry prompt addendum

#### T7: Prompt Builder
- **Description**: Build complete agent prompt from task + skill + persona + workspace context + DAG dependency artifacts. Replace current `buildPrompt()`.
- **Files create**: `src/orchestrator/prompt-builder.ts`
- **Files modify**: none
- **Test files**: `src/__tests__/orchestrator-v2.test.ts` (prompt builder tests)
- **Complexity**: medium
- **Dependencies**: T1, T5
- **Acceptance criteria**: AC1, AC2, AC7 (prompt includes persona when applicable)

Functions:
- `buildAgentPrompt(task, template, config)` → string
  - Reads skill content from `skill/` if template has `skill` field
  - Reads persona YAML from `skill/personas/` if template has `persona` field
  - Injects workspace path, attempt number, previous attempt notes
  - Injects DAG dependency status and available artifacts
  - Adds structured output instructions (write `result.json` to workspace)

#### T8: Result Collector
- **Description**: Parse structured results from agent workspaces. Synthesize multi-agent findings for Mode 2 (merge, deduplicate, rank).
- **Files create**: `src/orchestrator/result-collector.ts`
- **Files modify**: none
- **Test files**: `src/__tests__/orchestrator-v2.test.ts` (result collector tests)
- **Complexity**: medium
- **Dependencies**: T5
- **Acceptance criteria**: AC2 (synthesize findings from multiple agents), AC8 (structured analytics)

Functions:
- `collectResult(workspace)` → reads `result.json` from workspace, validates schema
- `synthesizeFindings(results[])` → merges multi-agent findings, deduplicates, ranks by severity
- `formatSynthesis(synthesis)` → human-readable summary for review stage

#### T9: Orchestrator Rewrite
- **Description**: Rewrite `src/orchestrator.ts` to use all new components: adapter registry, workspace, retry, prompt builder, result collector. Add Task Router (Mode 1 vs Mode 2). Preserve CLI interface.
- **Files modify**: `src/orchestrator.ts`
- **Test files**: `src/__tests__/orchestrator-v2.test.ts` (integration tests)
- **Complexity**: large
- **Dependencies**: T4, T5, T6, T7, T8
- **Acceptance criteria**: AC1, AC2, AC3, AC4, AC5, AC8

Task Router logic (inside orchestrator):
- Read template's `dispatch_mode`: `"same-model"` → Mode 1, `"cross-model"` → Mode 2
- Mode 1: dispatch to default adapter
- Mode 2: dispatch same task to multiple adapters (one per configured cross-model agent)
- Collect results from all agents, pass to result-collector for synthesis

Updated poll cycle:
```
1. Reap completed agents (check via adapter.monitor())
2. On completion: collect result, handle retry if failed, inject artifacts for downstream
3. Find dispatchable tasks (DAG deps met, not running)
4. Route: Mode 1 or Mode 2?
5. Dispatch via appropriate adapter(s)
6. Log to .apex/analytics/orchestrator.jsonl
```

#### T10: Event Log + Task State Updates
- **Description**: Ensure new Task fields (adapter, persona, attempt, workspace_path, session_id) flow through event sourcing correctly. Orchestrator updates task state on completion.
- **Files modify**: `src/state/tasks.ts`, `src/state/event-log.ts`
- **Test files**: `src/__tests__/tasks.test.ts` (extend existing tests)
- **Complexity**: small
- **Dependencies**: T1, T9
- **Acceptance criteria**: AC8 (analytics logging)

---

### Phase 2: Multi-Perspective

#### T11: Persona Files
- **Description**: Create 6 initial persona YAML files. Define schema convention.
- **Files create**: `skill/personas/experts/technical-architect.yaml`, `skill/personas/experts/business-strategist.yaml`, `skill/personas/experts/ux-researcher.yaml`, `skill/personas/experts/security-engineer.yaml`, `skill/personas/users/first-time-user.yaml`, `skill/personas/users/power-user.yaml`
- **Complexity**: small
- **Dependencies**: none
- **Acceptance criteria**: AC7 (Persona-driven review)

#### T12: Expert Panel Review Skill
- **Description**: Create `expert-panel-review` Skill that orchestrates a multi-Persona review of a plan or architecture document. Defines process: read artifact → evaluate from Persona's perspective → output verdict + findings.
- **Files create**: `skill/stages/expert-panel-review.md`
- **Complexity**: medium
- **Dependencies**: T11
- **Acceptance criteria**: AC7 (3+ Personas in expert review)

#### T13: GeminiAdapter Implementation
- **Description**: Implement GeminiAdapter for Gemini CLI.
- **Files create**: `src/adapters/gemini-adapter.ts`
- **Test files**: `src/__tests__/adapters.test.ts` (add Gemini tests)
- **Complexity**: small
- **Dependencies**: T1
- **Acceptance criteria**: AC2 (third model available)

#### T14: Registry Template Enhancement
- **Description**: Add `skill`, `persona`, `dispatch_mode` fields to registry-seeds.yaml templates. Add new templates for expert-panel-review and user-panel-review patterns.
- **Files modify**: `orchestration/registry-seeds.yaml`
- **Complexity**: medium (bulk update across 115 templates)
- **Dependencies**: T11, T12
- **Acceptance criteria**: AC7 (registry drives Persona selection)

---

## Dependency Graph

```
T1 (types + interface)
├── T2 (ClaudeAdapter)──────┐
├── T3 (CodexAdapter)───────┤
├── T5 (workspace)──────────┤
├── T6 (retry)──────────────┤
├── T7 (prompt builder)─────┤
│                            ▼
│                     T4 (adapter registry)
│                            │
├── T8 (result collector)────┤
│                            ▼
│                     T9 (orchestrator rewrite)
│                            │
└── T10 (event log updates)──┘

T11 (persona files) ─── no code dep ───
├── T12 (expert panel skill)
└── T14 (registry enhancement)

T13 (GeminiAdapter) ← T1
```

Phase 1 critical path: T1 → T2/T3/T5/T6/T7 (parallel) → T4/T8 → T9 → T10
Phase 2: T11/T13 (parallel, no dep on Phase 1) → T12 → T14

---

## Test Plan

| AC# | Acceptance Criterion | Test Scenario | Test File |
|-----|---------------------|---------------|-----------|
| AC1 | 3 parallel Claude agents complete | Given 3 independent tasks, when orchestrate runs, then all 3 dispatch and complete | `orchestrator-v2.test.ts` |
| AC2 | Cross-model review (Claude + Codex) | Given a review task with dispatch_mode=cross-model, when dispatched, then both adapters produce findings and findings are synthesized | `orchestrator-v2.test.ts` |
| AC3 | Isolated git worktrees | Given 3 parallel tasks, when all running, then each has a separate worktree and no file conflicts | `orchestrator-v2.test.ts` |
| AC4 | Retry with backoff | Given a task that fails with exit code 1, when retried, then attempt increments, backoff increases, and --resume is used | `orchestrator-v2.test.ts` |
| AC5 | DAG artifact injection | Given task B depends on task A, when A completes, then B's workspace contains A's result.json | `orchestrator-v2.test.ts` |
| AC6 | Cross-platform, zero deps | Given only `claude` CLI available, when adapters detect, then SpawnAdapter works, others degrade gracefully | `adapters.test.ts` |
| AC7 | Expert Panel with 3+ Personas | Given expert-panel-review skill + 3 persona files, when dispatched, then 3 agents produce independent verdicts | `orchestrator-v2.test.ts` |
| AC8 | Structured analytics | Given any orchestrator run, when tasks complete, then orchestrator.jsonl contains structured entries with adapter, persona, duration, outcome | `orchestrator-v2.test.ts` |
