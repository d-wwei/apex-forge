---
name: apex-forge-document-release
description: Post-ship documentation update — sync all project docs with what actually shipped
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Document Release Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX DOCUMENT RELEASE ==="
apex_set_stage "document-release"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "document-release"

# ---------------------------------------------------------------------------
# Git context
# ---------------------------------------------------------------------------
if ! command -v git &>/dev/null || ! git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  echo "[doc-release] ERROR: Not a git repository. Document release requires git."
  echo "DOC_RELEASE_READY=false"
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

# Find the most recent release tag or use merge-base as fallback
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  DIFF_BASE="$LAST_TAG"
  echo "[doc-release] Diff base: tag $LAST_TAG"
else
  DIFF_BASE=$(git merge-base HEAD "${DEFAULT_BRANCH}" 2>/dev/null || echo "HEAD~20")
  echo "[doc-release] Diff base: merge-base $DIFF_BASE"
fi

echo "[doc-release] Branch: $CURRENT_BRANCH"

# ---------------------------------------------------------------------------
# Discover project docs
# ---------------------------------------------------------------------------
DOC_FILES=""
for f in README.md ARCHITECTURE.md CONTRIBUTING.md CLAUDE.md CHANGELOG.md \
         docs/README.md docs/ARCHITECTURE.md docs/CONTRIBUTING.md \
         DESIGN.md API.md DEPLOYMENT.md; do
  if [ -f "$f" ]; then
    DOC_FILES="$DOC_FILES $f"
  fi
done

VERSION_FILE=""
for vf in VERSION package.json pyproject.toml Cargo.toml; do
  if [ -f "$vf" ]; then
    VERSION_FILE="$vf"
    break
  fi
done

echo "[doc-release] Docs found:$DOC_FILES"
echo "[doc-release] Version file: ${VERSION_FILE:-none}"
echo "DOC_RELEASE_READY=true"

apex_ensure_dirs
```

# Document Release

> apex-forge / workflow / roles / document-release
>
> Post-ship documentation update. Cross-reference every project doc against
> what actually shipped. Update, polish, and commit as a clean doc-only change.

---

## Entry Conditions

1. `DOC_RELEASE_READY=true` from the preamble.
2. At least one documentation file found in the project.
3. If no docs exist: "No project documentation found. Create a README.md first."

---

## Procedure

### Step 1: Read All Documentation

Read every file discovered by the preamble. For each file, note:
- Last meaningful update date (from git blame or content)
- Sections that reference specific features, APIs, or configurations
- Any TODOs, FIXMEs, or placeholder text

### Step 2: Read the Shipped Diff

```bash
# What actually shipped since the last release / merge-base
git diff --stat "${DIFF_BASE}..HEAD"
git diff --name-only "${DIFF_BASE}..HEAD"
git log --oneline "${DIFF_BASE}..HEAD"
```

Build a mental model of what changed:
- New features or endpoints
- Changed configuration or environment variables
- Removed or deprecated functionality
- Changed file structure or architecture

### Step 3: Cross-Reference and Update

For each documentation file, compare it against the shipped diff:

| Doc File | Check |
|----------|-------|
| **README.md** | Setup instructions still accurate? Feature list current? Quick-start works? |
| **ARCHITECTURE.md** | New modules reflected? Data flow diagrams correct? Removed components cleaned up? |
| **CONTRIBUTING.md** | Build steps still work? Test commands current? New tooling documented? |
| **CLAUDE.md** | Project context accurate? Key commands updated? New conventions captured? |
| **CHANGELOG.md** | New entries for everything shipped? Consistent format? No missing items? |
| **DESIGN.md** | Design tokens current? Component inventory matches shipped UI? |
| **API.md** | New endpoints documented? Changed request/response shapes updated? Removed endpoints noted? |

For each discrepancy found, fix it in place.

### Step 4: Polish CHANGELOG

Apply consistent CHANGELOG formatting:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- Active voice, present tense: "Add user avatar upload endpoint"

### Changed
- "Update dashboard layout to use CSS grid"

### Fixed
- "Fix race condition in session refresh logic"

### Removed
- "Remove deprecated /api/v1/legacy endpoints"
```

Rules:
- Every entry starts with an active verb (Add, Update, Fix, Remove, Improve, Refactor)
- No passive voice ("was added" -> "Add")
- No issue numbers without context ("Fix #42" -> "Fix login timeout on slow connections (#42)")
- Group entries by category, not by date within a release
- Most impactful changes listed first within each category

### Step 5: Clean Stale TODOs

Search all doc files for stale markers:

```bash
grep -rn "TODO\|FIXME\|HACK\|XXX\|PLACEHOLDER\|TBD" ${DOC_FILES}
```

For each found marker:
- If the TODO is completed by the shipped code: remove it
- If the TODO is still relevant: leave it
- If the TODO references a removed feature: remove it
- If uncertain: add `(still pending as of YYYY-MM-DD)` annotation

### Step 6: Optional Version Bump

If `VERSION_FILE` exists and the user requests a version bump:
- Read the current version
- Propose the next version based on changes (semver):
  - Breaking changes -> major bump
  - New features -> minor bump
  - Bug fixes only -> patch bump
- Update the version file
- Update any version references in documentation

### Step 7: Commit Documentation

Stage only documentation files. Commit separately from code changes:

```bash
git add ${DOC_FILES} ${VERSION_FILE}
git commit -m "docs: update documentation for $(git describe --tags 2>/dev/null || echo 'latest release')

- Sync README, ARCHITECTURE, CONTRIBUTING with shipped changes
- Polish CHANGELOG formatting
- Clean stale TODOs"
```

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | All docs reviewed, updated, and committed. |
| **DONE_WITH_CONCERNS** | Docs updated but some sections need user input (unclear intent, missing context). |
| **BLOCKED** | No documentation files found, or git state prevents diff analysis. |
| **NEEDS_CONTEXT** | Cannot determine what shipped without a clear diff base or release tag. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

---

## Artifact Output

No separate artifact file. The documentation updates are committed directly.

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "document-release" "CHANGELOG.md"
```

Report:

> **Documentation release complete.** Updated {N} files: {file list}.
> {N} stale TODOs cleaned. CHANGELOG polished for {version}.
> Committed as doc-only change: `{commit hash}`.
