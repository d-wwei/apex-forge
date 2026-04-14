---
title: Hide/Close Project Dashboard
scope: Standard
status: approved
created: 2026-04-14
approved: 2026-04-14
tier: 2
---

# Hide/Close Project Dashboard — Requirements

## Problem Statement

Users need to temporarily hide specific projects from the Dashboard frontend (Hero page and Sidebar) without affecting backend data. Hidden projects automatically become visible again when `apex dashboard` is run from that project's directory.

## Constraints

- Frontend is vanilla JS PWA, no framework dependencies
- Project list comes from `/api/projects` API — no backend modifications
- Existing persistence uses localStorage (`sidebarCollapsed`, `kanbanCollapsed`, `lang`, `lastProject`)
- Must not break: project selection, URL hash navigation, Hub auto-select, SSE event stream, worktree aggregation, i18n

## Chosen Approach

**localStorage + URL hash auto-unhide**

- Store hidden project paths in `localStorage` as JSON array (`hiddenProjects`)
- Filter hidden projects in `renderProjectCards()` and `renderSidebar()`
- When `#project=PATH` hash points to a hidden project, auto-remove from hidden list before filtering
- Add `×` close button to Hero cards and Sidebar items (expanded state)

### Recovery Flow

1. User clicks `×` on project B → B hidden from Hero + Sidebar
2. Hidden state persists across refresh and tab close (localStorage)
3. User runs `apex dashboard` from project B directory → browser opens `#project=B`
4. Frontend detects B in hidden list → auto-unhide → B visible again
5. Other hidden projects unaffected

## Acceptance Criteria

1. **Hero close button**: Each project card has `×` button; click hides project immediately
2. **Sidebar close button**: Each sidebar item (expanded state) has `×` button; click hides project immediately
3. **Persistent hide**: Hidden state survives page refresh and tab close (localStorage)
4. **Hash auto-unhide**: `#project=PATH` pointing to hidden project auto-unhides it and navigates
5. **Current project protection**: Hiding the currently viewed project navigates to Home
6. **Zero data impact**: No backend API or `.apex/` data modifications

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Hiding current project → blank UI | Medium | High | Detect and auto `navigateToHome()` |
| Auto-select picks hidden project | Medium | Medium | Unhide-before-filter ordering in `loadProjectCards()` |
| PWA hash update behavior differs | Low | Medium | Verify during Execute |

## Dependencies

| Dependency | Status |
|-----------|--------|
| `frontend/app.js` — `renderProjectCards()` (line 142-181) | Available |
| `frontend/app.js` — `renderSidebar()` (line 227-268) | Available |
| `frontend/app.js` — `loadProjectCards()` auto-select (line 200-217) | Available |
| `frontend/index.html` — Hero + Sidebar HTML | Available |
| `frontend/styles.css` — close button styling | Needs creation |
| `frontend/locale.js` — i18n keys for close button | Needs creation |

## Solution Shape

**3 core functions** in `app.js`:
1. `getHiddenProjects()` — read hidden list from localStorage
2. `hideProject(path)` — add path to hidden list, trigger re-render
3. `filterVisibleProjects(projects)` — filter out hidden projects

**UI changes**:
- Hero card: `×` button in `project-card-header`
- Sidebar expanded: `×` button on each `sidebar-project-item` (hidden when collapsed)
- Close buttons use `event.stopPropagation()` to prevent triggering navigation

**Render pipeline changes**:
- `renderProjectCards()`: filter via `filterVisibleProjects()` at entry
- `renderSidebar()`: filter via `filterVisibleProjects()` at entry
- `loadProjectCards()`: unhide `#project=PATH` target before filtering; auto-select skips hidden projects

## Confirmed Decisions

| # | Decision | Basis | Status |
|---|----------|-------|--------|
| D1 | Use localStorage (not sessionStorage) | User requirement: hide persists until project re-launched | Confirmed |
| D2 | URL hash `#project=PATH` triggers auto-unhide | [已验证] `apex dashboard` sends this hash (`dashboard.ts:117`) | Confirmed |
| D3 | No "show hidden" management UI | Recovery is via `apex dashboard` re-launch per user spec | Confirmed |
| D4 | Close button only in expanded sidebar | Collapsed sidebar too narrow for button | Confirmed |
