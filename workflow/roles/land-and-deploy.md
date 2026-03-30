---
name: apex-forge-land-and-deploy
description: Merge PR, wait for CI, deploy, and verify with canary checks — full ship pipeline
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Land and Deploy Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX LAND AND DEPLOY ROLE ==="
apex_set_stage "land-and-deploy"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
_lad_start_ts=$(date +%s)
apex_telemetry_start "land-and-deploy"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DEPLOY_CONFIG=".apex/config.yaml"
DEPLOY_PLATFORM=""
DEPLOY_URL=""
DEPLOY_STATUS_CMD=""
HEALTH_ENDPOINT=""

if [ -f "$DEPLOY_CONFIG" ]; then
  eval "$(python3 -c "
import yaml, sys
try:
    with open('$DEPLOY_CONFIG') as f:
        cfg = yaml.safe_load(f)
    d = cfg.get('deploy', {})
    print(f'DEPLOY_PLATFORM=\"{d.get(\"platform\", \"\")}\"')
    print(f'DEPLOY_URL=\"{d.get(\"production_url\", \"\")}\"')
    print(f'DEPLOY_STATUS_CMD=\"{d.get(\"status_command\", \"\")}\"')
    print(f'HEALTH_ENDPOINT=\"{d.get(\"health_check\", \"\")}\"')
except: pass
" 2>/dev/null)"
fi

echo "[land-and-deploy] Platform: ${DEPLOY_PLATFORM:-'(not configured — run /apex-setup-deploy)'}"
echo "[land-and-deploy] URL: ${DEPLOY_URL:-'(not configured)'}"
echo "[land-and-deploy] Status cmd: ${DEPLOY_STATUS_CMD:-'(not configured)'}"

# Check for gh CLI
GH_AVAILABLE=false
if command -v gh &>/dev/null; then
  GH_AVAILABLE=true
  echo "[land-and-deploy] GitHub CLI: available"
else
  echo "[land-and-deploy] GitHub CLI: NOT available — cannot merge PRs"
fi

# Detect current PR context
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
echo "[land-and-deploy] Branch: ${CURRENT_BRANCH:-'(detached)'}"

