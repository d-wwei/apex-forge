/* ========================================================================
   APEX FORGE Dashboard — Application Logic
   ======================================================================== */

const STAGES = ['brainstorm', 'plan', 'execute', 'review', 'ship', 'compound'];

const STAGE_ICONS = {
  brainstorm: '<svg viewBox="0 0 14 14"><path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  plan: '<svg viewBox="0 0 14 14"><path d="M2 4h10M2 7h7M2 10h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  execute: '<svg viewBox="0 0 14 14"><path d="M4 2L11 7L4 12V2Z" fill="currentColor"/></svg>',
  review: '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M5 7l2 2 3-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ship: '<svg viewBox="0 0 14 14"><rect x="2" y="4" width="10" height="7" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M5 4V2h4v2" stroke="currentColor" stroke-width="1.5"/></svg>',
  compound: '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="2" fill="currentColor"/><circle cx="7" cy="2" r="1.5" fill="currentColor"/><circle cx="11" cy="5" r="1.5" fill="currentColor"/><circle cx="11" cy="10" r="1.5" fill="currentColor"/><circle cx="3" cy="10" r="1.5" fill="currentColor"/><circle cx="3" cy="5" r="1.5" fill="currentColor"/></svg>'
};

const CHECK_ICON = '<svg viewBox="0 0 14 14"><path d="M3 7l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let evtSource = null;
let sseConnected = false;

// ---- Navigation ----

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('view-' + tab.dataset.view).classList.add('active');
  });
});


// ---- SSE Connection ----

function connectSSE() {
  if (evtSource) evtSource.close();
  sseConnected = false;
  evtSource = new EventSource('/api/events');

  evtSource.onopen = () => {
    sseConnected = true;
  };

  evtSource.onmessage = (e) => {
    sseConnected = true;
    try {
      render(JSON.parse(e.data));
    } catch { /* ignore parse errors */ }
  };

  evtSource.onerror = () => {
    if (evtSource.readyState === EventSource.CLOSED) {
      // Connection permanently closed — retry after delay
      sseConnected = false;
      document.getElementById('header-status').textContent = 'DISCONNECTED — RETRYING...';
      setTimeout(connectSSE, 5000);
    }
    // readyState CONNECTING = browser auto-reconnecting, no action needed
  };
}

async function initialLoad() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    render(data);
  } catch (e) {
    document.getElementById('header-status').textContent = 'ERROR: ' + e.message;
  }
  connectSSE();
}

// ---- Render All ----

function render(data) {
  renderKanban(data.tasks);
  renderPipeline(data.state);
  renderTelemetry(data.analytics);
  renderActivity(data.analytics);
  renderMemory(data.memory);

  // Dynamic project name from API
  if (data.project) {
    const name = (data.project.name || 'unknown').toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
    document.getElementById('header-project').textContent = 'PROJECT: ' + name;
    document.title = 'APEX FORGE — ' + data.project.name;
  }

  const stage = data.state.current_stage || 'idle';
  const now = new Date();
  const ts = now.toISOString().slice(0, 19).replace('T', ' ');
  document.getElementById('header-status').textContent =
    'CONNECTED | ' + stage.toUpperCase() + ' | ' + ts;

  document.getElementById('pipeline-status').textContent =
    'STATUS: ' + (stage === 'idle' ? 'IDLE' : 'RUNNING');
}

// ---- Kanban Board ----

