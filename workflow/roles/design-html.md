---
name: apex-forge-design-html
description: |
  Design finalization: generates production-quality HTML/CSS from approved mockups,
  plans, design variants, or freeform descriptions. Text reflows, heights are computed,
  layouts are dynamic. Responsive breakpoints, ARIA accessibility, design tokens.
  Use when: "finalize this design", "turn this into HTML", "build me a page",
  "implement this design", or after any planning skill.
user-invocable: true
---

# Design HTML

> apex-forge / workflow / roles / design-html
>
> Generate production-quality HTML/CSS from design context (approved mockups, plans,
> design variants, or freeform descriptions). Outputs self-contained, responsive,
> accessible HTML with computed text layout and live-editable content.

---

## Step 0: Input Detection

Detect what design context exists for this project. Check for four types of input:

1. **approved.json** -- output from a prior design-shotgun or design review
2. **Plan document** -- a product plan or feature spec (from plan-ceo-review or similar)
3. **Design variants** -- PNG mockup variants from a design exploration
4. **finalized.html** -- a prior finalized HTML from a previous session

Also check for a `DESIGN.md` in the repo root (design tokens file).

Route based on what was found, checking in order:

### Case A: Approved mockup exists (design exploration ran)

Read the approved design artifact. Extract: approved variant image path, user feedback,
screen name. Also read the plan document if one exists (it adds strategic context).

Read `DESIGN.md` if it exists in the repo root. These tokens take priority for
system-level values (fonts, brand colors, spacing scale).

If a prior finalized.html also exists, ask the user:
> Found a prior finalized HTML from a previous session. Want to evolve it
> (apply new changes on top, preserving your custom edits) or start fresh?
> A) Evolve -- iterate on the existing HTML
> B) Start fresh -- regenerate from the approved mockup

If evolve: read the existing HTML. Apply changes on top during Step 3.
If fresh or no finalized.html: proceed to Step 1 with the approved image as the
visual reference.

### Case B: Plan and/or design variants exist, but no approved mockup

Read whichever context exists:
- If plan found: read it and summarize the product vision and design requirements.
- If variant images found: show them inline.
- If DESIGN.md found: read it for design tokens and constraints.

Ask the user:
> Found [plan / design variants / both] but no approved design mockup.
> A) Run design exploration first -- explore design variants based on the existing context
> B) Skip mockups -- I'll design the HTML directly from the plan context
> C) I have a reference image -- let me provide the path

If A: tell the user to explore designs first, then come back to design-html.
If B: proceed to Step 1 in "plan-driven mode." Ask the user for a screen name
(e.g., "landing-page", "dashboard", "pricing").
If C: accept an image file path from the user and proceed with that as the reference.

### Case C: Nothing found (clean slate)

Ask the user:
> No design context found for this project. How do you want to start?
> A) Plan first -- think through the product strategy before designing
> B) Design exploration first -- explore visual design variants
> C) Just describe it -- tell me what you want and I'll design the HTML live

If A or B: direct the user to the appropriate planning or design skill.
If C: proceed to Step 1 in "freeform mode." Ask the user for a screen name.

### Context Summary

After routing, output a brief context summary:
- **Mode:** approved-mockup | plan-driven | freeform | evolve
- **Visual reference:** path to approved image, or "none (plan-driven)" or "none (freeform)"
- **Plan document:** path or "none"
- **Design tokens:** "DESIGN.md" or "none"
- **Screen name:** from approved context, user-provided, or inferred from plan

---

## Step 1: Design Analysis

1. If an approved mockup image exists, analyze the visual layout:
   - Describe colors, typography, layout structure, and component inventory
   - Extract a structured implementation spec from the image

2. If in plan-driven mode (no approved image), design from context:
   - Read the plan and/or design review notes
   - Extract UI requirements, user flows, target audience, visual feel
   - Identify content structure (hero, features, pricing, etc.) and constraints
   - Build an implementation spec from the plan's prose

3. If in freeform mode, gather requirements from the user:
   - Purpose/audience
   - Visual feel (dark/light, playful/serious, dense/spacious)
   - Content structure (hero, features, pricing, etc.)
   - Reference sites they like

