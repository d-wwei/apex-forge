/* ========================================================================
   APEX FORGE Dashboard — Application Logic
   ======================================================================== */

// ===== 1. Constants =====

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

const DEMO_PROJECTS = [];

// ===== 2. State =====

let currentView = 'home';
let currentProject = null;
let sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
let evtSource = null;
let sseConnected = false;
let loadedProjects = null;

// ===== 3. Navigation =====

function navigateToHome() {
  currentView = 'home';
  document.getElementById('view-home').classList.add('active');
  document.getElementById('view-project').classList.remove('active');
  loadProjectCards();
}

function navigateToProject(project) {
  currentView = 'project';
  currentProject = project;
  document.getElementById('view-home').classList.remove('active');
  document.getElementById('view-project').classList.add('active');

  const name = project.name || 'UNKNOWN';
  document.getElementById('top-bar-project').textContent = 'PROJECT: ' + name;
  document.getElementById('top-bar-time').textContent = new Date().toISOString().replace('T', ' ').slice(0, 19);

  updateSidebarActive(project);
  initialLoad();
}

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
  document.getElementById('project-sidebar').classList.toggle('collapsed', sidebarCollapsed);
}

// ===== 4. Home View =====

function renderProjectCards(projects) {
  const grid = document.getElementById('project-grid');
  if (!grid) return;

  const active = projects.filter(p => p.status !== 'archived').length;
  const archived = projects.filter(p => p.status === 'archived').length;
  const subtitle = document.getElementById('home-subtitle');
  if (subtitle) subtitle.textContent = projects.length + ' projects \u00b7 ' + active + ' active \u00b7 ' + archived + ' archived';

  grid.innerHTML = projects.map((p, i) => {
    const dotClass = p.status === 'archived' ? 'gray' : (p.status === 'building' ? 'blue' : 'green');
    const isActive = i === 0;
    const isArchived = p.status === 'archived';
    const successClass = isArchived ? 'muted' : 'green';

    return '<div class="project-card' + (isActive ? ' active-project' : '') + (isArchived ? ' archived' : '') + '" data-index="' + i + '">' +
      '<div class="project-card-header">' +
        '<div class="project-card-name-group">' +
          '<div class="project-card-dot ' + dotClass + '"></div>' +
          '<span class="project-card-name">' + esc(p.name) + '</span>' +
        '</div>' +
        '<span class="project-card-badge ' + p.status + '">' + p.status.toUpperCase() + '</span>' +
      '</div>' +
      '<span class="project-card-desc">' + esc(p.description) + '</span>' +
      '<div class="project-card-metrics">' +
        '<div class="project-card-metric"><span class="project-card-metric-label">TASKS</span><span class="project-card-metric-value">' + p.tasks + '</span></div>' +
        '<div class="project-card-metric"><span class="project-card-metric-label">SUCCESS</span><span class="project-card-metric-value ' + successClass + '">' + p.success.toFixed(1) + '%</span></div>' +
        '<div class="project-card-metric"><span class="project-card-metric-label">LAST ACTIVE</span><span class="project-card-metric-value small">' + esc(p.lastActive) + '</span></div>' +
      '</div>' +
    '</div>';
  }).join('');

  grid.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => {
      navigateToProject(projects[parseInt(card.dataset.index)]);
    });
  });
}

function loadProjectCards() {
  fetch('/api/projects').then(r => r.json()).then(data => {
    const projects = (data.projects || []).map(p => ({
      name: p.name || p.path.split('/').pop().toUpperCase(),
      status: p.status || 'active',
      description: p.description || '',
      tasks: p.task_count || 0,
      success: p.success_rate || 0,
      lastActive: p.last_active || 'unknown',
    }));
    loadedProjects = projects.length ? projects : DEMO_PROJECTS;
    renderProjectCards(loadedProjects);
    renderSidebar(loadedProjects);
  }).catch(() => {
    loadedProjects = DEMO_PROJECTS;
    renderProjectCards(DEMO_PROJECTS);
    renderSidebar(DEMO_PROJECTS);
  });
}

// ===== 5. Sidebar =====

