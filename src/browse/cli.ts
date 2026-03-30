#!/usr/bin/env bun

/**
 * apex-browse — Headless browser daemon for QA and site testing.
 *
 * User mode:   apex-browse goto https://example.com
 * Daemon mode:  apex-browse __daemon__ PORT TOKEN  (internal)
 */

import { ensureDaemon, sendCommand, stopDaemon } from "./daemon.js";
import { startServer } from "./server.js";

async function main() {
  const args = process.argv.slice(2);

  // ---- Internal: daemon mode ----
  if (args[0] === "__daemon__") {
    const port = parseInt(args[1], 10);
    const token = args[2];
    if (!port || !token) {
      console.error("Usage (internal): __daemon__ PORT TOKEN");
      process.exit(1);
    }
    await startServer(port, token);
    return; // Server loop keeps the process alive.
  }

  const command = args[0];

  // ---- No-daemon commands ----
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "stop") {
    await stopDaemon();
    console.log("Daemon stopped");
    return;
  }

  // ---- All other commands route through the daemon ----
  try {
    const info = await ensureDaemon();
    const result = await sendCommand(info, command, args.slice(1));
    if (result) console.log(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
apex-browse -- Headless browser daemon for QA and site testing

Usage: apex-browse <command> [args]

Navigation:
  goto URL              Navigate to URL
  back / forward        History navigation
  reload                Reload page
  url                   Print current URL

Reading:
  text                  Page text content
  html [SELECTOR]       Page or element HTML
  links                 All links (text -> href)

Tab Management:
  tabs                  List open tabs
  newtab [URL]          Open new tab, optionally navigate
  closetab [INDEX]      Close tab by index (default: last)
  tab INDEX             Switch to tab by index

Interaction:
  click SELECTOR        Click element
  fill SELECTOR VALUE   Fill input
  select SELECTOR VALUE Select dropdown option
  hover SELECTOR        Hover over element
  press KEY             Press keyboard key (Enter, Tab, Escape, ArrowUp, ...)
  type TEXT             Type text into focused element
  upload SELECTOR FILE  Upload file(s) to input element
  viewport WxH          Set viewport size (e.g. 1280x720)

Dialog Handling:
  dialog-accept [TEXT]  Auto-accept next dialog (optional prompt response)
  dialog-dismiss        Auto-dismiss next dialog
  dialog [--clear]      Show captured dialog messages (--clear to reset)

Cookie Management:
  cookies               List all cookies (JSON)
  cookie NAME=VALUE     Set cookie on current domain
  cookie-import PATH    Import cookies from JSON file

Visual:
  screenshot [SEL] PATH Save screenshot
  responsive PREFIX     Screenshots at mobile/tablet/desktop
  snapshot [-i]         ARIA tree with @e refs (-i = interactive only)
  pdf [PATH]            Save page as PDF
  diff URL1 URL2        Text diff between two pages

Inspection:
  console [--errors]    Console messages
  network               Failed network requests
  is PROP SELECTOR      Check: visible, hidden, enabled, disabled, checked
  js EXPRESSION         Evaluate JavaScript
  wait SELECTOR         Wait for element (or --networkidle, --load)
  attrs SELECTOR        Get element attributes (JSON)
  css SELECTOR PROP     Get computed CSS property value
  storage [set K V]     Read/write localStorage & sessionStorage
  perf                  Page load performance timings
  eval FILE             Run JavaScript from a file

Network:
  header NAME:VALUE     Set custom request header
  useragent STRING      Set user agent (creates new context)

Meta:
  chain JSON            Run commands sequentially from JSON array
  frame [SELECTOR]      Switch to iframe (no arg = back to main frame)

Observation:
  watch [SECONDS]       Passive snapshot every N seconds (default: 10)
  watch stop            Stop watch mode

State:
  state save [NAME]     Save browser state (cookies, tabs) to disk
  state load [NAME]     Restore browser state from disk

Inbox:
  inbox                 Show messages from extension/sidebar
  inbox --clear         Clear inbox

Connect Chrome:
  connect               Launch headed Chrome with Apex side panel extension
  disconnect            Switch back to headless mode
  focus                 Bring headed browser window to front
  handoff               Pause automation for manual user control
  resume                Resume automation after handoff

Daemon:
  stop                  Stop daemon
  help                  Show this help
`);
}

main();
