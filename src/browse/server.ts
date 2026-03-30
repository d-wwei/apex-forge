/**
 * HTTP server that runs inside the long-lived daemon process.
 *
 * Holds a persistent Chromium instance via Playwright and exposes every
 * browser operation as a simple JSON-over-HTTP command.
 */

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type FrameLocator,
} from "playwright";
import { readFileSync, existsSync, copyFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { CommandRequest, RefEntry } from "./types.js";
import { readJSON, writeJSON } from "../utils/json.js";

let browser: Browser;
let context: BrowserContext;
let page: Page;
const refs = new Map<string, RefEntry>();

let idleTimer: Timer;
const IDLE_TIMEOUT = 30 * 60 * 1_000; // 30 minutes

// Circular buffers for console & network diagnostics.
const consoleMessages: string[] = [];
const networkErrors: string[] = [];
const MAX_LOG_LINES = 500;

// Dialog handling state.
let dialogMessages: string[] = [];

// Active iframe context (set by `frame` command, cleared on navigation).
let activeFrame: FrameLocator | null = null;

// Watch mode timer (passive observation snapshots).
let watchTimer: Timer | null = null;

// Inbox messages (pushed by extension or external POST).
const inboxMessages: string[] = [];

// ---------------------------------------------------------------------------
// Activity stream (SSE) infrastructure
// ---------------------------------------------------------------------------

interface ActivityEvent {
  id: number;
  ts: string;
  command: string;
  args: string[];
  ok: boolean;
  result?: string;
  duration_ms?: number;
}

const activityBuffer: ActivityEvent[] = [];
let activityId = 0;
const MAX_ACTIVITY = 1000;
const sseClients: Set<ReadableStreamDefaultController<any>> = new Set();

// Track whether we're in headed (connected) mode.
let isHeadedMode = false;
let serverPort = 0;

function pushActivity(event: ActivityEvent) {
  activityBuffer.push(event);
  if (activityBuffer.length > MAX_ACTIVITY) activityBuffer.shift();
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.enqueue(new TextEncoder().encode(data));
    } catch {
      sseClients.delete(client);
    }
  }
}

function filterSensitiveArgs(cmd: string, args: string[]): string[] {
  if (cmd === "fill" && args.length > 1) return [args[0], "***"];
  if (cmd === "type") return ["***"];
  if (cmd === "cookie") return ["***"];
  if (cmd === "cookie-import") return ["***"];
  return args;
}

