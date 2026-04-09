---
name: apex-forge-learn
description: Manage project learnings — review, search, prune, export, and add what the system has learned across sessions
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Learn Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX LEARN ROLE ==="
apex_set_stage "learn"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "learn"

# ---------------------------------------------------------------------------
# Learnings store
# ---------------------------------------------------------------------------
LEARN_FILE=".apex/learnings.jsonl"
mkdir -p ".apex" 2>/dev/null || true

if [ -f "$LEARN_FILE" ]; then
  TOTAL=$(wc -l < "$LEARN_FILE" 2>/dev/null | tr -d ' ')
  echo "[learn] Learnings file: $LEARN_FILE"
  echo "[learn] Total entries: $TOTAL"
else
  echo "[learn] No learnings file yet ($LEARN_FILE)"
  echo "[learn] Total entries: 0"
fi

# ---------------------------------------------------------------------------
# Git context
# ---------------------------------------------------------------------------
if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
  echo "[learn] Branch: $BRANCH"
else
  echo "[learn] Not a git repo"
fi

apex_ensure_dirs
```

# Learn Role

> apex-forge / workflow / roles / learn
>
> Manage project learnings. Review, search, prune, and export what the system
> has learned across sessions. Learnings are stored in `.apex/learnings.jsonl`.

---

## HARD GATE

Do NOT implement code changes. This role manages learnings only.

---

## LEARNINGS FILE FORMAT

Each line in `.apex/learnings.jsonl` is a JSON object:

```json
{"skill":"review","type":"pattern","key":"prefer-const","insight":"This project uses const everywhere; let triggers lint warnings","confidence":8,"source":"observed","ts":"2026-03-31T14:30:00Z","files":["src/utils.ts"]}
```

Fields:
- `skill` -- which role/skill logged this
- `type` -- one of: `pattern`, `pitfall`, `preference`, `architecture`, `tool`, `operational`
- `key` -- short identifier in kebab-case (2-5 words)
- `insight` -- one sentence describing what was learned
- `confidence` -- 1-10 (how certain this is)
- `source` -- `observed`, `user-stated`, or `inferred`
- `ts` -- ISO 8601 timestamp
- `files` -- (optional) array of related file paths

---

## DETECT COMMAND

Parse the user's input to determine which command to run:

- `/learn` (no arguments) -> **Show recent**
- `/learn search <query>` -> **Search**
- `/learn prune` -> **Prune**
- `/learn export` -> **Export**
- `/learn stats` -> **Stats**
- `/learn add` -> **Manual add**

---

## SHOW RECENT (default)

Show the most recent 20 learnings, grouped by type.

```bash
LEARN_FILE=".apex/learnings.jsonl"
if [ -f "$LEARN_FILE" ]; then
  tail -20 "$LEARN_FILE"
else
  echo "No learnings yet."
fi
```

Parse the JSON lines and present grouped by `type`:

```
RECENT LEARNINGS (20 entries)
========================================

Patterns:
  - prefer-const: This project uses const everywhere; let triggers lint warnings (confidence: 8)
  - api-error-shape: All API errors return {error: string, code: number} shape (confidence: 9)

Pitfalls:
  - stale-cache: Build cache causes false positives after branch switch; run clean first (confidence: 7)

Operational:
  - slow-typecheck: tsc --noEmit takes 45s; use --incremental for faster feedback (confidence: 9)
```

If no learnings exist, tell the user:
"No learnings recorded yet. As you use /review, /investigate, /health, and other roles,
the system will automatically capture patterns, pitfalls, and insights it discovers.
You can also add learnings manually with `/learn add`."

---

## SEARCH

Search learnings by matching the query against `key`, `insight`, `type`, and `files` fields.

```bash
LEARN_FILE=".apex/learnings.jsonl"
if [ -f "$LEARN_FILE" ]; then
  grep -i "USER_QUERY" "$LEARN_FILE" 2>/dev/null || echo "No matches."
else
  echo "No learnings file found."
fi
```

Replace `USER_QUERY` with the user's search terms. For more precise matching,
also parse JSON and match against individual fields:

1. Read `.apex/learnings.jsonl`
2. For each line, check if the query appears in `key`, `insight`, `type`, or any `files` entry
3. Present matching results clearly, grouped by type

If no matches, suggest broadening the search or trying related terms.

---

## PRUNE

Check learnings for staleness and contradictions.

```bash
LEARN_FILE=".apex/learnings.jsonl"
if [ -f "$LEARN_FILE" ]; then
  cat "$LEARN_FILE"
else
  echo "No learnings to prune."
fi
```

For each learning entry:

### 1. File Existence Check

If the learning has a `files` field, check whether those files still exist in the
repo using Glob. If any referenced files are deleted, flag:
```
STALE: [key] references deleted file [path]
```

### 2. Contradiction Check

Look for learnings with the same `key` but different or opposite `insight` values.
Flag:
```
CONFLICT: [key] has contradicting entries —
  Entry 1 (2026-03-15): "use let for loop variables"
  Entry 2 (2026-03-28): "always use const, never let"
