---
name: apex-forge-setup-deploy
description: Auto-detect and configure deployment settings — platform, URLs, health checks
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Setup Deploy Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX SETUP DEPLOY ROLE ==="
apex_set_stage "setup-deploy"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
_setup_start_ts=$(date +%s)
apex_telemetry_start "setup-deploy"

# ---------------------------------------------------------------------------
# Auto-detect platform
# ---------------------------------------------------------------------------
DETECTED_PLATFORM=""

if [ -f "vercel.json" ] || [ -f ".vercel/project.json" ]; then
  DETECTED_PLATFORM="vercel"
elif [ -f "netlify.toml" ]; then
  DETECTED_PLATFORM="netlify"
elif [ -f "fly.toml" ]; then
  DETECTED_PLATFORM="fly.io"
elif [ -f "render.yaml" ]; then
  DETECTED_PLATFORM="render"
elif ls .github/workflows/*deploy* 2>/dev/null | head -1 >/dev/null 2>&1; then
  DETECTED_PLATFORM="github-actions"
elif ls .github/workflows/*release* 2>/dev/null | head -1 >/dev/null 2>&1; then
  DETECTED_PLATFORM="github-actions"
fi

echo "[setup-deploy] Detected platform: ${DETECTED_PLATFORM:-'(none — will ask user)'}"

# Check existing config
CONFIG_FILE=".apex/config.yaml"
if [ -f "$CONFIG_FILE" ]; then
  echo "[setup-deploy] Existing config found at ${CONFIG_FILE}"
else
  echo "[setup-deploy] No config found — will create ${CONFIG_FILE}"
fi

mkdir -p .apex

apex_ensure_dirs
```

# Setup Deploy Role

> apex-forge / workflow / roles / setup-deploy
>
> Configure deployment settings. Auto-detect the platform,
> collect production URL and health checks, write config.

---

## STEP 1: DETECT PLATFORM

The preamble already scanned for platform config files. Use the result:

| File Found | Platform |
|-----------|----------|
| `vercel.json` or `.vercel/project.json` | Vercel |
| `netlify.toml` | Netlify |
| `fly.toml` | Fly.io |
| `render.yaml` | Render |
| `.github/workflows/*deploy*` | GitHub Actions |
| None of the above | Custom — ask user |

If a platform was detected, confirm with the user:
> "Detected **{platform}** deployment config. Is this correct?"

If no platform detected, ask:
> "I didn't find a deployment config file. What platform do you deploy to?"
> Options: Vercel, Netlify, Fly.io, Render, GitHub Actions, Other

---

## STEP 2: COLLECT SETTINGS

Ask the user for these settings (skip any that can be auto-detected):

### Required:

1. **Production URL** — the live URL to monitor
   - Auto-detect from: `vercel.json` (aliases), `netlify.toml` (name), `fly.toml` (app name)
   - Ask if not found: "What is your production URL? (e.g., https://myapp.com)"

2. **Health check endpoint** — URL path that returns 200 when app is healthy
   - Suggest: `/api/health`, `/health`, `/ping`, `/`
   - Ask: "Do you have a health check endpoint? (default: /)"

### Optional:

3. **Deploy status command** — how to check if a deploy is in progress/complete
   - Vercel: `vercel ls --token $VERCEL_TOKEN`
   - Fly.io: `fly status --app {app-name}`
   - GitHub Actions: `gh run list --branch main --limit 1`
   - Ask if custom: "How do you check deploy status?"

4. **Rollback command** — how to roll back a bad deploy
   - Vercel: `vercel rollback`
   - Fly.io: `fly releases rollback`
   - Ask if custom: "How do you rollback? (leave blank if manual)"

5. **Merge strategy** — how PRs are merged
   - Options: `merge`, `squash`, `rebase`
   - Default: `squash`

6. **Canary pages** — pages to check after deploy
   - Default: `["/"]`
   - Suggest: "Which pages should we check after deploy? (comma-separated paths)"

---

## STEP 3: WRITE CONFIG

Write to `.apex/config.yaml`:

```yaml
deploy:
  platform: vercel        # vercel | netlify | fly.io | render | github-actions | custom
  production_url: https://myapp.com
  health_check: /api/health
  status_command: "gh run list --branch main --limit 1 --json status,conclusion"
  rollback_command: "vercel rollback"
  merge_strategy: squash   # merge | squash | rebase
  canary_pages:
    - /
    - /login
    - /dashboard
```

If `.apex/config.yaml` already exists, merge the `deploy:` section — do not overwrite other keys.

---

## STEP 4: VERIFY

Run a quick verification:

1. **Health check**: `curl -sf {production_url}{health_check}`
   - If 200 → "Health check passed."
   - If non-200 → "Health check returned {status}. Is the URL correct?"
   - If connection refused → "Could not reach {production_url}. Please verify the URL."

2. **Deploy status**: Run the status command if configured
   - Report what it returns
   - Confirm it looks correct

3. **Summary**:
```
Deploy Configuration Complete
  Platform:      {platform}
  Production:    {url}
  Health check:  {endpoint}
  Status cmd:    {command}
  Merge style:   {strategy}
  Canary pages:  {list}
  Config file:   .apex/config.yaml

You can now use:
  /apex-land-and-deploy — merge + deploy + verify
  /apex-canary          — post-deploy monitoring
```

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Config written and health check passes. |
| **DONE_WITH_CONCERNS** | Config written but health check failed (URL may be wrong). |
| **BLOCKED** | User cannot provide production URL or platform. |
| **NEEDS_CONTEXT** | Need platform or URL information from user. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```
