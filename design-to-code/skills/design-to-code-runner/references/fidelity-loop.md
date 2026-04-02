# Fidelity Loop

Use this reference throughout implementation — not just at the end. The fidelity loop is the core mechanism that drives visual accuracy from rough to pixel-perfect.

## Core principle

Treat design fidelity as an iterative optimization problem, not a one-shot generation problem. The path from 35% to 97% fidelity is 40 small steps, not 1 big leap.

## The loop

```
┌─→ Make ONE change (single variable)
│        ↓
│   Screenshot current state
│        ↓
│   Compare with design reference (same region, same viewport)
│        ↓
│   Assess: improved? regressed? unchanged?
│        ↓
├── Improved → KEEP (commit), continue to next change
├── Regressed → DISCARD (revert), try different approach
└── Unchanged → analyze why, try a different variable
```

Repeat until the target fidelity is reached or diminishing returns are hit.

## Single-variable rule

**Change one thing at a time.** This is non-negotiable.

Good (single variable):
- "Increase hero height from 38vh to 42vh"
- "Add border-left: 3px solid var(--accent-gold) to active card"
- "Change gradient start from 50% to 65%"

Bad (multiple variables):
- "Increase hero height, add gradient, and change card borders"
- "Restyle the entire sidebar"

Why: If you change 5 things and the score drops, you don't know which change caused the regression. Single-variable changes give you clear attribution.

## Screenshot comparison protocol

### Background-first screenshot capture

**Always use background methods** so the user can keep working. Never steal the user's active window focus for routine screenshots.

**Priority 1 — CDP Proxy (browser-control skill)**:
```bash
# Open dev server in a background tab
TAB_ID=$(curl -s "http://localhost:3456/new?url=http://localhost:3000" | jq -r '.targetId')
# Wait for load, then screenshot
curl -s "http://localhost:3456/screenshot?target=$TAB_ID&file=/tmp/fidelity-check.png"
```
Best option: zero user disruption, dedicated background tab, fully scriptable.

**Priority 2 — macOS Desktop Control MCP**:
```
mcp__macos-desktop-control__screenshot(target: { app: "Google Chrome", title: "localhost" })
```
Good option: captures specific window without stealing focus. Brief flash, then focus restored.

**Priority 3 — Foreground screenshot (last resort)**:
```bash
screencapture -x /tmp/screenshot.png
```
Only when background methods are unavailable. Warn user before taking focus.

If none of these tools are available, suggest the user install `browser-control` or `chrome-control` skills, or configure the `macos-desktop-control` MCP server.

### Resolution tiers

Use the smallest image that shows the difference:

1. **Tiny (400px)** — for quick structural comparison. Use this by default.
2. **Compressed (600px)** — for investigating specific spacing or color differences.
3. **Original** — only for final pixel-perfect verification.
4. **Region crop** — when you need to focus on a specific area (sidebar, header, card).

### How to compare

1. Take a screenshot at the same viewport size as the design reference
2. Compress to the same resolution tier
3. Compare region-by-region:
   - Header/nav area
   - Main content area
   - Sidebar (if applicable)
   - Footer area
4. For each region, check: layout, spacing, typography, colors, borders

### Avoiding API/context overload

- Never load multiple full-resolution design images in one comparison
- Compare one view at a time
- If API errors (500/timeout) occur, downgrade: compressed → tiny → crop → text-only description
- After downgrading, do NOT retry at the original resolution

## Keep/discard decision

| Result | Action | Git operation |
|--------|--------|--------------|
| Metric improved | Keep | `git commit` — branch advances |
| Metric equal or worse | Discard | `git reset --hard HEAD~1` — revert |
| Crash/broken | Quick fix attempt (2 tries max) | Fix → re-run, or discard and move on |

## Plateau detection

When the fidelity score stops improving:

**Level 1 plateau** (2 consecutive unchanged rounds):
- You may be adjusting the wrong variable
- Re-examine the design reference — what is the actual largest visible difference?
- Switch to a different region or component

**Level 2 plateau** (4+ consecutive unchanged rounds):
- Polish-level changes are exhausted
- Try a bigger structural change (layout restructure, component redesign)
- Or combine two near-miss changes that each barely failed

**Level 3 plateau** (8+ rounds at same score):
- You may be at the practical limit for the current approach
- Consider: is the remaining gap in areas you can't control (font rendering, anti-aliasing)?
- Ask the user if the current fidelity level is acceptable

## Cross-session continuity

Record experiment history in a TSV file to enable session recovery:

```
commit	metric_name	status	description
a1b2c3d	85	keep	baseline after phase 3
b2c3d4e	87	keep	reduce hero to 38vh
c3d4e5f	85	discard	push gradient to 75%
d4e5f6g	88	keep	compress card grid gaps
```

This file:
- Is NOT committed to git (add to .gitignore)
- Enables a new session to understand what's been tried
- Shows trends (which direction improves scores)
- Prevents re-trying failed approaches

## When to run the loop

| Trigger | Action |
|---------|--------|
| After completing a phase | Full comparison against all relevant design views |
| After a significant CSS change | Compare the affected region |
| After adding a new component | Compare the component against its design reference |
| After fixing a regression | Verify the fix and check for side effects |
| User provides feedback | Compare their screenshot against your view |

## Integration with implementation phases

```
Phase 1 (Structure)    → Fidelity check: "Do all views exist?"
Phase 2 (Data)         → Fidelity check: "Is content populated?"
Phase 3 (Spacing)      → Fidelity check: "Does the rhythm match?" ← Biggest jump here
Phase 4 (Viewport)     → Fidelity check: "Do proportions match?" ← 2-3 iteration rounds
Phase 5 (States)       → Fidelity check: "Does each state match?" ← Most iterations here
Phase 6 (Polish)       → Fidelity check: "Do details match?" ← Diminishing returns
Phase 7 (Standalone)   → Fidelity check: "Does standalone match integrated?"
```
