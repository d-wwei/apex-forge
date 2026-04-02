# Implementation Phases

Use this reference during step 6 of the workflow. Do not implement everything at once. Follow this execution order — each phase builds on the previous one, and the fidelity loop (step 8) runs after each phase.

## Why phased execution matters

In 40 rounds of experiments (35→97 visual fidelity), the single most important factor was execution order. Adjusting gradients before the layout skeleton exists wastes effort. Tuning viewport proportions before demo data is populated gives misleading results. Each phase has prerequisites.

## Phase 1: Structure

**Goal**: All views/pages exist as empty containers with correct routing.

**Do**:
- Create HTML structure for every view identified in the design
- Set up page/view routing (show/hide, tabs, navigation)
- Establish the layout grid (sidebar + main, header + content)
- Define CSS custom properties (design tokens) in `:root`

**Do NOT yet**: Fill in content, adjust spacing, tune colors, add interactions.

**Completion check**: Every view can be navigated to. The page skeleton matches the design's section structure. CSS variables are defined.

## Phase 2: Data population

**Goal**: All views show realistic content — no empty states.

**Do**:
- Add demo/mock data for all dynamic content areas
- Populate text, numbers, badges, status indicators
- Render lists, cards, tables with realistic item counts
- Add placeholder images where the design shows images

**Do NOT yet**: Fine-tune spacing, adjust typography scale, polish borders.

**Completion check**: Every section has visible content. The page looks "full" even if spacing and styling are rough. This is critical — you cannot evaluate visual fidelity against empty containers.

## Phase 3: Spacing and typography hierarchy

**Goal**: Panel gaps, padding, and font size hierarchy match the design.

**Do**:
- Set section gaps and panel padding to match design values
- Establish heading/body/label/mono font size scale
- Set font weights (heading bold, body regular, label medium)
- Adjust line-heights for readability
- Set border widths and border-radius values

**Do NOT yet**: Tune viewport-relative values (vh/vw), handle component states, add decorative elements.

**Completion check**: Hold the implementation next to the design — the "rhythm" of spacing should feel right. Headings should be visibly larger than body text. Panels should have consistent padding. This phase typically delivers the biggest single-phase score improvement.

## Phase 4: Viewport proportions

**Goal**: Viewport-relative dimensions (hero height, content ratios) match the design.

**Do**:
- Set hero/banner heights using vh units
- Adjust grid column ratios
- Tune max-width/min-width constraints
- Adjust background-position and background-size for hero images

**Important**: vh/vw values CANNOT be precisely derived from static design images. You must iterate:

1. Start with a reasonable estimate (e.g., 40vh for a hero)
2. Screenshot and compare
3. Adjust by 5-10vh increments
4. Narrow down to 2-3vh precision
5. Typically requires 2-3 rounds

**Completion check**: Key sections occupy the correct proportion of the viewport. The hero shows the right amount of background image. Content sections are visible without excessive scrolling.

## Phase 5: Component states

**Goal**: Every interactive component has all its state variants implemented.

**Do**:
- Implement collapsed/expanded states (sidebars, panels, accordions)
- Implement active/selected states (tabs, nav items, cards)
- Implement hover states (buttons, links, cards)
- Implement error/warning states (form fields, status indicators)
- Implement loading/empty states

**State checklist** — verify each component against:
- [ ] Default/rest state
- [ ] Hover state
- [ ] Active/selected state
- [ ] Focus state (keyboard navigation)
- [ ] Disabled state
- [ ] Loading state
- [ ] Empty state
- [ ] Error state
- [ ] Collapsed state (if applicable)
- [ ] Expanded state (if applicable)
- [ ] Responsive state (mobile vs desktop, if applicable)

**Completion check**: Toggle each component through all its states. Compare each state against the design. This phase often requires the most iterations because state-specific styling has subtle interactions (e.g., active + collapsed = different from just active or just collapsed).

## Phase 6: Detail polish

**Goal**: Pixel-level details match — gradients, shadows, borders, decorative elements.

**Do**:
- Tune gradient stops (multi-stop gradients typically need 3+ iterations)
- Adjust box-shadow values
- Refine border colors and opacity
- Add decorative elements (overlays, watermarks, accent lines)
- Tune opacity values for muted/dim text
- Adjust transition/animation timing

**Gradient tuning protocol**:
1. Start with a simple 2-stop gradient
2. Compare against design — identify where the transition feels wrong
3. Add intermediate stops (e.g., `65%, 85%, 100%`)
4. Adjust stop positions by 5-10% increments
5. Repeat until the transition matches

**Completion check**: Side-by-side comparison at compressed resolution shows no visible differences in gradients, shadows, or decorative elements.

## Phase 7: Standalone components

**Goal**: Complex components are extracted to standalone pages for isolated iteration.

**When to use this phase**:
- A component has its own distinct design reference (e.g., "Browser Side Panel" is a separate design)
- A component is complex enough that iterating within the full page is slow
- A component will be reused across multiple views

**Do**:
- Create a standalone HTML file (e.g., `side-panel.html`) that loads shared CSS
- Implement the component in isolation
- Use the fidelity loop against its specific design reference
- Once the standalone version matches, integrate back into the main page
- Verify consistency between standalone and integrated versions

**Completion check**: The standalone component page matches its design reference. The integrated version in the main page matches the standalone version.

## Phase progression rules

1. **Complete each phase before moving to the next** — don't skip ahead to polish before spacing is right
2. **Run the fidelity loop after each phase** — screenshot, compare, assess
3. **A phase is "complete enough" when the next phase's work won't invalidate it** — e.g., spacing doesn't need to be pixel-perfect before moving to viewport proportions, but the general rhythm should be close
4. **If a later phase breaks an earlier phase**, go back and fix the earlier phase first
5. **Record progress** — after each phase, note the current fidelity level and what the main remaining gaps are