function renderSidebar(projects) {
  const list = document.getElementById('sidebar-list');
  const archivedList = document.getElementById('sidebar-archived-list');
  if (!list || !archivedList) return;

  const activeProjects = projects.filter(p => p.status !== 'archived');
  const archivedProjects = projects.filter(p => p.status === 'archived');

  const cardColors = ['#f0c040', '#22c55e', '#a2c9ff', '#e879a0'];
  list.innerHTML = activeProjects.map((p, i) => {
    const isActive = currentProject && currentProject.name === p.name;
    const dotColor = p.status === 'building' ? '#a2c9ff' : '#22c55e';
    const cardColor = cardColors[i % cardColors.length];
    const abbr = p.name.split('_')[0];
    return '<div class="sidebar-project-item' + (isActive ? ' active' : '') + '" data-index="' + i + '" style="--card-color:' + cardColor + '">' +
      '<div class="sidebar-project-dot" style="background:' + dotColor + '"></div>' +
      '<div class="sidebar-project-info">' +
        '<span class="sidebar-project-name">' + esc(p.name) + '</span>' +
        '<span class="sidebar-project-meta">' + p.tasks + ' tasks \u00b7 ' + p.success.toFixed(1) + '%</span>' +
      '</div>' +
      '<div class="sidebar-project-compact">' +
        '<span class="compact-name">' + esc(abbr) + '</span>' +
        '<span class="compact-stats"><span class="compact-dot" style="background:' + dotColor + '"></span>' + p.success.toFixed(1) + '%</span>' +
      '</div>' +
    '</div>';
  }).join('');

  archivedList.innerHTML = archivedProjects.map((p, i) => {
    return '<div class="sidebar-archived-item" data-index="' + (activeProjects.length + i) + '">' +
      '<div class="sidebar-archived-dot"></div>' +
      '<span class="sidebar-archived-name">' + esc(p.name) + '</span>' +
    '</div>';
  }).join('');

  const allItems = [...list.querySelectorAll('.sidebar-project-item'), ...archivedList.querySelectorAll('.sidebar-archived-item')];
  allItems.forEach(item => {
    item.addEventListener('click', () => {
      navigateToProject(projects[parseInt(item.dataset.index)]);
    });
  });
}

function updateSidebarActive(project) {
  document.querySelectorAll('.sidebar-project-item').forEach(el => el.classList.remove('active'));
  if (!project) return;
  document.querySelectorAll('.sidebar-project-item').forEach(el => {
    const nameEl = el.querySelector('.sidebar-project-name');
    if (nameEl && nameEl.textContent === project.name) el.classList.add('active');
  });
}

// ===== 6. Dashboard Rendering (preserved) =====

function render(data) {
  renderKanban(data.tasks);
  renderPipeline(data.state);
  renderTelemetry(data.analytics);
  renderActivity(data.analytics);
  renderMemory(data.memory);

  if (data.project) {
    const name = (data.project.name || 'unknown').toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
    document.getElementById('top-bar-project').textContent = 'PROJECT: ' + name;
    document.title = 'APEX FORGE \u2014 ' + data.project.name;
  }

  document.getElementById('pipeline-status').textContent =
    'STATUS: ' + ((data.state.current_stage || 'idle') === 'idle' ? 'IDLE' : 'RUNNING');
}

function renderKanban(tasks) {
  const cols = { open: [], assigned: [], in_progress: [], to_verify: [], done: [] };
  for (const t of (tasks.tasks || [])) {
    const bucket = cols[t.status] !== undefined ? t.status : 'open';
    cols[bucket].push(t);
  }
  for (const [status, items] of Object.entries(cols)) {
    const label = document.getElementById('col-label-' + status);
    if (label) label.textContent = status.replace(/_/g, ' ').toUpperCase() + ' [' + String(items.length).padStart(2, '0') + ']';
    const container = document.getElementById('col-' + status);
    if (!container) continue;
    if (items.length === 0) {
      container.innerHTML = '<div class="kanban-empty"><span class="kanban-empty-text">NO TASKS ' + (status === 'done' ? 'COMPLETED' : 'HERE') + '</span></div>';
    } else {
      container.innerHTML = items.map(t => {
        const statusClass = 'status-' + status.replace(/_/g, '-');
        const deps = t.depends_on && t.depends_on.length ? 'DEP: ' + esc(t.depends_on.join(', ')) : 'DEP: NULL';
        return '<div class="task-card ' + statusClass + '"><div class="task-id">TASK_ID: ' + esc(t.id) + '</div><div class="task-title">' + esc(t.title) + '</div><div class="task-meta"><span class="task-dep">' + deps + '</span><span class="task-evidence">' + (t.evidence ? t.evidence.length : 0) + ' EVIDENCE</span></div></div>';
      }).join('');
    }
  }
}

