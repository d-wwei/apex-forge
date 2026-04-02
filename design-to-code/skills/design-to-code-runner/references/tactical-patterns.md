# Tactical Patterns

CSS pitfalls, modern patterns, and workarounds discovered through 40 rounds of design-to-code experiments. Use this as a quick reference when you encounter specific implementation challenges.

## CSS Positioning

### position:sticky silent failure

**Problem**: `position: sticky` requires a scrollable ancestor with defined height. If the scroll container is `window` or if the element's parent has `overflow: hidden`, sticky silently does nothing — no error, no warning.

**Symptoms**: Element should stick on scroll but doesn't. Works in isolation but fails in the full page context.

**Solution**: Use `position: fixed` with CSS transform animation:

```css
.sticky-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-100%);
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.sticky-nav.visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
```

Trigger visibility with IntersectionObserver or scroll event.

### Absolute overlay pattern (floating elements)

**Problem**: A decorative element (logo, badge) needs to float over a container without affecting the container's size.

**Solution**: Absolute positioning relative to the container:

```css
.container {
  position: relative;  /* Establish positioning context */
}
.floating-logo {
  position: absolute;
  left: 14px;
  bottom: -2px;        /* Adjust to align with container content */
  pointer-events: none; /* Don't block clicks on underlying content */
  z-index: 1;
}
```

## Viewport Units

### vh tuning methodology

**Problem**: Hero heights, section proportions, and content areas expressed in vh cannot be precisely derived from static design images.

**Solution**: Iterative binary search:

1. Start with a rough estimate based on design proportions (e.g., hero ≈ 40vh)
2. Screenshot and compare — is it too tall or too short?
3. Adjust by 10vh in the correct direction
4. Screenshot again — getting closer?
5. Narrow to 5vh increments, then 2vh
6. Typical convergence: 2-3 rounds

**Common ranges**:
- Full-screen hero: 80-100vh
- Half-screen hero: 35-50vh
- Section banner: 20-30vh
- Content panels rarely need vh — use px or auto

## Gradients

### Multi-stop gradient tuning

**Problem**: Design shows a smooth gradient transition, but a simple 2-stop gradient looks wrong (too abrupt or too spread).

**Solution**: Progressive refinement:

```css
/* Round 1: Simple 2-stop */
background: linear-gradient(to bottom, transparent 50%, #0a0e14 100%);

/* Round 2: Doesn't match — add intermediate stop */
background: linear-gradient(to bottom, transparent 50%, rgba(10,14,20,0.4) 75%, #0a0e14 100%);

/* Round 3: Transition too late — push stops earlier */
background: linear-gradient(to bottom, transparent 40%, rgba(10,14,20,0.3) 65%, rgba(10,14,20,0.7) 85%, #0a0e14 100%);
```

**Rules**:
- Start simple (2 stops), add complexity only when needed
- Adjust stop positions by 5-10% increments
- Gradients over images need lower opacity stops to preserve image visibility
- Always test with the actual background image, not a solid color

## Color and State Differentiation

### CSS custom properties + color-mix() for state variants

**Problem**: Multiple cards/items need different accent colors, with opacity-based differentiation between default and active states.

**Solution**: Per-element CSS custom properties with `color-mix()`:

```css
/* Each item gets its own color via inline style: style="--card-color: #f0c040" */
.card {
  background: color-mix(in srgb, var(--card-color, #f0c040) 8%, transparent);
  border-left: 2px solid var(--card-color, #f0c040);
}
.card.active {
  background: color-mix(in srgb, var(--card-color, #f0c040) 22%, transparent);
}
```

```javascript
const cardColors = ['#f0c040', '#22c55e', '#a2c9ff', '#e879a0'];
items.forEach((item, i) => {
  item.style.setProperty('--card-color', cardColors[i % cardColors.length]);
});
```

**Why this works**: One CSS rule handles all colors. No need for `.card-gold`, `.card-green`, etc. Adding a new color is just adding to the array.

### Avoiding double-background overlaps

**Problem**: Parent element and child element both have background colors, creating a visible double layer.

**Solution**: When a child has its own background, suppress the parent's:

