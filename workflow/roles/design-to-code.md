---
name: apex-forge-design-to-code
description: Spec-first design-to-code workflow — Figma/screenshot to pixel-perfect frontend code with acceptance loop
user-invocable: true
---

# Design to Code

Spec-first visual restoration. Takes a design (Figma, screenshot, or spec) and produces pixel-perfect frontend code through a disciplined acceptance loop.

This skill wraps the [Design To Code](design-to-code/) module. It enforces a repository-first workflow where implementation specs, component maps, and acceptance checklists prevent agent drift and Tailwind approximation errors.

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

# Check for Design To Code module
D2C_ROOT="$APEX_ROOT/design-to-code"
if [ ! -d "$D2C_ROOT" ]; then
  echo "ERROR: design-to-code module not found at $D2C_ROOT"
  echo "Run: cd apex-forge && git subtree pull --prefix=design-to-code https://github.com/d-wwei/agent-agnostic-design-to-code.git main"
  exit 1
fi
echo "Design To Code module: $D2C_ROOT"
```

## Workflow

Follow the 11-step execution SOP from `design-to-code/workflows/agent-execution-sop.md`.

### Step 0 — Bootstrap Task Files

For a new feature, create the task artifacts:

```bash
python3 design-to-code/skills/design-to-code-runner/scripts/bootstrap_task.py \
  --repo-root . \
  --task-dir features/<feature-name>
```

This creates:
- `implementation-spec.yaml` — Design parameters source of truth
- `component-map.json` — Which components to reuse/create/forbid
- `acceptance-checklist.md` — Completion criteria

### Step 1 — Get Design Input

Accept design from any source:

**Figma URL**: Use Figma MCP to extract design context
```
get_design_context(nodeId, fileKey)
```

**Screenshot**: Read the image, extract visual parameters manually.

**Design spec**: If the designer provided a spec, use it directly.

### Step 2 — Fill Implementation Spec

Open `implementation-spec.yaml` and fill in:
- Exact hex/rgba colors (from design API, not eyeballed)
- Exact px values for padding, margin, gap, border-radius
- Exact font-size, line-height, font-weight
- CSS variable names and per-theme values
- Layout structure (flex/grid, gap, alignment)

**Critical**: Use exact values from the design tool API. Do NOT approximate.

### Step 3 — Map Components

Open `component-map.json` and classify each UI element:
- `existing` — Reuse from project's component library (specify path)
- `primitive` — HTML element with inline styles
- `new` — Must create (document why existing ones don't work)
- `forbidden` — Do NOT substitute (e.g., don't replace a custom card with a generic div)

### Step 4 — Implement

Follow the spec exactly. Key rules:

**Inline styles for fidelity-critical values:**
```tsx
// GOOD — exact values from spec
<div style={{ padding: '10px 12px', gap: '8px' }}>

// BAD — Tailwind approximation (py-2.5 = 10px, not 12px)
<div className="py-2.5 gap-2">
```

**CSS Variable Chain must close:**
```
HTML class (.dark) → CSS selector → var(--color-bg) → component usage
```
If any layer breaks, theme silently fails.

**No silent substitutions.** If you can't find the right component, flag it in the spec. Don't quietly use a generic alternative.

### Step 5 — Acceptance Loop

Run through the 8-dimension checklist:

1. **Structural** — Landmarks match? Hierarchy correct?
2. **Component** — Every element mapped? No forbidden substitutions?
3. **Visual** — Typography, spacing, colors match spec? Screenshot comparison.
4. **Responsive** — Mobile/tablet/desktop correct?
5. **Interaction** — Hover/focus/disabled/loading states?
6. **Theme Chain** — HTML class → CSS → var() → component all connected?
7. **Evidence** — Screenshots taken? Before/after compared?
8. **Traceability** — Spec matches code? Map matches shipped components?

Use the browse binary for visual verification:
```bash
apex-forge-browse goto http://localhost:3000/page
apex-forge-browse screenshot /tmp/implementation.png
apex-forge-browse responsive /tmp/responsive
```

### Step 6 — Iterate Until Pass

If any dimension fails:
1. Identify the specific gap
2. Fix in code
3. Re-verify that dimension
4. Re-run full checklist

Do NOT mark as done until all 8 dimensions pass.

## Completion Status

| Status | When |
|--------|------|
| **DONE** | All 8 acceptance dimensions pass. Spec + map + checklist delivered. |
| **DONE_WITH_CONCERNS** | Passes but with known compromises (document each). |
| **BLOCKED** | Missing design input, ambiguous spec, or component library gap. |
| **NEEDS_CONTEXT** | Need Figma access, design tokens, or component docs. |

```bash
apex_telemetry_end "success" 2>/dev/null || true
```

## Key Anti-Patterns

| Anti-Pattern | Why It's Bad | Do This Instead |
|---|---|---|
| Screenshot → code directly | Loses exact values, introduces drift | Extract from design API first |
| Tailwind classes for spacing | `py-2.5` = 10px, not your design's 12px | Inline styles for exact values |
| Silent component swap | "Close enough" compounds across page | Flag in component map, get approval |
| Skip acceptance checklist | "It looks right" isn't evidence | Run all 8 dimensions |
| Approximate colors | `#333` instead of `#2D2D3A` | Use exact hex from design tool |

## Reference Files

- Full SOP: `design-to-code/workflows/agent-execution-sop.md`
- Spec template: `design-to-code/specs/implementation-spec.template.yaml`
- Component map template: `design-to-code/specs/component-map.template.json`
- Acceptance checklist: `design-to-code/templates/acceptance-checklist.md`
- Example (filled): `design-to-code/examples/marketing-homepage-hero/`
- Architecture rationale: `design-to-code/docs/architecture.md`
