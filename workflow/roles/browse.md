---
name: apex-forge-browse
description: Browser interaction skill — navigate, read, interact, screenshot with available tooling
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Browse Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX BROWSE ==="
apex_set_stage "browse"

# Detect available browser tooling (priority order)
BROWSE_METHOD="none"
BROWSE_BINARY=""

# 1. Check for gstack browse binary
if command -v browse &>/dev/null; then
  BROWSE_METHOD="gstack"
  BROWSE_BINARY="browse"
  echo "[apex] Browser: gstack browse binary found"
elif [ -x "./node_modules/.bin/browse" ]; then
  BROWSE_METHOD="gstack"
  BROWSE_BINARY="./node_modules/.bin/browse"
  echo "[apex] Browser: gstack browse (local) found"
fi

# 2. Check for Playwright
if [ "$BROWSE_METHOD" = "none" ]; then
  if command -v playwright &>/dev/null || [ -d "node_modules/playwright" ]; then
    BROWSE_METHOD="playwright"
    echo "[apex] Browser: Playwright found"
  fi
fi

# 3. Check for Puppeteer
if [ "$BROWSE_METHOD" = "none" ]; then
  if [ -d "node_modules/puppeteer" ]; then
    BROWSE_METHOD="puppeteer"
    echo "[apex] Browser: Puppeteer found"
  fi
fi

# 4. Fall back to MCP desktop control
if [ "$BROWSE_METHOD" = "none" ]; then
  BROWSE_METHOD="mcp-desktop"
  echo "[apex] Browser: No headless browser. Using MCP desktop control tools."
fi

echo "BROWSE_METHOD=$BROWSE_METHOD"

# Check for cookie file (authenticated sessions)
COOKIE_FILE=""
if [ -f ".apex/cookies.json" ]; then
  COOKIE_FILE=".apex/cookies.json"
  echo "[apex] Cookie file found: $COOKIE_FILE"
elif [ -f ".apex/cookies.txt" ]; then
  COOKIE_FILE=".apex/cookies.txt"
  echo "[apex] Cookie file found: $COOKIE_FILE"
fi
echo "COOKIE_FILE=$COOKIE_FILE"

# Create screenshots directory
mkdir -p ".apex/screenshots"
echo "[apex] Screenshots: .apex/screenshots/"

