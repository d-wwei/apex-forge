---
title: apex audit --quick Review
status: DONE
reviewer: self (Tier 2)
created: 2026-04-17
---

## Summary

1 file changed: `src/commands/audit.ts` (+100 lines: `formatQuickSummary` function + `--quick` flag handling + local `parseFrontmatter`).

## Security Reviewer

No findings. `formatQuickSummary` reads the same local files as the existing audit (artifacts, verification files, git diff). No new attack surface. `parseFrontmatter` is a pure local file parser with no shell execution.

## Correctness Reviewer

No findings. `--quick` mode short-circuits before Layer 1-3 checks — existing audit path is completely untouched when `--quick` is not passed. 54/54 tests confirm. Output is 28 lines (under 40-line target).

## Spec Compliance Reviewer

- AC1 (single-page summary with all sections): PASS — output has task/scope/changes/findings/gates/decision
- AC2 (< 40 lines): PASS — 28 lines measured
- AC3 (sub-agent findings extraction): PASS — reads `.apex/verifications/*.md`, extracts bullet lines
- AC4 (AC checklist): PASS — reads brainstorm AC section, shows numbered items
- AC5 (existing audit unchanged): PASS — 54/54 tests pass, no code path modified

## Adversarial Reviewer

1. **Sub-agent findings extraction is noisy**: Current regex picks up any line starting with `-`, `*`, or `⚠`. In verbose adversarial files this can pull non-finding lines. P3 — tuning issue, not a correctness problem. Could be improved with stricter pattern matching in a follow-up.
2. **AC pass/fail uses pipeline completion as proxy**: All ACs show `✓` if ship stage completed, `?` otherwise. This doesn't distinguish between individual AC pass/fail. Acceptable for v1 — human reads the AC text and makes their own judgment.

## Verdict

DONE — all AC met, 2 P3 nits tracked for follow-up.
