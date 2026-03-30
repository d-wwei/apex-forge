---
name: apex-forge-canary
description: Post-deploy canary monitoring — screenshots, error detection, performance regression checks at timed intervals
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Canary Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX CANARY ROLE ==="
apex_set_stage "canary"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
_canary_start_ts=$(date +%s)
apex_telemetry_start "canary"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CANARY_DIR=".apex/canary"
CANARY_DATE=$(date +%Y-%m-%d)
CANARY_REPORT="${CANARY_DIR}/${CANARY_DATE}-report.md"
CANARY_SCREENSHOTS="${CANARY_DIR}/screenshots"
CANARY_BASELINE="${CANARY_DIR}/baseline"

mkdir -p "$CANARY_DIR" "$CANARY_SCREENSHOTS" "$CANARY_BASELINE"

# Load deploy config if available
DEPLOY_URL=""
HEALTH_ENDPOINT=""
if [ -f ".apex/config.yaml" ]; then
  DEPLOY_URL=$(python3 -c "
import yaml, sys
try:
    with open('.apex/config.yaml') as f:
        cfg = yaml.safe_load(f)
    print(cfg.get('deploy', {}).get('production_url', ''))
except: pass
" 2>/dev/null || echo "")
  HEALTH_ENDPOINT=$(python3 -c "
import yaml, sys
try:
    with open('.apex/config.yaml') as f:
        cfg = yaml.safe_load(f)
    print(cfg.get('deploy', {}).get('health_check', ''))
except: pass
" 2>/dev/null || echo "")
fi

echo "[canary] Production URL: ${DEPLOY_URL:-'(not configured — will ask)'}"
echo "[canary] Health endpoint: ${HEALTH_ENDPOINT:-'(not configured)'}"
echo "[canary] Report: ${CANARY_REPORT}"

# Browser detection
eval "$(apex_browse_detect)"
echo "[canary] Browser tool: ${APEX_BROWSE_TYPE:-none}"

apex_ensure_dirs
```

# Canary Role

> apex-forge / workflow / roles / canary
>
> Post-deploy monitoring. Detect regressions before users do.
> Screenshots, error checks, performance baselines at timed intervals.

---

## WHEN TO USE

- After a deployment to production or staging
- As the final step of `/apex-land-and-deploy`
- On-demand to verify production health

---

## STEP 1: RESOLVE TARGETS

If `DEPLOY_URL` is empty, ask the user for the production URL.

Determine key pages to monitor. Check these sources in order:
1. `.apex/config.yaml` → `deploy.canary_pages` list
2. Common routes: `/`, `/login`, `/dashboard`, `/api/health`
3. Ask the user if neither source yields pages

Build the page list:
```
PAGES = [production_url + path for path in canary_pages]
```

---

## STEP 2: TAKE BASELINE

If `CANARY_BASELINE/` has no recent screenshots (< 1 hour old), capture baselines NOW before proceeding.

For each page in PAGES:
1. Navigate to the page
2. Screenshot → save to `CANARY_BASELINE/{page-slug}-baseline.png`
3. Record HTTP status code
4. Capture console errors (if browser supports it)
5. Record page load time

Store baseline metadata in `CANARY_BASELINE/metadata.json`:
```json
{
  "captured_at": "ISO-timestamp",
  "pages": [
    { "url": "...", "status": 200, "load_time_ms": 450, "console_errors": 0 }
  ]
}
```

---

## STEP 3: MONITORING INTERVALS

Run checks at these intervals after deployment:

| Interval | Focus |
|----------|-------|
| **Immediate** (T+0) | HTTP status, health endpoint, critical page loads |
| **T+5 min** | Console errors, visual comparison, API responses |
| **T+15 min** | Performance regression check, error rate trends |
| **T+30 min** | Full sweep — all pages, all checks, final report |

At each interval, run the full check suite below.

---

## STEP 4: CHECK SUITE

For each page at each interval:

### 4a. HTTP Health
- Fetch the page (curl or browser)
- Record status code
- If 4xx/5xx → **ANOMALY**: record immediately

### 4b. Console Errors
- If browser available: capture `console.error` output
- Compare count against baseline
- New errors not in baseline → **ANOMALY**

### 4c. Visual Comparison
- Screenshot the page → `CANARY_SCREENSHOTS/{page-slug}-{interval}.png`
- Compare against baseline screenshot
- If browser tool supports diff mode, use it
- If not: present both screenshots for manual comparison
- Significant visual changes → **ANOMALY**

### 4d. Performance Check
- Record page load time
- Compare against baseline load time
- If >20% slower than baseline → **ANOMALY**

### 4e. Health Endpoint
- If `HEALTH_ENDPOINT` is configured: `curl -s $HEALTH_ENDPOINT`
- Check response body for expected status (e.g., `"status": "ok"`)
- Non-200 or unexpected body → **ANOMALY**

---

## STEP 5: ANOMALY HANDLING

When an anomaly is detected:

```
ANOMALY DETECTED
  Page: {url}
  Check: {http_health | console_errors | visual | performance | health_endpoint}
  Interval: {T+0 | T+5 | T+15 | T+30}
  Expected: {baseline value}
  Actual: {current value}
  Evidence: {screenshot path or error output}
```

**Severity classification:**
- HTTP 5xx or health endpoint down → **CRITICAL** — alert immediately
- New console errors → **WARNING** — include in report, continue monitoring
- Visual change → **WARNING** — include screenshot diff in report
- Performance regression >20% → **WARNING** — flag in report
- Performance regression >50% → **CRITICAL** — alert immediately

For CRITICAL anomalies: stop monitoring and report immediately.
Suggest rollback if multiple CRITICAL anomalies.

---

## STEP 6: REPORT

Write to `.apex/canary/YYYY-MM-DD-report.md`:

```yaml
---
title: Canary Report — {date}
deploy_url: {url}
started_at: {ISO timestamp}
completed_at: {ISO timestamp}
status: healthy | warning | critical
anomalies: {count}
---
```

### Report Sections

1. **Summary**: Overall health status in one sentence.
2. **Interval Results**: Table showing each interval's findings.
3. **Anomalies**: Each anomaly with evidence (screenshot path, error log).
4. **Performance Comparison**: Table of load times — baseline vs current.
5. **Visual Changes**: Links to before/after screenshots.
6. **Recommendation**: Ship / monitor / rollback.

Register the report:
```
apex_add_artifact "canary" ".apex/canary/YYYY-MM-DD-report.md"
```

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | All intervals checked. No critical anomalies. |
| **DONE_WITH_CONCERNS** | Warnings found but no critical issues. |
| **BLOCKED** | Cannot reach production URL or no browser available. |
| **NEEDS_CONTEXT** | Production URL not configured and user did not provide one. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```