4. Read `DESIGN.md` tokens if available. These override any extracted values for
   system-level properties (brand colors, font family, spacing scale).

5. Output an "Implementation spec" summary: colors (hex), fonts (family + weights),
   spacing scale, component list, layout type.

**Content rule:** Generate realistic content based on the mockup, plan, or user
description. Never use "Lorem ipsum", "Your text here", or placeholder content.

---

## Step 2: Framework Detection

Check if the user's project uses a frontend framework:

```bash
[ -f package.json ] && cat package.json | grep -o '"react"\|"svelte"\|"vue"\|"@angular/core"\|"solid-js"\|"preact"' | head -1 || echo "NONE"
```

If a framework is detected, ask the user:
> Detected [React/Svelte/Vue] in your project. What format should the output be?
> A) Vanilla HTML -- self-contained preview file (recommended for first pass)
> B) [React/Svelte/Vue] component -- framework-native output

If the user chooses framework output, ask one follow-up:
> A) TypeScript
> B) JavaScript

For vanilla HTML: proceed to Step 3 with vanilla output.
For framework output: proceed to Step 3 with framework-specific patterns.
If no framework detected: default to vanilla HTML, no question needed.

---

## Step 3: Generate HTML

Write a single file using the Write tool.

### HTML Generation Rules

**Always include:**
- CSS custom properties for design tokens from DESIGN.md / Step 1 extraction
- Google Fonts via `<link>` tags (if applicable)
- Semantic HTML5 (`<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`)
- Responsive behavior with breakpoint-specific adjustments at 375px, 768px, 1024px, 1440px
- ARIA attributes, heading hierarchy, focus-visible states
- `contenteditable` on text elements where appropriate for live editing
- ResizeObserver on containers to handle dynamic relayout on resize
- `prefers-color-scheme` media query for dark mode support
- `prefers-reduced-motion` for animation respect
- Real content extracted from the mockup or plan (never lorem ipsum)

**Never include (AI slop blacklist):**
- Purple/blue gradients as default
- Generic 3-column feature grids
- Center-everything layouts with no visual hierarchy
- Decorative blobs, waves, or geometric patterns not in the mockup
- Stock photo placeholder divs
- "Get Started" / "Learn More" generic CTAs not from the source material
- Rounded-corner cards with drop shadows as the default component
- Emoji as visual elements
- Generic testimonial sections
- Cookie-cutter hero sections with left-text right-image

### Text Layout

For text-heavy designs, use computed text layout to ensure correct height computation
on resize. Options include:

- **Basic height computation:** One-time text measurement after fonts load, relayout
  on every resize via ResizeObserver. Sub-millisecond per call.
- **Shrinkwrap containers:** For chat bubbles or tight-fit containers, compute the
  tightest width that produces the same line count.
- **Text around obstacles:** For editorial layouts, compute available width at each
  y position accounting for floated elements.
- **Full line-by-line rendering:** For complex editorial with Canvas/SVG rendering.

Choose the appropriate approach based on the design type:

| Design type | Approach | Use case |
|-------------|----------|----------|
| Simple layout (landing, marketing) | Basic height computation | Resize-aware heights |
| Card/grid (dashboard, listing) | Basic height computation | Self-sizing cards |
| Chat/messaging UI | Shrinkwrap containers | Tight-fit bubbles, min-width |
| Content-heavy (editorial, blog) | Text around obstacles | Text wrapping around images |
| Complex editorial | Full line-by-line | Manual line rendering |

State the chosen approach and why.

---

## Step 3.5: Live Reload Server

After writing the HTML file, start a simple HTTP server for live preview:

```bash
cd "$(dirname <path-to-finalized.html>)"
python3 -m http.server 0 --bind 127.0.0.1 &
```

If python3 is not available, fall back to:
```bash
open <path-to-finalized.html>
```

Tell the user: "Live preview running. After each edit, refresh the browser to see changes."

When the refinement loop ends, kill the server.

---

## Step 4: Preview + Refinement Loop

### Verification

