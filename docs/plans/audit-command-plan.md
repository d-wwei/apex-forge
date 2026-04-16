---
title: "apex audit — Implementation Plan"
scope: Standard
status: approved
created: 2026-04-16
source: docs/brainstorms/audit-command-requirements.md
tasks: 4
complexity: medium
---

# apex audit — Implementation Plan

## Problem Frame

`apex doctor` checks infrastructure health; nothing audits whether a completed pipeline run produced real work or hollow artifacts. `apex audit` cross-verifies agent self-reported artifacts against unforgeable data sources (git diff, test output, timestamps).

## Decision Log

| # | Decision | Rationale | Rejected Alternative |
|---|----------|-----------|---------------------|
| D1 | Inline types (don't import from doctor.ts) | audit.ts is a self-contained module; doctor.ts types are simple 4-line interfaces. Importing creates coupling for no benefit. | Import Check/CategoryScore from doctor.ts |
| D2 | Use `materializePerSession()` for session lookup, then filter history for pipeline boundaries | Reuses existing event-sourcing infrastructure. Pipeline = contiguous brainstorm→compound in history[]. | Parse state.jsonl manually |
| D3 | Ship artifact commit SHAs for git diff range | Ship artifacts already record commit hashes. More robust than `HEAD~1` which breaks for multi-commit pipelines. | Always use `HEAD~1` |
| D4 | AC keyword extraction: split on whitespace, filter >4 chars + not in stopword list | Simple, deterministic, no NLP dependency. WARN-only verdict acknowledges heuristic nature. | Regex patterns from AC text |
| D5 | Layer weights: Process 30%, Content 20%, Verified 50% | Cross-verification is the core innovation — highest weight. Content is agent-reported data — lowest trust. | Equal weights |

## File Manifest

### Create

| File | Purpose |
|------|---------|
| `src/commands/audit.ts` | Main audit command: 3-layer checks, scoring, formatting, JSON output |
| `src/__tests__/audit.test.ts` | Tests: CLI integration + unit tests for scoring/pipeline-finding logic |

### Modify

| File | Change |
|------|--------|
| `src/cli.ts` | Add `case "audit":` block (~4 lines) + help text line |

## Task Decomposition

### T1: Core audit infrastructure + Layer 1 (Process Integrity)

- **Description**: Create `src/commands/audit.ts` with arg parsing (`--session`, `--json`, `--no-test`, `--all`), session resolution (find latest session via `materializePerSession()`), pipeline boundary detection in history[], and Layer 1 checks: 6 stages complete, completed_via=gate, ship checkpoints, skill invocations, no skip-gate, timeline ordering.
- **Files**: `src/commands/audit.ts` (create), `src/__tests__/audit.test.ts` (create)
- **Complexity**: medium
- **Dependencies**: none
- **Acceptance criteria**: AC1, AC2, AC3, AC4, AC6, AC10

### T2: Layer 2 (Artifact Content Quality)

- **Description**: Add Layer 2 checks to audit.ts — read artifact files from state's `artifacts{}`, check brainstorm AC count/length, plan task count/length, review persona depth/file-refs/findings, ship summary sections, compound root-cause depth. Uses `parseFrontmatter()` and `hasSection()` from state.ts.
- **Files**: `src/commands/audit.ts` (modify), `src/__tests__/audit.test.ts` (modify)
- **Complexity**: medium
- **Dependencies**: T1
- **Acceptance criteria**: AC7

### T3: Layer 3 (Cross-Verification) + Scoring + Output

- **Description**: Add Layer 3 checks — plan-vs-diff alignment, AC-vs-code grep, review-vs-diff refs, bun test execution (with --no-test skip), stage duration checks. Add scoring engine (weighted average per layer, grade calculation, Layer 3 FAIL cap). Add formatted report output matching the spec's box-drawing format. Add `--json` output mode. Add `--all` trend summary mode.
- **Files**: `src/commands/audit.ts` (modify), `src/__tests__/audit.test.ts` (modify)
- **Complexity**: medium
- **Dependencies**: T1, T2
- **Acceptance criteria**: AC1, AC3, AC5, AC8, AC9

### T4: CLI registration + help text + build verification

- **Description**: Add `case "audit"` to cli.ts switch block. Add help text for `audit [--session ID] [--json] [--no-test] [--all]`. Build with `bun build`. Run `bun test --timeout 30000` to verify all existing + new tests pass.
- **Files**: `src/cli.ts` (modify)
- **Complexity**: trivial
- **Dependencies**: T1, T2, T3
- **Acceptance criteria**: AC1, AC11

## Test Plan

| AC | Scenario | Test File |
|----|----------|-----------|
| AC1 | Given a temp dir with seeded .apex/log/state.jsonl containing a complete pipeline, When `apex audit` runs, Then exit code 0 and output contains "PIPELINE AUDIT" header + grade | `src/__tests__/audit.test.ts` |
| AC2 | Given `--session <id>` targeting a specific session, When audit runs, Then only that session's events are analyzed | `src/__tests__/audit.test.ts` |
| AC3 | Given `--json` flag, When audit runs, Then output is valid JSON with `checks`, `scores`, `grade` keys | `src/__tests__/audit.test.ts` |
| AC6 | Given a session where brainstorm was completed_via "transition" (not gate), When Layer 1 runs, Then check produces WARN "stage bypassed gate" | `src/__tests__/audit.test.ts` |
| AC7 | Given a brainstorm artifact with 1 AC of 5 words, When Layer 2 runs, Then produces WARN for low AC count and short AC length | `src/__tests__/audit.test.ts` |
| AC9 | Given Layer 1 all PASS, Layer 2 all PASS, Layer 3 has one FAIL, Then overall grade capped at C | `src/__tests__/audit.test.ts` |
| AC10 | Given audit completes, Then .apex/ directory is unmodified (snapshot before/after) | `src/__tests__/audit.test.ts` |
| AC11 | Given existing test suite, When `bun test --timeout 30000` runs after changes, Then all tests pass | CLI verification |

## Dependency Graph

```
T1 (infra + L1)
  ↓
T2 (L2) ──→ T3 (L3 + scoring + output)
                  ↓
               T4 (CLI registration + build)
```