```css
.parent.active {
  background: none;    /* Remove parent background */
  border-left: none;   /* Remove parent border if child has its own */
}
.parent.active .child {
  background: color-mix(in srgb, var(--card-color) 22%, transparent);
}
```

## Typography

### Establishing visual hierarchy

**Impact**: Typography hierarchy alone can improve fidelity by 5-10 points.

**Pattern**:

```css
/* Heading scale */
.section-heading { font-size: 18px; font-weight: 700; font-family: var(--font-heading); }
.panel-title     { font-size: 14px; font-weight: 600; font-family: var(--font-body); }
.label           { font-size: 11px; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; }
.stat-value      { font-size: 28px; font-weight: 700; font-family: var(--font-heading); }
.mono-data       { font-size: 10px; font-weight: 400; font-family: var(--font-mono); }
```

**Rule**: If you can't distinguish heading from body from label at a glance, the hierarchy is too flat.

## Borders and Panels

### Border visibility tuning

**Problem**: Borders are invisible against dark backgrounds, or too prominent.

**Solution**: Use rgba with deliberate opacity control:

```css
--border-main: rgba(78, 70, 53, 0.15);   /* Subtle, for panel separation */
--border-light: rgba(78, 70, 53, 0.2);   /* Slightly more visible */
--border-medium: rgba(78, 70, 53, 0.3);  /* For emphasis */
```

Adjust the base color to match the design's warm/cool tone. Dark UIs often use warm-tinted borders (amber/brown base) rather than neutral gray.

### Stat card border pattern

```css
.stat-card {
  border: 3px solid rgba(78, 70, 53, 0.2);
  border-radius: 8px;
}
.stat-card.green {
  border-color: rgba(34, 197, 94, 0.25); /* Tinted to match content */
}
```

## Layout

### Grid vs Flex decision

- **Grid**: When you need equal-width columns regardless of content (card grids, dashboard panels)
- **Flex**: When items should size based on content (nav bars, button groups, stat rows)

```css
/* Card grid — always 3 equal columns */
.card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

/* Stat row — items size to content */
.stat-row {
  display: flex;
  gap: 12px;
}
.stat-row > * {
  flex: 1; /* Equal width within flex */
}
```

### Sidebar collapsed/expanded transition

```css
.sidebar {
  width: 240px;
  transition: width 0.2s ease;
  overflow: hidden;
}
.sidebar.collapsed {
  width: 90px;
}
/* Hide text-heavy elements in collapsed mode */
.sidebar.collapsed .sidebar-text,
.sidebar.collapsed .sidebar-search { display: none; }
/* Show compact alternatives */
.sidebar.collapsed .sidebar-compact { display: flex; }
```

## Component State Checklist

Before marking Phase 5 complete, verify every interactive component against this list:

- [ ] **Default**: Resting appearance
- [ ] **Hover**: Mouse-over feedback
- [ ] **Active/Selected**: Currently chosen item
- [ ] **Focus**: Keyboard navigation indicator
- [ ] **Disabled**: Unavailable state
- [ ] **Loading**: Data pending
- [ ] **Empty**: No data available
- [ ] **Error**: Operation failed
- [ ] **Collapsed**: Minimized variant
- [ ] **Expanded**: Full-size variant
- [ ] **Transition**: Animation between states

Not every component needs every state, but explicitly verify which states apply and confirm they're all implemented.

## Anti-patterns

### Things that silently reduce fidelity

1. **Tailwind approximation**: `py-2.5` = 10px, but design says 8px. Use inline styles for critical values.
2. **Default browser margins**: `<h1>`, `<p>`, `<ul>` have default margins. Reset them.
3. **Font fallback mismatch**: If Google Fonts fails to load, the fallback font has different metrics. Always include appropriate fallback families.
4. **Sub-pixel rendering**: Borders at 0.5px or text at odd sizes render differently across browsers. Stick to integer pixel values.
5. **z-index collisions**: Multiple `position: fixed` elements need explicit z-index ordering.
6. **Scrollbar width**: Scrollbar takes ~15px on some OSes, shifting layout. Account for this with `scrollbar-gutter: stable` or fixed widths.
