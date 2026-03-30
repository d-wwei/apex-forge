#!/usr/bin/env bun

import { readJSON } from "./utils/json.js";
import { existsSync, readFileSync } from "fs";

const DEFAULT_PORT = 3456;

export async function startDashboard(port: number = DEFAULT_PORT) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/") {
        return new Response(buildHTML(), {
          headers: { "Content-Type": "text/html" },
        });
      }

      if (url.pathname === "/api/state") {
        const data = await buildStatePayload();
        return Response.json(data);
      }

      if (url.pathname === "/api/events") {
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const interval = setInterval(async () => {
              try {
                const data = await buildStatePayload();
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

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`Apex Dashboard running at http://localhost:${port}`);

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

function loadAnalytics(): any[] {
  const file = ".apex/analytics/usage.jsonl";
  if (!existsSync(file)) return [];
  try {
    return readFileSync(file, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function buildStatePayload() {
  return {
    tasks: await readJSON(".apex/tasks.json", { tasks: [], next_id: 1 }),
    memory: await readJSON(".apex/memory.json", { facts: [], next_id: 1 }),
    state: await readJSON(".apex/state.json", {
      current_stage: "idle",
      artifacts: {},
      history: [],
    }),
    analytics: loadAnalytics(),
  };
}

function buildHTML(): string {
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
