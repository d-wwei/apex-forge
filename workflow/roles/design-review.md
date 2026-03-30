---
name: apex-forge-design-review
description: Visual QA and design polish — screenshot-driven review with fix-verify loops
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Design Review Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX DESIGN REVIEW ==="
apex_set_stage "design-review"

# Detect browser capabilities
BROWSER_METHOD="none"

if command -v puppeteer &>/dev/null || [ -d "node_modules/puppeteer" ]; then
  BROWSER_METHOD="puppeteer"
  echo "[apex] Browser: Puppeteer detected"
elif command -v playwright &>/dev/null || [ -d "node_modules/playwright" ]; then
  BROWSER_METHOD="playwright"
  echo "[apex] Browser: Playwright detected"
else
  echo "[apex] Browser: No headless browser found."
  echo "[apex] Will use macOS desktop control MCP tools for screenshots."
  BROWSER_METHOD="mcp-desktop"
fi
echo "BROWSER_METHOD=$BROWSER_METHOD"

# Detect running dev server
DEV_SERVER_URL=""
for port in 3000 3001 5173 5174 4321 8080 8000; do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port" 2>/dev/null | grep -q "200\|304\|301\|302"; then
    DEV_SERVER_URL="http://localhost:$port"
    echo "[apex] Dev server detected at $DEV_SERVER_URL"
    break
  fi
done

if [ -z "$DEV_SERVER_URL" ]; then
  echo "[apex] WARNING: No dev server detected on common ports."
  echo "DEV_SERVER_FOUND=false"
else
  echo "DEV_SERVER_FOUND=true"
fi

# Create output directory for screenshots
SCREENSHOTS_DIR=".apex/design-review"
mkdir -p "$SCREENSHOTS_DIR"
echo "[apex] Screenshots will be saved to $SCREENSHOTS_DIR/"

