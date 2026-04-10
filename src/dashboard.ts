#!/usr/bin/env bun

import { readJSON } from "./utils/json.js";
import { existsSync, readFileSync } from "fs";
import { join, resolve, extname } from "path";
import {
  autoPort,
  hubPort,
  register,
  unregister,
  listProjects,
} from "./registry.js";

/** Human-readable relative time string. */
function timeAgo(iso: string): string {
  if (!iso) return "unknown";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hrs ago`;
  const days = Math.floor(hrs / 24);
  return `${days} days ago`;
}

/** Derive a human-readable project name from the working directory. */
function getProjectName(dir: string): string {
  // Try reading name from package.json
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name;
    } catch { /* ignore */ }
  }
  // Try reading name from .apex/config.yaml (project_name: xxx)
  const configPath = join(dir, ".apex", "config.yaml");
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      const match = content.match(/^project_name:\s*(.+)$/m);
      if (match) return match[1].trim();
    } catch { /* ignore */ }
  }
  // Fallback: directory basename
  return dir.split("/").filter(Boolean).pop() || "unknown-project";
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function findFrontendDir(): string | null {
  const candidates = [
    // 1. Explicit override via env var
    process.env.APEX_FORGE_HOME && join(process.env.APEX_FORGE_HOME, "frontend"),
    // 2. Relative to this source file (works in dev: bun run src/cli.ts)
    resolve(import.meta.dir, "..", "frontend"),
    // 3. Relative to compiled binary (dist/apex-forge → dist/../frontend)
    resolve(import.meta.dir, "frontend"),
    // 4. Relative to working directory (compiled binary run from project root)
    join(process.cwd(), "frontend"),
    // 5. Well-known global install path
    join(process.env.HOME || "/tmp", ".apex-forge", "frontend"),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  return null;
}

export async function startDashboard(portOverride?: number) {
  const frontendDir = findFrontendDir();
  const projectDir = process.cwd();
  const projectName = getProjectName(projectDir);
  const port = portOverride ?? autoPort(projectDir);

  if (!frontendDir) {
    console.warn(
      "Frontend assets not found. Searched:\n" +
      "  - $APEX_FORGE_HOME/frontend\n" +
      "  - <source-dir>/../frontend\n" +
      "  - ~/.apex-forge/frontend\n" +
      "Falling back to legacy inline dashboard."
    );
  }

  // Register in shared registry
  register({
    name: projectName,
    path: projectDir,
    port,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  // Cleanup on exit
  const cleanup = () => { try { unregister(projectDir); } catch {} };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // API: state payload (includes project context)
      if (url.pathname === "/api/state") {
        const data = await buildStatePayload(projectDir, projectName);
        return Response.json(data);
      }

      // API: all active projects (for sidebar + hub), enriched with .apex/ state
      if (url.pathname === "/api/projects") {
        const projects = listProjects();
        const enriched = await Promise.all(
          projects.map(async (p) => {
            const apexDir = join(p.path, ".apex");
            const tasks = await readJSON(join(apexDir, "tasks.json"), { tasks: [] as any[], next_id: 1 });
            const state = await readJSON(join(apexDir, "state.json"), {
              current_stage: "idle",
              last_updated: "",
              artifacts: {},
              history: [],
            });
            const taskCount = tasks.tasks.length;
            const doneTasks = tasks.tasks.filter((t: any) => t.status === "done").length;
            const successRate = taskCount > 0 ? Math.round(doneTasks / taskCount * 1000) / 10 : 0;
            const stage = (state as any).current_stage || "idle";
            return {
              ...p,
              status: stage !== "idle" ? "running" : "active",
              description: `Stage: ${stage} | ${taskCount} tasks`,
              task_count: taskCount,
              success_rate: successRate,
              last_active: timeAgo((state as any).last_updated || p.startedAt),
            };
          })
        );
        return Response.json({
          current: projectDir,
          hub: hubPort(),
          projects: enriched,
        });
      }

      // API: server-sent events
      if (url.pathname === "/api/events") {
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const interval = setInterval(async () => {
              try {
                const data = await buildStatePayload(projectDir, projectName);
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
                );
              } catch {
                // Ignore encoding errors on closed streams
              }
            }, 2000);
            req.signal.addEventListener("abort", () => clearInterval(interval));
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      // Serve static frontend — or fallback to legacy inline HTML
      if (!frontendDir) {
        if (url.pathname === "/" || url.pathname === "/index.html") {
          return new Response(_buildHTMLLegacy(), {
            headers: { "Content-Type": "text/html" },
          });
        }
        return new Response("Not Found", { status: 404 });
      }

      let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
      const safePath = join(frontendDir, filePath.replace(/\.\./g, ""));
      if (existsSync(safePath)) {
        const ext = extname(safePath);
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        const content = readFileSync(safePath);
        return new Response(content, {
          headers: { "Content-Type": contentType },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`Apex Dashboard for "${projectName}" at http://localhost:${port}`);
  console.log(`  Project: ${projectDir}`);
  console.log(`  Hub:     http://localhost:${hubPort()}`);

  // Auto-open in default browser
  try {
    const { exec } = await import("child_process");
    const cmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    exec(`${cmd} http://localhost:${port}`);
  } catch {
    // Silently ignore if browser open fails
  }
}

