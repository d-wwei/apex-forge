---
name: apex-forge-design-consultation
description: Design system creation from scratch — aesthetic direction, tokens, typography, color, and preview
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Design Consultation Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX DESIGN CONSULTATION ==="
apex_set_stage "design-consultation"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "design-consultation"

# ---------------------------------------------------------------------------
# Discover existing design artifacts
# ---------------------------------------------------------------------------
DESIGN_FILE=""
if [ -f "DESIGN.md" ]; then
  DESIGN_FILE="DESIGN.md"
  echo "[design-consult] Existing DESIGN.md found — will read and extend."
elif [ -f "docs/DESIGN.md" ]; then
  DESIGN_FILE="docs/DESIGN.md"
  echo "[design-consult] Existing docs/DESIGN.md found — will read and extend."
else
  echo "[design-consult] No existing design system found. Creating from scratch."
fi
echo "DESIGN_FILE=$DESIGN_FILE"

# Detect CSS/Tailwind config
TAILWIND_CONFIG=""
for cfg in tailwind.config.js tailwind.config.ts tailwind.config.mjs; do
  if [ -f "$cfg" ]; then
    TAILWIND_CONFIG="$cfg"
    echo "[design-consult] Tailwind config found: $cfg"
    break
  fi
done
echo "TAILWIND_CONFIG=$TAILWIND_CONFIG"

# Detect existing CSS custom properties
CSS_VARS_FILE=""
for css in src/styles/globals.css src/app/globals.css app/globals.css styles/globals.css \
           src/index.css src/styles/variables.css; do
  if [ -f "$css" ]; then
    CSS_VARS_FILE="$css"
    echo "[design-consult] CSS file found: $css"
    break
  fi
done
echo "CSS_VARS_FILE=$CSS_VARS_FILE"

# Detect project type for context
PROJECT_TYPE="unknown"
if [ -f "package.json" ]; then
  PROJECT_TYPE="web"
  if grep -q '"next"' package.json 2>/dev/null; then
    PROJECT_TYPE="nextjs"
  elif grep -q '"react"' package.json 2>/dev/null; then
    PROJECT_TYPE="react"
  elif grep -q '"vue"' package.json 2>/dev/null; then
    PROJECT_TYPE="vue"
  fi
fi
echo "[design-consult] Project type: $PROJECT_TYPE"

# Create output directory
mkdir -p ".apex/design"
echo "[design-consult] Output: .apex/design/"

