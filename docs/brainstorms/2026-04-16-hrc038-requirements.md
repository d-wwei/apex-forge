---
title: Gate Hardening — Content Quality + Adversarial Verification
scope: Standard
status: approved
created: 2026-04-16
approved_by: user (direct request)
---

## Problem Statement

Current gates only check form (section exists). Content quality checks (CQ1-CQ3) are in `apex doctor` (post-audit) but not in real-time gates. Also, agents self-review without independent adversarial verification.

## Constraints

- [已验证] `runStructuralGate` in `src/state/state.ts:173-453` handles all stage gates.
- [已验证] CLI cannot spawn Claude agents. Adversarial verification uses file-existence gate.
- [已验证] Existing tests in `src/__tests__/stage-gates.test.ts` test structural gates.
- Must not break Tier 1 lightweight pipelines.

## Approaches

1. **Content gates + file-existence adversarial gate** (chosen)
2. **Only content gates** — Rejected: user asked for both.

## Acceptance Criteria

1. `apex stage complete brainstorm` blocks if acceptance criteria count < 3.
2. `apex stage complete review` blocks if any persona section < 50 chars.
3. `apex stage complete brainstorm` requires `.apex/verifications/brainstorm-adversarial.md` (Tier 2+ only).
4. `apex stage complete review` requires `.apex/verifications/review-adversarial.md` (Tier 2+ only).
5. Tier 1 exempt from adversarial verification (scope=Lightweight in frontmatter).
6. All existing tests pass + new tests for CQ gates.
7. Build succeeds.

## Solution Shape

`src/state/state.ts`: Add CQ checks + adversarial file-existence checks to brainstorm and review gates. Adversarial block message includes sub-agent prompt.