/**
 * Hub server — fixed port, lists all active project dashboards.
 */
export async function startHub() {
  const port = hubPort();

  Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/api/projects") {
        return Response.json({ projects: listProjects() });
      }

      // Inline hub page
      return new Response(buildHubHTML(), {
        headers: { "Content-Type": "text/html" },
      });
    },
  });

  console.log(`Apex Hub at http://localhost:${port}`);

  try {
    const { exec } = await import("child_process");
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    exec(`${cmd} http://localhost:${port}`);
  } catch {}
}

function buildHubHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>APEX FORGE — Hub</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&family=Inter:wght@400;500;600&family=Fira+Code:wght@400&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-main: #10141a; --bg-card: #181c22; --bg-deep: #0a0e14;
    --text-primary: #dfe2eb; --text-secondary: rgba(223,226,235,0.6); --text-muted: rgba(223,226,235,0.4); --text-dim: rgba(223,226,235,0.2);
    --accent-gold: #f0c040; --accent-gold-light: #ffdf96; --accent-gold-bg: rgba(255,223,150,0.1);
    --accent-green: #22c55e; --accent-green-bg: rgba(34,197,94,0.1);
    --border-gold: rgba(240,192,64,0.2); --border-default: rgba(78,70,53,0.2);
    --font-heading: 'Space Grotesk', sans-serif; --font-body: 'Inter', sans-serif; --font-mono: 'Fira Code', monospace;
  }
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--font-body); background: var(--bg-deep);
    color: var(--text-primary); min-height: 100vh;
    display: flex; flex-direction: column; align-items: center;
    -webkit-font-smoothing: antialiased;
  }

  /* --- Glow background --- */
  body::before {
    content: ''; position: fixed; top: -120px; left: 50%; transform: translateX(-50%);
    width: 600px; height: 400px;
    background: radial-gradient(ellipse, rgba(240,192,64,0.06) 0%, transparent 70%);
    pointer-events: none; z-index: 0;
  }

  /* --- Header --- */
  .hub-header {
    position: relative; z-index: 1;
    padding: 56px 0 12px; text-align: center;
  }
  .hub-logo {
    width: 48px; height: 48px; margin: 0 auto 16px;
    border-radius: 12px; background: var(--accent-gold-bg);
    border: 1px solid var(--border-gold);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 24px rgba(240,192,64,0.15);
  }
  .hub-logo svg { color: var(--accent-gold); }
  .hub-title {
    font-family: var(--font-heading); font-size: 24px; font-weight: 700;
    color: var(--accent-gold); letter-spacing: 3px;
  }
  .hub-subtitle {
    font-size: 11px; color: var(--text-muted); margin-top: 6px;
    text-transform: uppercase; letter-spacing: 2px;
  }
  .hub-divider {
    width: 40px; height: 1px; background: var(--border-gold);
    margin: 20px auto 0;
  }

  /* --- Stats bar --- */
  .hub-stats {
    position: relative; z-index: 1;
    display: flex; gap: 32px; justify-content: center;
    padding: 20px 0 32px;
  }
  .hub-stat {
    text-align: center;
  }
  .hub-stat-value {
    font-family: var(--font-heading); font-size: 28px; font-weight: 700;
    color: var(--text-primary);
  }
  .hub-stat-value.gold { color: var(--accent-gold); }
  .hub-stat-label {
    font-size: 10px; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 1px; margin-top: 2px;
  }

  /* --- Project grid --- */
  .project-grid {
    position: relative; z-index: 1;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 14px; padding: 0 32px; max-width: 1100px; width: 100%;
  }

  /* --- Project card --- */
  .project-card {
    background: var(--bg-card); border: 1px solid var(--border-default);
    border-radius: 10px; padding: 20px 22px;
    cursor: pointer; transition: all 0.2s ease;
    position: relative; overflow: hidden;
  }
  .project-card::before {
    content: ''; position: absolute; top: 0; left: 0; bottom: 0;
    width: 3px; background: var(--accent-gold);
    border-radius: 3px 0 0 3px;
  }
  .project-card:hover {
    border-color: rgba(240,192,64,0.3);
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(240,192,64,0.1);
  }

  .card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .card-name {
    font-family: var(--font-heading); font-size: 15px; font-weight: 700;
    color: var(--text-primary); letter-spacing: 0.3px;
  }
  .card-badge {
    display: flex; align-items: center; gap: 5px;
    padding: 3px 10px; border-radius: 20px;
    background: var(--accent-green-bg); font-size: 10px;
    font-weight: 600; color: var(--accent-green);
    letter-spacing: 0.5px;
  }
  .card-badge-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--accent-green);
    animation: pulse 2s infinite;
  }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }

  .card-path {
    font-family: var(--font-mono); font-size: 11px;
    color: var(--text-muted); word-break: break-all;
    line-height: 1.5; margin-bottom: 14px;
  }

  .card-footer {
    display: flex; align-items: center; gap: 16px;
    padding-top: 12px; border-top: 1px solid var(--border-default);
    font-size: 11px; color: var(--text-muted);
  }
  .card-port {
    font-family: var(--font-mono); color: var(--accent-gold);
    font-weight: 600; font-size: 12px;
  }
  .card-arrow {
    margin-left: auto; color: var(--text-dim);
    transition: color 0.15s, transform 0.15s;
  }
  .project-card:hover .card-arrow { color: var(--accent-gold); transform: translateX(3px); }

  /* --- Empty state --- */
  .empty-state {
    position: relative; z-index: 1;
    text-align: center; padding: 48px 24px;
    max-width: 480px;
  }
  .empty-icon {
    width: 64px; height: 64px; margin: 0 auto 20px;
    border-radius: 16px; background: var(--bg-card);
    border: 1px dashed var(--border-gold);
    display: flex; align-items: center; justify-content: center;
  }
  .empty-icon svg { color: var(--text-dim); }
  .empty-title {
    font-family: var(--font-heading); font-size: 16px; font-weight: 700;
    color: var(--text-secondary); margin-bottom: 8px;
  }
  .empty-desc { font-size: 13px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.6; }
  .empty-cmd {
    display: inline-block; background: var(--bg-card);
    border: 1px solid var(--border-gold); border-radius: 8px;
    padding: 10px 20px; font-family: var(--font-mono);
    font-size: 13px; color: var(--accent-gold-light);
    letter-spacing: 0.3px;
  }
  .empty-cmd .prompt { color: var(--text-dim); }

  /* --- Footer --- */
  .hub-footer {
    position: relative; z-index: 1;
    margin-top: auto; padding: 32px 0 20px;
    font-size: 10px; color: var(--text-dim);
    letter-spacing: 1px; text-transform: uppercase;
  }