function renderPipeline(state) {
  const current = state.current_stage || 'idle';
  const history = (state.history || []).map(h => h.stage);
  const stagesEl = document.getElementById('pipeline-stages');
  stagesEl.innerHTML = '<div class="pipeline-line"></div>' + STAGES.map(s => {
    const isActive = s === current, isCompleted = history.includes(s);
    const circleClass = isActive ? 'active' : isCompleted ? 'completed' : '';
    const icon = isCompleted ? CHECK_ICON : STAGE_ICONS[s];
    return '<div class="pipeline-stage"><div class="stage-circle ' + circleClass + '">' + icon + '</div><span class="stage-label ' + circleClass + '">' + s + '</span></div>';
  }).join('');
  const artEl = document.getElementById('pipeline-artifacts');
  if (state.artifacts && Object.keys(state.artifacts).length > 0) {
    const entries = Object.entries(state.artifacts).filter(([, v]) => v && v.length > 0);
    if (entries.length > 0) {
      artEl.innerHTML = entries.map(([stageName, items]) => '<div><div class="artifact-section-label">' + esc(stageName) + ' Artifacts</div>' + items.map(item => '<div class="artifact-item"><span class="artifact-dot"></span><span class="artifact-name">' + esc(item) + '</span></div>').join('') + '</div>').join('');
      return;
    }
  }
  artEl.innerHTML = '<div class="artifact-empty">No artifacts yet. Run /apex-forge brainstorm to start.</div>';
}

function renderTelemetry(analytics) {
  if (!analytics || analytics.length === 0) {
    document.getElementById('stat-total').textContent = '0';
    document.getElementById('stat-avg').innerHTML = '0<span class="stat-unit">s</span>';
    document.getElementById('stat-rate').textContent = '--';
    renderSkillBars([]);
    return;
  }
  const bySkill = {}; let totalDur = 0, successes = 0;
  for (const a of analytics) { const s = a.skill || a.name || 'unknown'; if (!bySkill[s]) bySkill[s] = { count: 0, dur: 0 }; bySkill[s].count++; const dur = a.duration_s != null ? a.duration_s : (a.duration || 0); bySkill[s].dur += dur; totalDur += dur; if ((a.outcome || a.result) === 'success') successes++; }
  document.getElementById('stat-total').textContent = analytics.length.toLocaleString();
  document.getElementById('stat-avg').innerHTML = (totalDur / analytics.length).toFixed(1) + '<span class="stat-unit">s</span>';
  document.getElementById('stat-rate').textContent = (successes / analytics.length * 100).toFixed(1) + '%';
  const entries = Object.entries(bySkill).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  const maxCount = Math.max(...entries.map(([, v]) => v.count), 1);
  renderSkillBars(entries.map(([name, data]) => ({ name: name.toUpperCase(), count: data.count, pct: Math.round(data.count / maxCount * 100) })));
}

function renderSkillBars(bars) {
  document.getElementById('skill-bars').innerHTML = bars.map(b => '<div class="skill-bar-row"><div class="skill-bar-header"><span class="skill-bar-name">' + esc(b.name) + '</span><span class="skill-bar-count">' + b.count + ' CALLS</span></div><div class="skill-bar-track"><div class="skill-bar-fill" style="width:' + b.pct + '%"></div></div></div>').join('');
}

function renderActivity(analytics) {
  const el = document.getElementById('activity-stream');
  if (!analytics || analytics.length === 0) {
    el.innerHTML = '<div class="activity-empty">No activity recorded yet.</div>';
    return;
  }
  el.innerHTML = analytics.slice(-30).reverse().map(a => {
    const ts = (a.ts || a.timestamp || '').slice(11, 23) || '--:--:--.---';
    const skill = (a.skill || a.name || 'unknown').toUpperCase();
    const isOk = (a.outcome || a.result) === 'success';
    const dur = a.source === 'hook' ? (a.meta && a.meta.file ? esc(a.meta.file.split('/').pop()) : '') : (a.duration_s != null ? a.duration_s : (a.duration || 0)).toFixed(3) + 's';
    return renderActivityRow({ time: ts, skill, status: isOk ? 'success' : 'failed', dur }, false);
  }).join('');
}

