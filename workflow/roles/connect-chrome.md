---
name: apex-forge-connect-chrome
description: Launch controlled Chrome browser with remote debugging for automation and inspection
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Connect Chrome Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX CONNECT CHROME ==="
apex_set_stage "connect-chrome"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "connect-chrome"

# ---------------------------------------------------------------------------
# Detect available Chrome launch methods
# ---------------------------------------------------------------------------
CHROME_METHOD="none"
CHROME_DEBUG_PORT="${APEX_CHROME_PORT:-9222}"
CHROME_DEBUG_URL=""

# Method 1: gstack connect-chrome binary
if command -v connect-chrome &>/dev/null; then
  CHROME_METHOD="gstack"
  echo "[connect-chrome] gstack connect-chrome binary found."
elif command -v gstack &>/dev/null && gstack connect-chrome --help &>/dev/null 2>&1; then
  CHROME_METHOD="gstack-sub"
  echo "[connect-chrome] gstack connect-chrome subcommand found."
fi

# Method 2: Check for Chrome application on macOS
if [ "$CHROME_METHOD" = "none" ]; then
  if [ -d "/Applications/Google Chrome.app" ]; then
    CHROME_METHOD="applescript"
    echo "[connect-chrome] Google Chrome found at /Applications/."
  elif [ -d "/Applications/Chromium.app" ]; then
    CHROME_METHOD="applescript-chromium"
    echo "[connect-chrome] Chromium found at /Applications/."
  fi
fi

echo "CHROME_METHOD=$CHROME_METHOD"
echo "CHROME_DEBUG_PORT=$CHROME_DEBUG_PORT"

# Check if Chrome is already running with debugging
if curl -s "http://localhost:${CHROME_DEBUG_PORT}/json/version" &>/dev/null; then
  CHROME_DEBUG_URL="http://localhost:${CHROME_DEBUG_PORT}"
  echo "[connect-chrome] Chrome already running with debugging on port $CHROME_DEBUG_PORT."
  echo "CHROME_ALREADY_RUNNING=true"
else
  echo "CHROME_ALREADY_RUNNING=false"
fi

# Check for gstack extension (side panel activity)
GSTACK_EXTENSION="false"
if [ -d "$HOME/.gstack/chrome-extension" ] || \
   curl -s "http://localhost:${CHROME_DEBUG_PORT}/json" 2>/dev/null | grep -q "gstack"; then
  GSTACK_EXTENSION="true"
  echo "[connect-chrome] gstack Chrome extension detected."
fi
echo "GSTACK_EXTENSION=$GSTACK_EXTENSION"

# Create state directory for browser data
mkdir -p ".apex/browser-state"

apex_ensure_dirs
```

# Connect Chrome

> apex-forge / workflow / roles / connect-chrome
>
> Launch a controlled Chrome instance with remote debugging enabled.
> Connects headless automation tools to a real browser.

---

## Entry Conditions

1. Chrome or Chromium must be installed.
2. If `CHROME_ALREADY_RUNNING=true`: skip launch, provide connection details.
3. If `CHROME_METHOD=none`: "No Chrome or Chromium found. Install Google Chrome first."

---

## Launch Methods

### If `CHROME_METHOD=gstack` or `gstack-sub`

Delegate entirely to the gstack binary:

```bash
# gstack handles Chrome launch, profile management, and debugging setup
connect-chrome                    # standalone binary
# or
gstack connect-chrome             # subcommand variant
```

gstack manages:
- Chrome profile isolation
- Remote debugging port assignment
- Extension loading (including side panel)
- Cookie persistence

After launch, gstack reports the debugging URL. Capture and expose it.

### If `CHROME_METHOD=applescript` or `applescript-chromium`

Launch Chrome manually with remote debugging flags:

```bash
# Close any existing Chrome instances first (optional, warn user)
# Launch with remote debugging enabled
open -a "Google Chrome" --args \
  --remote-debugging-port=${CHROME_DEBUG_PORT} \
  --user-data-dir=".apex/browser-state/chrome-profile" \
  --no-first-run \
  --no-default-browser-check
```

For Chromium:
```bash
open -a "Chromium" --args \
  --remote-debugging-port=${CHROME_DEBUG_PORT} \
  --user-data-dir=".apex/browser-state/chromium-profile" \
  --no-first-run
```

Wait for Chrome to start, then verify debugging is active:

```bash
# Poll until Chrome responds (timeout after 10 seconds)
for i in $(seq 1 20); do
  if curl -s "http://localhost:${CHROME_DEBUG_PORT}/json/version" &>/dev/null; then
    echo "Chrome debugging active on port ${CHROME_DEBUG_PORT}"
    break
  fi
  sleep 0.5
done
```

---

## Connection Details

Once Chrome is running with debugging, provide:

```
Chrome DevTools Protocol:
  WebSocket: ws://localhost:{port}/devtools/browser/{id}
  HTTP API:  http://localhost:{port}

Useful endpoints:
  GET /json/version    — browser version info
  GET /json            — list open tabs
  GET /json/new?{url}  — open new tab
  PUT /json/close/{id} — close a tab
```

These endpoints can be used by:
- Puppeteer: `puppeteer.connect({ browserWSEndpoint: 'ws://...' })`
- Playwright: `chromium.connectOverCDP('http://localhost:{port}')`
- curl: direct HTTP API calls

---

## Side Panel Activity (gstack extension)

If `GSTACK_EXTENSION=true`:

The gstack Chrome extension provides a side panel that shows:
- Current page analysis
- Element inspector results
- Screenshot history
- Console log stream

To interact with the side panel:
- It activates automatically when gstack connect-chrome launches
- Activity from `/apex-forge-browse` and `/apex-design-review` appears here
- Screenshots taken via the extension are higher quality than headless captures

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | Chrome launched with debugging. Connection URL provided. |
| **DONE_WITH_CONCERNS** | Chrome launched but some features unavailable (no gstack extension, etc). |
| **BLOCKED** | No Chrome installed. Cannot launch. |
| **NEEDS_CONTEXT** | Chrome is running but not with debugging. User must close and relaunch. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

---

## Artifact Output

No persistent artifact. Connection details are session-scoped.

Report:

> **Chrome connected.** Debugging on port {port}.
> Connect URL: `http://localhost:{port}`
> {If gstack: "gstack side panel active."}
> {If applescript: "Manual launch. Profile at `.apex/browser-state/chrome-profile/`."}
> Ready for `/apex-forge-browse` or `/apex-design-review`.