apex_ensure_dirs
```

# Design Review

> apex-forge / workflow / roles / design-review
>
> Visual QA and design polish. Screenshot-driven, evidence-based.
> Every issue gets before/after proof.

---

## Entry Conditions

1. A running dev server or deployed URL to review.
2. If `DEV_SERVER_FOUND=false`: ask the user for the URL, or offer to start the dev server.
3. Browser capability detected (headless or MCP desktop control).

---

## Review Checklist

Work through each category systematically. For every issue found, take a screenshot as evidence BEFORE fixing.

### 1. Spacing Consistency

| Check | What to Look For |
|-------|-----------------|
| **Padding uniformity** | Same logical elements should have same padding. Cards, sections, list items. |
| **Margin rhythm** | Vertical spacing between sections should follow a consistent scale (4/8/16/24/32/48px). |
| **Container breathing room** | Content should not touch container edges. Minimum 16px internal padding on mobile, 24px+ on desktop. |
| **Gap consistency** | Flex/grid gaps should be uniform within a group. Mixed 8px and 12px gaps in the same list is a defect. |

### 2. Typography Hierarchy

| Check | What to Look For |
|-------|-----------------|
| **Heading scale** | H1 > H2 > H3 in both size and weight. No two heading levels should look the same. |
| **Body readability** | Line height >= 1.5 for body text. Line length 45-75 characters. |
| **Font weight contrast** | At least 2 distinct weights visible (regular + bold). No "everything is medium" syndrome. |
| **Orphaned headings** | A heading with no content below it, or a heading closer to the section above than the section below. |

### 3. Color Harmony

| Check | What to Look For |
|-------|-----------------|
| **Contrast ratios** | Text on background meets WCAG AA (4.5:1 normal text, 3:1 large text). |
| **Accent consistency** | Primary action color used consistently for all primary CTAs. |
| **Gray scale** | Not too many different grays. Ideally 3-4 shades max (text, secondary text, borders, backgrounds). |
| **Dark mode** | If dark mode exists, check that all surfaces have distinct elevation levels. No text disappearing into backgrounds. |

### 4. Alignment and Grid

| Check | What to Look For |
|-------|-----------------|
| **Left edge alignment** | Text, inputs, and content blocks should share a left edge within a section. |
| **Center alignment abuse** | Center-aligned body text longer than 2 lines is a readability defect. |
| **Grid adherence** | Cards/tiles in a grid should be uniform width. No one-off wider cards. |
| **Vertical alignment** | Items in a row should be vertically centered or baseline-aligned consistently. |

### 5. Responsive Layout

| Check | What to Look For |
|-------|-----------------|
| **Mobile (375px)** | No horizontal overflow. Touch targets >= 44px. Text readable without zoom. |
| **Tablet (768px)** | Layout adapts. Not just a stretched mobile or compressed desktop. |
| **Desktop (1280px)** | Content does not stretch full-width on large screens. Max-width container. |
| **Breakpoint transitions** | No layout jumps or content reflow glitches at breakpoint boundaries. |

---

## AI Slop Patterns

These are the most common visual defects produced by AI-generated code. Check for ALL of them.

| Pattern | Description | Fix |
|---------|-------------|-----|
| **Inconsistent padding** | Card A has 16px padding, Card B has 24px. Same component, different spacing. | Unify to the design system's spacing scale. |
| **Orphaned headings** | Section heading at the bottom of a viewport with content on the next scroll. | Ensure heading + at least first paragraph are together. |
| **Cramped text** | Body text with line-height < 1.4, or text touching its container edges. | Set line-height: 1.5-1.6, add proper padding. |
| **Generic icons** | Placeholder icons that don't match the action (e.g., generic circle for "settings"). | Replace with semantically correct icons. |
| **Misaligned grid** | Cards in a grid with slightly different heights causing ragged bottom edges. | Use CSS grid with uniform row heights, or equalize card content. |
| **Button inconsistency** | Primary buttons with different heights, border-radius, or padding across pages. | Extract button component with fixed dimensions. |
| **Phantom borders** | Faint 1px borders that serve no visual purpose, leftover from defaults. | Remove or make intentional (visible border or none). |
| **Z-index chaos** | Dropdowns behind modals, tooltips behind headers. | Establish a z-index scale and apply consistently. |

---

## Fix-Verify Loop

For EACH issue found, follow this exact sequence:

### Step 1: Document

```markdown
### Issue: {short description}
- **Category**: spacing | typography | color | alignment | responsive | slop
- **Severity**: P1 (broken) | P2 (ugly) | P3 (polish)
- **File**: `path/to/file.ext:line`
- **Screenshot**: `.apex/design-review/before-{N}.png`
- **Description**: {what is wrong}
- **Fix**: {specific CSS/code change}
```

### Step 2: Screenshot Before

Take a screenshot of the issue area. Save to `.apex/design-review/before-{issue-number}.png`.

### Step 3: Fix

Apply the fix. Change the minimum amount of code needed.

### Step 4: Screenshot After

Take a screenshot of the same area. Save to `.apex/design-review/after-{issue-number}.png`.

### Step 5: Verify

Compare before and after:
- Is the issue resolved?
- Did the fix introduce any new visual problems?
- Does the fix hold at other viewport sizes?

If verified, commit the fix with message: `fix(ui): {description} [design-review]`

### Step 6: Next Issue

Move to the next issue. Do NOT batch fixes — one issue, one commit, one verification.

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | All categories reviewed. All P1/P2 issues fixed and verified. |
| **DONE_WITH_CONCERNS** | All categories reviewed. P1 issues fixed. P2/P3 issues documented but not all fixed. |
| **BLOCKED** | Cannot take screenshots (no browser, no dev server). |
| **NEEDS_CONTEXT** | Design spec or mockup needed to evaluate correctness. |

---

## Artifact Output

Write to `.apex/design-review/YYYY-MM-DD-review.md`:

```markdown
---
title: "Design Review"
url: "{reviewed URL}"
date: YYYY-MM-DD
status: DONE | DONE_WITH_CONCERNS | BLOCKED
issues_found: {N}
issues_fixed: {N}
stage: design-review
apex_version: "0.1.0"
---

# Design Review — {date}

## Summary
- **URL reviewed**: {url}
- **Viewports tested**: {list}
- **Issues found**: {N} (P1: {n}, P2: {n}, P3: {n})
- **Issues fixed**: {N}

## Issues
{issue list with before/after screenshot references}

## Remaining Items
{P3 or deferred items}
```

---

## Register and Report

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "design-review" ".apex/design-review/YYYY-MM-DD-review.md"
```

Then report to the user:

> **Design review complete.** {N} issues found, {N} fixed.
> Before/after screenshots in `.apex/design-review/`.
> Review log at `.apex/design-review/{date}-review.md`.
