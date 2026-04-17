---
title: apex audit --quick — Human Decision Summary
scope: Standard
status: approved
created: 2026-04-17
approved_by: user (direct request)
---

## Problem Statement

Human reviewers need a 30-second scannable summary to decide approve/reject. Current `apex audit` is a deep analysis tool (3 layers, 20+ checks) — too verbose for quick decisions. Need a `--quick` mode that shows: task, AC status, sub-agent findings, changes, gate status.

## Constraints

- [已验证] `apex audit` already exists at `src/commands/audit.ts` (948 lines) with full infrastructure for pipeline resolution, artifact reading, and check scoring.
- [已验证] Sub-agent findings are in `.apex/verifications/{stage}-adversarial.md`.
- [已验证] Brainstorm artifact has AC section; gate results are in `runStructuralGate()`.
- Reuse existing `findPipeline`, `extractSection`, `readFileSync` infrastructure.

## Approaches

1. **Add `--quick` flag to existing `apex audit`** (chosen) — new `formatQuickSummary()` function, reuses pipeline/artifact infrastructure.
2. **New `apex summary` command** — rejected: duplicates infrastructure, adds maintenance burden.

## Acceptance Criteria

1. `apex audit --quick` outputs a single-page summary with: task name, scope, AC checklist, changes (git diff --stat), sub-agent findings, gate status per stage, and decision prompt.
2. Output fits in one terminal screen (< 40 lines).
3. Sub-agent findings section extracts key warnings from `.apex/verifications/*.md`.
4. AC section reads brainstorm artifact and marks each criterion with pass/fail based on execution evidence.
5. Existing `apex audit` (without --quick) behavior unchanged.

## Solution Shape

Add `formatQuickSummary(pipeline)` function in `audit.ts`. When `--quick` flag detected, skip Layer 1-3 detailed checks, instead produce the concise format directly from artifacts + git + verifications.
