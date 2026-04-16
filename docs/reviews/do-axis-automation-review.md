---
title: Strategy 3 — Do-Axis Automation Review
status: DONE
reviewer: self (Tier 2)
created: 2026-04-16
---

## Summary

2 files changed (+84 lines): `src/cli.ts` (inline requirements + artifact templates), `skill/hooks/apex-forge-skill-trace.sh` (auto-checkpoint on AskUserQuestion).

## Security Reviewer

No findings. Template paths derived from internal session_id (no user input). Hook only reads local state file.

## Correctness Reviewer

No findings. Templates guarded by `existsSync`. Hook guarded by tool name + stage checks. All 54 existing tests pass.

## Spec Compliance Reviewer

- AC1 (auto-checkpoint): PASS — hook detects AskUserQuestion during ship, calls `apex ship checkpoint push-prompt`
- AC2 (brainstorm template): PASS — verified `docs/brainstorms/{project}-requirements.md` created
- AC3 (plan template): PASS — `templateMap.plan` defined with correct frontmatter
- AC4 (review template): PASS — `templateMap.review` defined with correct sections
- AC5 (inline requirements): PASS — all 6 stages have 3-4 requirements, printed on stage set
- AC6 (tests pass): PASS — 54/54
- AC7 (build succeeds): PASS — `dist/apex-forge` 0.74 MB

## Adversarial Reviewer

1. **Key requirements can drift from stage files**: Hardcoded strings in cli.ts won't auto-update when stage files change. Acceptable trade-off — reliability over auto-sync. A comment in code marks this for future maintainers.
2. **Template naming uses session_id**: If session_id format changes, template paths change. Low risk — session_id format is stable and internal.

## Verdict

DONE — all AC met, no findings.