apex_ensure_dirs
```

# Land and Deploy Role

> apex-forge / workflow / roles / land-and-deploy
>
> Full ship pipeline: merge the PR, wait for CI, deploy, verify.
> One command to go from approved PR to verified production.

---

## PREREQUISITES

Before starting, verify:
- [ ] Deploy config exists (`.apex/config.yaml`) — if not, suggest `/apex-setup-deploy`
- [ ] GitHub CLI (`gh`) is available — if not, BLOCKED
- [ ] A PR number or branch is provided — if not, detect from current branch

---

## STEP 1: IDENTIFY THE PR

Determine the PR to merge:

1. If user provides a PR number → use it directly
2. If on a feature branch → `gh pr list --head {branch} --json number,title,state`
3. If neither → ask the user

Verify PR status:
```
gh pr view {PR_NUMBER} --json state,reviewDecision,statusCheckRollup
```

**Gate checks:**
- `state` must be `OPEN`
- `reviewDecision` should be `APPROVED` (warn if not, ask user to confirm)
- All status checks should pass (warn if pending/failing)

If checks are failing → show the failures and ask: "Merge anyway?"

---

## STEP 2: MERGE THE PR

```
gh pr merge {PR_NUMBER} --merge --delete-branch
```

Merge strategy priority:
1. If repo uses squash merges → `--squash`
2. If repo uses rebase merges → `--rebase`
3. Default → `--merge`

Detect preferred strategy from `.github/settings.yml` or ask the user on first run.
Store preference in `.apex/config.yaml` under `deploy.merge_strategy`.

After merge, confirm:
```
gh pr view {PR_NUMBER} --json state
```
State must be `MERGED`.

---

## STEP 3: WAIT FOR CI

After merge, the main branch CI pipeline runs. Wait for it.

### Platform-specific CI detection:

**GitHub Actions:**
```
gh run list --branch main --limit 1 --json status,conclusion,databaseId
```
Poll every 30 seconds until `status == completed`.

**Custom CI:**
If `DEPLOY_STATUS_CMD` is configured:
```
eval "$DEPLOY_STATUS_CMD"
```
Interpret the output per the platform docs.

### Timeout
- Wait up to 15 minutes for CI
- After 10 minutes → warn user about long CI
- After 15 minutes → report BLOCKED with CI link

### CI Result
- `conclusion == success` → proceed to Step 4
- `conclusion == failure` → STOP. Report failure. Suggest investigation.

---

## STEP 4: WAIT FOR DEPLOY

After CI passes, the deploy should trigger (or has already triggered).

### Platform-specific deploy detection:

**Vercel:**
```
# Check latest deployment
gh api repos/{owner}/{repo}/deployments --jq '.[0] | {state: .statuses_url}'
# Or: vercel ls --token $VERCEL_TOKEN (if available)
```
Wait for deployment state to be `success`.

**Netlify:**
```
# Check deploy status via Netlify CLI or API
netlify status
```

**Fly.io:**
```
fly status --app {app-name}
```

**Render:**
```
# Render deploys auto on push — check via API or dashboard
```

**GitHub Actions (deploy job):**
```
gh run list --branch main --workflow deploy --limit 1 --json status,conclusion
```

**Custom:**
Use `DEPLOY_STATUS_CMD` from config.

### Timeout
- Wait up to 10 minutes for deploy
- Poll every 30 seconds
- After timeout → report BLOCKED with deploy status

---

## STEP 5: CANARY VERIFICATION

Once deploy is confirmed live, run canary checks.

### Quick health check:
```
curl -sf {HEALTH_ENDPOINT} && echo "Health: OK" || echo "Health: FAILED"
```

### Full canary:
Invoke the canary role checks:
1. Check HTTP status of production URL
2. Screenshot key pages
3. Check for console errors
4. Compare response time against baseline

**If canary fails:**
```
ALERT: Canary check failed after deployment!

  URL: {url}
  Issue: {description}
  Evidence: {screenshot path or error}

  Recommended action:
  - Check deploy logs
  - Consider rollback: {rollback command per platform}
```

Rollback commands by platform:
- **Vercel**: `vercel rollback`
- **Netlify**: Rollback via dashboard
- **Fly.io**: `fly releases rollback`
- **GitHub Actions**: Re-deploy previous commit
- **Custom**: Use `deploy.rollback_command` from config

---

## STEP 6: REPORT

```
=== Land and Deploy Report ===

PR: #{number} — {title}
Merged: {timestamp}
CI: {passed | failed} ({duration})
Deploy: {succeeded | failed} ({platform})
Canary: {healthy | warning | critical}

Production URL: {url}
Verified at: {timestamp}
```

Register the deployment:
```
apex_add_artifact "land-and-deploy" ".apex/canary/YYYY-MM-DD-report.md"
```

---

## PLATFORM REFERENCE

| Platform | Deploy Trigger | Status Check | Rollback |
|----------|---------------|-------------|----------|
| Vercel | Auto on push | `vercel ls` | `vercel rollback` |
| Netlify | Auto on push | `netlify status` | Dashboard |
| Fly.io | `fly deploy` | `fly status` | `fly releases rollback` |
| Render | Auto on push | Render API | Dashboard |
| GitHub Actions | Workflow on push | `gh run list` | Re-run previous |
| Custom | Config command | Config command | Config command |

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | PR merged, CI passed, deploy succeeded, canary healthy. |
| **DONE_WITH_CONCERNS** | Deployed but canary has warnings. |
| **BLOCKED** | CI failed, deploy failed, or canary critical. |
| **NEEDS_CONTEXT** | No PR specified, no deploy config, or missing credentials. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```