</style>
</head>
<body>

<div class="hub-header">
  <div class="hub-logo">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M2 17l10 5 10-5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  </div>
  <div class="hub-title">APEX FORGE</div>
  <div class="hub-subtitle">Project Command Center</div>
  <div class="hub-divider"></div>
</div>

<div class="hub-stats" id="stats">
  <div class="hub-stat"><div class="hub-stat-value gold" id="stat-count">--</div><div class="hub-stat-label">Active</div></div>
  <div class="hub-stat"><div class="hub-stat-value" id="stat-uptime">--</div><div class="hub-stat-label">Longest Up</div></div>
</div>

<div class="project-grid" id="grid"></div>

<div class="hub-footer">apex-forge v0.1.0</div>

<script>
async function load() {
  const grid = document.getElementById('grid');
  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    const projects = data.projects || [];

    // Stats
    document.getElementById('stat-count').textContent = projects.length || '0';
    if (projects.length > 0) {
      const oldest = projects.reduce((a, b) => a.startedAt < b.startedAt ? a : b);
      document.getElementById('stat-uptime').textContent = timeAgo(oldest.startedAt);
    } else {
      document.getElementById('stat-uptime').textContent = '--';
    }

    if (projects.length === 0) {
      grid.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>' +
          '<div class="empty-title">No Active Dashboards</div>' +
          '<div class="empty-desc">Start a project dashboard from any directory.<br>Each project gets its own auto-assigned port.</div>' +
          '<div class="empty-cmd"><span class="prompt">$ </span>cd your-project && apex dashboard</div>' +
        '</div>';
      return;
    }

    grid.innerHTML = projects.map(function(p) {
      var name = p.name || 'unknown';
      var shortPath = p.path.replace(/^\\/Users\\/[^/]+/, '~');
      var ago = timeAgo(p.startedAt);
      return '<div class="project-card" onclick="window.open(\\'http://localhost:' + p.port + '\\', \\'_blank\\')">' +
        '<div class="card-top">' +
          '<div class="card-name">' + esc(name) + '</div>' +
          '<div class="card-badge"><span class="card-badge-dot"></span>LIVE</div>' +
        '</div>' +
        '<div class="card-path">' + esc(shortPath) + '</div>' +
        '<div class="card-footer">' +
          '<span class="card-port">:' + p.port + '</span>' +
          '<span>' + ago + '</span>' +
          '<span class="card-arrow">&rarr;</span>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-title">Connection Error</div><div class="empty-desc">' + esc(e.message) + '</div></div>';
  }
}
function timeAgo(iso) {
  if (!iso) return '';
  var diff = Date.now() - new Date(iso).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ' + (mins % 60) + 'm';
  return Math.floor(hrs / 24) + 'd';
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
load();
setInterval(load, 5000);
</script>
</body>
</html>`;
}

function loadJSONL(filePath: string): any[] {
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function loadEvents(apexDir: string) {
  // Merge two sources: hook-written events + legacy telemetry analytics
  const hookEvents = loadJSONL(join(apexDir, "events.jsonl"));
  const legacyAnalytics = loadJSONL(join(apexDir, "analytics", "usage.jsonl"));

  // Normalize hook events into a unified activity format
  const activities = hookEvents.map((e) => ({
    ts: e.ts,
    skill: e.tool || "unknown",
    outcome: "success", // hooks only fire on completed calls
    duration_s: 0,
    meta: e.meta || {},
    source: "hook",
  }));

  // Normalize legacy analytics
  const legacy = legacyAnalytics.map((a) => ({
    ts: a.ts || a.timestamp || "",
    skill: a.skill || a.name || "unknown",
    outcome: a.outcome || a.result || "unknown",
    duration_s: a.duration_s ?? a.duration ?? 0,
    meta: {},
    source: "telemetry",
  }));

  // Merge, sort by timestamp (newest last), cap at 50 most recent
  return [...legacy, ...activities]
    .sort((a, b) => (a.ts || "").localeCompare(b.ts || ""))
    .slice(-50);
}

async function buildStatePayload(projectDir: string, projectName: string) {
  const apexDir = join(projectDir, ".apex");
  return {
    project: {
      name: projectName,
      path: projectDir,
    },
    tasks: await readJSON(join(apexDir, "tasks.json"), { tasks: [], next_id: 1 }),
    memory: await readJSON(join(apexDir, "memory.json"), { facts: [], next_id: 1 }),
    state: await readJSON(join(apexDir, "state.json"), {
      current_stage: "idle",
      artifacts: {},
      history: [],
    }),
    analytics: loadEvents(apexDir),
  };
}

// Legacy buildHTML kept as fallback — no longer primary
function _buildHTMLLegacy(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Apex Forge Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #0d1117;
    color: #c9d1d9;
    min-height: 100vh;
  }

  /* Header */
  .header {
    padding: 14px 24px;
    background: #161b22;
    border-bottom: 1px solid #30363d;
    display: flex;
    align-items: center;
    gap: 12px;
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .header h1 { font-size: 18px; color: #f0c040; font-weight: 700; letter-spacing: -0.3px; }
  .header .dot { width: 8px; height: 8px; border-radius: 50%; background: #3fb950; display: inline-block; animation: pulse 2s infinite; }
  .header .status { font-size: 12px; color: #8b949e; margin-left: auto; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  /* Grid layout */
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto auto;
    gap: 16px;
    padding: 16px 24px;
    max-width: 1600px;
    margin: 0 auto;
  }

  /* Panel base */
  .panel {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 16px;
    overflow: hidden;
  }
  .panel h2 {
    font-size: 11px;
    color: #8b949e;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    font-weight: 600;
  }

  /* Kanban — full width */
  .kanban-container { grid-column: 1 / -1; }
  .kanban {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }
  .kanban-col {
    background: #0d1117;
    border-radius: 6px;
    padding: 8px;
    min-height: 100px;
  }
  .kanban-col h3 {
    font-size: 10px;
    color: #8b949e;
    text-transform: uppercase;
    margin-bottom: 8px;
    text-align: center;
    letter-spacing: 0.8px;
    font-weight: 600;
  }
  .kanban-col .count {
    font-size: 10px;
    color: #484f58;
    text-align: center;
    display: block;
    margin-bottom: 8px;
  }
  .task-card {
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 6px;
    font-size: 12px;
    transition: border-color 0.15s;
    border-left: 3px solid transparent;
  }
  .task-card:hover { border-color: #484f58; }
  .task-card.s-open { border-left-color: #8b949e; }
  .task-card.s-assigned { border-left-color: #58a6ff; }
  .task-card.s-in_progress { border-left-color: #f0c040; }
  .task-card.s-to_verify { border-left-color: #bc8cff; }
  .task-card.s-done { border-left-color: #3fb950; }
  .task-card .id { color: #f0c040; font-weight: 700; font-size: 11px; }
  .task-card .title { color: #c9d1d9; margin-left: 6px; }
  .task-card .meta { margin-top: 4px; display: flex; gap: 8px; align-items: center; }
  .task-card .deps { color: #8b949e; font-size: 10px; }
  .task-card .evidence-count {
    font-size: 9px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 3px;
    padding: 1px 5px;
    color: #8b949e;
  }
  .empty-col { color: #30363d; font-size: 11px; text-align: center; padding: 20px 0; font-style: italic; }

  /* Pipeline */
  .pipeline {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .pipeline-stage {
    padding: 6px 14px;
    background: #21262d;
    border-radius: 4px;
    font-size: 11px;
    color: #8b949e;
    font-weight: 500;
    transition: all 0.2s;
  }
  .pipeline-stage.active {
    background: #f0c040;
    color: #0d1117;
    font-weight: 700;
    box-shadow: 0 0 12px rgba(240, 192, 64, 0.25);
  }
  .pipeline-stage.completed {
    background: #1a2f1a;
    color: #3fb950;
    border: 1px solid #238636;
  }
  .pipeline-arrow { color: #30363d; font-size: 12px; }
  .artifacts-section { margin-top: 8px; }
  .artifact-group {
    font-size: 11px;
    color: #8b949e;
    margin-top: 6px;
    padding: 6px 8px;
    background: #0d1117;
    border-radius: 4px;
  }
  .artifact-group .stage-name { color: #58a6ff; font-weight: 600; }
  .artifact-group .items { color: #c9d1d9; }

  /* Telemetry */
  .stats {
    display: flex;
    gap: 24px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .stat { text-align: center; min-width: 80px; }
  .stat .num { font-size: 28px; font-weight: 700; color: #f0c040; line-height: 1.1; }
  .stat .label { font-size: 10px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

  .bar-chart { margin-top: 8px; }
  .bar-row {
    display: flex;
    align-items: center;
    margin-bottom: 5px;
    font-size: 11px;
  }
  .bar-label {
    width: 130px;
    color: #8b949e;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .bar-track { flex: 1; height: 18px; background: #0d1117; border-radius: 3px; overflow: hidden; }
  .bar {
    height: 100%;
    background: linear-gradient(90deg, #58a6ff, #388bfd);
    border-radius: 3px;
    min-width: 2px;
    transition: width 0.3s ease;
  }
  .bar-value { margin-left: 8px; color: #8b949e; min-width: 24px; }

  /* Activity / Memory — bottom full width */
  .bottom-row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .activity-scroll, .memory-scroll {
    max-height: 320px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #30363d #161b22;
  }
  .activity-scroll::-webkit-scrollbar, .memory-scroll::-webkit-scrollbar { width: 6px; }
  .activity-scroll::-webkit-scrollbar-track, .memory-scroll::-webkit-scrollbar-track { background: #161b22; }
  .activity-scroll::-webkit-scrollbar-thumb, .memory-scroll::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

  .activity-item {
    padding: 7px 0;
    border-bottom: 1px solid #21262d;
    font-size: 12px;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .activity-item .time { color: #484f58; font-size: 11px; min-width: 60px; }
  .activity-item .skill { color: #58a6ff; }
  .activity-item .outcome-ok { color: #3fb950; font-weight: 600; }
  .activity-item .outcome-err { color: #f85149; font-weight: 600; }
  .activity-item .dur { color: #f0c040; font-size: 11px; }

  .fact {
    padding: 8px 0;
    border-bottom: 1px solid #21262d;
    font-size: 12px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .fact .confidence-badge {
    display: inline-block;
    min-width: 38px;
    text-align: center;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .fact .confidence-badge.high { background: #1a2f1a; color: #3fb950; }
  .fact .confidence-badge.med { background: #2d2a1a; color: #d29922; }
  .fact .confidence-badge.low { background: #2d1a1a; color: #f85149; }
  .fact .content { flex: 1; color: #c9d1d9; line-height: 1.4; }
  .fact .tags { margin-top: 3px; }
  .fact .tag {
    display: inline-block;
    background: #21262d;
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 10px;
    color: #8b949e;
    margin-right: 4px;
    margin-top: 2px;
  }

  .empty-state {
    color: #30363d;
    font-size: 12px;
    text-align: center;
    padding: 32px 0;
    font-style: italic;
  }
</style>
</head>
<body>

<div class="header">
  <h1>apex-forge</h1>
  <span class="dot"></span>
  <span class="status" id="project-name" style="color:#f0c040;font-size:12px;"></span>
  <div class="status" id="status">Connecting...</div>
</div>

<div class="grid">
  <!-- Kanban Board — full width row -->
  <div class="panel kanban-container">
    <h2>Tasks</h2>
    <div class="kanban" id="kanban">
      <div class="kanban-col" id="col-open"><h3>Open</h3></div>
      <div class="kanban-col" id="col-assigned"><h3>Assigned</h3></div>
      <div class="kanban-col" id="col-in_progress"><h3>In Progress</h3></div>
      <div class="kanban-col" id="col-to_verify"><h3>To Verify</h3></div>
      <div class="kanban-col" id="col-done"><h3>Done</h3></div>
    </div>
  </div>

  <!-- Pipeline Status -->
  <div class="panel">
    <h2>Pipeline</h2>
    <div class="pipeline" id="pipeline"></div>
    <div class="artifacts-section" id="artifacts"></div>
  </div>

  <!-- Telemetry Overview -->
  <div class="panel">
    <h2>Telemetry</h2>
    <div class="stats" id="stats"></div>
    <div class="bar-chart" id="chart"></div>
  </div>

  <!-- Activity + Memory — full width row -->
  <div class="bottom-row">
    <div class="panel">
      <h2>Activity Stream</h2>
      <div class="activity-scroll" id="activity"></div>
    </div>
    <div class="panel">
      <h2>Memory</h2>
      <div class="memory-scroll" id="memory"></div>
    </div>
  </div>
</div>

<script>
const STAGES = ['brainstorm','plan','execute','review','ship','compound'];

let evtSource = null;

function connectSSE() {
  if (evtSource) evtSource.close();
  evtSource = new EventSource('/api/events');
  evtSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      render(data);
    } catch {}
  };
  evtSource.onerror = () => {
    document.getElementById('status').textContent = 'Reconnecting...';
  };
}

function render(data) {
  renderKanban(data.tasks);
  renderPipeline(data.state);
  renderActivity(data.analytics);
  renderMemory(data.memory);
  renderTelemetry(data.analytics);
  if (data.project) {
    document.getElementById('project-name').textContent = data.project.name;
    document.title = 'Apex Forge — ' + data.project.name;
  }
  const stage = data.state.current_stage || 'idle';
  document.getElementById('status').textContent =
    'Stage: ' + stage + ' | ' + new Date().toLocaleTimeString();
}

async function initialLoad() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    render(data);
  } catch(e) {
    document.getElementById('status').textContent = 'Error: ' + e.message;
  }
  connectSSE();
}

function renderKanban(tasks) {
  const cols = { open: [], assigned: [], in_progress: [], to_verify: [], done: [] };
  for (const t of (tasks.tasks || [])) {
    const bucket = cols[t.status] !== undefined ? t.status : 'open';
    cols[bucket].push(t);
  }
  for (const [status, items] of Object.entries(cols)) {
    const el = document.getElementById('col-' + status);
    if (!el) continue;
    const label = status.replace(/_/g, ' ');
    let html = '<h3>' + label + '</h3>';
    html += '<span class="count">' + items.length + '</span>';
    if (items.length === 0) {
      html += '<div class="empty-col">No tasks</div>';
    } else {
      for (const t of items) {
        const deps = (t.depends_on && t.depends_on.length)
          ? '<div class="deps">depends: ' + escHtml(t.depends_on.join(', ')) + '</div>'
          : '';
        const evCount = (t.evidence && t.evidence.length)
          ? '<span class="evidence-count">' + t.evidence.length + ' evidence</span>'
          : '';
        html += '<div class="task-card s-' + status + '">'
          + '<span class="id">' + escHtml(t.id) + '</span>'
          + '<span class="title">' + escHtml(t.title) + '</span>'
          + '<div class="meta">' + deps + evCount + '</div>'
          + '</div>';
      }
    }
    el.innerHTML = html;
  }
}

function renderPipeline(state) {
  const el = document.getElementById('pipeline');
  const current = state.current_stage || 'idle';
  const history = (state.history || []).map(h => h.stage);

  el.innerHTML = STAGES.map((s, i) => {
    let cls = 'pipeline-stage';
    if (s === current) cls += ' active';
    else if (history.includes(s)) cls += ' completed';
    const arrow = i < STAGES.length - 1 ? '<span class="pipeline-arrow">\\u2192</span>' : '';
    return '<div class="' + cls + '">' + s + '</div>' + arrow;
  }).join('');

  const arts = document.getElementById('artifacts');
  if (state.artifacts && Object.keys(state.artifacts).length > 0) {
    arts.innerHTML = Object.entries(state.artifacts)
      .filter(([, v]) => v && v.length > 0)
      .map(([k, v]) =>
        '<div class="artifact-group">'
        + '<span class="stage-name">' + escHtml(k) + ':</span> '
        + '<span class="items">' + v.map(a => escHtml(a)).join(', ') + '</span>'
        + '</div>'
      ).join('');
  } else {
    arts.innerHTML = '<div class="empty-state">No artifacts</div>';
  }
}

function renderActivity(analytics) {
  const el = document.getElementById('activity');
  if (!analytics || analytics.length === 0) {
    el.innerHTML = '<div class="empty-state">No activity recorded yet</div>';
    return;
  }
  const items = analytics.slice(-30).reverse();
  el.innerHTML = items.map(a => {
    const ts = (a.ts || a.timestamp || '').slice(11, 19) || '--:--:--';
    const skill = a.skill || a.name || 'unknown';
    const outcome = a.outcome || a.result || 'unknown';
    const isOk = outcome === 'success';
    const dur = a.duration_s != null ? a.duration_s : (a.duration || 0);
    return '<div class="activity-item">'
      + '<span class="time">' + ts + '</span>'
      + '<span class="skill">' + escHtml(skill) + '</span>'
      + '<span class="' + (isOk ? 'outcome-ok' : 'outcome-err') + '">' + escHtml(outcome) + '</span>'
      + '<span class="dur">' + dur + 's</span>'
      + '</div>';
  }).join('');
}

function renderMemory(memory) {
  const el = document.getElementById('memory');
  const facts = memory.facts || [];
  if (facts.length === 0) {
    el.innerHTML = '<div class="empty-state">No facts stored yet</div>';
    return;
  }
  const sorted = [...facts].sort((a, b) => b.confidence - a.confidence);
  el.innerHTML = sorted.map(f => {
    const conf = (f.confidence != null) ? f.confidence : 0;
    const level = conf >= 0.8 ? 'high' : conf >= 0.5 ? 'med' : 'low';
    const tags = (f.tags || []).map(t => '<span class="tag">' + escHtml(t) + '</span>').join('');
    const tagsHtml = tags ? '<div class="tags">' + tags + '</div>' : '';
    return '<div class="fact">'
      + '<span class="confidence-badge ' + level + '">' + conf.toFixed(2) + '</span>'
      + '<div class="content">' + escHtml(f.content) + tagsHtml + '</div>'
      + '</div>';
  }).join('');
}

function renderTelemetry(analytics) {
  const statsEl = document.getElementById('stats');
  const chartEl = document.getElementById('chart');

  if (!analytics || analytics.length === 0) {
    statsEl.innerHTML =
      '<div class="stat"><div class="num">0</div><div class="label">Total Runs</div></div>'
      + '<div class="stat"><div class="num">--</div><div class="label">Avg Duration</div></div>'
      + '<div class="stat"><div class="num">--</div><div class="label">Success Rate</div></div>';
    chartEl.innerHTML = '<div class="empty-state">No telemetry data</div>';
    return;
  }

  const bySkill = {};
  let totalDur = 0, successes = 0;
  for (const a of analytics) {
    const s = a.skill || a.name || 'unknown';
    if (!bySkill[s]) bySkill[s] = { count: 0, dur: 0 };
    bySkill[s].count++;
    const dur = a.duration_s != null ? a.duration_s : (a.duration || 0);
    bySkill[s].dur += dur;
    totalDur += dur;
    if ((a.outcome || a.result) === 'success') successes++;
  }

  const avgDur = Math.round(totalDur / analytics.length);
  const successRate = Math.round(successes / analytics.length * 100);

  statsEl.innerHTML =
    '<div class="stat"><div class="num">' + analytics.length + '</div><div class="label">Total Runs</div></div>'
    + '<div class="stat"><div class="num">' + avgDur + 's</div><div class="label">Avg Duration</div></div>'
    + '<div class="stat"><div class="num">' + successRate + '%</div><div class="label">Success Rate</div></div>';

  const entries = Object.entries(bySkill).sort((a, b) => b[1].count - a[1].count);
  const maxCount = Math.max(...entries.map(([, v]) => v.count), 1);

  chartEl.innerHTML = entries.map(([name, data]) => {
    const pct = Math.round(data.count / maxCount * 100);
    return '<div class="bar-row">'
      + '<span class="bar-label">' + escHtml(name) + '</span>'
      + '<div class="bar-track"><div class="bar" style="width:' + pct + '%"></div></div>'
      + '<span class="bar-value">' + data.count + '</span>'
      + '</div>';
  }).join('');
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

initialLoad();
</script>
</body>
</html>`;
}