apex_ensure_dirs
```

# Design Consultation

> apex-forge / workflow / roles / design-consultation
>
> Create a complete design system from scratch. Not a theme picker.
> A thoughtful aesthetic direction grounded in the product's purpose.

---

## Entry Conditions

1. If `DESIGN_FILE` exists: read it fully. This is an extension, not a replacement.
2. If no design file: start from scratch. Ask about the product or read existing docs.
3. Understand the product before proposing anything visual.

---

## Phase 1: Product Understanding

Before touching colors or fonts, establish context. Ask the user or read project docs:

| Question | Why It Matters |
|----------|---------------|
| What does the product do? | Aesthetic must serve the product's purpose. |
| Who is the target audience? | Developer tools feel different from consumer apps. |
| What is the emotional tone? | Trustworthy, playful, serious, cutting-edge? |
| Are there existing brand assets? | Logo, colors, fonts already in use? |
| What products do you admire visually? | Fastest way to calibrate taste. |

If the user does not answer, infer from:
- README.md, package.json description, any existing landing page
- The codebase's domain (fintech = trust, dev-tool = clarity, consumer = warmth)

---

## Phase 2: Research Comparable Products

Use web search to research 3-5 products in the same space:

- Note their color palettes, typography choices, layout patterns
- Identify common patterns (what users in this space expect)
- Identify differentiation opportunities (what most competitors do poorly)

Document findings briefly in the design system output.

---

## Phase 3: Design System Proposal

Propose a complete system covering all dimensions below. Each dimension gets a rationale, not just a value.

### Aesthetic Direction

One-paragraph description of the overall visual personality. Example:
> "Clean, confident, and slightly warm. Generous whitespace with sharp typography.
> The interface should feel like a well-organized workspace, not a dashboard."

### Typography

| Property | Value | Rationale |
|----------|-------|-----------|
| **Heading font** | {family} | {why this font fits the product} |
| **Body font** | {family} | {why this font for readability} |
| **Mono font** | {family} | {for code blocks / technical content} |

Type scale (using a consistent ratio like 1.25 or 1.333):

| Level | Size | Weight | Line Height | Use |
|-------|------|--------|-------------|-----|
| Display | 48px | 700 | 1.1 | Hero sections |
| H1 | 36px | 700 | 1.2 | Page titles |
| H2 | 28px | 600 | 1.25 | Section headers |
| H3 | 22px | 600 | 1.3 | Subsections |
| H4 | 18px | 500 | 1.4 | Card titles |
| Body | 16px | 400 | 1.6 | Paragraphs |
| Body SM | 14px | 400 | 1.5 | Secondary text |
| Caption | 12px | 400 | 1.4 | Labels, metadata |

### Color Palette

For each color, provide hex value, rationale, and WCAG contrast note.

**Primary** (brand identity):
- Primary 50-950 (10-step scale from lightest to darkest)
- Rationale for hue choice

**Secondary** (accent/complement):
- Secondary 50-950
- How it relates to primary

**Neutral** (grays/structure):
- Neutral 50-950
- Warm gray, cool gray, or true gray — and why

**Semantic colors**:
| Role | Color | Use |
|------|-------|-----|
| Success | {hex} | Confirmations, positive states |
| Warning | {hex} | Caution states, pending actions |
| Error | {hex} | Errors, destructive actions |
| Info | {hex} | Informational messages |

### Spacing Scale

Base unit: 4px. Scale:

| Token | Value | Use |
|-------|-------|-----|
| space-1 | 4px | Tight gaps, icon padding |
| space-2 | 8px | Inline spacing, small gaps |
| space-3 | 12px | Form field gaps |
| space-4 | 16px | Standard content gaps |
| space-6 | 24px | Section internal padding |
| space-8 | 32px | Card padding, section gaps |
| space-12 | 48px | Section separation |
| space-16 | 64px | Page-level separation |

### Border Radii

| Token | Value | Use |
|-------|-------|-----|
| radius-sm | {px} | Badges, tags, small chips |
| radius-md | {px} | Buttons, inputs, cards |
| radius-lg | {px} | Modals, large containers |
| radius-full | 9999px | Avatars, pills |

### Shadow System

| Token | Value | Use |
|-------|-------|-----|
| shadow-sm | {CSS value} | Subtle lift (buttons hover) |
| shadow-md | {CSS value} | Cards, dropdowns |
| shadow-lg | {CSS value} | Modals, popovers |
| shadow-xl | {CSS value} | Floating panels |

### Motion and Animation

| Property | Value | Use |
|----------|-------|-----|
| duration-fast | 100ms | Hover states, toggles |
| duration-normal | 200ms | Expanding panels, page transitions |
| duration-slow | 300ms | Modal entrances, complex animations |
| easing-default | cubic-bezier(0.4, 0, 0.2, 1) | General purpose |
| easing-enter | cubic-bezier(0, 0, 0.2, 1) | Elements appearing |
| easing-exit | cubic-bezier(0.4, 0, 1, 1) | Elements disappearing |

---

## Phase 4: Generate Preview Page

Create an HTML preview that demonstrates the design system in action:

Save to `.apex/design/preview.html`:

The preview page must include:
- All heading levels with the chosen typography
- Color palette swatches (primary, secondary, neutral, semantic)
- Button states (primary, secondary, outline, ghost, disabled)
- Form elements (input, textarea, select, checkbox, radio)
- Card component with shadow and radius
- Spacing visualization (stacked boxes showing the scale)
- Dark mode toggle (if applicable)

The HTML must be self-contained (inline styles or `<style>` tag). No external dependencies.

---

## Phase 5: Write Design Document

Write to `DESIGN.md` (project root) as the source of truth:

```markdown
---
title: "Design System"
created: YYYY-MM-DD
updated: YYYY-MM-DD
version: "1.0"
---

# Design System

## Aesthetic Direction
{one-paragraph vision}

## Typography
{font choices, type scale table}

## Color Palette
{full palette with hex values and rationale}

## Spacing
{spacing scale}

## Border Radii
{radius tokens}

## Shadows
{shadow tokens}

## Motion
{animation tokens}

## Preview
Open `.apex/design/preview.html` in a browser to see the system in action.
```

---

## Phase 6: Generate Integration Code

### CSS Custom Properties

Write to the project's main CSS file (or create `design-tokens.css`):

```css
:root {
  /* Typography */
  --font-heading: '{heading font}', sans-serif;
  --font-body: '{body font}', sans-serif;
  --font-mono: '{mono font}', monospace;

  /* Colors - Primary */
  --color-primary-50: {hex};
  /* ... through 950 */

  /* Spacing */
  --space-1: 4px;
  /* ... */
}
```

### Tailwind Config (if applicable)

If `TAILWIND_CONFIG` exists, propose `theme.extend` additions:

```javascript
theme: {
  extend: {
    colors: {
      primary: { /* scale */ },
      secondary: { /* scale */ },
    },
    fontFamily: {
      heading: ['...'],
      body: ['...'],
    },
  },
}
```

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | Full design system proposed, preview generated, DESIGN.md written. |
| **DONE_WITH_CONCERNS** | System created but user input needed on brand direction or specific preferences. |
| **BLOCKED** | Cannot determine product context. Need user input on purpose and audience. |
| **NEEDS_CONTEXT** | Existing brand assets or style guide needed before proceeding. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

---

## Artifact Output

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "design-consultation" "DESIGN.md"
apex_add_artifact "design-consultation" ".apex/design/preview.html"
```

Report:

> **Design system created.** Aesthetic: {one-line direction}.
> Typography: {heading font} / {body font}. Primary: {hex}.
> Preview at `.apex/design/preview.html`. Full spec at `DESIGN.md`.
> {If Tailwind: "Tailwind config extension included."}
