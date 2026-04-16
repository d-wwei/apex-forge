---
title: "apex audit — Pipeline Execution Quality Audit"
scope: Standard
status: approved
created: 2026-04-16
author: user + agent
tier: 2
---

# apex audit — Requirements

## Problem Statement

`apex doctor` checks infrastructure health (hooks, gates, bindings). It cannot detect whether a completed pipeline run produced substantive work or hollow artifacts. An agent can write one-line ACs, empty review sections, and skip-grade plans — all formally compliant, all content-empty. There is no mechanism to audit a **specific pipeline execution** for quality after the fact.

## Constraints

- [已验证] Read-only: audit MUST NOT modify .apex/ state, git history, or artifact files.
- [已验证] Single new file: `src/commands/audit.ts`. Only other change: register `case "audit"` in `src/cli.ts`.
- [已验证] Reuse existing types from doctor.ts (Check, CategoryScore, Severity, Verdict) and APIs from event-log.ts (readEvents, materializePerSession) and state.ts (parseFrontmatter, hasSection).
- `bun test` verification is opt-out via `--no-test`, not opt-in.
- Existing test suite MUST continue to pass.
- Build: `bun build src/cli.ts --outfile dist/apex-forge --target node`.

## Approach: 3-Layer Cross-Verification Audit

**Why this instead of just artifact analysis**: Agent can fake artifact content but cannot fake git diff, test results, commit timestamps, or code existence. Cross-verification makes the cost of deception approach the cost of real work. [已验证: this is the user's stated design principle]

**Alternative considered — pure git analysis only**: Would miss process compliance checks entirely (skipped stages, bypassed gates). Rejected because process integrity is still valuable even if weaker than cross-verification.

## Acceptance Criteria

1. `apex audit` succeeds on a completed pipeline, producing a formatted report with Layer 1/2/3 results and overall grade.
2. `apex audit --session <id>` audits a specific session's most recent pipeline.
3. `apex audit --json` produces machine-readable output (same data, JSON format).
4. `apex audit --no-test` skips `bun test` execution.
5. `apex audit --all` produces a trend summary across all sessions.
6. Layer 1 detects: missing stages, skipped gates (`completed_via: "transition"`), missing ship checkpoints, absent skill invocations, `--skip-gate` usage.
7. Layer 2 checks artifact content: AC count/length, plan task count/length, review persona depth/file-refs/findings, ship summary sections, compound root-cause depth.
8. Layer 3 cross-verifies: plan-vs-diff file alignment, AC-vs-code keyword presence, review-vs-diff file references, test passage, timeline ordering, stage duration reasonableness.
9. Scoring: Process 30%, Content 20%, Verified 50%. Grade A/B/C/D/F. Any Layer 3 FAIL caps grade at C.
10. Zero writes to .apex/, git, or artifact files.
11. Existing tests pass: `bun test --timeout 30000`.

## Design Decisions

### D1: Pipeline Identification Within a Session

A single session can run multiple pipeline cycles (brainstorm→compound→idle→brainstorm→...). The audit targets the **most recent complete pipeline cycle** — identified by finding the last `stage.completed` for `ship` or `compound` in the session's history, then tracing back to the corresponding `brainstorm` start.

### D2: Git Diff Range

The spec's `HEAD~1` is fragile for multi-commit pipelines. Instead:
- Extract commit SHAs from ship artifacts (they're recorded as bare hashes like `bc5d045`).
- If multiple commits: diff from the commit before the first ship commit to the last ship commit.
- Fallback: if no ship commit artifacts, use `HEAD~1`.

### D3: AC Keyword Extraction (Heuristic)

Extract significant words (>4 chars, not stopwords) from each AC line. This is inherently approximate — the check produces WARN not FAIL when keywords are missing, because AC phrasing may not match code identifiers exactly.

### D4: Score Calculation

Follows doctor.ts weighted-score pattern:
- Each check: PASS=100, WARN=50, FAIL=0, SKIP=excluded
- Per-layer score: weighted average of checks in that layer
- Overall: Process(30%) + Content(20%) + Verified(50%)
- Hard cap: any Layer 3 FAIL → max grade C regardless of total score

## Dependencies

| Dependency | Status |
|-----------|--------|
| `readEvents("state")` from event-log.ts | [已验证] Available |
| `materializePerSession()` from event-log.ts | [已验证] Available |
| `parseFrontmatter()`, `hasSection()` from state.ts | [已验证] Available |
| Check/CategoryScore types from doctor.ts | [已验证] Available, will inline (no import needed) |
| `execSync` from child_process | [已验证] Node built-in |
| `readFileSync`, `existsSync` from fs | [已验证] Node built-in |

## Out of Scope

- Automated remediation (audit is read-only diagnostic).
- Integration with Dashboard (future work).
- Comparing pipelines across branches.