apex_ensure_dirs
```

# Browse

> apex-forge / workflow / roles / browse
>
> Browser interaction skill. Navigate, read, interact, capture.
> Auto-detects available tooling and adapts.

---

## Tooling Dispatch

The preamble detected the available browser method. Follow the corresponding section.

### If `BROWSE_METHOD=gstack`

Delegate all browser operations to the gstack browse binary. Reference:

| Action | Command |
|--------|---------|
| **Navigate** | `$B goto URL` |
| **Back** | `$B back` |
| **Forward** | `$B forward` |
| **Reload** | `$B reload` |
| **Read text** | `$B text` |
| **Read HTML** | `$B html` |
| **Read links** | `$B links` |
| **Read forms** | `$B forms` |
| **Click** | `$B click SELECTOR` |
| **Fill input** | `$B fill SELECTOR VALUE` |
| **Select dropdown** | `$B select SELECTOR VALUE` |
| **Screenshot** | `$B screenshot PATH` |
| **Responsive shots** | `$B responsive PREFIX` |
| **Check visible** | `$B is visible SELECTOR` |
| **Check enabled** | `$B is enabled SELECTOR` |
| **Console errors** | `$B console --errors` |

Where `$B` is the browse binary path detected by the preamble.

**Snapshot modes**:
- `-i` — Interactive: annotated screenshot with element labels
- `-D` — Diff: compare current state against previous snapshot
- `-a` — Annotated: overlay CSS selectors on the screenshot

### If `BROWSE_METHOD=playwright`

Use Playwright via Node.js scripts. Construct and execute inline:

```javascript
// Template for Playwright operations
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  // Load cookies if available
  const page = await context.newPage();
  // ... operation ...
  await browser.close();
})();
```

Map common operations:

| Action | Playwright Code |
|--------|----------------|
| Navigate | `await page.goto(url)` |
| Click | `await page.click(selector)` |
| Fill | `await page.fill(selector, value)` |
| Text | `await page.textContent(selector)` |
| Screenshot | `await page.screenshot({ path, fullPage: true })` |
| Wait | `await page.waitForSelector(selector)` |

### If `BROWSE_METHOD=puppeteer`

Use Puppeteer via Node.js scripts. Same pattern as Playwright with Puppeteer API:

```javascript
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  // ... operation ...
  await browser.close();
})();
```

### If `BROWSE_METHOD=mcp-desktop`

Use macOS desktop control MCP tools for browser interaction:

| Action | MCP Tool |
|--------|----------|
| **Open URL** | `open_app "Safari"` or `open_app "Google Chrome"`, then type URL |
| **Screenshot** | `screenshot` (full screen or region) |
| **Click element** | `click` at coordinates (identify from screenshot) |
| **Type text** | `type_text` with app focus |
| **Scroll** | `scroll` at current position |
| **Key press** | `key_press` for navigation (Tab, Enter, etc.) |

**MCP desktop workflow**:
1. Take a screenshot to see the current state.
2. Identify the target element's coordinates from the screenshot.
3. Click or type at those coordinates.
4. Take another screenshot to verify the action.

This method is slower but works without any headless browser installation.

---

## Quick Commands

When the user gives a browse command, parse and dispatch:

| User Input | Action |
|-----------|--------|
| `goto URL` or `open URL` | Navigate to the URL |
| `back` | Navigate back |
| `forward` | Navigate forward |
| `reload` or `refresh` | Reload the page |
| `text` or `read` | Extract page text content |
| `html` | Extract page HTML |
| `links` | List all links on the page |
| `forms` | List all forms and their inputs |
| `click SELECTOR` | Click the matching element |
| `fill SELECTOR VALUE` | Fill an input with a value |
| `select SELECTOR VALUE` | Select a dropdown option |
| `screenshot` or `snap` | Take a full-page screenshot |
| `screenshot SELECTOR` | Screenshot a specific element |
| `responsive` | Take screenshots at 375, 768, 1280px widths |
| `visible SELECTOR` | Check if element is visible |
| `enabled SELECTOR` | Check if element is enabled |
| `console` | Show console errors |

---

## Cookie Import

For authenticated pages, load cookies before navigation.

**JSON format** (`.apex/cookies.json`):
```json
[
  {
    "name": "session",
    "value": "abc123",
    "domain": ".example.com",
    "path": "/",
    "httpOnly": true,
    "secure": true
  }
]
```

**Netscape format** (`.apex/cookies.txt`):
```
.example.com	TRUE	/	TRUE	0	session	abc123
```

If `COOKIE_FILE` is set, load cookies before the first navigation.

To export cookies from Chrome: user runs
`document.cookie` in DevTools, or uses an extension like EditThisCookie.

---

## Screenshot Management

All screenshots are saved to `.apex/screenshots/` with descriptive names.

Naming convention:
- `{timestamp}-{description}.png` — manual screenshots
- `{timestamp}-before-{action}.png` — before an interaction
- `{timestamp}-after-{action}.png` — after an interaction
- `{timestamp}-responsive-{width}.png` — responsive screenshots

Compare screenshots by opening them side-by-side or using diff tools.

---

## Responsive Testing

When `responsive` is invoked, capture at these breakpoints:

| Breakpoint | Width | Description |
|-----------|-------|-------------|
| Mobile | 375px | iPhone SE / small phone |
| Mobile L | 428px | iPhone 14 Pro Max |
| Tablet | 768px | iPad mini |
| Desktop | 1280px | Standard laptop |
| Desktop L | 1920px | Full HD monitor |

For each breakpoint:
1. Set viewport width.
2. Wait for layout to settle (500ms).
3. Take a full-page screenshot.
4. Report any layout issues observed.

---

## Error Handling

| Error | Response |
|-------|----------|
| Page returns 4xx/5xx | Report the status code and response body. Do not retry automatically. |
| Element not found | Report the selector that failed. Suggest alternatives based on page content. |
| Timeout | Report which operation timed out. Increase timeout and retry once. |
| Navigation blocked (CORS, CSP) | Report the blocking policy. Suggest workarounds. |
| No browser available | Offer to install Playwright: `npm init -y && npm install playwright` |

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | Requested browse operations completed successfully. |
| **DONE_WITH_CONCERNS** | Operations completed but issues found (console errors, layout problems). |
| **BLOCKED** | Cannot browse (no browser, no dev server, auth required). |
| **NEEDS_CONTEXT** | Need URL, credentials, or specific page to interact with. |

---

## Register and Report

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
# Only register artifact if screenshots were taken
if ls .apex/screenshots/*.png 1>/dev/null 2>&1; then
  apex_add_artifact "browse" ".apex/screenshots/"
fi
```

Report based on what was done:

**Navigation**:
> Navigated to `{url}`. Page loaded ({status code}).
> {Brief description of page content if requested.}

**Screenshot**:
> Screenshot saved to `.apex/screenshots/{filename}`.
> {Brief description of what's visible.}

**Interaction**:
> {Action performed}. {Result observed}.
> {Screenshot if state changed.}

**Responsive**:
> Responsive screenshots captured at {N} breakpoints.
> Saved to `.apex/screenshots/`.
> {Any layout issues found.}
