---
name: apex-forge-plan-design-review
description: Designer's eye plan review — rate design dimensions and annotate with specific improvements
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Plan Design Review Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX PLAN DESIGN REVIEW ==="
apex_set_stage "plan-design-review"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "plan-design-review"

# ---------------------------------------------------------------------------
# Locate plan to review
# ---------------------------------------------------------------------------
PLAN_FILE=""
PLANS=$(apex_find_upstream "plan")
if [ -n "$PLANS" ]; then
  PLAN_FILE=$(echo "$PLANS" | head -1)
  echo "[design-review] Plan to review: $PLAN_FILE"
  echo "PLAN_FOUND=true"
else
  echo "[design-review] WARNING: No plan artifacts found in docs/plans/"
  echo "PLAN_FOUND=false"
fi

# Check for design system context
DESIGN_FILE=""
if [ -f "DESIGN.md" ]; then
  DESIGN_FILE="DESIGN.md"
  echo "[design-review] Design system found: DESIGN.md"
elif [ -f "docs/DESIGN.md" ]; then
  DESIGN_FILE="docs/DESIGN.md"
  echo "[design-review] Design system found: docs/DESIGN.md"
fi
echo "DESIGN_FILE=$DESIGN_FILE"

# Check for CEO and eng reviews
CEO_REVIEW=$(ls -t .apex/reviews/*-ceo-review.md 2>/dev/null | head -1)
ENG_REVIEW=$(ls -t .apex/reviews/*-eng-review.md 2>/dev/null | head -1)
[ -n "$CEO_REVIEW" ] && echo "[design-review] CEO review available: $CEO_REVIEW"
[ -n "$ENG_REVIEW" ] && echo "[design-review] Eng review available: $ENG_REVIEW"

# Check for existing mockups or screenshots
MOCKUPS=""
for dir in .apex/design .apex/design-shotgun .apex/screenshots mockups designs; do
  if [ -d "$dir" ] && ls "$dir"/*.{html,png,jpg} 2>/dev/null | head -1 >/dev/null 2>&1; then
    MOCKUPS="$MOCKUPS $dir"
  fi
done
[ -n "$MOCKUPS" ] && echo "[design-review] Mockups found in:$MOCKUPS"

# Detect browser for screenshot comparison
BROWSER_METHOD="none"
if command -v puppeteer &>/dev/null || [ -d "node_modules/puppeteer" ]; then
  BROWSER_METHOD="puppeteer"
elif command -v playwright &>/dev/null || [ -d "node_modules/playwright" ]; then
  BROWSER_METHOD="playwright"
else
  BROWSER_METHOD="mcp-desktop"
fi
echo "BROWSER_METHOD=$BROWSER_METHOD"

mkdir -p ".apex/reviews"
apex_ensure_dirs
```

# Plan Design Review

> apex-forge / workflow / roles / plan-design-review
>
> Designer's eye on a plan. This reviews the design intent in the plan,
> not a live site. Evaluates whether the planned UI will be good before it is built.

---

## Entry Conditions

1. A plan document must exist (`PLAN_FOUND=true`).
2. If no plan: "No plan found. Run `/apex-plan` first, or point me to the plan."
3. Read the plan completely. Focus on any UI/UX sections, wireframe descriptions, component specs.
4. If `DESIGN_FILE` exists, read it as the baseline design standard.
5. If CEO/eng reviews exist, read them for context on scope and constraints.

---

## Review Dimensions

Rate each dimension 0-10. For every dimension scoring below 7, provide a specific path to 10.

### 1. Visual Hierarchy (0-10)

Does the plan establish clear information priority?

| Check | What to Evaluate |
|-------|-----------------|
| **Primary action clarity** | Is the most important action on each screen immediately obvious? |
| **Reading flow** | Does the layout guide the eye in a logical sequence? |
| **Emphasis levels** | Are there distinct levels of visual importance (not everything screaming)? |
| **Negative space** | Does the plan allow for breathing room, or is it cramming content? |

### 2. Typography (0-10)

Does the plan address text presentation?

| Check | What to Evaluate |
|-------|-----------------|
| **Font choices** | Are fonts specified? Do they fit the product's character? |
| **Scale consistency** | Is there a type scale, or are sizes ad-hoc? |
| **Readability** | Are line heights, line lengths, and contrast considered? |
| **Hierarchy through type** | Can you distinguish H1/H2/H3/body from the plan alone? |

### 3. Color Usage (0-10)

Does the plan use color intentionally?

| Check | What to Evaluate |
|-------|-----------------|
| **Palette definition** | Are colors specified or left to "whatever looks good"? |
| **Semantic consistency** | Does red always mean error? Does green always mean success? |
| **Contrast** | Does the plan mention or imply WCAG-compliant contrast? |
| **Dark mode** | If applicable, is dark mode considered or ignored? |

### 4. Spacing and Layout (0-10)

Does the plan define spatial organization?

| Check | What to Evaluate |
|-------|-----------------|
| **Grid system** | Is there a defined grid or is layout hand-waved? |
| **Spacing scale** | Consistent spacing tokens or arbitrary pixel values? |
| **Container strategy** | Max-width, padding, margins specified? |
| **Density** | Appropriate information density for the use case? |

### 5. Responsiveness (0-10)

Does the plan account for multiple screen sizes?

| Check | What to Evaluate |
|-------|-----------------|
| **Breakpoints** | Are breakpoints mentioned? Which sizes? |
| **Layout adaptation** | Does the plan describe how components reflow? |
| **Mobile-first** | Is mobile considered primary or an afterthought? |
| **Touch targets** | Are interactive elements sized for touch (44px minimum)? |

### 6. Interaction Design (0-10)

Does the plan specify how things behave?

| Check | What to Evaluate |
|-------|-----------------|
| **State definitions** | Hover, active, disabled, loading, error, empty states? |
| **Transitions** | Are animations or transitions specified? |
| **Feedback** | Does the user get feedback for every action? |
| **Progressive disclosure** | Is complexity revealed gradually or all at once? |

### 7. Accessibility (0-10)

Does the plan consider diverse users?

| Check | What to Evaluate |
|-------|-----------------|
| **Keyboard navigation** | Can all interactions be completed with keyboard? |
| **Screen reader** | Are semantic elements and ARIA labels considered? |
| **Color independence** | Is information conveyed by more than just color? |
| **Focus management** | Are focus traps and focus order addressed? |

### 8. Consistency (0-10)

Does the plan maintain internal coherence?

| Check | What to Evaluate |
|-------|-----------------|
| **Component reuse** | Does the plan reuse components or reinvent for each screen? |
| **Pattern language** | Are similar actions handled the same way everywhere? |
| **Naming** | Are UI elements named consistently throughout the plan? |
| **Design system alignment** | If a design system exists, does the plan follow it? |

---

## Scoring Output

```markdown
## Design Dimension Scores

| Dimension | Score | Path to 10 |
|-----------|-------|-----------|
| Visual hierarchy | /10 | {specific improvement} |
| Typography | /10 | {specific improvement} |
| Color usage | /10 | {specific improvement} |
| Spacing/layout | /10 | {specific improvement} |
| Responsiveness | /10 | {specific improvement} |
| Interaction design | /10 | {specific improvement} |
| Accessibility | /10 | {specific improvement} |
| Consistency | /10 | {specific improvement} |
| **Overall** | **/10** | |
```

---

## Plan Annotations

For each dimension below 7, produce concrete annotations on the plan:

```markdown
### [DESIGN-REVIEW] {section reference}

**Dimension**: {which dimension this addresses}
**Current score impact**: {how this drags the score down}
**Proposed change**: {specific, implementable suggestion}
**Example**: {what the improved version would look like}
```

Annotations must be specific enough that an engineer can implement them without further design input.

---

## Screenshot Comparison (Optional)

If `BROWSER_METHOD` is available and mockups or a running app exist:

1. Capture the current state as reference
2. Create an annotated version highlighting issues
3. Save to `.apex/reviews/design-annotations/`

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | All 8 dimensions scored. All sub-7 dimensions have path-to-10. Annotations complete. |
| **DONE_WITH_CONCERNS** | Scores rendered. Multiple dimensions below 5. Plan needs significant design rework. |
| **BLOCKED** | Plan has no UI/UX content to review. This is a backend-only plan. |
| **NEEDS_CONTEXT** | Plan references a design spec or mockup that is not available. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

---

## Artifact Output

Write to `.apex/reviews/{name}-design-review.md`:

```markdown
---
title: "{Feature Name} Design Review"
source_plan: "docs/plans/{name}-plan.md"
status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
date: YYYY-MM-DD
overall_score: {average of 8 dimensions}
dimensions_below_7: {count}
stage: plan-design-review
apex_version: "0.1.0"
---

# {Feature Name} — Plan Design Review

## Scores
{scoring table}

## Annotations
{all annotations grouped by dimension}

## Recommendations
{prioritized list of design improvements}

## Verdict
{one-paragraph summary}
```

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "plan-design-review" ".apex/reviews/{name}-design-review.md"
```

Report:

> **Plan design review complete.** Overall: {N}/10. {M} dimensions below 7.
> Top concerns: {top 2 lowest dimensions and their scores}.
> Full review at `.apex/reviews/{name}-design-review.md`.
>
> {If all >= 7: "Design is solid. Proceed to `/apex-forge-execute`."}
> {If any < 5: "Significant design gaps. Consider `/apex-design-consultation` first."}
