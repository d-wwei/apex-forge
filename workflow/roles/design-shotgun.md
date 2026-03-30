---
name: apex-forge-design-shotgun
description: Design variant exploration — generate 3 distinct visual approaches for a UI requirement
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Design Shotgun Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX DESIGN SHOTGUN ==="
apex_set_stage "design-shotgun"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "design-shotgun"

# ---------------------------------------------------------------------------
# Discover design context
# ---------------------------------------------------------------------------
DESIGN_FILE=""
if [ -f "DESIGN.md" ]; then
  DESIGN_FILE="DESIGN.md"
  echo "[design-shotgun] DESIGN.md found — will use as style baseline."
elif [ -f "docs/DESIGN.md" ]; then
  DESIGN_FILE="docs/DESIGN.md"
fi
echo "DESIGN_FILE=$DESIGN_FILE"

# Check for image generation capability
IMAGE_GEN="none"
if command -v convert &>/dev/null; then
  IMAGE_GEN="imagemagick"
  echo "[design-shotgun] ImageMagick available for mockup generation."
fi
echo "IMAGE_GEN=$IMAGE_GEN"

# Detect browser for HTML preview
BROWSER_METHOD="none"
if command -v puppeteer &>/dev/null || [ -d "node_modules/puppeteer" ]; then
  BROWSER_METHOD="puppeteer"
elif command -v playwright &>/dev/null || [ -d "node_modules/playwright" ]; then
  BROWSER_METHOD="playwright"
else
  BROWSER_METHOD="mcp-desktop"
fi
echo "BROWSER_METHOD=$BROWSER_METHOD"

# Create output directory
SHOTGUN_DIR=".apex/design-shotgun"
mkdir -p "$SHOTGUN_DIR"
echo "[design-shotgun] Output: $SHOTGUN_DIR/"

apex_ensure_dirs
```

# Design Shotgun

> apex-forge / workflow / roles / design-shotgun
>
> Given a UI requirement, generate 3 distinct visual approaches.
> Not 3 slight variations. 3 genuinely different design philosophies.

---

## Entry Conditions

1. A clear UI requirement from the user (component, page, or feature).
2. If `DESIGN_FILE` exists, read it for baseline tokens and constraints.
3. If no requirement provided: "What UI element or page should I explore designs for?"

---

## The Three Directions

Every design shotgun produces exactly 3 variants. Each must be genuinely distinct.

### Variant A: Conservative

**Philosophy**: Clean, minimal, proven patterns. Zero surprise.

- Uses established UI conventions for this type of element
- Neutral or muted color palette, standard typography
- Focuses on clarity, scannability, and familiarity
- Users should feel "I already know how to use this"
- References: Stripe, Linear, Notion

For this variant, describe:
- Layout structure and hierarchy
- Color choices and typography
- Key interactions (hover, click, transition states)
- Pros: reliability, accessibility, fast to build
- Cons: may feel generic, no memorability

### Variant B: Bold

**Philosophy**: Distinctive, opinionated, memorable. This product has a personality.

- Strong color choices, custom typography pairing
- Asymmetric layouts, intentional visual tension
- Micro-interactions that reinforce brand
- Users should feel "this is different from everything else I use"
- References: Vercel, Raycast, Arc Browser

For this variant, describe:
- Layout structure (how it breaks from convention)
- Color palette and how it creates identity
- Typography choices and weight contrast
- Signature interaction (one thing that makes it memorable)
- Pros: brand differentiation, user delight
- Cons: learning curve, polarizing

### Variant C: Experimental

**Philosophy**: Pushes boundaries. Novel interactions or unconventional patterns.

- May use spatial layout, animation-driven navigation, or non-standard controls
- Explores what the UI could be if conventions did not exist
- Prioritizes delight and innovation over familiarity
- Users should feel "I have never seen this done this way before"
- References: Amie, Figma, Nothing Phone UI

For this variant, describe:
- What convention it breaks and why
- The novel interaction model
- How discoverability is preserved despite novelty
- Technical feasibility assessment (easy / moderate / hard)
- Pros: innovation, potential competitive advantage
- Cons: accessibility risk, build cost, user confusion

---

## Output Format

For each variant, produce:

### Description Block

```markdown
## Variant {A|B|C}: {Name}

**Direction**: Conservative | Bold | Experimental
**One-line pitch**: {what makes this variant unique}

### Layout
{describe the spatial organization}

### Colors
{key colors with hex values and usage}

### Typography
{fonts, sizes, weights for key elements}

### Key Interactions
{hover states, transitions, animations}

### Pros
- {pro 1}
- {pro 2}

### Cons
- {con 1}
- {con 2}
```

### Visual Preview

For each variant, generate a detailed HTML/CSS preview:

Save to `.apex/design-shotgun/variant-{a|b|c}.html`

Each HTML file must be:
- Self-contained (no external dependencies)
- Responsive (looks reasonable at 375px and 1280px)
- Interactive where relevant (hover states, transitions)
- Clearly labeled with the variant name and direction

If `BROWSER_METHOD` supports screenshots, also capture:
- `.apex/design-shotgun/variant-{a|b|c}-desktop.png` (1280px)
- `.apex/design-shotgun/variant-{a|b|c}-mobile.png` (375px)

---

## Comparison Table

After generating all three variants, present a comparison:

| Dimension | Conservative | Bold | Experimental |
|-----------|-------------|------|-------------|
| Visual impact | /10 | /10 | /10 |
| Familiarity | /10 | /10 | /10 |
| Build complexity | /10 | /10 | /10 |
| Accessibility | /10 | /10 | /10 |
| Brand differentiation | /10 | /10 | /10 |
| Mobile adaptability | /10 | /10 | /10 |

**Recommendation**: State which variant you would pick and why, but defer to user.

---

## Feedback Loop

After presenting all three variants, ask:

> Which direction resonates? You can:
> 1. Pick one to refine
> 2. Combine elements ("A's layout with B's colors")
> 3. Ask for a new round with adjusted parameters
> 4. Ship one of these as-is

If the user picks a direction:
- Refine that variant based on feedback
- Update the HTML preview
- If the project has a design system, integrate into `DESIGN.md`
- If heading toward implementation, suggest `/apex-plan` next

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | Three variants generated with previews. User selected a direction. |
| **DONE_WITH_CONCERNS** | Variants generated. User has not decided yet. |
| **BLOCKED** | No UI requirement provided. Cannot generate without a target. |
| **NEEDS_CONTEXT** | Requirement is too vague to differentiate three approaches. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

---

## Artifact Output

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "design-shotgun" ".apex/design-shotgun/variant-a.html"
apex_add_artifact "design-shotgun" ".apex/design-shotgun/variant-b.html"
apex_add_artifact "design-shotgun" ".apex/design-shotgun/variant-c.html"
```

Report:

> **Design shotgun complete.** 3 variants generated for: {requirement}.
> - **A (Conservative)**: {one-line pitch}
> - **B (Bold)**: {one-line pitch}
> - **C (Experimental)**: {one-line pitch}
> Previews at `.apex/design-shotgun/`. Which direction?
