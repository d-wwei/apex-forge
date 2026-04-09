---
name: apex-forge-design-review
description: "Alias: routes to two-layer design review (design-baseline gate + /tasteful-frontend)"
---

**This command now runs a two-layer design review.**

1. **First**: Run the design baseline gate (`gates/design-baseline.md` in this skill directory). All objective checks must pass.
2. **Then**: Load `/tasteful-frontend` for subjective deep review.

If baseline fails → REJECTED, return to Execute. Do not proceed to layer 2.
If baseline passes → load `/tasteful-frontend` and follow its review process.