If browser automation is available (e.g., via AF's browser-qa-testing role), take
verification screenshots at 3 viewports: mobile (375px), tablet (768px),
desktop (1440px).

Check for:
- Text overflow (text cut off or extending beyond containers)
- Layout collapse (elements overlapping or missing)
- Responsive breakage (content not adapting to viewport)

If issues are found, fix them before presenting to the user.

If browser automation is not available, skip automated verification and note it.

### Refinement Loop

```
LOOP (max 10 iterations):
  1. Direct the user to view the HTML in their browser

  2. If an approved mockup image exists, show it for visual comparison

  3. Ask the user (adjust wording based on mode):
     With mockup: "The HTML is live. Here's the approved mockup for comparison.
      Try: resize the window (text should reflow dynamically),
      click any text (it's editable, layout recomputes instantly).
      What needs to change? Say 'done' when satisfied."
     Without mockup: "The HTML is live. Try resizing and editing.
      What needs to change? Say 'done' when satisfied."

  4. If "done" / "ship it" / "looks good" / "perfect" -> exit loop, go to Step 5

  5. Apply feedback using targeted Edit tool changes on the HTML file
     (do NOT regenerate the entire file -- surgical edits only)

  6. Brief summary of what changed (2-3 lines max)

  7. If verification screenshots are available, re-take them to confirm the fix

  8. Go to LOOP
```

Maximum 10 iterations. If the user hasn't said "done" after 10, ask:
"We've done 10 rounds of refinement. Want to continue iterating or call it done?"

---

## Step 5: Save & Export

### Design Token Extraction

If no `DESIGN.md` exists in the repo root, offer to create one from the generated HTML:

Extract from the HTML:
- CSS custom properties (colors, spacing, font sizes)
- Font families and weights used
- Color palette (primary, secondary, accent, neutral)
- Spacing scale
- Border radius values
- Shadow values

Ask the user:
> No DESIGN.md found. I can extract the design tokens from the HTML we just built
> and create a DESIGN.md for your project. This means future design runs will be
> style-consistent automatically.
> A) Create DESIGN.md from these tokens
> B) Skip -- I'll handle the design system later

If A: write `DESIGN.md` to the repo root with the extracted tokens.

### Save Metadata

Write a metadata JSON file alongside the HTML:
```json
{
  "source_mockup": "<approved variant image path or null>",
  "source_plan": "<plan document path or null>",
  "mode": "<approved-mockup|plan-driven|freeform|evolve>",
  "html_file": "<path to finalized.html or component file>",
  "layout_approach": "<selected approach>",
  "framework": "<vanilla|react|svelte|vue>",
  "iterations": "<number of refinement iterations>",
  "date": "<ISO 8601>",
  "screen": "<screen name>",
  "branch": "<current branch>"
}
```

### Next Steps

Ask the user:
> Design finalized. What's next?
> A) Copy to project -- copy the HTML/component into your codebase
> B) Iterate more -- keep refining
> C) Done -- I'll use this as a reference

---

## Important Rules

- **Source of truth fidelity over code elegance.** When an approved mockup exists,
  pixel-match it. If that requires explicit pixel widths instead of a CSS grid class,
  that's correct. When in plan-driven or freeform mode, the user's feedback during
  the refinement loop is the source of truth. Code cleanup happens later during
  component extraction.

- **Surgical edits in the refinement loop.** Use the Edit tool to make targeted changes,
  not the Write tool to regenerate the entire file. The user may have made manual edits
  via contenteditable that should be preserved.

- **Real content only.** When a mockup exists, extract text from it. In plan-driven mode,
  use content from the plan. In freeform mode, generate realistic content based on the
  user's description. Never use placeholder content.

- **One page per invocation.** For multi-page designs, run design-html once per page.
  Each run produces one HTML file.

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | HTML finalized, user said "done". |
| **DONE_WITH_CONCERNS** | HTML finalized but with known issues noted. |
| **BLOCKED** | Cannot proceed (missing design context, user unresponsive). |
| **NEEDS_CONTEXT** | Waiting for user to provide design input or feedback. |
