---
name: apex-forge-memory-curate
description: Extract and persist reusable facts from session activity — agent-powered, no API key needed
user-invocable: true
---

# Memory Curation

## Purpose

Extract reusable project knowledge at session boundaries. The agent (you) does
the extraction directly — no external API call, no API key.

## When to Activate

- User says "save what we learned", "curate memory", "remember this"
- Session end signals: "done", "finished", "wrapping up"
- After milestones: feature shipped, bug fixed, architecture decision made
- Start of new session if last curation was >3 sessions ago

## How It Works

You ARE the LLM. You don't need to call an external API to extract facts.
You read the activity context, identify reusable knowledge, and write it
to memory using the `apex` CLI.

## Workflow

### Step 1 — Gather Context

Run this to see current state:

```bash
apex status
apex memory list
```

Also review what happened this session:
- What tasks were completed?
- What decisions were made?
- What was learned about the codebase?
- What gotchas or patterns were discovered?

### Step 2 — Extract Facts

For each reusable fact you identified, add it:

```bash
apex memory add "FACT_CONTENT" CONFIDENCE TAG1 TAG2...
```

**What to extract:**
- Architecture decisions ("Auth uses JWT with RS256")
- Tech stack facts ("Database is PostgreSQL 16")
- Conventions ("Team uses conventional commits")
- Gotchas ("Playwright needs --external flag for bun compile")
- Solved problems ("Cookie import requires copying DB to /tmp first")

**What NOT to extract:**
- Secrets, API keys, tokens
- Temporary file paths
- Session-specific debugging steps
- Obvious facts derivable from package.json/config

### Step 3 — Prune

Clean up low-confidence and duplicate facts:

```bash
apex memory prune
```

### Step 4 — Report

List the updated memory and summarize:

```bash
apex memory list --min 0.7
```

Tell the user:
- How many facts added
- Key topics covered
- Current memory size

## Confidence Scoring Guide

| Range | Meaning | Example |
|-------|---------|---------|
| 0.9-1.0 | Verified in code/config | "Project uses Bun 1.3" |
| 0.7-0.9 | Strong evidence from commits/tasks | "Auth uses JWT RS256" |
| 0.5-0.7 | Reasonable inference | "Team prefers functional components" |
| 0.3-0.5 | Tentative, needs confirmation | "Redis might be for caching" |
| <0.3 | Don't add | — |

## Example Session

```
User: "Done for today, save what we learned"

Agent:
  1. Reviews session: implemented auth middleware, fixed cookie import bug,
     decided on PostgreSQL over MongoDB
  2. Runs:
     apex memory add "Auth middleware uses JWT RS256 with 1h expiry" 0.9 auth jwt
     apex memory add "Cookie import requires copying DB to /tmp (browser locks file)" 0.85 browser cookies
     apex memory add "Chose PostgreSQL for ACID compliance" 0.9 database architecture
     apex memory prune
     apex memory list --min 0.7
  3. Reports: "Added 3 facts (auth, cookies, database). Memory: 26 facts total."
```

## Fallback: Deterministic Curation

If you want automated extraction without agent involvement (e.g., in a cron job
or pre-commit hook), use the deterministic extractor:

```bash
apex memory curate
```

This scans git log, completed tasks, and solution docs to extract facts
automatically. No API key needed, no LLM needed — pure pattern matching.

## Fallback: External LLM (out-of-session only)

For automated curation outside a Claude Code session (CI, cron), the binary
can call the Anthropic API directly:

```bash
ANTHROPIC_API_KEY=sk-ant-... apex memory extract-llm
```

This is the SECONDARY path. The primary path is this skill — the agent extracts
facts during the session, with full context awareness.
