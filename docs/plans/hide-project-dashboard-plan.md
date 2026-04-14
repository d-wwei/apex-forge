---
title: Hide/Close Project Dashboard — Implementation Plan
scope: Standard
status: approved
created: 2026-04-14
source: docs/brainstorms/hide-project-dashboard-requirements.md
task_count: 3
complexity: small-medium
---

# Hide/Close Project Dashboard — Plan

## Problem Frame

Users need to temporarily hide specific projects from the Dashboard frontend. Hidden projects persist via localStorage and auto-unhide when `apex dashboard` is run from that project's directory (detected via `#project=PATH` URL hash).

## Decision Log

| # | Decision | Rationale | Rejected Alternative |
|---|----------|-----------|---------------------|
| D1 | localStorage for hidden list | Must survive refresh + tab close; cleared selectively via hash auto-unhide | sessionStorage (clears ALL on tab close, not selective) |
| D2 | Filter at render entry, not at data fetch | Keeps `loadedProjects` complete for auto-unhide lookup | Filtering in `loadProjectCards()` fetch callback would lose reference |
| D3 | Close button between badge and card header end (Hero) / at right end of item (Sidebar) | Fits existing flex layout, no restructuring needed | Overlay button (z-index complexity) |
| D4 | `event.stopPropagation()` on close button | Prevents click from triggering project navigation | Separate click target zone (HTML restructuring) |

## File Manifest

### Modified Files

| File | Changes |
|------|---------|
| `frontend/app.js` | Add hidden project functions; modify `renderProjectCards()`, `renderSidebar()`, `loadProjectCards()` |
| `frontend/styles.css` | Add `.project-card-close`, `.sidebar-project-close` styles |
| `frontend/locale.js` | Add i18n keys for close button tooltip |

### Test Files

| File | Purpose |
|------|---------|
| `frontend/test-hide-project.html` | Manual test harness: mock projects, verify hide/unhide/hash-restore |

**Scope check**: 3 files modified + 1 test file. Well within 8-files rule. Zero new classes.

## Task Decomposition

### T1: Hidden project state management (app.js)

- **Description**: Add `getHiddenProjects()`, `hideProject(path)`, `unhideProject(path)`, `filterVisibleProjects(projects)` functions. All operate on `localStorage.hiddenProjects` (JSON array of paths).
- **Files**: `frontend/app.js` (add after Section 2 State, around line 40)
- **Test files**: `frontend/test-hide-project.html`
- **Complexity**: small
- **Dependencies**: none
- **Acceptance criteria**: AC3 (persistent hide), AC4 (hash auto-unhide)
- **Test scenarios**:
  - Given empty hiddenProjects, When `hideProject('/a')`, Then `getHiddenProjects()` returns `['/a']` and localStorage contains it
  - Given hiddenProjects `['/a']`, When `unhideProject('/a')`, Then list is empty
  - Given projects `[A, B, C]` with B hidden, When `filterVisibleProjects()`, Then returns `[A, C]`

### T2: UI close buttons + render pipeline (app.js, styles.css, locale.js)

- **Description**: Add `×` close button to Hero card header (between name-group and badge area) and Sidebar expanded item (right end). Modify `renderProjectCards()` and `renderSidebar()` to: (1) call `filterVisibleProjects()` before rendering, (2) attach close button click handlers with `stopPropagation()`. If hiding the current project, call `navigateToHome()`. Update subtitle counts to reflect visible projects only.
- **Files**: `frontend/app.js` (lines 142-181 renderProjectCards, lines 227-268 renderSidebar), `frontend/styles.css`, `frontend/locale.js`
- **Test files**: `frontend/test-hide-project.html`
- **Complexity**: medium
- **Dependencies**: T1
- **Acceptance criteria**: AC1 (Hero close button), AC2 (Sidebar close button), AC3 (immediate effect), AC5 (current project protection)
- **Test scenarios**:
  - Given 3 project cards visible, When click `×` on card B, Then B disappears, A and C remain
  - Given sidebar shows 3 items expanded, When click `×` on item B, Then B disappears from sidebar
  - Given currently viewing project B, When click `×` on B in sidebar, Then navigate to Home
  - Given sidebar is collapsed, Then close buttons are not visible

### T3: Auto-unhide via URL hash (app.js loadProjectCards)

- **Description**: In `loadProjectCards()` (line 200-217), before auto-select logic, check if `#project=PATH` target is in hidden list. If so, call `unhideProject(path)` to remove it, then proceed with normal render (which will now include it). This ensures `apex dashboard` re-launch restores the project.
- **Files**: `frontend/app.js` (lines 200-217 in loadProjectCards)
- **Test files**: `frontend/test-hide-project.html`
- **Complexity**: small
- **Dependencies**: T1, T2
- **Acceptance criteria**: AC4 (hash auto-unhide)
- **Test scenarios**:
  - Given project B is hidden, When page loads with `#project=/path/to/B`, Then B is unhidden and navigated to
  - Given project B is NOT hidden, When page loads with `#project=/path/to/B`, Then normal navigation (no regression)

## Test Plan

| AC# | Acceptance Criterion | Scenario | Test |
|-----|---------------------|----------|------|
| AC1 | Hero close button | Click `×` → card disappears | test-hide-project.html: mock 3 projects, click close, verify DOM |
| AC2 | Sidebar close button | Click `×` → item disappears | test-hide-project.html: expand sidebar, click close, verify DOM |
| AC3 | Persistent hide | Reload page → hidden stays hidden | test-hide-project.html: set localStorage, reload, verify filtered |
| AC4 | Hash auto-unhide | Load with `#project=PATH` → unhide | test-hide-project.html: set hidden + hash, load, verify visible |
| AC5 | Current project protection | Hide current → navigate home | test-hide-project.html: set current, hide it, verify view=home |
| AC6 | Zero data impact | No backend calls on hide | Code review: hideProject() only touches localStorage |

## Dependency Graph

```
T1 (state management) → T2 (UI + render) → T3 (hash auto-unhide)
```

Linear chain. T2 depends on T1's functions. T3 depends on T2's render pipeline being in place.
