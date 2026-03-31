# Acceptance Checklist

Task: Marketing homepage hero

Spec file: `examples/marketing-homepage-hero/implementation-spec.yaml`

Component map file: `examples/marketing-homepage-hero/component-map.json`

Reviewer:

Date:

## 1. Structural Fidelity

- [ ] Hero section contains eyebrow, title, body, CTA cluster, and proof row in the specified order.
- [ ] `h1` is used for the main hero title.
- [ ] CTA grouping is visually and structurally clear.

## 2. Component Fidelity

- [ ] Primary CTA matches the mapped `Button` contract or an explicitly documented equivalent.
- [ ] Secondary CTA remains visually subordinate.
- [ ] No generic section-title component replaced the hero headline.

## 3. Visual Fidelity

- [ ] Headline hierarchy is clearly stronger than the paragraph copy.
- [ ] Primary CTA is the strongest action on first glance.
- [ ] Spacing feels premium and breathable rather than compressed.
- [ ] Proof row remains supportive and understated.

## 4. Responsive Fidelity

- [ ] Mobile layout stacks cleanly without losing hierarchy.
- [ ] Desktop layout preserves strong copy width and balance.
- [ ] Proof row changes layout without becoming noisy.

## 5. Interaction Fidelity

- [ ] Primary CTA has default, hover, focus-visible, and disabled states.
- [ ] Secondary CTA has default, hover, and focus-visible states.
- [ ] Focus treatment is visible and accessible.

## 6. Acceptance Evidence

- [ ] Preview was reviewed on mobile and desktop.
- [ ] Screenshots or manual side-by-side comparison were completed.
- [ ] Any deviations were documented and accepted.

## 7. Traceability

- [ ] Final implementation still matches the spec.
- [ ] Final implementation still matches the component map.
- [ ] Any repo gaps discovered were documented.

## Final Status

- [ ] Accept
- [ ] Needs revision
