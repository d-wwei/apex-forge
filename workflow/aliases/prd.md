---
name: apex-forge-prd
description: "Alias: routes to /product-prd for PRD writing and product validation"
user-invocable: true
---

# PRD Alias

This is a routing alias. The actual PRD capability lives in the
**product-prd** companion skill.

## Action

Invoke `/product-prd` and follow its workflow.

The product-prd skill handles:
- Product validation (6 forcing questions)
- Structured PM interview (≤3 questions/round)
- Quality-gated PRD drafting
- Revision loop

After the PRD is approved, return to the Apex Forge pipeline
and proceed to the Plan stage.

```bash
# Record trace after completion
apex trace-skill brainstorm product-prd 2.0.0 <status> <af_mapping>
```