/** Push current refs to all SSE clients as a named event. */
function broadcastRefs() {
  const refArray = Array.from(refs.entries()).map(([id, entry]) => ({
    id,
    role: entry.role,
    name: entry.name,
  }));
  const data = `event: refs\ndata: ${JSON.stringify(refArray)}\n\n`;
  for (const client of sseClients) {
    try {
      client.enqueue(new TextEncoder().encode(data));
    } catch {
      sseClients.delete(client);
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point — called from cli.ts in __daemon__ mode
// ---------------------------------------------------------------------------

export async function startServer(port: number, token: string) {
  serverPort = port;
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  page = await context.newPage();

  // Capture console output and failed network requests.
  page.on("console", (msg) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    if (consoleMessages.length > MAX_LOG_LINES) consoleMessages.shift();
  });
  page.on("requestfailed", (req) => {
    networkErrors.push(
      `${req.method()} ${req.url()} ${req.failure()?.errorText}`,
    );
    if (networkErrors.length > MAX_LOG_LINES) networkErrors.shift();
  });

  // Default dialog handler — auto-accept to prevent page lockup.
  page.on("dialog", async (d) => {
    dialogMessages.push(`[${d.type()}] ${d.message()}`);
    await d.accept();
  });

  resetIdleTimer();

  const server = Bun.serve({
    port,
    async fetch(req) {
      resetIdleTimer();
      const url = new URL(req.url);

      // CORS preflight for extension requests (no auth required)
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
          },
        });
      }

      // Unauthenticated read-only endpoints for the side panel extension
      const publicPaths = new Set([
        "/activity/stream",
        "/activity/history",
        "/refs",
        "/inbox",
      ]);
      const isPublic = publicPaths.has(url.pathname);

      // ---- Auth gate (skip for public endpoints) ----
      if (!isPublic && req.headers.get("authorization") !== `Bearer ${token}`) {
        return new Response("Unauthorized", { status: 401 });
      }

      // GET /status
      if (url.pathname === "/status" && req.method === "GET") {
        return Response.json({
          ok: true,
          data: { url: page.url(), pid: process.pid, headed: isHeadedMode },
        });
      }

      // POST /stop
      if (url.pathname === "/stop" && req.method === "POST") {
        setTimeout(() => shutdown(server), 100);
        return Response.json({ ok: true });
      }

      // POST /command
      if (url.pathname === "/command" && req.method === "POST") {
        const body = (await req.json()) as CommandRequest;
        const startMs = Date.now();
        try {
          const data = await handleCommand(body.command, body.args);
          const event: ActivityEvent = {
            id: ++activityId,
            ts: new Date().toISOString(),
            command: body.command,
            args: filterSensitiveArgs(body.command, body.args),
            ok: true,
            result: data.slice(0, 500),
            duration_ms: Date.now() - startMs,
          };
          pushActivity(event);
          // Broadcast refs after snapshot commands
          if (body.command === "snapshot") broadcastRefs();
          return Response.json({ ok: true, data });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          const event: ActivityEvent = {
            id: ++activityId,
            ts: new Date().toISOString(),
            command: body.command,
            args: filterSensitiveArgs(body.command, body.args),
            ok: false,
            result: msg.slice(0, 500),
            duration_ms: Date.now() - startMs,
          };
          pushActivity(event);
          return Response.json({ ok: false, error: msg });
        }
      }

      // GET /activity/stream — Server-Sent Events
      if (url.pathname === "/activity/stream" && req.method === "GET") {
        const stream = new ReadableStream({
          start(controller) {
            sseClients.add(controller);
            // Send recent events as catch-up
            for (const event of activityBuffer.slice(-50)) {
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
              );
            }
          },
          cancel(controller) {
            sseClients.delete(controller as ReadableStreamDefaultController);
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // GET /activity/history — recent activity events (JSON)
      if (url.pathname === "/activity/history" && req.method === "GET") {
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const events = activityBuffer.slice(-Math.min(limit, MAX_ACTIVITY));
        return Response.json({ ok: true, data: events }, {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }

      // GET /refs — current ref map
      if (url.pathname === "/refs" && req.method === "GET") {
        const refArray = Array.from(refs.entries()).map(([id, entry]) => ({
          id,
          role: entry.role,
          name: entry.name,
          index: entry.index,
          selector: entry.selector,
        }));
        return Response.json({ ok: true, data: refArray }, {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }

      // POST /inbox — push a message from extension or external tool (public)
      if (url.pathname === "/inbox" && req.method === "POST") {
        try {
          const body = await req.json() as { message?: string };
          const msg = body?.message;
          if (!msg || typeof msg !== "string") {
            return Response.json(
              { ok: false, error: "Body must contain { message: string }" },
              { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
            );
          }
          inboxMessages.push(`[${new Date().toISOString()}] ${msg}`);
          return Response.json(
            { ok: true, queued: inboxMessages.length },
            { headers: { "Access-Control-Allow-Origin": "*" } },
          );
        } catch {
          return Response.json(
            { ok: false, error: "Invalid JSON body" },
            { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
          );
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`apex-browse daemon listening on port ${port}`);
}

// ---------------------------------------------------------------------------
// Idle auto-shutdown
// ---------------------------------------------------------------------------

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.log("Idle timeout reached, shutting down");
    process.exit(0);
  }, IDLE_TIMEOUT);
}

async function shutdown(server: ReturnType<typeof Bun.serve>) {
  try {
    if (isHeadedMode) {
      await context?.close();
    } else {
      await browser?.close();
    }
  } catch {
    // Best effort.
  }
  server.stop();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Command dispatcher
// ---------------------------------------------------------------------------

async function handleCommand(cmd: string, args: string[]): Promise<string> {
  switch (cmd) {
    // ------ Navigation ------

    case "goto": {
      const url = args[0];
      if (!url) throw new Error("Usage: goto URL");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      refs.clear();
      return `Navigated to ${page.url()} (${await page.title()})`;
    }

    case "back": {
      await page.goBack();
      return `Back to ${page.url()}`;
    }
    case "forward": {
      await page.goForward();
      return `Forward to ${page.url()}`;
    }
    case "reload": {
      await page.reload();
      return `Reloaded ${page.url()}`;
    }
    case "url": {
      return page.url();
    }

    // ------ Reading ------

    case "text": {
      return (await page.textContent("body")) || "";
    }

    case "html": {
      const sel = args[0];
      if (sel) {
        const el = resolveSelector(sel);
        return await el.innerHTML();
      }
      return await page.content();
    }

    case "links": {
      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a")).map(
          (a) => `${a.textContent?.trim()} -> ${a.href}`,
        ),
      );
      return links.join("\n");
    }

    // ------ Interaction ------

    case "click": {
      const sel = args[0];
      if (!sel) throw new Error("Usage: click SELECTOR");
      const el = resolveSelector(sel);
      await el.click();
      return `Clicked ${sel}`;
    }

    case "fill": {
      const sel = args[0];
      if (!sel) throw new Error("Usage: fill SELECTOR VALUE");
      const value = args.slice(1).join(" ");
      const el = resolveSelector(sel);
      await el.fill(value);
      return `Filled ${sel} with "${value}"`;
    }

    case "select": {
      const sel = args[0];
      const value = args[1];
      if (!sel || !value) throw new Error("Usage: select SELECTOR VALUE");
      await page.selectOption(sel, value);
      return `Selected "${value}" in ${sel}`;
    }

    // ------ Visual ------

    case "screenshot": {
      // screenshot [SELECTOR] PATH   — last arg is always the path
      const path =
        args[args.length - 1] || ".apex/screenshots/screenshot.png";
      if (args.length > 1) {
        const el = resolveSelector(args[0]);
        await el.screenshot({ path });
      } else {
        await page.screenshot({ path, fullPage: true });
      }
      return `Screenshot saved to ${path}`;
    }

    case "responsive": {
      const prefix = args[0] || ".apex/screenshots/responsive";
      const viewports = [
        { name: "mobile", w: 375, h: 812 },
        { name: "tablet", w: 768, h: 1024 },
        { name: "desktop", w: 1280, h: 720 },
      ] as const;
      const results: string[] = [];
      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        const p = `${prefix}-${vp.name}.png`;
        await page.screenshot({ path: p, fullPage: true });
        results.push(`${vp.name} (${vp.w}x${vp.h}): ${p}`);
      }
      // Restore default viewport.
      await page.setViewportSize({ width: 1280, height: 720 });
      return results.join("\n");
    }

    case "snapshot": {
      // Playwright 1.58+: use ariaSnapshot() which returns a YAML string.
      const yaml = await page.locator("body").ariaSnapshot({ timeout: 10_000 });
      if (!yaml) return "No accessibility tree available";

      refs.clear();
      let refCount = 0;
      const interactiveOnly = args.includes("-i");
      const interactiveRoles = new Set([
        "button",
        "link",
        "textbox",
        "checkbox",
        "radio",
        "combobox",
        "menuitem",
        "tab",
        "switch",
      ]);

      // Parse YAML lines like "- role \"name\"" or "  - role \"name\": ..."
      // and assign @e refs to each node.
      const roleNameRe = /^(\s*)-\s+(\w+)(?:\s+"([^"]*)")?/;
      const outputLines: string[] = [];

      for (const line of yaml.split("\n")) {
        const m = line.match(roleNameRe);
        if (!m) {
          // Passthrough non-node lines (text content, etc.)
          if (line.trim()) outputLines.push(line);
          continue;
        }

        const indent = m[1];
        const role = m[2];
        const name = m[3] ?? "";
        const interactive = interactiveRoles.has(role);

        if (interactiveOnly && !interactive) continue;

        refCount++;
        const ref = `@e${refCount}`;
        refs.set(ref, {
          role,
          name,
          index: refCount,
          selector: `[role="${role}"][name="${name}"]`,
        });
        outputLines.push(`${indent}${ref} [${role}] "${name}"`);
      }

      return outputLines.join("\n");
    }

    // ------ Inspection ------

    case "console": {
      const errorsOnly = args.includes("--errors");
      const msgs = errorsOnly
        ? consoleMessages.filter(
            (m) => m.startsWith("[error]") || m.startsWith("[warning]"),
          )
        : consoleMessages;
      return msgs.length > 0 ? msgs.join("\n") : "No console messages";
    }

    case "network": {
      return networkErrors.length > 0
        ? networkErrors.join("\n")
        : "No network errors";
    }

    case "is": {
      const prop = args[0];
      const sel = args[1];
      if (!prop || !sel)
        throw new Error("Usage: is PROP SELECTOR");
      const el = resolveSelector(sel);
      let result: boolean;
      switch (prop) {
        case "visible":
          result = await el.isVisible();
          break;
        case "hidden":
          result = await el.isHidden();
          break;
        case "enabled":
          result = await el.isEnabled();
          break;
        case "disabled":
          result = await el.isDisabled();
          break;
        case "checked":
          result = await el.isChecked();
          break;
        default:
          throw new Error(
            `Unknown property: ${prop}. Use visible|hidden|enabled|disabled|checked`,
          );
      }
      return result ? "true" : "false";
    }

    case "js": {
      const expr = args.join(" ");
      if (!expr) throw new Error("Usage: js EXPRESSION");
      const result = await page.evaluate(expr);
      return String(result);
    }

    case "wait": {
      const target = args[0];
      if (!target) throw new Error("Usage: wait SELECTOR | --networkidle | --load");
      if (target === "--networkidle") {
        await page.waitForLoadState("networkidle");
      } else if (target === "--load") {
        await page.waitForLoadState("load");
      } else {
        await page.waitForSelector(target, { timeout: 15_000 });
      }
      return "Done";
    }

    // ------ Tab management ------

    case "tabs": {
      const pages = context.pages();
      return pages.map((p, i) => `${i}: ${p.url()}`).join("\n");
    }

    case "newtab": {
      const p = await context.newPage();
      if (args[0]) {
        await p.goto(args[0], { waitUntil: "domcontentloaded", timeout: 15_000 });
      }
      page = p;
      attachPageListeners(page);
      return `Opened new tab${args[0] ? ` at ${args[0]}` : ""} (now active)`;
    }

    case "closetab": {
      const pages = context.pages();
      const index = args[0] !== undefined ? parseInt(args[0], 10) : pages.length - 1;
      if (index < 0 || index >= pages.length)
        throw new Error(`Tab index ${index} out of range (0-${pages.length - 1})`);
      const closing = pages[index];
      await closing.close();
      // Switch to the last remaining tab.
      const remaining = context.pages();
      if (remaining.length > 0) {
        page = remaining[Math.min(index, remaining.length - 1)];
      }
      return `Closed tab ${index}. Active tab: ${page.url()}`;
    }

    case "tab": {
      const index = parseInt(args[0], 10);
      const pages = context.pages();
      if (isNaN(index) || index < 0 || index >= pages.length)
        throw new Error(`Tab index ${index} out of range (0-${pages.length - 1})`);
      page = pages[index];
      return `Switched to tab ${index}: ${page.url()}`;
    }

    // ------ Interaction (additional) ------

    case "hover": {
      const sel = args[0];
      if (!sel) throw new Error("Usage: hover SELECTOR");
      const el = resolveSelector(sel);
      await el.hover();
      return `Hovered ${sel}`;
    }

    case "press": {
      const key = args[0];
      if (!key) throw new Error("Usage: press KEY (e.g. Enter, Tab, Escape, ArrowUp)");
      await page.keyboard.press(key);
      return `Pressed ${key}`;
    }

    case "type": {
      const text = args.join(" ");
      if (!text) throw new Error("Usage: type TEXT");
      await page.keyboard.type(text);
      return `Typed "${text}"`;
    }

    case "upload": {
      const sel = args[0];
      if (!sel || args.length < 2) throw new Error("Usage: upload SELECTOR FILE [FILE2...]");
      const files = args.slice(1);
      await page.setInputFiles(sel, files);
      return `Uploaded ${files.length} file(s) to ${sel}`;
    }

    case "viewport": {
      const spec = args[0];
      if (!spec) throw new Error("Usage: viewport WxH (e.g. 1280x720)");
      const match = spec.match(/^(\d+)x(\d+)$/);
      if (!match) throw new Error("Invalid format. Use WxH, e.g. 1280x720");
      const width = parseInt(match[1], 10);
      const height = parseInt(match[2], 10);
      await page.setViewportSize({ width, height });
      return `Viewport set to ${width}x${height}`;
    }

    // ------ Dialog handling ------

    case "dialog-accept": {
      const text = args.length > 0 ? args.join(" ") : undefined;
      page.once("dialog", async (d) => {
        dialogMessages.push(`[${d.type()}] ${d.message()} -> accepted`);
        await d.accept(text);
      });
      return `Will auto-accept next dialog${text ? ` with "${text}"` : ""}`;
    }

    case "dialog-dismiss": {
      page.once("dialog", async (d) => {
        dialogMessages.push(`[${d.type()}] ${d.message()} -> dismissed`);
        await d.dismiss();
      });
      return "Will auto-dismiss next dialog";
    }

    case "dialog": {
      if (args.includes("--clear")) {
        const count = dialogMessages.length;
        dialogMessages = [];
        return `Cleared ${count} dialog message(s)`;
      }
      return dialogMessages.length > 0
        ? dialogMessages.join("\n")
        : "No dialog messages captured";
    }

    // ------ Cookie management ------

    case "cookies": {
      const cookies = await context.cookies();
      return JSON.stringify(cookies, null, 2);
    }

    case "cookie": {
      const spec = args[0];
      if (!spec) throw new Error("Usage: cookie NAME=VALUE");
      const eqIdx = spec.indexOf("=");
      if (eqIdx === -1) throw new Error("Usage: cookie NAME=VALUE");
      const name = spec.slice(0, eqIdx);
      const value = spec.slice(eqIdx + 1);
      const url = page.url();
      await context.addCookies([{ name, value, url }]);
      return `Cookie "${name}" set for ${url}`;
    }

    case "cookie-import": {
      const filePath = args[0];
      if (!filePath) throw new Error("Usage: cookie-import JSON_PATH");
      const raw = readFileSync(filePath, "utf-8");
      const cookies = JSON.parse(raw);
      if (!Array.isArray(cookies)) throw new Error("JSON file must contain an array of cookies");
      await context.addCookies(cookies);
      return `Imported ${cookies.length} cookie(s) from ${filePath}`;
    }

    case "cookie-import-browser": {
      // Import cookies directly from a local Chromium-based browser's SQLite DB.
      // args[0] = browser name (optional, default: auto-detect first available)
      // --domain .example.com (optional, filter cookies by domain)
      const browserName =
        args[0] && !args[0].startsWith("--") ? args[0] : "auto";
      const domainIdx = args.indexOf("--domain");
      const domain = domainIdx >= 0 ? args[domainIdx + 1] : undefined;

      const home = process.env.HOME || "";
      const browserPaths: Record<string, string> = {
        chrome: `${home}/Library/Application Support/Google/Chrome/Default/Cookies`,
        brave: `${home}/Library/Application Support/BraveSoftware/Brave-Browser/Default/Cookies`,
        arc: `${home}/Library/Application Support/Arc/User Data/Default/Cookies`,
        edge: `${home}/Library/Application Support/Microsoft Edge/Default/Cookies`,
      };

      // Detect which browsers have a Cookies database on disk.
      const available = Object.entries(browserPaths).filter(([, p]) =>
        existsSync(p),
      );
      if (available.length === 0) {
        return "No supported Chromium browsers found. Looked for: Chrome, Brave, Arc, Edge.";
      }

      // Select the target browser.
      let selectedName: string;
      let selectedPath: string;
      if (browserName === "auto") {
        selectedName = available[0][0];
        selectedPath = available[0][1];
      } else {
        const match = available.find(
          ([name]) => name === browserName.toLowerCase(),
        );
        if (!match) {
          return `Browser not found: ${browserName}. Available: ${available.map((a) => a[0]).join(", ")}`;
        }
        selectedName = match[0];
        selectedPath = match[1];
      }

      // Copy the Cookies DB to /tmp — browsers hold a write-lock on it.
      const tmpDb = `/tmp/apex-cookies-${Date.now()}.db`;
      try {
        copyFileSync(selectedPath, tmpDb);
      } catch (copyErr: unknown) {
        const msg =
          copyErr instanceof Error ? copyErr.message : String(copyErr);
        return `Failed to copy Cookies database (is the browser running with a lock?): ${msg}`;
      }

      try {
        // Bun ships built-in SQLite via bun:sqlite — no extra dependency.
        const { Database } = await import("bun:sqlite" as any);
        const db = new (Database as any)(tmpDb, { readonly: true });

        // Query cookies. On macOS Chrome encrypts most cookie values into
        // `encrypted_value` via Keychain. Rows where `value` is non-empty
        // are plaintext session cookies we can use; encrypted-only rows are
        // skipped with a warning.
        let query =
          "SELECT host_key, name, value, encrypted_value, path, is_secure, expires_utc FROM cookies";
        if (domain) {
          query += ` WHERE host_key LIKE '%${domain.replace(/'/g, "''")}%'`;
        }

        const rows = (db as any).prepare(query).all() as any[];
        (db as any).close();

        if (rows.length === 0) {
          return `No cookies found in ${selectedName}${domain ? ` for domain ${domain}` : ""}`;
        }

        // Separate usable (plaintext value) vs encrypted-only rows.
        const usable = rows.filter(
          (r: any) => r.value && r.value.length > 0,
        );
        const encryptedCount = rows.length - usable.length;

        if (usable.length === 0) {
          return (
            `Found ${rows.length} cookies in ${selectedName} but all values are encrypted. ` +
            `Chrome on macOS encrypts cookie values via Keychain; only session cookies with ` +
            `plaintext values can be imported. Try exporting cookies from the browser DevTools instead.`
          );
        }

        // Convert to Playwright cookie format.
        // Chrome stores expires_utc as microseconds since 1601-01-01 (Windows epoch).
        const WINDOWS_EPOCH_OFFSET = 11644473600n; // seconds between 1601 and 1970
        const cookies = usable.map((r: any) => {
          let expires = -1;
          if (r.expires_utc && BigInt(r.expires_utc) > 0n) {
            expires = Number(
              BigInt(r.expires_utc) / 1000000n - WINDOWS_EPOCH_OFFSET,
            );
          }
          return {
            name: r.name as string,
            value: r.value as string,
            domain: r.host_key as string,
            path: (r.path as string) || "/",
            secure: r.is_secure === 1,
            httpOnly: false,
            expires,
          };
        });

        await context.addCookies(cookies);

        let result = `Imported ${cookies.length} cookie(s) from ${selectedName}`;
        if (domain) result += ` (domain filter: ${domain})`;
        if (encryptedCount > 0) {
          result += `\nNote: skipped ${encryptedCount} encrypted cookie(s). Chrome on macOS encrypts values via Keychain; only plaintext session cookies were imported.`;
        }
        return result;
      } finally {
        // Clean up temp copy.
        try {
          unlinkSync(tmpDb);
        } catch {
          // best effort
        }
      }
    }

    // ------ Inspection (additional) ------

    case "attrs": {
      const sel = args[0];
      if (!sel) throw new Error("Usage: attrs SELECTOR");
      const el = resolveSelector(sel);
      const attributes = await el.evaluate((node: Element) => {
        const result: Record<string, string> = {};
        for (const attr of node.attributes) {
          result[attr.name] = attr.value;
        }
        return result;
      });
      return JSON.stringify(attributes, null, 2);
    }

    case "css": {
      const sel = args[0];
      const prop = args[1];
      if (!sel || !prop) throw new Error("Usage: css SELECTOR PROPERTY");
      const el = resolveSelector(sel);
      const value = await el.evaluate(
        (node: Element, p: string) => getComputedStyle(node).getPropertyValue(p),
        prop,
      );
      return value;
    }

    case "storage": {
      if (args[0] === "set") {
        const key = args[1];
        const value = args.slice(2).join(" ");
        if (!key) throw new Error("Usage: storage set KEY VALUE");
        await page.evaluate(
          ([k, v]) => localStorage.setItem(k, v),
          [key, value],
        );
        return `localStorage["${key}"] = "${value}"`;
      }
      const data = await page.evaluate(() => {
        const ls: Record<string, string | null> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!;
          ls[k] = localStorage.getItem(k);
        }
        const ss: Record<string, string | null> = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i)!;
          ss[k] = sessionStorage.getItem(k);
        }
        return { localStorage: ls, sessionStorage: ss };
      });
      return JSON.stringify(data, null, 2);
    }

    case "perf": {
      const timing = await page.evaluate(() => {
        const t = performance.timing;
        return {
          dns: t.domainLookupEnd - t.domainLookupStart,
          tcp: t.connectEnd - t.connectStart,
          ttfb: t.responseStart - t.requestStart,
          download: t.responseEnd - t.responseStart,
          domParse: t.domInteractive - t.domLoading,
          domReady: t.domContentLoadedEventEnd - t.navigationStart,
          fullLoad: t.loadEventEnd - t.navigationStart,
        };
      });
      return Object.entries(timing)
        .map(([k, v]) => `${k}: ${v}ms`)
        .join("\n");
    }

    case "eval": {
      const filePath = args[0];
      if (!filePath) throw new Error("Usage: eval FILE");
      const content = readFileSync(filePath, "utf-8");
      const result = await page.evaluate(content);
      return result !== undefined ? String(result) : "undefined";
    }

    // ------ Visual (additional) ------

    case "pdf": {
      const path = args[0] || ".apex/output/page.pdf";
      await page.pdf({ path });
      return `PDF saved to ${path}`;
    }

    case "diff": {
      const url1 = args[0];
      const url2 = args[1];
      if (!url1 || !url2) throw new Error("Usage: diff URL1 URL2");
      await page.goto(url1, { waitUntil: "domcontentloaded", timeout: 15_000 });
      const text1 = (await page.textContent("body")) || "";
      await page.goto(url2, { waitUntil: "domcontentloaded", timeout: 15_000 });
      const text2 = (await page.textContent("body")) || "";
      const lines1 = text1.split("\n");
      const lines2 = text2.split("\n");
      const diffLines: string[] = [];
      const maxLen = Math.max(lines1.length, lines2.length);
      for (let i = 0; i < maxLen; i++) {
        const a = lines1[i] ?? "";
        const b = lines2[i] ?? "";
        if (a !== b) {
          diffLines.push(`L${i + 1}:`);
          if (a) diffLines.push(`  - ${a}`);
          if (b) diffLines.push(`  + ${b}`);
        }
      }
      return diffLines.length > 0 ? diffLines.join("\n") : "No differences found";
    }

    // ------ Network (additional) ------

    case "header": {
      const spec = args.join(" ");
      if (!spec || !spec.includes(":"))
        throw new Error("Usage: header NAME:VALUE");
      const colonIdx = spec.indexOf(":");
      const name = spec.slice(0, colonIdx).trim();
      const value = spec.slice(colonIdx + 1).trim();
      // Merge with any existing extra headers.
      const existing =
        (await page.evaluate(() => (window as any).__apexExtraHeaders)) || {};
      existing[name] = value;
      await context.setExtraHTTPHeaders(existing);
      await page.evaluate(
        (h: Record<string, string>) => {
          (window as any).__apexExtraHeaders = h;
        },
        existing,
      );
      return `Header set: ${name}: ${value}`;
    }

    case "useragent": {
      const ua = args.join(" ");
      if (!ua) throw new Error("Usage: useragent STRING");
      // Create a new context with the desired user agent, preserving cookies.
      const cookies = await context.cookies();
      const oldViewport = page.viewportSize() || { width: 1280, height: 720 };
      const newContext = await browser.newContext({
        userAgent: ua,
        viewport: oldViewport,
      });
      const newPage = await newContext.newPage();
      await newContext.addCookies(cookies);
      // Navigate the new page to the current URL.
      const currentUrl = page.url();
      if (currentUrl && currentUrl !== "about:blank") {
        await newPage.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
      }
      // Close old context, swap references.
      await context.close();
      context = newContext;
      page = newPage;
      attachPageListeners(page);
      return `User agent set to: ${ua}`;
    }

    // ------ Meta ------

    case "chain": {
      // Read JSON array of commands from stdin or args.
      // Format: [["cmd1", "arg1", "arg2"], ["cmd2", "arg1"]]
      const input = args.join(" ");
      if (!input) throw new Error("Usage: chain JSON_ARRAY (e.g. [[\"goto\",\"url\"],[\"text\"]])");
      const commands: string[][] = JSON.parse(input);
      if (!Array.isArray(commands)) throw new Error("chain expects a JSON array of command arrays");
      const results: string[] = [];
      for (const entry of commands) {
        const [subcmd, ...subargs] = entry;
        const r = await handleCommand(subcmd, subargs);
        results.push(`[${subcmd}] ${r}`);
      }
      return results.join("\n---\n");
    }

    case "frame": {
      const sel = args[0];
      if (!sel) {
        activeFrame = null;
        return "Switched back to main frame";
      }
      activeFrame = page.frameLocator(sel);
      return `Switched to iframe: ${sel}`;
    }

    // ------ Passive observation ------

    case "watch": {
      if (args[0] === "stop") {
        if (watchTimer) {
          clearInterval(watchTimer);
          watchTimer = null;
        }
        return "Watch mode stopped";
      }
      const intervalSec = parseInt(args[0]) || 10;
      if (watchTimer) clearInterval(watchTimer);
      watchTimer = setInterval(async () => {
        const snap = await page
          .locator("body")
          .ariaSnapshot({ timeout: 5000 })
          .catch(() => "");
        pushActivity({
          id: ++activityId,
          ts: new Date().toISOString(),
          command: "watch-snapshot",
          args: [],
          ok: true,
          result: snap.slice(0, 200),
        });
      }, intervalSec * 1000);
      return `Watch mode: snapshot every ${intervalSec}s. Run 'watch stop' to end.`;
    }

    // ------ Browser state save/load ------

    case "state": {
      const verb = args[0]; // save or load
      const name = args[1] || "default";
      const stateFile = `.apex/browser-state/${name}.json`;

      if (verb === "save") {
        const cookies = await context.cookies();
        const urls = context.pages().map((p) => p.url());
        await writeJSON(stateFile, {
          cookies,
          urls,
          savedAt: new Date().toISOString(),
        });
        return `Saved state "${name}" (${cookies.length} cookies, ${urls.length} tabs)`;
      }

      if (verb === "load") {
        const data = await readJSON<{
          cookies: any[];
          urls: string[];
          savedAt: string;
        } | null>(stateFile, null);
        if (!data) return `No saved state "${name}"`;
        await context.addCookies(data.cookies);
        // Restore tabs.
        for (const url of data.urls.slice(1)) {
          const p = await context.newPage();
          await p
            .goto(url, { waitUntil: "domcontentloaded" })
            .catch(() => {});
        }
        if (data.urls[0]) {
          await page
            .goto(data.urls[0], { waitUntil: "domcontentloaded" })
            .catch(() => {});
        }
        return `Loaded state "${name}" (${data.cookies.length} cookies, ${data.urls.length} tabs)`;
      }

      return "Usage: state save|load NAME";
    }

    // ------ Inbox (messages from sidebar/extension) ------

    case "inbox": {
      if (args[0] === "--clear") {
        inboxMessages.length = 0;
        return "Inbox cleared";
      }
      return inboxMessages.length > 0
        ? inboxMessages.join("\n")
        : "No messages";
    }

    // ------ Connect Chrome (headed mode with extension) ------

    case "connect": {
      // Close current headless browser and relaunch as headed with extension
      const currentUrl = page.url();
      const currentCookies = await context.cookies();
      await browser.close();

      const extensionPath = join(process.cwd(), "extension");
      const profilePath = join(process.cwd(), ".apex/browser-state/chrome-profile");

      context = await chromium.launchPersistentContext(profilePath, {
        headless: false,
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
        ],
        viewport: { width: 1280, height: 720 },
      });

      page = context.pages()[0] || await context.newPage();
      attachPageListeners(page);

      // Restore cookies and navigate to previous URL
      if (currentCookies.length > 0) {
        await context.addCookies(currentCookies);
      }
      if (currentUrl && currentUrl !== "about:blank") {
        await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
      }

      // Store port info for the extension to read
      await page.evaluate((p: number) => {
        try { localStorage.setItem("apex_port", String(p)); } catch {}
      }, serverPort);

      isHeadedMode = true;
      // Note: browser variable is not used for persistent context; context is the root
      browser = null as any;
      return "Launched headed Chrome with Apex Side Panel extension";
    }

    case "disconnect": {
      // Close headed browser and relaunch as headless
      const currentUrl = page.url();
      const currentCookies = await context.cookies();
      await context.close();

      browser = await chromium.launch({ headless: true });
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      page = await context.newPage();
      attachPageListeners(page);

      // Restore cookies and navigate to previous URL
      if (currentCookies.length > 0) {
        await context.addCookies(currentCookies);
      }
      if (currentUrl && currentUrl !== "about:blank") {
        await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
      }

      isHeadedMode = false;
      return "Switched back to headless mode";
    }

    case "focus": {
      // Bring the headed browser window to front
      if (!isHeadedMode) return "Not in headed mode. Run 'connect' first.";
      await page.bringToFront();
      return "Browser window brought to front";
    }

    case "handoff": {
      // Pause automation — user takes manual control of the headed browser.
      // Returns current state so it can be resumed later.
      if (!isHeadedMode) return "Not in headed mode. Run 'connect' first.";
      const state = {
        url: page.url(),
        title: await page.title(),
        refs: refs.size,
      };
      return `Handoff: browser at "${state.title}" (${state.url}), ${state.refs} refs. User has manual control. Use "resume" when done.`;
    }

    case "resume": {
      // Resume automation after handoff — re-read current page state.
      if (!isHeadedMode) return "Not in headed mode. Run 'connect' first.";
      const url = page.url();
      const title = await page.title();
      refs.clear();
      return `Resumed automation. Page: "${title}" (${url}). Refs cleared — run "snapshot" to rebuild.`;
    }

    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}

// ---------------------------------------------------------------------------
// Selector resolution — @e refs or raw CSS
// ---------------------------------------------------------------------------

function resolveSelector(sel: string) {
  if (sel.startsWith("@e")) {
    const ref = refs.get(sel);
    if (!ref) throw new Error(`Unknown ref: ${sel}. Run "snapshot" first.`);
    return page.getByRole(ref.role as Parameters<Page["getByRole"]>[0], {
      name: ref.name,
    });
  }
  return page.locator(sel);
}

// ---------------------------------------------------------------------------
// Attach standard listeners to a new page (used after newtab / useragent).
// ---------------------------------------------------------------------------

function attachPageListeners(p: Page) {
  p.on("console", (msg) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    if (consoleMessages.length > MAX_LOG_LINES) consoleMessages.shift();
  });
  p.on("requestfailed", (req) => {
    networkErrors.push(
      `${req.method()} ${req.url()} ${req.failure()?.errorText}`,
    );
    if (networkErrors.length > MAX_LOG_LINES) networkErrors.shift();
  });
  p.on("dialog", async (d) => {
    dialogMessages.push(`[${d.type()}] ${d.message()}`);
    await d.accept();
  });
}
