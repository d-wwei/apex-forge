---
name: apex-forge-browse
description: "Headless browser automation for QA, testing, and web interaction. Persistent Chromium daemon with 60+ commands, @ref element selection, responsive testing, DOM diffing, and annotated screenshots."
---

# Browse — Browser Automation

Persistent headless Chromium daemon for QA testing, site verification, and web interaction. Uses the `apex-forge-browse` binary (alias: `$B`).

## Setup

```bash
# Start automatically on first command (3s cold start, ~100ms subsequent)
apex-forge-browse goto https://example.com

# Or use alias
B="apex-forge-browse"
$B goto https://example.com
```

The daemon auto-shuts down after 30 min idle. All state (cookies, tabs, sessions) persists between calls.

## Core Workflow

The primary loop for understanding and interacting with any page:

```
1. $B goto <url>                    # Navigate
2. $B snapshot -i                   # Get interactive elements with @refs
3. $B click @e3                     # Interact using @ref from snapshot
4. $B snapshot -D                   # Diff to see what changed
5. $B screenshot                    # Visual verification
```

## Command Reference

### Navigation
```
goto <url>          Navigate to URL
back                History back
forward             History forward
reload              Reload page
url                 Print current URL
```

### Snapshot System (Primary Tool)
```
snapshot            Full accessibility tree with @e refs
snapshot -i         Interactive elements only (buttons, links, inputs)
snapshot -c         Compact (no empty structural nodes)
snapshot -d <N>     Limit depth (0 = root only)
snapshot -s <sel>   Scope to CSS selector
snapshot -D         Unified diff against previous snapshot
snapshot -a         Annotated screenshot (red overlay boxes with ref labels)
snapshot -C         Cursor-interactive elements (@c refs)
```

After snapshot, use @refs as selectors: `click @e3`, `fill @e4 "value"`, `hover @e1`

### Reading
```
text                Cleaned page text (no scripts/styles)
html [selector]     innerHTML of element or full page
links               All links as "text -> href"
forms               Form fields as JSON
accessibility       Full ARIA tree
```

### Interaction
```
click <sel|@ref>    Click element
fill <sel> <val>    Fill input field
select <sel> <val>  Select dropdown option
hover <sel>         Hover element
type <text>         Type into focused element
press <key>         Press key (Enter, Tab, Escape, arrows, modifiers)
scroll [sel]        Scroll element into view or page bottom
upload <sel> <file> Upload file(s)
wait <sel|--networkidle|--load>  Wait (15s timeout)
```

### Inspection
```
js <expr>           Run JavaScript, return result
eval <file>         Run JS from file
css <sel> <prop>    Computed CSS value
attrs <sel|@ref>    Element attributes as JSON
is <prop> <sel>     State check: visible/hidden/enabled/disabled/checked/editable/focused
console [--clear]   Console messages (--errors for warnings/errors only)
network [--clear]   Network requests
cookies             All cookies as JSON
storage [set k v]   Read/write localStorage
perf                Page load timings
dialog [--clear]    Dialog messages
```

### Visual & Testing
```
screenshot [sel] [path]           Save screenshot (element crop, --viewport, --clip)
responsive [prefix]               Screenshots at mobile/tablet/desktop viewports
pdf [path]                        Save as PDF
diff <url1> <url2>                Text diff between two pages
viewport <WxH>                    Set viewport (e.g., 375x812 for mobile)
```

### Session & Cookies
```
cookie <name>=<value>             Set cookie on current domain
cookie-import <json-file>         Import cookies from JSON
cookie-import-browser [browser]   Import from installed Chrome/Chromium
state save|load <name>            Save/load full browser state
```

### Tabs
```
tabs                List open tabs
tab <id>            Switch to tab
newtab [url]        Open new tab
closetab [id]       Close tab
```

### Advanced
```
connect             Launch headed Chrome (visible browser)
disconnect          Return to headless
focus               Bring headed browser to foreground
handoff [message]   Give control to user (CAPTCHA, MFA)
resume              Take control back after handoff
frame <sel|main>    Switch iframe context
chain               Batch commands from JSON stdin
```

## Common Patterns

**QA Test Flow:**
```bash
$B goto http://localhost:3000
$B snapshot -i                     # See all interactive elements
$B fill @e2 "test@example.com"    # Fill email
$B fill @e3 "password123"         # Fill password
$B click @e4                       # Click submit
$B wait --networkidle
$B screenshot /tmp/after-login.png
$B is visible ".dashboard"         # Assert dashboard visible
```

**Responsive Testing:**
```bash
$B goto http://localhost:3000
$B responsive /tmp/site            # Generates site-mobile.png, site-tablet.png, site-desktop.png
```

**Before/After Verification:**
```bash
$B snapshot                        # Baseline
# ... make changes ...
$B reload
$B snapshot -D                     # See what changed
```

**Debug with Annotated Screenshot:**
```bash
$B snapshot -a -o /tmp/annotated.png   # Screenshot with @ref overlay boxes
```
