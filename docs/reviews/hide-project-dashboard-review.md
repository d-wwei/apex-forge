---
title: Hide/Close Project Dashboard — Review
status: DONE
created: 2026-04-14
---

# Review: Hide/Close Project Dashboard

## Active Personas

Always-on: Security, Correctness, Spec Compliance, Adversarial
Conditional: Frontend, Test Quality

## Security Reviewer

### Finding: localStorage poisoning — no Array.isArray guard
- **Severity**: P2
- **Persona**: Security
- **Confidence**: high
- **File**: `frontend/app.js:46`
- **Evidence**: `getHiddenProjects` parsed localStorage without validating array type
- **Status**: FIXED — added `Array.isArray(raw) ? raw : []` guard

No XSS issues: all user data goes through `esc()`, close button uses literal `&times;` entity.

## Correctness Reviewer

### Finding: Auto-select navigates to hidden project
- **Severity**: P1
- **Persona**: Correctness
- **Confidence**: high
- **File**: `frontend/app.js:260-278`
- **Evidence**: Auto-select used unfiltered `projects` array; `projects[0]` or `lastProject` could be hidden
- **Status**: FIXED — auto-select now uses `filterVisibleProjects(projects)`

### Finding: `lastProject` restores hidden project on reload
- **Severity**: P1
- **Persona**: Correctness
- **Confidence**: high
- **File**: `frontend/app.js:72`
- **Evidence**: `onHideProject` didn't clear `localStorage.lastProject`, causing reload to re-select hidden project
- **Status**: FIXED — added `localStorage.removeItem('lastProject')` when hiding current

### Finding: All projects hidden leaves empty grid with no recovery
- **Severity**: P1
- **Persona**: Correctness
- **Confidence**: high
- **File**: `frontend/app.js:194`
- **Evidence**: Empty visible list rendered blank grid
- **Status**: FIXED — added "N project(s) hidden" message with "Show all projects" button

## Spec Compliance Reviewer

### Finding: Archived sidebar items missing close button
- **Severity**: P2
- **Persona**: Spec Compliance
- **Confidence**: high
- **File**: `frontend/app.js:317-322`
- **Evidence**: AC2 requires all sidebar items to have close button; archived items were missing
- **Status**: FIXED — added close button + click handler to archived items

### Acceptance Criteria Coverage

| AC | Description | Status |
|----|-------------|--------|
| AC1 | Hero close button | MET — `project-card-close` in card header |
| AC2 | Sidebar close button | MET — `sidebar-project-close` on active + archived items |
| AC3 | Persistent hide (localStorage) | MET — `hiddenProjects` key |
| AC4 | Hash auto-unhide | MET — `loadProjectCards()` unhides before render |
| AC5 | Current project protection | MET — `onHideProject` calls `navigateToHome()` + clears `lastProject` |
| AC6 | Zero data impact | MET — no backend/`.apex/` modifications |

## Adversarial Reviewer

### Assumption Violation: SSE reconnect could re-trigger loadProjectCards
- **Severity**: P3
- **Persona**: Adversarial
- **Confidence**: medium
- **File**: `frontend/app.js:869`
- **Evidence**: Current SSE handler does not re-invoke `loadProjectCards()`. If future code adds this, auto-select could pick hidden project. Current auto-select fix (using `filterVisibleProjects`) mitigates this.
- **Status**: Mitigated by current fix. No action needed.

### Abuse Case: External link auto-unhides hidden project
- **Severity**: P3
- **Persona**: Adversarial
- **Confidence**: medium
- **File**: `frontend/app.js:248-256`
- **Evidence**: Any link with `#project=<path>` silently unhides. This is by design — `apex dashboard` uses this mechanism.
- **Status**: Accepted by design (D2 in requirements).

## Deferred (P3)

- Input validation for `hideProject(path)` — undefined/null guard
- Test file uses `.mjs` instead of plan's `.html` — noted as deviation

## Verification

All 16 tests pass after fixes. No regressions.
