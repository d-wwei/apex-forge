# Compound Memory Write Enforcement

**Date**: 2026-04-14
**Category**: protocol
**Tags**: compound, memory, hard-gate, persistence

## Context

During Compound stage, agents consistently verbalized lessons ("we learned X")
but never wrote them to persistent memory files. The memory write step existed
as a soft recommendation, and agents optimized for speed by skipping it.

## Problem

Compound's value depends on persisting knowledge across sessions. Verbal summaries
in chat have zero persistence — the next session starts with no record of lessons
learned. This made Compound theatric rather than functional.

## What Was Tried

1. **Verbal instruction in protocol text** — agents ignored it
2. **Memory section in Compound stage doc** — still skippable, no enforcement

## Solution

Added a HARD GATE section to `skill/stages/compound.md` with:

1. **Step 1-4**: Structured memory write workflow (collect → classify → write project → propose global)
2. **Step 5**: Verification checklist (file exists, MEMORY.md updated, no duplicates)
3. **Exit Gate S5**: Structural check that at least 1 memory file was written this session

The exit gate makes it impossible to complete Compound without a written memory artifact.

## Why It Worked

Follows the Push > Pull enforcement pattern (see `push-based-enforcement.md`).
Instead of asking the agent to remember to write memory, the gate blocks completion
until memory is written. The agent cannot rationalize skipping it.

## Generalized Pattern

**Persistence gates**: When an agent must produce a side-effect (not just chat output),
add a structural check for the artifact's existence to the exit gate. Verbal acknowledgment
is never sufficient evidence of persistence.

## Prevention

Any future Compound stage modifications must preserve the S5 memory check.
New side-effect requirements should follow the same pattern: add exit gate structural check.
