---
name: design-review
description: Visual QA and design polish — screenshot-driven review with fix-verify loops
---

# Design Review

Visual QA and design polish. Screenshot-driven, evidence-based.
Every issue gets before/after proof.

---

## ENTRY CONDITIONS

1. A running dev server or deployed URL to review.
2. Ability to capture screenshots (browser tool, headless browser, or desktop control).

---

## REVIEW CHECKLIST

Work through each category systematically. For every issue found, capture a screenshot as evidence BEFORE fixing.

### 1. Spacing Consistency

| Check | What to Look For |
|-------|-----------------|
| **Padding uniformity** | Same logical elements should have same padding |
| **Margin rhythm** | Vertical spacing should follow a consistent scale (4/8/16/24/32/48px) |
| **Container breathing room** | Content should not touch container edges. Min 16px on mobile, 24px+ on desktop |
| **Gap consistency** | Flex/grid gaps uniform within a group. Mixed 8px and 12px in the same list is a defect |

### 2. Typography Hierarchy

| Check | What to Look For |
|-------|-----------------|
| **Heading scale** | H1 > H2 > H3 in both size and weight. No two levels should look the same |
| **Body readability** | Line height >= 1.5. Line length 45-75 characters |
| **Font weight contrast** | At least 2 distinct weights visible. No "everything is medium" syndrome |
| **Orphaned headings** | Heading with no content below, or closer to section above than section below |

### 3. Color Harmony

| Check | What to Look For |
|-------|-----------------|
| **Contrast ratios** | WCAG AA: 4.5:1 normal text, 3:1 large text |
| **Accent consistency** | Primary action color used consistently for all primary CTAs |
| **Gray scale** | Ideally 3-4 shades max (text, secondary text, borders, backgrounds) |
| **Dark mode** | All surfaces have distinct elevation levels. No text disappearing into backgrounds |

### 4. Alignment and Grid

| Check | What to Look For |
|-------|-----------------|
| **Left edge alignment** | Text, inputs, content blocks should share a left edge within a section |
| **Center alignment abuse** | Center-aligned body text longer than 2 lines is a readability defect |
| **Grid adherence** | Cards/tiles in a grid should be uniform width |
| **Vertical alignment** | Row items vertically centered or baseline-aligned consistently |

### 5. Responsive Layout

| Check | What to Look For |
|-------|-----------------|
| **Mobile (375px)** | No horizontal overflow. Touch targets >= 44px. Text readable without zoom |
| **Tablet (768px)** | Layout adapts. Not just stretched mobile or compressed desktop |
| **Desktop (1280px)** | Content does not stretch full-width. Max-width container present |
| **Breakpoint transitions** | No layout jumps or content reflow glitches at breakpoint boundaries |

---

## AI SLOP PATTERNS

Common visual defects in AI-generated code. Check for ALL of them:

| Pattern | Fix |
|---------|-----|
| **Inconsistent padding** — same component, different spacing | Unify to the spacing scale |
| **Orphaned headings** — heading at bottom of viewport | Ensure heading + first paragraph stay together |
| **Cramped text** — line-height < 1.4, text touching edges | Set line-height: 1.5-1.6, add proper padding |
| **Generic icons** — placeholders that don't match the action | Replace with semantically correct icons |
| **Misaligned grid** — cards with different heights | Use CSS grid with uniform rows or equalize content |
| **Button inconsistency** — different heights/radius across pages | Extract button component with fixed dimensions |
| **Phantom borders** — faint 1px borders serving no purpose | Remove or make intentional |
| **Z-index chaos** — dropdowns behind modals | Establish a z-index scale |

---

## FIX-VERIFY LOOP

For EACH issue found:

1. **Document**: Category, severity (P1 broken / P2 ugly / P3 polish), file:line, description, and specific fix.
2. **Screenshot Before**: Capture the issue area.
3. **Fix**: Apply the minimal code change.
4. **Screenshot After**: Capture the same area.
5. **Verify**: Is the issue resolved? Any new visual problems? Does it hold at other viewport sizes?
6. **Next Issue**: One issue, one fix, one verification. Do NOT batch.

---

## COMPLETION STATUS

| Status | Condition |
|--------|-----------|
| **DONE** | All categories reviewed. All P1/P2 issues fixed and verified. |
| **DONE_WITH_CONCERNS** | All categories reviewed. P1 fixed. Some P2/P3 documented but not all fixed. |
| **BLOCKED** | Cannot take screenshots (no browser, no dev server). |
| **NEEDS_CONTEXT** | Design spec or mockup needed to evaluate correctness. |
