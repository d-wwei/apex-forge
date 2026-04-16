---
name: apex-forge-codex-consult
description: "Alias: routes to independent second-opinion review via Codex CLI or subagent fallback"
---

**This command routes to `workflow/roles/codex-consult.md` — the full implementation.**

Three modes:
1. **Review** (default): Independent diff review with PASS/PASS_WITH_NOTES/FAIL verdict.
2. **Challenge**: Adversarial mode — reviewer actively tries to break the code.
3. **Consult**: Open-ended consultation on any question.

Engine selection: Codex CLI if available, otherwise independent subagent with worktree isolation.