function renderActivityRow(r, highlighted) {
  const statusIcon = r.status === 'success' ? '<svg class="activity-status-icon" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>' : '<svg class="activity-status-icon" viewBox="0 0 10 10"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  return '<div class="activity-row' + (highlighted ? ' highlighted' : '') + '"><span class="activity-time">' + esc(r.time) + '</span><span class="activity-skill">' + esc(r.skill) + '</span><span class="activity-status ' + r.status + '">' + (r.status === 'success' ? 'SUCCESS' : 'FAILED') + ' ' + statusIcon + '</span><span class="activity-duration">' + esc(r.dur) + '</span></div>';
}

function renderMemory(memory) {
  const el = document.getElementById('memory-list');
  const facts = memory.facts || [];
  if (facts.length === 0) {
    el.innerHTML = '<div class="memory-empty">No memory facts stored. Use /apex-forge-memory add to record project knowledge.</div>';
    return;
  }
  el.innerHTML = [...facts].sort((a, b) => b.confidence - a.confidence).map(f => {
    const conf = f.confidence != null ? f.confidence : 0;
    return renderMemoryFact({ confidence: conf, level: conf >= 0.8 ? 'high' : conf >= 0.5 ? 'med' : 'low', content: f.content, tags: f.tags || [] });
  }).join('');
}

function renderMemoryFact(f) {
  const levelLabel = f.level === 'high' ? 'HIGH' : f.level === 'med' ? 'MED' : 'LOW';
  return '<div class="memory-fact confidence-' + f.level + '"><div class="memory-fact-header"><span class="memory-confidence-badge ' + f.level + '">' + levelLabel + '_CONFIDENCE (' + f.confidence.toFixed(2) + ')</span><div class="memory-tags">' + f.tags.map(t => '<span class="memory-tag">' + esc(t) + '</span>').join('') + '</div></div><div class="memory-fact-content">' + esc(f.content) + '</div></div>';
}

// ===== 7. Utility =====

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== 8. SSE =====

function connectSSE() {
  if (evtSource) evtSource.close();
  sseConnected = false;
  evtSource = new EventSource('/api/events');
  evtSource.onopen = () => { sseConnected = true; };
  evtSource.onmessage = (e) => { sseConnected = true; try { render(JSON.parse(e.data)); } catch {} };
  evtSource.onerror = () => { if (evtSource.readyState === EventSource.CLOSED) { sseConnected = false; setTimeout(connectSSE, 5000); } };
}

async function initialLoad() {
  try {
    const res = await fetch('/api/state');
    render(await res.json());
  } catch {
    // API unavailable — render empty state
    render({
      tasks: { tasks: [] },
      state: { current_stage: 'idle', history: [], artifacts: {} },
      analytics: [],
      memory: { facts: [] },
      project: { name: currentProject ? currentProject.name : 'unknown' }
    });
  }
  connectSSE();
}

// ===== 9. Init =====

document.addEventListener('DOMContentLoaded', () => {
  loadProjectCards();

  // Sub-tab switching
  document.querySelectorAll('.sub-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sub-view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('view-' + tab.dataset.view).classList.add('active');
    });
  });

  // Sidebar logo → Toggle sidebar expand/collapse
  const sidebarLogo = document.getElementById('sidebar-logo');
  if (sidebarLogo) sidebarLogo.addEventListener('click', toggleSidebar);

  // Back link → Navigate to Home (All Projects)
  const backLink = document.getElementById('sidebar-back-link');
  if (backLink) backLink.addEventListener('click', navigateToHome);

  if (sidebarCollapsed) {
    const sidebar = document.getElementById('project-sidebar');
    if (sidebar) sidebar.classList.add('collapsed');
  }

  // Sidebar is populated by loadProjectCards() via API

  // Sticky nav — show only after scrolling past hero
  const hero = document.querySelector('.home-hero');
  const stickyNav = document.getElementById('home-sticky-nav');
  if (hero && stickyNav) {
    new IntersectionObserver(([entry]) => {
      stickyNav.classList.toggle('visible', !entry.isIntersecting);
    }, { threshold: 0 }).observe(hero);
  }
});