function renderKanban(tasks) {
  const cols = { open: [], assigned: [], in_progress: [], to_verify: [], done: [] };
  for (const t of (tasks.tasks || [])) {
    const bucket = cols[t.status] !== undefined ? t.status : 'open';
    cols[bucket].push(t);
  }

  for (const [status, items] of Object.entries(cols)) {
    const label = document.getElementById('col-label-' + status);
    if (label) {
      const displayName = status.replace(/_/g, ' ').toUpperCase();
      label.textContent = displayName + ' [' + String(items.length).padStart(2, '0') + ']';
    }

    const container = document.getElementById('col-' + status);
    if (!container) continue;

    if (items.length === 0) {
      container.innerHTML = '<div class="kanban-empty"><span class="kanban-empty-text">NO TASKS ' +
        (status === 'done' ? 'COMPLETED' : 'HERE') + '</span></div>';
    } else {
      container.innerHTML = items.map(t => {
        const statusClass = 'status-' + status.replace(/_/g, '-');
        const deps = t.depends_on && t.depends_on.length
          ? 'DEP: ' + esc(t.depends_on.join(', '))
          : 'DEP: NULL';
        const evCount = t.evidence ? t.evidence.length : 0;
        return '<div class="task-card ' + statusClass + '">' +
          '<div class="task-id">TASK_ID: ' + esc(t.id) + '</div>' +
          '<div class="task-title">' + esc(t.title) + '</div>' +
          '<div class="task-meta">' +
            '<span class="task-dep">' + deps + '</span>' +
            '<span class="task-evidence">' + evCount + ' EVIDENCE</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }
}

// ---- Pipeline ----

function renderPipeline(state) {
  const current = state.current_stage || 'idle';
  const history = (state.history || []).map(h => h.stage);
  const stagesEl = document.getElementById('pipeline-stages');

  stagesEl.innerHTML = '<div class="pipeline-line"></div>' +
    STAGES.map(s => {
      const isActive = s === current;
      const isCompleted = history.includes(s);
      const circleClass = isActive ? 'active' : isCompleted ? 'completed' : '';
      const labelClass = isActive ? 'active' : isCompleted ? 'completed' : '';
      const icon = isCompleted ? CHECK_ICON : STAGE_ICONS[s];
      return '<div class="pipeline-stage">' +
        '<div class="stage-circle ' + circleClass + '">' + icon + '</div>' +
        '<span class="stage-label ' + labelClass + '">' + s + '</span>' +
      '</div>';
    }).join('');

  // Artifacts
  const artEl = document.getElementById('pipeline-artifacts');
  if (state.artifacts && Object.keys(state.artifacts).length > 0) {
    const entries = Object.entries(state.artifacts).filter(([, v]) => v && v.length > 0);
    if (entries.length > 0) {
      artEl.innerHTML = entries.map(([stageName, items]) =>
        '<div>' +
          '<div class="artifact-section-label">' + esc(stageName) + ' Artifacts</div>' +
          items.map(item =>
            '<div class="artifact-item">' +
              '<span class="artifact-dot"></span>' +
              '<span class="artifact-name">' + esc(item) + '</span>' +
            '</div>'
          ).join('') +
        '</div>'
      ).join('');
      return;
    }
  }
  artEl.innerHTML =
    '<div><div class="artifact-section-label">Brainstorm Artifacts</div>' +
      '<div class="artifact-item"><span class="artifact-dot"></span><span class="artifact-name">concept_doc_v1.md</span></div>' +
      '<div class="artifact-item"><span class="artifact-dot"></span><span class="artifact-name">wireframe_logic_map</span></div>' +
    '</div>' +
    '<div><div class="artifact-section-label">Plan Artifacts</div>' +
      '<div class="artifact-item"><span class="artifact-dot"></span><span class="artifact-name">task_distribution_matrix</span></div>' +
      '<div class="artifact-item"><span class="artifact-dot"></span><span class="artifact-name">schema_design_final</span></div>' +
    '</div>';
}

// ---- Telemetry ----

function renderTelemetry(analytics) {
  if (!analytics || analytics.length === 0) {
    // Show demo data matching Figma
    document.getElementById('stat-total').textContent = '1,420';
    document.getElementById('stat-avg').innerHTML = '18.2<span class="stat-unit">s</span>';
    document.getElementById('stat-rate').textContent = '94.2%';

    renderSkillBars([
      { name: 'REASONING_ENGINE_V4', count: 842, pct: 85 },
      { name: 'SEMANTIC_PARSER', count: 612, pct: 62 },
      { name: 'DATA_SYNTHESIZER', count: 290, pct: 30 }
    ]);
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

  const avgDur = (totalDur / analytics.length).toFixed(1);
  const successRate = (successes / analytics.length * 100).toFixed(1);

  document.getElementById('stat-total').textContent = analytics.length.toLocaleString();
  document.getElementById('stat-avg').innerHTML = avgDur + '<span class="stat-unit">s</span>';
  document.getElementById('stat-rate').textContent = successRate + '%';

  const entries = Object.entries(bySkill).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  const maxCount = Math.max(...entries.map(([, v]) => v.count), 1);

  renderSkillBars(entries.map(([name, data]) => ({
    name: name.toUpperCase(),
    count: data.count,
    pct: Math.round(data.count / maxCount * 100)
  })));
}

function renderSkillBars(bars) {
  document.getElementById('skill-bars').innerHTML = bars.map(b =>
    '<div class="skill-bar-row">' +
      '<div class="skill-bar-header">' +
        '<span class="skill-bar-name">' + esc(b.name) + '</span>' +
        '<span class="skill-bar-count">' + b.count + ' CALLS</span>' +
      '</div>' +
      '<div class="skill-bar-track">' +
        '<div class="skill-bar-fill" style="width:' + b.pct + '%"></div>' +
      '</div>' +
    '</div>'
  ).join('');
}

// ---- Activity Stream ----

function renderActivity(analytics) {
  const el = document.getElementById('activity-stream');
  if (!analytics || analytics.length === 0) {
    // Show demo data
    const demoRows = [
      { time: '14:29:50.112', skill: 'FILE_READ', status: 'success', dur: '0.012s' },
      { time: '14:29:50.112', skill: 'FILE_READ', status: 'success', dur: '0.012s' },
      { time: '14:29:55.302', skill: 'SQL_EXECUTOR', status: 'failed', dur: '0.104s' },
      { time: '14:29:58.841', skill: 'WEB_SEARCH', status: 'success', dur: '1.821s' },
      { time: '14:30:05.122', skill: 'REASONING_V4', status: 'success', dur: '0.422s' },
      { time: '14:30:08.501', skill: 'FILE_READ', status: 'success', dur: '0.012s' },
    ];
    el.innerHTML = demoRows.map((r, i) => renderActivityRow(r, i === 4)).join('');
    return;
  }

  const items = analytics.slice(-30).reverse();
  el.innerHTML = items.map((a, i) => {
    const ts = (a.ts || a.timestamp || '').slice(11, 23) || '--:--:--.---';
    const skill = (a.skill || a.name || 'unknown').toUpperCase();
    const outcome = a.outcome || a.result || 'unknown';
    const isOk = outcome === 'success';
    const dur = a.source === 'hook'
      ? (a.meta && a.meta.file ? esc(a.meta.file.split('/').pop()) : (a.meta && a.meta.cmd ? esc(a.meta.cmd.slice(0, 40)) : ''))
      : (a.duration_s != null ? a.duration_s : (a.duration || 0)).toFixed(3) + 's';
    return renderActivityRow({
      time: ts, skill, status: isOk ? 'success' : 'failed', dur
    }, false);
  }).join('');
}

function renderActivityRow(r, highlighted) {
  const statusIcon = r.status === 'success'
    ? '<svg class="activity-status-icon" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>'
    : '<svg class="activity-status-icon" viewBox="0 0 10 10"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const statusLabel = r.status === 'success' ? 'SUCCESS' : 'FAILED';
  return '<div class="activity-row' + (highlighted ? ' highlighted' : '') + '">' +
    '<span class="activity-time">' + esc(r.time) + '</span>' +
    '<span class="activity-skill">' + esc(r.skill) + '</span>' +
    '<span class="activity-status ' + r.status + '">' + statusLabel + ' ' + statusIcon + '</span>' +
    '<span class="activity-duration">' + esc(r.dur) + '</span>' +
  '</div>';
}

// ---- Cognitive Memory ----

function renderMemory(memory) {
  const el = document.getElementById('memory-list');
  const facts = memory.facts || [];

  if (facts.length === 0) {
    // Show demo data matching Figma
    const demoFacts = [
      {
        confidence: 0.98, level: 'high',
        content: '"Primary database schema v4.2 is immutable and requires explicit migration tokens for any structural alterations."',
        tags: ['SCHEMA', 'PROD']
      },
      {
        confidence: 0.72, level: 'med',
        content: '"The user typically initiates orchestration layers between 14:00 and 16:00 UTC during weekdays."',
        tags: ['LATENCY']
      },
      {
        confidence: 0.24, level: 'low',
        content: '"Agent Echo might be manifesting divergent reasoning patterns when processing large CSV files from sub-node Delta."',
        tags: ['HEURISTIC']
      },
      {
        confidence: 0.91, level: 'high',
        content: '"Root access is restricted to the current hardware ID: FORGE_ALPHA_09."',
        tags: ['CREDENTIALS']
      }
    ];
    el.innerHTML = demoFacts.map(renderMemoryFact).join('');
    return;
  }

  const sorted = [...facts].sort((a, b) => b.confidence - a.confidence);
  el.innerHTML = sorted.map(f => {
    const conf = f.confidence != null ? f.confidence : 0;
    const level = conf >= 0.8 ? 'high' : conf >= 0.5 ? 'med' : 'low';
    return renderMemoryFact({
      confidence: conf, level,
      content: f.content,
      tags: f.tags || []
    });
  }).join('');
}

function renderMemoryFact(f) {
  const levelLabel = f.level === 'high' ? 'HIGH' : f.level === 'med' ? 'MED' : 'LOW';
  const tags = f.tags.map(t =>
    '<span class="memory-tag">' + esc(t) + '</span>'
  ).join('');
  return '<div class="memory-fact confidence-' + f.level + '">' +
    '<div class="memory-fact-header">' +
      '<span class="memory-confidence-badge ' + f.level + '">' +
        levelLabel + '_CONFIDENCE (' + f.confidence.toFixed(2) + ')' +
      '</span>' +
      '<div class="memory-tags">' + tags + '</div>' +
    '</div>' +
    '<div class="memory-fact-content">' + esc(f.content) + '</div>' +
  '</div>';
}

// ---- Utility ----

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Project Sidebar ----

async function loadSidebar() {
  const list = document.getElementById('sidebar-list');
  const hubLink = document.getElementById('sidebar-hub-link');
  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    const currentPath = data.current || '';

    if (hubLink && data.hub) {
      hubLink.href = 'http://localhost:' + data.hub;
    }

    if (!data.projects || data.projects.length === 0) {
      list.innerHTML = '<div class="sidebar-empty">No projects</div>';
      return;
    }

    list.innerHTML = data.projects.map(p => {
      const isActive = p.path === currentPath;
      const cls = 'sidebar-item' + (isActive ? ' active' : '');
      const url = 'http://localhost:' + p.port;
      const shortName = (p.name || 'unknown').slice(0, 18);
      return '<a class="' + cls + '" href="' + url + '" title="' + esc(p.path) + '">' +
        '<span class="sidebar-dot"></span>' +
        '<span class="sidebar-name">' + esc(shortName) + '</span>' +
        '</a>';
    }).join('');
  } catch {
    list.innerHTML = '<div class="sidebar-empty">Offline</div>';
  }
}

// ---- Init ----
initialLoad();
loadSidebar();
setInterval(loadSidebar, 10000);
