# Acceptance Checklist

Task:

Spec file:

Component map file:

Reviewer:

Date:

## 1. Structural Fidelity

- [ ] Semantic landmarks match the spec.
- [ ] Section hierarchy matches the spec.
- [ ] Content order matches the spec.

## 2. Component Fidelity

- [ ] Every implemented component is mapped in the component map.
- [ ] No forbidden substitution was used.
- [ ] Any new component creation is documented.

## 3. Visual Fidelity

- [ ] Typography hierarchy matches the intended emphasis.
- [ ] Spacing hierarchy matches the spec.
- [ ] Radius, color, and shadow roles match the spec.
- [ ] The result keeps the intended visual character and does not collapse into a generic UI.
- [ ] **Screenshot comparison**: generated output visually matches the design screenshot (side-by-side review).
- [ ] **Exact values verified**: spacing, sizing, and color values match design API output (not approximated via utility classes).

## 4. Responsive Fidelity

- [ ] Mobile behavior matches the spec.
- [ ] Tablet behavior matches the spec, if applicable.
- [ ] Desktop behavior matches the spec.

## 5. Interaction Fidelity

- [ ] Required interaction states exist.
- [ ] Focus behavior is present where needed.
- [ ] Disabled, loading, expanded, or other declared states are implemented where required.

## 6. Theme & CSS Variable Chain

- [ ] HTML root element has the correct theme class (e.g. `class="dark"`).
- [ ] CSS selectors (`.dark {}`) define all required CSS variables.
- [ ] Components consume CSS variables (`var(--name)`), not hardcoded color values.
- [ ] Theme store default matches HTML class preset.
- [ ] Runtime sync (useEffect or equivalent) keeps HTML class and store aligned.

## 7. Acceptance Evidence

- [ ] Preview was reviewed.
- [ ] Required screenshots or manual comparisons were completed.
- [ ] Design screenshot vs. generated output compared side-by-side.
- [ ] Any material deviations are documented and accepted.

## 8. Traceability

- [ ] The final spec matches the shipped implementation.
- [ ] The final component map matches the shipped implementation.
- [ ] Open questions and assumptions were resolved or explicitly carried forward.

## Final Status

- [ ] Accept
- [ ] Needs revision
