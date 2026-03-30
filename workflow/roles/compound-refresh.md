---
name: apex-forge-compound-refresh
description: Review and refresh stale solution docs when new knowledge contradicts them
user-invocable: true
---

# Compound Refresh

You are performing a solution documentation refresh cycle.
When a recent fix contradicts or supersedes an existing solution doc, update the knowledge base.

## When to use

- After completing an `apex-compound` cycle that produced a new solution
- User says "update solutions", "refresh docs", or "sync knowledge"
- Auto-suggested when a new solution conflicts with an existing one
- Periodic maintenance — scan for stale docs older than 30 days

## Process

### Step 1 — Scan solution index

Read `docs/solutions/INDEX.md` to get the list of all existing solution docs.
If the index does not exist, scan `docs/solutions/*.md` directly and create the index.

### Step 2 — Identify contradictions

For each solution doc:
1. Read the file's **Problem**, **Root Cause**, and **Solution** sections
2. Compare against the current fix or recently learned facts
3. Flag as **contradicted** if:
   - The root cause was different from what the doc claims
   - The solution approach has been replaced by a better method
   - The technology, API, or tool version has changed
   - The doc references files/paths that no longer exist

### Step 3 — Classify staleness

| Status | Criteria | Action |
|--------|----------|--------|
| Current | No contradictions, still accurate | Skip |
| Stale | >30 days old, minor drift | Add a "Last verified" note |
| Contradicted | Active conflict with new knowledge | Update with new information |
| Obsolete | >60 days, heavily contradicted | Flag for full rewrite or deletion |

### Step 4 — Update contradicted docs

For each contradicted doc:
1. Preserve the original content under a `## Previous Understanding` section
2. Write the updated **Root Cause** and **Solution** with the new information
3. Add a `## Revision History` entry:
   ```
   - YYYY-MM-DD: Updated — {reason for change}
   ```
4. Update any code snippets or file paths that have changed

### Step 5 — Update INDEX.md

Rebuild or update `docs/solutions/INDEX.md` with:
```markdown
| File | Problem | Status | Last Updated |
|------|---------|--------|-------------|
| solution-name.md | Brief description | Current/Stale/Updated | YYYY-MM-DD |
```

### Step 6 — Report

Summarize:
- Total docs scanned
- Docs updated (with reason)
- Docs flagged as obsolete
- New index entries added

## Triggers

This skill can be invoked:
- Manually: `$apex-compound-refresh`
- Auto-suggest: after `apex-compound` writes a new solution, check if it conflicts with existing ones
- Scheduled: recommend running monthly as part of knowledge maintenance

## Completion Protocol

When finished:
1. `apex telemetry end success`
2. Commit updated docs if in a git repo
3. Report count of scanned / updated / obsolete docs
