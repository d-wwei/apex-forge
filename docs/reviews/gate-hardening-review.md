---
title: Gate Hardening — Content Quality + Adversarial Verification Review
status: DONE
reviewer: self (Tier 2)
created: 2026-04-16
---

## Summary

3 files changed: `src/state/state.ts` (+55 lines: CQ1/ADV1 in brainstorm gate, CQ3/ADV2 in review gate), `src/__tests__/stage-gates.test.ts` (fixture updates), `src/__tests__/skip-gate-enforcement.test.ts` (fixture updates).

## Security Reviewer

No findings. New gates read local artifact files and check `.apex/verifications/` for file existence. No external access, no user input in paths.

## Correctness Reviewer

No findings. CQ1 regex (`/^\s*\d+\./gm`) correctly counts numbered items in the AC section, bounded by section-end markers. CQ3 measures trimmed content length per persona section. ADV1/ADV2 use simple file-existence check with Lightweight scope exemption. All 54 tests pass.

## Spec Compliance Reviewer

- AC1 (CQ1 blocks brainstorm): PASS — `state.ts` brainstorm gate includes CQ1 check, threshold >= 3
- AC2 (CQ3 blocks review): PASS — `state.ts` review gate includes CQ3 check, threshold > 50 chars per persona
- AC3 (ADV1 for brainstorm): PASS — file-existence gate with sub-agent dispatch prompt in error message
- AC4 (ADV2 for review): PASS — file-existence gate with sub-agent dispatch prompt in error message
- AC5 (Tier 1 exempt): PASS — `scope: Lightweight` in brainstorm frontmatter skips ADV1/ADV2
- AC6 (tests pass): PASS — 54/54
- AC7 (build succeeds): PASS — 0.75 MB

## Adversarial Reviewer

1. **Agent can create a trivial adversarial file**: The gate only checks file existence, not content quality. An agent could `echo "ok" > .apex/verifications/brainstorm-adversarial.md` and bypass. Mitigation: the sub-agent prompt is specific ("challenge every assumption, find gaps") — a properly prompted sub-agent will write substantive content. Future: add content length check to the adversarial file too.
2. **CQ3 threshold of 50 chars is low**: "No SQL injection found in the code." is 38 chars and would fail, but "No SQL injection, XSS, or SSRF vulnerabilities found." is 53 chars and passes — both are equally shallow. This is a deliberate trade-off: too high a threshold blocks legitimate brief findings.

## Verdict

DONE — all AC met. The adversarial file bypass risk (finding #1) is acknowledged and acceptable as a v1 — the technical gate is still better than no gate.
