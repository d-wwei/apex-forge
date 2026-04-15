# Changelog

## 0.1.2 (2026-04-15)

### Stage-Skip Protection

- **cli.ts**: `apex stage set <stage>` now prints `⚠ MANDATORY: Read stages/{stage}.md` for all non-idle stages — push-based reminder so agents cannot miss stage file reading
- **SKILL.md**: Added "Stage File Reading Rule (HARD GATE)" to Phase Discipline — explicit hard rule requiring `Read stages/{stage}.md` before executing any stage
- **Tests**: 2 new CLI tests verifying MANDATORY reminder for all 6 stages + idle exemption

### Root Cause

Agents relied on SKILL.md's brief stage descriptions instead of reading detailed stage files. The "MUST Read" rule existed only in the "Explicit Stage Commands" section (line 155), not in Phase Discipline that applies to all pipeline transitions. CLI provided no reminder.

## 0.1.1 (2026-04-14)

### Pipeline Re-entry Fix

- **compound.md**: After "开始新迭代", compound now chains into `Skill('apex-forge')` re-invocation instead of passively waiting — prevents control flow breakage where new tasks bypass the Complexity Router
- **SKILL.md**: Added "Idle re-entry enforcement" paragraph in Initialization section — ensures tasks arriving via compound chain enter the Router immediately

### Ship CI Detection Fix

- **ship.md**: CI detection command changed from zsh-breaking `ls *.yml *.yaml` to `find` + `test -f` with proper grouping — fixes false "No CI config" on zsh

### TypeScript Type Error Fixes

- Fixed 25+ `TS7006` implicit any errors in worker test files (mock.calls callback params)
- Fixed `TS18047` possibly-null errors in proxy.test.ts (non-null assertions)
- Fixed `TS2352` type cast in cross-model.ts (proper WindowHandle import + type widening)

### Root Cause

- Pipeline re-entry: skill execution ended after Compound, no mechanism forced Router re-entry
- CI detection: zsh `nomatch` aborts entire `ls` when one glob pattern has no matches
- TS errors: CI runs stricter `tsc --noEmit` than local dev environment

## 0.2.0 (2026-04-12)

### Multi-Agent Orchestration

- **RuntimeAdapter interface**: Pluggable adapter system for heterogeneous agent support
- **3 built-in adapters**: Claude, Codex, Gemini — auto-detected at startup
- **Adapter registry**: Detects available agents, resolves by name with graceful fallback
- **Two orchestration modes**:
  - Mode 1 (parallel dispatch): Same agent type, different tasks, for speed
  - Mode 2 (cross-model dispatch): Different agents evaluating same artifact, for eliminating blind spots
- **Workspace isolation**: Per-task directories with input/output structure and DAG artifact injection
- **Retry + exponential backoff**: Configurable max retries with jitter
- **Prompt builder**: Composes task + skill + persona + workspace context + upstream artifacts
- **Result collector**: Structured result parsing with multi-agent finding synthesis and deduplication
- **Persona system**: 6 initial personas (4 expert, 2 user) as reusable YAML context modules
- **Expert Panel Review skill**: Multi-perspective evaluation process for plans and architectures
- **Task state completion**: Orchestrator properly transitions tasks to done, unblocking DAG
- **Registry enhancement**: 3 new templates with skill/persona/dispatch_mode fields (118 total)
- **Extended Task type**: adapter, persona, skill, attempt, workspace_path, session_id fields
- **Event sourcing**: Materializer handles all new fields with backward compatibility

### Artifacts

- Requirements: `docs/brainstorms/multi-agent-orchestration-requirements.md`
- Plan: `docs/plans/multi-agent-orchestration-plan.md`
- Review: `docs/reviews/multi-agent-orchestration-review.md`

### Known Limitations

- Workspaces use plain directories, not git worktrees (Phase 2)
- Codex/Gemini adapters use `which` for availability check (Windows incompatible)
- No end-to-end integration test for cross-model expert panel dispatch
- Prompt still passed as CLI argument (temp file written but not yet piped via stdin)