```

### 3. Per-Entry Decision

Present each flagged entry to the user:

- A) Remove this learning
- B) Keep it
- C) Update it (I'll tell you what to change)

For removals: read `.apex/learnings.jsonl`, remove the matching line, and write
the file back.

For updates: append a new entry with the corrected insight (the latest entry for
a given key wins when there are duplicates).

---

## EXPORT

Export learnings as markdown suitable for adding to CLAUDE.md or project documentation.

```bash
LEARN_FILE=".apex/learnings.jsonl"
if [ -f "$LEARN_FILE" ]; then
  cat "$LEARN_FILE"
else
  echo "No learnings to export."
fi
```

Read all entries, deduplicate by key (latest entry wins), and format as markdown
grouped by type:

```markdown
## Project Learnings

### Patterns
- **prefer-const**: This project uses const everywhere; let triggers lint warnings (confidence: 8)
- **api-error-shape**: All API errors return {error, code} shape (confidence: 9)

### Pitfalls
- **stale-cache**: Build cache causes false positives after branch switch (confidence: 7)

### Preferences
- **tab-indent**: Project uses tabs, not spaces (confidence: 10)

### Architecture
- **service-layer**: All DB access goes through service layer, never direct from handlers (confidence: 9)

### Operational
- **slow-typecheck**: tsc --noEmit takes 45s; use --incremental for faster feedback (confidence: 9)
```

Present the formatted output to the user. Ask if they want to:
- A) Append it to CLAUDE.md
- B) Save it as a separate file (e.g., `.apex/learnings-export.md`)
- C) Just copy the output, thanks

---

## STATS

Show summary statistics about the project's learnings.

```bash
LEARN_FILE=".apex/learnings.jsonl"
if [ -f "$LEARN_FILE" ]; then
  TOTAL=$(wc -l < "$LEARN_FILE" | tr -d ' ')
  echo "TOTAL_RAW: $TOTAL"

  # Deduplicate by key+type, keeping latest
  # Count unique keys
  jq -r '.key + "|" + .type' "$LEARN_FILE" 2>/dev/null | sort -u | wc -l | tr -d ' '

  # Count by type
  jq -r '.type' "$LEARN_FILE" 2>/dev/null | sort | uniq -c | sort -rn

  # Count by source
  jq -r '.source' "$LEARN_FILE" 2>/dev/null | sort | uniq -c | sort -rn

  # Average confidence
  jq -r '.confidence // 0' "$LEARN_FILE" 2>/dev/null | awk '{s+=$1; n++} END {if(n>0) printf "%.1f\n", s/n; else print "N/A"}'
else
  echo "NO_LEARNINGS"
fi
```

If `jq` is not available, fall back to grep-based parsing:

```bash
# Count by type (grep fallback)
for TYPE in pattern pitfall preference architecture tool operational; do
  COUNT=$(grep -c "\"type\":\"$TYPE\"" "$LEARN_FILE" 2>/dev/null || echo "0")
  echo "$TYPE: $COUNT"
done
```

Present the stats in a readable format:

```
LEARNINGS STATS
========================================
Raw entries:    42
Unique (dedup): 31
Average confidence: 7.3

By Type:
  pattern:       12
  pitfall:        8
  operational:    5
  architecture:   3
  preference:     2
  tool:           1

By Source:
  observed:      24
  user-stated:    5
  inferred:       2
========================================
```

---

## MANUAL ADD

The user wants to manually add a learning. Gather the following:

1. **Type**: pattern / pitfall / preference / architecture / tool / operational
2. **Key**: short identifier (2-5 words, kebab-case)
3. **Insight**: one sentence describing the learning
4. **Confidence**: 1-10
5. **Related files**: (optional) file paths

Then append to `.apex/learnings.jsonl`:

```bash
LEARN_FILE=".apex/learnings.jsonl"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo '{"skill":"learn","type":"TYPE","key":"KEY","insight":"INSIGHT","confidence":N,"source":"user-stated","ts":"'"$TIMESTAMP"'","files":["FILE1"]}' >> "$LEARN_FILE"
```

Confirm to the user:

```
LEARNING ADDED
========================================
Type:       pattern
Key:        prefer-const
Insight:    This project uses const everywhere
Confidence: 8
Files:      src/utils.ts
========================================
```

---

## LOGGING LEARNINGS FROM OTHER ROLES

Other roles can log learnings by appending to `.apex/learnings.jsonl`. The format
is the same JSON-per-line described above. Example from a role's completion:

```bash
LEARN_FILE=".apex/learnings.jsonl"
echo '{"skill":"investigate","type":"pitfall","key":"race-condition-ws","insight":"WebSocket reconnect can fire before auth token refresh completes","confidence":7,"source":"observed","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","files":["src/ws.ts"]}' >> "$LEARN_FILE"
```

---

## RULES

1. **Never modify code.** This role manages learnings only.
2. **Append-only by default.** New entries go at the end of the file. Only prune removes lines (with user confirmation).
3. **Latest wins.** When deduplicating, the most recent entry for a given key+type pair takes precedence.
4. **No external binaries.** Use grep, jq (if available), and standard shell tools. No proprietary search binaries.
5. **Respect user input.** For manual adds, accept what the user says without second-guessing confidence or type classification.

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Command completed successfully (show/search/prune/export/stats/add) |
| **BLOCKED** | Learnings file is corrupted or unreadable |
| **NEEDS_CONTEXT** | User's search query is too vague to produce useful results |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```
