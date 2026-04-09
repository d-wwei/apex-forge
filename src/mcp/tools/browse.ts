/**
 * Apex Forge — MCP Browse Proxy Tools
 *
 * Registers browser automation tools that proxy commands to the browse daemon
 * provided by the browser-qa-testing companion skill. The daemon manages a
 * Playwright browser instance.
 *
 * Commands: goto, snapshot, click, fill, screenshot, text, html, links, console, is
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Daemon communication
// ---------------------------------------------------------------------------

interface ServerState {
  pid: number;
  port: number;
  token: string;
  startedAt: string;
  mode?: string;
}

const BROWSE_JSON = ".apex/browse.json";

function readState(): ServerState | null {
  try {
    const data = fs.readFileSync(BROWSE_JSON, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function ensureDaemon(): Promise<ServerState> {
  const info = readState();
  if (!info) {
    throw new Error(
      "Browse daemon is not running. Start it with: browse goto <url> (provided by browser-qa-testing skill)",
    );
  }
  // Quick health check (no auth required on /health)
  try {
    const resp = await fetch(`http://127.0.0.1:${info.port}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) throw new Error("unhealthy");
    const health = await resp.json() as any;
    if (health.status !== "healthy") throw new Error("unhealthy");
  } catch {
    throw new Error(
      "Browse daemon is not responding. Restart with: browse goto <url> (provided by browser-qa-testing skill)",
    );
  }
  return info;
}

async function sendCommand(
  info: ServerState,
  command: string,
  args: string[],
): Promise<string> {
  const resp = await fetch(`http://127.0.0.1:${info.port}/command`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${info.token}`,
    },
    body: JSON.stringify({ command, args }),
    signal: AbortSignal.timeout(30000),
  });

  const text = await resp.text();
  if (!resp.ok) {
    // Try to parse as JSON error
    try {
      const err = JSON.parse(text);
      throw new Error(err.error || `Browse command "${command}" failed`);
    } catch (e) {
      if (e instanceof Error && e.message.includes("Browse command")) throw e;
      throw new Error(text || `Browse command "${command}" failed`);
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerBrowseTools(server: McpServer) {
  // ── goto ────────────────────────────────────────────────────────────────
  server.tool(
    "apex_browse_goto",
    "Navigate browser to a URL",
    { url: z.string() },
    async ({ url }) => {
      try {
        const info = await ensureDaemon();
        const result = await sendCommand(info, "goto", [url]);
        return ok(result || `Navigated to ${url}`);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── snapshot ────────────────────────────────────────────────────────────
  server.tool(
    "apex_browse_snapshot",
    "Get an accessibility snapshot of the current page (assigns @ref aliases)",
    {},
    async () => {
      try {
        const info = await ensureDaemon();
        const result = await sendCommand(info, "snapshot", []);
        return ok(result || "(empty snapshot)");
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── click ───────────────────────────────────────────────────────────────
  server.tool(
    "apex_browse_click",
    "Click an element by @ref alias or CSS selector",
    { target: z.string() },
    async ({ target }) => {
      try {
        const info = await ensureDaemon();
        const result = await sendCommand(info, "click", [target]);
        return ok(result || `Clicked ${target}`);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── fill ────────────────────────────────────────────────────────────────
  server.tool(
    "apex_browse_fill",
    "Fill an input element with text (target by @ref alias or CSS selector)",
    { target: z.string(), value: z.string() },
    async ({ target, value }) => {
      try {
        const info = await ensureDaemon();
        const result = await sendCommand(info, "fill", [target, value]);
        return ok(result || `Filled ${target}`);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── screenshot ──────────────────────────────────────────────────────────
  server.tool(
    "apex_browse_screenshot",
    "Take a screenshot of the current page (returns base64 PNG)",
    {},
    async () => {
      try {
        const info = await ensureDaemon();
        const result = await sendCommand(info, "screenshot", []);
        return ok(result);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── text ────────────────────────────────────────────────────────────────
  server.tool(
    "apex_browse_text",
    "Get the visible text content of the current page or a specific element",
    { selector: z.string().optional() },
    async ({ selector }) => {
      try {
        const info = await ensureDaemon();
        const args = selector ? [selector] : [];
        const result = await sendCommand(info, "text", args);
        return ok(result || "(no text)");
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── html ────────────────────────────────────────────────────────────────
  server.tool(
    "apex_browse_html",
    "Get the outer HTML of the page or a specific element",
    { selector: z.string().optional() },
    async ({ selector }) => {
      try {
        const info = await ensureDaemon();
        const args = selector ? [selector] : [];
        const result = await sendCommand(info, "html", args);
        return ok(result || "(no html)");
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── links ───────────────────────────────────────────────────────────────
  server.tool(
    "apex_browse_links",
    "List all links on the current page",
    {},
    async () => {
      try {
        const info = await ensureDaemon();
        const result = await sendCommand(info, "links", []);
        return ok(result || "(no links)");
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── console ─────────────────────────────────────────────────────────────
  server.tool(
    "apex_browse_console",
    "Get recent browser console messages",
    {},
    async () => {
      try {
        const info = await ensureDaemon();
        const result = await sendCommand(info, "console", []);
        return ok(result || "(no console messages)");
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── is (assertion) ─────────────────────────────────────────────────────
  server.tool(
    "apex_browse_is",
    "Assert a condition on the page (e.g. 'visible .login-btn', 'title Login Page')",
    { assertion: z.string() },
    async ({ assertion }) => {
      try {
        const info = await ensureDaemon();
        const result = await sendCommand(info, "is", [assertion]);
        return ok(result || `Assertion passed: ${assertion}`);
      } catch (e) {
        return err(e);
      }
    },
  );
}
