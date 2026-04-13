---
name: design-baseline
description: Objective, quantifiable design quality gate. Industry-standard checks that any design system must pass. Not opinionated — factual.
---

# Design Baseline Gate

Objective, quantifiable design checks. These are industry-standard facts, not design opinions. Any design system must pass these before deeper review.

**This gate is owned by Apex Forge and cannot be overridden by external skills.**

---

## Checks

| Dimension | Check | Criterion | Source |
|-----------|-------|-----------|--------|
| Accessibility | Text contrast | WCAG AA: >= 4.5:1 (normal text), >= 3:1 (large text, 18px+ or 14px bold) | WCAG 2.1 SC 1.4.3 |
| Accessibility | Interactive element size | >= 44x44px (touch), >= 24x24px (mouse-only) | WCAG 2.5.8 |
| Accessibility | Focus indicator | Keyboard-reachable elements must have visible focus style | WCAG 2.4.7 |
| Layout | Content overflow | No clipping, no unintended horizontal scrollbar at standard viewports | — |
| Layout | Responsive breakpoints | 375px / 768px / 1440px — layout must not break at any of these | — |
| Readability | Body font size | >= 14px | — |
| Readability | Line height | 1.4 – 1.8 | WCAG 1.4.12 |
| Consistency | Same-function components | Components with the same function must look the same | — |
| Hierarchy | Visual levels | Must be able to distinguish primary > secondary > tertiary (heading > body > caption) | — |
| Completeness | Empty/error states | Lists, forms, and async data must have fallback displays (empty, error, loading) | — |

---

## Verification Method

For each check, the agent must provide evidence:

- **Contrast**: Use `browse js` to compute contrast ratios, or inspect CSS color values.
- **Element size**: Use `browse css <sel> "width"` / `"height"` or inspect computed styles.
- **Focus**: Use `browse press Tab` and `browse is focused <sel>` to verify keyboard navigation.
- **Overflow**: Use `browse viewport <WxH>` at 375, 768, 1440 and check for horizontal scrollbar via `browse js "document.documentElement.scrollWidth > document.documentElement.clientWidth"`.
- **Font size / line height**: Use `browse css <sel> "font-size"` and `"line-height"`.
- **Consistency**: Visual inspection via `browse screenshot` at multiple viewports.
- **Hierarchy**: Visual inspection of heading/body/caption sizing.
- **Empty states**: Navigate to empty data scenarios and verify fallback UI.

---

## Judgment Rules

- **Any check fails** → REJECTED. Return to Execute stage to fix.
- **All checks pass** → Proceed to second-layer deep review (external design skill).

This gate is binary. No partial passes. No exceptions.

---

## Integration with Review Stage

When the Review stage detects frontend file changes (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.css`, `.scss`):

1. **First**: Run this design-baseline gate. All checks must pass.
2. **Then**: Load the external design skill (e.g., `/tasteful-frontend`) for subjective deep review.

The baseline gate ensures objective safety. The deep review ensures design quality. Neither can override the other.

---

## Future Direction

This gate will evolve through three phases. Each phase adds a review layer without removing previous ones.

### Phase 1: Objective Checklist (Current)

The table above. Binary pass/fail on industry-standard facts. No opinions. This is the foundation and will always run first.

### Phase 2: Expert Persona Sub-Agents (Planned)

Spawn independent sub-agents, each embodying a domain expert:

| Persona | Focus | Judgment Type |
|---------|-------|---------------|
| UX Designer | Information architecture, interaction patterns, user flow coherence | Subjective expert |
| Accessibility Specialist | Beyond WCAG AA — cognitive load, screen reader experience, motor accessibility | Deep domain |
| Brand Guardian | Visual consistency with brand guidelines, tone alignment | Subjective expert |
| Performance Analyst | Render performance, asset weight, Core Web Vitals impact | Quantitative |
| End User (non-technical) | First impression, clarity, trust signals, emotional response | User perspective |

Each persona reviews independently, produces findings in the standard format (severity + autofix_class + confidence), and their results are merged. Conflicts between personas are surfaced, not auto-resolved.

### Phase 3: Cross-Agent Review (Planned)

Invoke external AI agents (Codex, Gemini) as independent reviewers, following the `codex-consult` pattern already established in `bindings.yaml`:

- Each external agent receives the design artifacts and the Phase 1 checklist results
- Each produces an independent assessment
- Disagreements between agents are flagged for human review
- This provides genuine second opinions from models with different training distributions

**Implementation note**: Phase 3 builds on the existing `codex-consult` binding which already handles cross-agent dispatch. The pattern extends naturally to Gemini and other agents.
