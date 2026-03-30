---
name: apex-forge-setup-browser-cookies
description: Import cookies from a real browser for authenticated headless browsing sessions
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Setup Browser Cookies Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX SETUP BROWSER COOKIES ==="
apex_set_stage "setup-browser-cookies"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "setup-browser-cookies"

# ---------------------------------------------------------------------------
# Detect cookie import methods
# ---------------------------------------------------------------------------
COOKIE_METHOD="none"

# Method 1: gstack cookie-import-browser
if command -v cookie-import-browser &>/dev/null; then
  COOKIE_METHOD="gstack"
  echo "[cookies] gstack cookie-import-browser found."
elif command -v gstack &>/dev/null && gstack cookie-import-browser --help &>/dev/null 2>&1; then
  COOKIE_METHOD="gstack-sub"
  echo "[cookies] gstack cookie-import-browser subcommand found."
fi

# Method 2: Manual import (always available as fallback)
if [ "$COOKIE_METHOD" = "none" ]; then
  COOKIE_METHOD="manual"
  echo "[cookies] No cookie import tool found. Will guide manual export."
fi

echo "COOKIE_METHOD=$COOKIE_METHOD"

# Check for existing cookies
EXISTING_COOKIES="none"
if [ -f ".apex/browser-state/cookies.json" ]; then
  EXISTING_COOKIES=".apex/browser-state/cookies.json"
  COOKIE_COUNT=$(python3 -c "
import json
with open('.apex/browser-state/cookies.json') as f:
    print(len(json.load(f)))
" 2>/dev/null || echo "?")
  echo "[cookies] Existing cookies found: $COOKIE_COUNT cookies in $EXISTING_COOKIES"
elif [ -f ".apex/cookies.json" ]; then
  EXISTING_COOKIES=".apex/cookies.json"
  echo "[cookies] Legacy cookies found at .apex/cookies.json"
fi
echo "EXISTING_COOKIES=$EXISTING_COOKIES"

# Create storage directory
mkdir -p ".apex/browser-state"
echo "[cookies] Storage: .apex/browser-state/"

apex_ensure_dirs
```

# Setup Browser Cookies

> apex-forge / workflow / roles / setup-browser-cookies
>
> Import cookies from a real browser session so headless automation
> can access authenticated pages. Only import from browsers you control.

---

## Entry Conditions

1. Determine the import method from the preamble.
2. If `EXISTING_COOKIES` is not `none`: inform user of existing cookies, ask if replacing or appending.
3. Ask the user which domain(s) they need cookies for.

---

## Safety Notice

Display before any cookie import:

> **Cookie Safety**: Only import cookies from browsers and accounts you personally
> control. Cookies grant the same access as being logged in. Imported cookies are
> stored locally at `.apex/browser-state/cookies.json` and are NOT committed to git.
> Run `/apex-setup-browser-cookies clear` to delete stored cookies at any time.

Verify `.apex/` is in `.gitignore`:

```bash
if [ -f ".gitignore" ]; then
  if ! grep -q "^\.apex/" .gitignore 2>/dev/null; then
    echo ".apex/" >> .gitignore
    echo "[cookies] Added .apex/ to .gitignore"
  fi
else
  echo ".apex/" > .gitignore
  echo "[cookies] Created .gitignore with .apex/"
fi
```

---

## Import Methods

### If `COOKIE_METHOD=gstack` or `gstack-sub`

Delegate to the gstack cookie import tool:

```bash
# gstack opens an interactive browser picker
cookie-import-browser                  # standalone
# or
gstack cookie-import-browser           # subcommand

# With domain filter
cookie-import-browser --domain "example.com"
```

gstack handles:
- Browser profile detection (Chrome, Firefox, Safari)
- Cookie decryption (Keychain on macOS)
- Interactive domain/cookie selection
- Secure storage

After import, copy to the standard location:
```bash
cp ~/.gstack/cookies.json .apex/browser-state/cookies.json 2>/dev/null
# Also write to legacy location for backward compatibility
cp .apex/browser-state/cookies.json .apex/cookies.json 2>/dev/null
```

### If `COOKIE_METHOD=manual`

Guide the user through manual cookie export. Three approaches:

#### Approach A: Chrome DevTools Export

1. Open Chrome and navigate to the target site (ensure you are logged in).
2. Open DevTools (`Cmd+Option+I` on macOS).
3. Go to the **Application** tab -> **Cookies** in the sidebar.
4. Select the domain you need cookies from.
5. Copy the relevant cookies. At minimum you need:
   - Session cookies (often named `session`, `sid`, `_session_id`, etc.)
   - Auth tokens (often named `token`, `auth`, `jwt`, etc.)
   - CSRF tokens (often named `csrf`, `_csrf_token`, `XSRF-TOKEN`, etc.)

6. Provide the cookies in this JSON format:

```json
[
  {
    "name": "session_id",
    "value": "abc123...",
    "domain": ".example.com",
    "path": "/",
    "httpOnly": true,
    "secure": true,
    "sameSite": "Lax"
  }
]
```

#### Approach B: Browser Extension Export

Recommend the user install a cookie export extension:
- **EditThisCookie** (Chrome) — exports as JSON
- **Cookie Quick Manager** (Firefox) — exports as JSON

Steps:
1. Install the extension.
2. Navigate to the target site.
3. Click the extension icon -> Export as JSON.
4. Paste the JSON output.

#### Approach C: JavaScript Console Export

For quick single-domain export:

```javascript
// Run in Chrome DevTools console on the target site
// NOTE: This only captures non-httpOnly cookies
document.cookie.split(';').map(c => {
  const [name, ...v] = c.trim().split('=');
  return { name, value: v.join('='), domain: location.hostname };
});
```

**Warning**: This method cannot export `httpOnly` cookies. For full access, use Approach A or B.

---

## Cookie Storage

Save imported cookies to `.apex/browser-state/cookies.json` in this format:

```json
[
  {
    "name": "cookie_name",
    "value": "cookie_value",
    "domain": ".example.com",
    "path": "/",
    "httpOnly": true,
    "secure": true,
    "sameSite": "Lax",
    "expires": 1735689600,
    "imported_at": "2026-03-29T00:00:00Z",
    "source_domain": "example.com"
  }
]
```

Also maintain backward compatibility:
```bash
cp .apex/browser-state/cookies.json .apex/cookies.json
```

The `/apex-forge-browse` role automatically loads cookies from `.apex/cookies.json`.

---

## Cookie Management Commands

| Command | Action |
|---------|--------|
| `setup-browser-cookies` | Import new cookies (interactive) |
| `setup-browser-cookies clear` | Delete all stored cookies |
| `setup-browser-cookies list` | Show stored cookies (names and domains only, not values) |
| `setup-browser-cookies refresh` | Re-import cookies for existing domains |

### Clear Cookies

```bash
rm -f .apex/browser-state/cookies.json .apex/cookies.json .apex/cookies.txt
echo "All stored cookies cleared."
```

### List Cookies

```python
import json
with open('.apex/browser-state/cookies.json') as f:
    cookies = json.load(f)
for c in cookies:
    print(f"  {c['domain']:30s}  {c['name']:30s}  expires: {c.get('expires', 'session')}")
```

Never display cookie values in list output.

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | Cookies imported and stored. Ready for authenticated browsing. |
| **DONE_WITH_CONCERNS** | Cookies imported but some may be expired or incomplete. |
| **BLOCKED** | User cannot export cookies (no browser access, no extension). |
| **NEEDS_CONTEXT** | Need target domain from user to know which cookies to import. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

---

## Artifact Output

No review artifact. Cookie files are stored in `.apex/browser-state/`.

Report:

> **Browser cookies imported.** {N} cookies for {domain list}.
> Stored at `.apex/browser-state/cookies.json`.
> `.apex/` is in `.gitignore` — cookies will not be committed.
> Ready for authenticated browsing via `/apex-forge-browse`.
