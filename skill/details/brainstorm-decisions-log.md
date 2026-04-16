# Brainstorm Running Decisions Log

## When to Use

When a Brainstorm discussion exceeds **3 interaction rounds**, maintain
a decisions log to prevent earlier decisions from being buried by later
conversation.

## File

`docs/brainstorms/{name}-decisions.md`

## Format

```markdown
| # | Decision | Basis | Status |
|---|----------|-------|--------|
| D1 | Kernel includes baseline guarantees | User choice | Confirmed |
| D2 | Hooks use abstract event layer | User requires cross-platform | Confirmed |
| D3 | Budget default = 5 fields | [假设] No experimental data | Needs verification |
```

## Rules

- Append each decision as it is made. Do NOT wait until the end.
- The `Basis` column must distinguish [已验证] from [假设] sources
  (as defined in the Evidentiary Discipline section of brainstorm.md).
- The `Status` column tracks: `Confirmed` / `Needs verification` / `Superseded`.
- When a later decision invalidates an earlier one, mark the earlier one
  `Superseded by D{N}`.

## Purpose

- Quick reference during long discussions (no need to scroll back).
- The final requirements document's "Confirmed Decisions" section is
  generated from this log.
- `Needs verification` items surface what still requires investigation.

The decisions log is a process tool. The final deliverable remains
the requirements document.
