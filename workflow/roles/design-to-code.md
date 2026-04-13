---
name: apex-forge-design-to-code
description: Spec-first design-to-code workflow — Figma/screenshot to pixel-perfect frontend code with acceptance loop
user-invocable: true
---

# Design to Code

Apex Forge wrapper for the **design-to-code-runner** companion skill. This wrapper provides protocol integration (telemetry, completion status mapping) and delegates all domain logic to the external skill.

## When to Use

- Implementing a UI from a Figma design
- Restoring visual fidelity from screenshots or mockups
- Building new pages/components from design specs
- Fixing visual drift between design and implementation

## Preamble

```bash
APEX_ROOT="${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
source "$APEX_ROOT/hooks/state-helper" 2>/dev/null || true
apex_telemetry_start "design-to-code" 2>/dev/null || true

# Check companion skill is installed
SKILL_DIR="${SKILLS_HOME:-$HOME/.claude/skills}/design-to-code-runner"
if [ ! -f "$SKILL_DIR/SKILL.md" ]; then
  echo "ERROR: design-to-code-runner skill not installed."
  echo "Run: cd apex-forge && skill/install.sh"
  exit 1
fi
echo "Using companion skill: $SKILL_DIR"
```

## Workflow

Invoke `/design-to-code-runner` — the companion skill handles the full workflow:

1. Identify and preprocess design sources
2. Discover repository contract (AGENTS.md, architecture docs)
3. Establish task artifacts (implementation-spec, component-map, acceptance-checklist)
4. Validate spec completeness
5. Resolve component mappings
6. Extract exact parameters from design source
7. Implement in phases with continuous fidelity loop
8. Validate theme/CSS variable chain
9. Run final acceptance review
10. Deliver with traceability

The skill contains all templates, SOP, and reference docs internally.

## Completion Status

| Status | When |
|--------|------|
| **DONE** | All acceptance dimensions pass. Spec + map + checklist delivered. |
| **DONE_WITH_CONCERNS** | Passes but with known compromises (document each). |
| **BLOCKED** | Missing design input, ambiguous spec, or component library gap. |
| **NEEDS_CONTEXT** | Need Figma access, design tokens, or component docs. |

```bash
apex_telemetry_end "success" 2>/dev/null || true
```
