# Acceptance Checklist — APEX FORGE Frontend Redesign

## Structural Fidelity
- [ ] Home view (view-home) exists as default landing page
- [ ] Project view (view-project) wraps sidebar + top-bar + sub-tabs + content
- [ ] Hero section is first child of view-home
- [ ] Project card grid uses flex-wrap with 3 columns
- [ ] Sidebar contains: logo, search, project-list, archived-group
- [ ] Sub-tab bar sits below top-bar, above content area

## Component Fidelity
- [ ] Hero section renders with full atmospheric background image
- [ ] Project cards show: name, status badge, description, 3 metrics
- [ ] Status badges use correct colors (green=ACTIVE/RUNNING, blue=BUILDING, gray=ARCHIVED)
- [ ] Sidebar expanded state: 240px width, full project names + metrics line
- [ ] Sidebar collapsed state: 68px width, abbreviation + status dot
- [ ] Active project has gold background highlight + left border
- [ ] Sub-tabs use Space Grotesk 12px, gold active, muted inactive
- [ ] Top-bar shows "PROJECT: {NAME}" + connection status + timestamp

## Visual Fidelity
- [ ] Background colors match tokens: #10141a (main), #181c22 (card), #0a0e14 (deep)
- [ ] Gold accent: #f0c040 used for active states, buttons, highlights
- [ ] Card border-radius: 12px
- [ ] Card padding: 20px
- [ ] Card gap: 20px
- [ ] Sidebar border-right: 1px solid rgba(223,226,235,0.08)
- [ ] Font families: Space Grotesk headings, Inter body, Fira Code mono
- [ ] Archived project cards have reduced opacity (0.6)

## Interaction Fidelity
- [ ] Clicking project card navigates to project Dashboard view
- [ ] Clicking sidebar logo navigates back to Home view
- [ ] Clicking sidebar project switches active project
- [ ] Sidebar toggle button expands/collapses between 68px and 240px
- [ ] Sub-tab click switches between Dashboard and Design Comparison
- [ ] Scroll past hero shows compact navigation (optional enhancement)

## Data Pipeline Fidelity
- [ ] SSE connection (/api/events) still works after navigation changes
- [ ] /api/projects data populates both Home cards and sidebar list
- [ ] /api/state data still renders Dashboard content correctly
- [ ] Project switch triggers data reload for new project
- [ ] Demo/fallback data displays when API unavailable

## Acceptance Evidence
- [ ] Screenshot: Home view with Hero + project cards
- [ ] Screenshot: Dashboard with sidebar expanded
- [ ] Screenshot: Dashboard with sidebar collapsed
- [ ] Screenshot: Design Comparison sub-tab active
- [ ] Comparison: Paper design vs implementation for each view
