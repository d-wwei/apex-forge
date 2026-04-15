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
let kanbanCollapsed = localStorage.getItem('kanbanCollapsed') !== 'false'; // default collapsed
let currentLang = localStorage.getItem('lang') || 'en';
let evtSource = null;
let sseConnected = false;
let loadedProjects = null;

// Worktree aggregation state
let worktreeMode = 'single';   // 'single' | 'aggregated' | 'filter'
let worktreeExpanded = false;   // pipeline expand/collapse
let worktreeFilter = null;      // selected worktree label in filter mode
let currentRepoRoot = null;     // repo root for aggregated SSE
let currentWorktrees = null;    // worktree data from last SSE payload

// Session pipeline state
let sessionExpanded = false;    // session pipeline expand/collapse

// ===== 2c. Hidden Projects =====

function getHiddenProjects() {
  try {
    const raw = JSON.parse(localStorage.getItem('hiddenProjects'));
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function hideProject(path) {
  const list = getHiddenProjects();
  if (!list.includes(path)) {
    list.push(path);
    localStorage.setItem('hiddenProjects', JSON.stringify(list));
  }
}

function unhideProject(path) {
  const list = getHiddenProjects().filter(p => p !== path);
  localStorage.setItem('hiddenProjects', JSON.stringify(list));
}

function filterVisibleProjects(projects) {
  const hidden = getHiddenProjects();
  if (!hidden.length) return projects;
  return projects.filter(p => !hidden.includes(p.path));
}

function onHideProject(path) {
  hideProject(path);
  if (localStorage.getItem('lastProject') === path) {
    localStorage.removeItem('lastProject');
  }
  if (currentProject && currentProject.path === path) {
    navigateToHome();
  }
  if (loadedProjects) {
    renderProjectCards(loadedProjects);
    renderSidebar(loadedProjects);
  }
}

// ===== 2b. i18n =====

function t(key) {
  const table = LOCALE[currentLang] || LOCALE.en;
  return table[key] !== undefined ? table[key] : (LOCALE.en[key] || key);
}

function toggleLang() {
  currentLang = currentLang === 'en' ? 'zh' : 'en';
  localStorage.setItem('lang', currentLang);
  applyLocale();
  // Re-render dynamic content with new language
  if (loadedProjects) {
    renderProjectCards(loadedProjects);
    renderSidebar(loadedProjects);
  }
}

function applyLocale() {
  // Update all static elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val !== key) el.textContent = val;
  });
  // Update lang toggle buttons
  const label = currentLang === 'en' ? '中' : 'EN';
  document.querySelectorAll('.lang-toggle-btn').forEach(btn => { btn.textContent = label; });
}

// ===== 3. Navigation =====

function navigateToHome() {
  currentView = 'home';
  sessionStorage.setItem('hubExplicitHome', '1');
  document.getElementById('view-home').classList.add('active');
  document.getElementById('view-project').classList.remove('active');
  loadProjectCards();
}

function navigateToProject(project) {
  currentView = 'project';
  currentProject = project;
  // Persist selection: URL hash (survives refresh) + localStorage (survives hash clearing)
  history.replaceState(null, '', location.pathname + location.search + '#project=' + encodeURIComponent(project.path));
  localStorage.setItem('lastProject', project.path);
  document.getElementById('view-home').classList.remove('active');
  document.getElementById('view-project').classList.add('active');

  const name = project.name || 'UNKNOWN';
  document.getElementById('top-bar-project').textContent = t('common.projectPrefix') + name;
  document.getElementById('top-bar-time').textContent = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Detect worktree group membership
  const wg = project.worktreeGroup;
  if (wg && wg.siblingCount > 1) {
    worktreeMode = 'aggregated';
    currentRepoRoot = wg.repoRoot;
    worktreeFilter = null;
    worktreeExpanded = false;
  } else {
    worktreeMode = 'single';
    currentRepoRoot = null;
    currentWorktrees = null;
  }
  updateWtControls();

  updateSidebarActive(project);
  initialLoad();
}

// ===== 3b. Section Collapse =====

function toggleSectionCollapse(sectionId) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.classList.toggle('section-collapsed');
  updateSectionCollapseBtn(sectionId);
}

function updateSectionCollapseBtn(sectionId) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  var btn = document.getElementById(sectionId + '-toggle');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = sectionId + '-toggle';
    btn.className = 'section-toggle-btn';
    btn.onclick = function() { toggleSectionCollapse(sectionId); };
    el.parentNode.insertBefore(btn, el.nextSibling);
  }
  const isCollapsed = el.classList.contains('section-collapsed');
  const hasOverflow = isCollapsed && el.scrollHeight > el.clientHeight + 2;
  el.classList.toggle('section-has-overflow', hasOverflow);
  btn.textContent = isCollapsed ? t('panel.expand') : t('panel.collapse');
  btn.style.display = (isCollapsed && !hasOverflow) ? 'none' : '';
}

function updateAllSectionCollapse() {
  updateSectionCollapseBtn('pipeline-artifacts');
  updateSectionCollapseBtn('skill-ranking');
}

function toggleKanban() {
  kanbanCollapsed = !kanbanCollapsed;
  localStorage.setItem('kanbanCollapsed', kanbanCollapsed);
  applyKanbanCollapse();
}

function applyKanbanCollapse() {
  const board = document.getElementById('kanban-board');
  const btn = document.getElementById('kanban-toggle');
  if (!board) return;
  const totalTasks = board.querySelectorAll('.task-card').length;
  board.classList.toggle('kanban-collapsed', kanbanCollapsed);
  if (btn) btn.textContent = kanbanCollapsed ? t('kanban.expand') + ' (' + totalTasks + ' ' + t('kanban.tasks') + ')' : t('kanban.collapse');
  // Mark columns that actually overflow
  board.querySelectorAll('.kanban-column').forEach(col => {
    const cards = col.querySelector('.kanban-cards');
    if (cards) col.classList.toggle('has-overflow', cards.scrollHeight > cards.clientHeight + 2);
  });
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

  const visible = filterVisibleProjects(projects);
  const active = visible.filter(p => p.status !== 'archived').length;
  const archived = visible.filter(p => p.status === 'archived').length;
  const subtitle = document.getElementById('home-subtitle');
  if (subtitle) subtitle.textContent = t('home.subtitle').replace('{count}', visible.length).replace('{active}', active).replace('{archived}', archived);

  const hiddenCount = projects.length - visible.length;
  if (visible.length === 0 && hiddenCount > 0) {
    grid.innerHTML = '<div class="project-grid-empty">' +
      '<span>' + t('home.allHidden').replace('{count}', hiddenCount) + '</span>' +
      '<button class="project-unhide-all-btn" onclick="localStorage.removeItem(\'hiddenProjects\'); renderProjectCards(loadedProjects); renderSidebar(loadedProjects);">' + t('home.unhideAll') + '</button>' +
    '</div>';
    return;
  }

  grid.innerHTML = visible.map((p, i) => {
    const dotClass = p.status === 'archived' ? 'gray' : (p.status === 'building' ? 'blue' : 'green');
    const isActive = i === 0;
    const isArchived = p.status === 'archived';
    const successClass = isArchived ? 'muted' : 'green';

    return '<div class="project-card' + (isActive ? ' active-project' : '') + (isArchived ? ' archived' : '') + '" data-path="' + esc(p.path) + '">' +
      '<div class="project-card-header">' +
        '<div class="project-card-name-group">' +
          '<div class="project-card-dot ' + dotClass + '"></div>' +
          '<span class="project-card-name">' + esc(p.name) + '</span>' +
          (p.worktreeGroup && p.worktreeGroup.siblingCount > 1 ? '<span class="project-card-wt-badge">' + p.worktreeGroup.siblingCount + ' WT</span>' : '') +
        '</div>' +
        '<div class="project-card-header-right">' +
          '<span class="project-card-badge ' + p.status + '">' + p.status.toUpperCase() + '</span>' +
          '<button class="project-card-close" data-path="' + esc(p.path) + '" title="' + t('home.hideProject') + '">&times;</button>' +
        '</div>' +
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
      const target = visible.find(p => p.path === card.dataset.path);
      if (target) navigateToProject(target);
    });
  });
  grid.querySelectorAll('.project-card-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onHideProject(btn.dataset.path);
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
      port: p.port || null,
      path: p.path || '',
      worktreeGroup: p.worktreeGroup || null,
    }));
    loadedProjects = projects.length ? projects : DEMO_PROJECTS;
    // Auto-unhide project targeted by URL hash (e.g. apex dashboard re-launch)
    const hashUnhide = location.hash.match(/project=([^&]*)/);
    if (hashUnhide) {
      const hashPath = decodeURIComponent(hashUnhide[1]);
      if (getHiddenProjects().includes(hashPath)) {
        unhideProject(hashPath);
      }
    }
    renderProjectCards(loadedProjects);
    renderSidebar(loadedProjects);
    // Hub auto-select: match #project=PATH from URL hash, localStorage, or fall back to first
    const visibleForSelect = filterVisibleProjects(projects);
    if (currentView === 'home' && visibleForSelect.length > 0
        && location.port === '3456' && !sessionStorage.getItem('hubExplicitHome')) {
      let target = visibleForSelect[0];
      const hashMatch = location.hash.match(/project=([^&]*)/);
      if (hashMatch) {
        const requestedPath = decodeURIComponent(hashMatch[1]);
        const found = visibleForSelect.find(p => p.path === requestedPath);
        if (found) target = found;
      } else {
        // Fallback: restore last selected project from localStorage
        const lastPath = localStorage.getItem('lastProject');
        if (lastPath) {
          const found = visibleForSelect.find(p => p.path === lastPath);
          if (found) target = found;
        }
      }
      navigateToProject(target);
    }
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

  const visible = filterVisibleProjects(projects);
  const activeProjects = visible.filter(p => p.status !== 'archived');
  const archivedProjects = visible.filter(p => p.status === 'archived');

  const cardColors = ['#f0c040', '#22c55e', '#a2c9ff', '#e879a0'];
  list.innerHTML = activeProjects.map((p, i) => {
    const isActive = currentProject && currentProject.name === p.name;
    const dotColor = p.status === 'building' ? '#a2c9ff' : '#22c55e';
    const cardColor = cardColors[i % cardColors.length];
    const abbr = p.name.split('_')[0];
    return '<div class="sidebar-project-item' + (isActive ? ' active' : '') + '" data-path="' + esc(p.path) + '" style="--card-color:' + cardColor + '">' +
      '<div class="sidebar-project-dot" style="background:' + dotColor + '"></div>' +
      '<div class="sidebar-project-info">' +
        '<span class="sidebar-project-name">' + esc(p.name) + '</span>' +
        '<span class="sidebar-project-meta">' + p.tasks + t('common.tasks') + p.success.toFixed(1) + '%</span>' +
      '</div>' +
      '<button class="sidebar-project-close" data-path="' + esc(p.path) + '" title="' + t('home.hideProject') + '">&times;</button>' +
      '<div class="sidebar-project-compact">' +
        '<span class="compact-name">' + esc(abbr) + '</span>' +
        '<span class="compact-stats"><span class="compact-dot" style="background:' + dotColor + '"></span>' + p.success.toFixed(1) + '%</span>' +
      '</div>' +
    '</div>';
  }).join('');

  archivedList.innerHTML = archivedProjects.map((p, i) => {
    return '<div class="sidebar-archived-item" data-path="' + esc(p.path) + '">' +
      '<div class="sidebar-archived-dot"></div>' +
      '<span class="sidebar-archived-name">' + esc(p.name) + '</span>' +
      '<button class="sidebar-project-close" data-path="' + esc(p.path) + '" title="' + t('home.hideProject') + '">&times;</button>' +
    '</div>';
  }).join('');

  const allItems = [...list.querySelectorAll('.sidebar-project-item'), ...archivedList.querySelectorAll('.sidebar-archived-item')];
  allItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = visible.find(p => p.path === item.dataset.path);
      if (target) navigateToProject(target);
    });
  });
  [...list.querySelectorAll('.sidebar-project-close'), ...archivedList.querySelectorAll('.sidebar-project-close')].forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onHideProject(btn.dataset.path);
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

// ===== 5b. Worktree Controls =====

function updateWtControls() {
  var el = document.getElementById('wt-controls');
  if (!el) return;
  if (worktreeMode === 'single') { el.style.display = 'none'; return; }
  el.style.display = 'inline-flex';

  var allBtn = el.querySelector('.wt-mode-btn');
  allBtn.classList.toggle('active', worktreeMode === 'aggregated');
  allBtn.onclick = function() { switchToAggregated(); };

  var sel = document.getElementById('wt-filter-select');
  if (worktreeMode === 'filter') {
    sel.style.display = '';
    if (currentWorktrees && sel.options.length !== currentWorktrees.length + 1) {
      sel.innerHTML = '<option value="">-- select --</option>';
      currentWorktrees.forEach(function(wt) {
        var opt = document.createElement('option');
        opt.value = wt.label;
        opt.textContent = wt.label + (wt.isMain ? ' (main)' : '');
        if (wt.label === worktreeFilter) opt.selected = true;
        sel.appendChild(opt);
      });
    }
    sel.onchange = function() { worktreeFilter = sel.value || null; connectSSE(); };
  } else {
    sel.style.display = 'none';
  }
}

function switchToAggregated() {
  worktreeMode = 'aggregated';
  worktreeFilter = null;
  worktreeExpanded = false;
  updateWtControls();
  connectSSE();
}

function switchToFilter(label) {
  worktreeMode = 'filter';
  worktreeFilter = label;
  worktreeExpanded = false;
  updateWtControls();
  connectSSE();
}

// ===== 6. Dashboard Rendering (preserved) =====

function render(data) {
  renderKanban(data.tasks, data._worktrees);
  renderPipeline(data.state, data.tasks, data._worktrees, data.sessionPipelines, data.project);
  renderTelemetry(data.analytics);
  updateAllSectionCollapse();
  renderActivity(data.analytics);
  renderMemory(data.memory, data.globalMemory);

  // Update worktree controls if worktree data available
  if (data._worktrees) updateWtControls();

  // Derive status from state + tasks
  const stageActive = (data.state.current_stage || 'idle') !== 'idle';
  const tasksActive = (data.tasks.tasks || []).some(function(t) { return t.status === 'in_progress'; });
  var statusText = stageActive || tasksActive ? t('pipeline.statusRunning') : t('pipeline.statusIdle');
  if (data._summary && data._summary.activeWorktrees > 1) {
    statusText += ' (' + data._summary.activeWorktrees + ' worktrees)';
  }
  var activeSessions = (data.sessionPipelines || []).filter(function(sp) { return !sp.stale; });
  if (activeSessions.length > 1) {
    statusText += ' (' + activeSessions.length + ' ' + t('session.sessions') + ')';
  }
  if (data._cost && data._cost.totalUsd > 0) {
    statusText += ' | Cost: $' + data._cost.totalUsd.toFixed(2);
  }
  if (data._rateLimit && data._rateLimit.throttled) {
    statusText += ' | \u26a0\ufe0f THROTTLED';
  }
  document.getElementById('pipeline-status').textContent = statusText;
}

const KANBAN_LABEL_KEYS = {
  open: 'kanban.open', assigned: 'kanban.assigned', in_progress: 'kanban.inProgress',
  to_verify: 'kanban.toVerify', done: 'kanban.done'
};

function renderKanban(tasks, wtData) {
  var taskList = (tasks.tasks || []);
  // In filter mode with worktree data, filter to selected worktree
  if (worktreeMode === 'filter' && worktreeFilter && wtData) {
    taskList = taskList.filter(function(tk) { return tk._worktree === worktreeFilter; });
  }
  const cols = { open: [], assigned: [], in_progress: [], to_verify: [], done: [] };
  for (const tk of taskList) {
    const bucket = cols[tk.status] !== undefined ? tk.status : 'open';
    cols[bucket].push(tk);
  }
  for (const [status, items] of Object.entries(cols)) {
    const label = document.getElementById('col-label-' + status);
    if (label) label.textContent = t(KANBAN_LABEL_KEYS[status]) + ' [' + String(items.length).padStart(2, '0') + ']';
    const container = document.getElementById('col-' + status);
    if (!container) continue;
    if (items.length === 0) {
      container.innerHTML = '<div class="kanban-empty"><span class="kanban-empty-text">' + (status === 'done' ? t('kanban.noTasksDone') : t('kanban.noTasks')) + '</span></div>';
    } else {
      container.innerHTML = items.map(tk => {
        const statusClass = 'status-' + status.replace(/_/g, '-');
        const deps = tk.depends_on && tk.depends_on.length ? t('kanban.dep') + esc(tk.depends_on.join(', ')) : t('kanban.depNull');
        const wtBadge = tk._worktree ? '<div class="task-wt-badge">' + esc(tk._worktree) + '</div>' : '';
        return '<div class="task-card ' + statusClass + '"><div class="task-id">' + t('kanban.taskId') + esc(tk.id) + '</div>' + wtBadge + '<div class="task-title">' + esc(tk.title) + '</div><div class="task-meta"><span class="task-dep">' + deps + '</span><span class="task-evidence">' + (tk.evidence ? tk.evidence.length : 0) + t('kanban.evidence') + '</span></div></div>';
      }).join('');
    }
  }
  applyKanbanCollapse();
}

function renderPipeline(state, tasks, wtData, sessionPipelines, project) {
  var current = state.current_stage || 'idle';
  var fullHistory = state.history || [];

  // Only show stages completed in the CURRENT cycle.
  // Current cycle = everything after the last "idle" entry in history.
  var cycleStart = 0;
  for (var i = fullHistory.length - 1; i >= 0; i--) {
    if (fullHistory[i].stage === 'idle') { cycleStart = i + 1; break; }
  }
  var history = fullHistory.slice(cycleStart)
    .filter(function(h) { return h.completed; })
    .map(function(h) { return h.stage; });

  // If explicitly idle, show clean slate — no inherited checkmarks
  if (current === 'idle') {
    history = [];
  }

  // Compute per-stage worktree counts for aggregated mode
  var stageCounts = {};
  var stageAllCompleted = {};
  if (wtData && wtData.length > 1 && worktreeMode === 'aggregated') {
    STAGES.forEach(function(s) { stageCounts[s] = 0; stageAllCompleted[s] = true; });
    wtData.forEach(function(wtp) {
      var wtState = wtp.state && wtp.state.state ? wtp.state.state : {};
      var wtCurrent = wtState.current_stage || 'idle';
      // Only use current-cycle history for each worktree
      var wtFullHistory = wtState.history || [];
      var wtCycleStart = 0;
      for (var wi = wtFullHistory.length - 1; wi >= 0; wi--) {
        if (wtFullHistory[wi].stage === 'idle') { wtCycleStart = wi + 1; break; }
      }
      var wtHistory = wtFullHistory.slice(wtCycleStart)
        .filter(function(h) { return h.completed; })
        .map(function(h) { return h.stage; });
      STAGES.forEach(function(s) {
        if (s === wtCurrent) stageCounts[s]++;
        if (!wtHistory.includes(s) && s !== wtCurrent) stageAllCompleted[s] = false;
      });
    });
    // Override: in aggregated mode, stage is "active" if any worktree is there
    // stage is "completed" if ALL worktrees have passed it
    current = null; // no single current in aggregated
    history = [];
  }

  // Compute per-stage session counts for multi-session mode (single-project only)
  var sessionCounts = {};
  var sessionAllCompleted = {};
  var activeSessionList = (sessionPipelines || []).filter(function(sp) { return !sp.stale; });
  var isMultiSession = worktreeMode !== 'aggregated' && activeSessionList.length > 1;

  if (isMultiSession) {
    STAGES.forEach(function(s) { sessionCounts[s] = 0; sessionAllCompleted[s] = true; });
    activeSessionList.forEach(function(sp) {
      var spCurrent = sp.current_stage || 'idle';
      var spFH = sp.history || [];
      var spCS = 0;
      for (var si = spFH.length - 1; si >= 0; si--) {
        if (spFH[si].stage === 'idle') { spCS = si + 1; break; }
      }
      var spHistory = spFH.slice(spCS)
        .filter(function(h) { return h.completed; })
        .map(function(h) { return h.stage; });
      STAGES.forEach(function(s) {
        if (s === spCurrent) sessionCounts[s]++;
        if (!spHistory.includes(s) && s !== spCurrent) sessionAllCompleted[s] = false;
      });
    });
    current = null;
    history = [];
  }

  const stagesEl = document.getElementById('pipeline-stages');
  var isAgg = wtData && wtData.length > 1 && worktreeMode === 'aggregated';
  var isMulti = isAgg || isMultiSession;
  var multiCounts = isAgg ? stageCounts : sessionCounts;
  var multiAllCompleted = isAgg ? stageAllCompleted : sessionAllCompleted;

  stagesEl.innerHTML = '<div class="pipeline-line"></div>' + STAGES.map(function(s) {
    var isActive, isCompleted;
    if (isMulti) {
      isActive = multiCounts[s] > 0;
      isCompleted = multiAllCompleted[s] && !isActive;
    } else {
      isActive = s === current;
      isCompleted = history.includes(s);
    }
    var circleClass = isActive ? 'active' : isCompleted ? 'completed' : '';
    var icon = isCompleted ? CHECK_ICON : STAGE_ICONS[s];
    var badge = (isMulti && multiCounts[s] > 0)
      ? '<div class="wt-count-badge">' + multiCounts[s] + '</div>' : '';
    return '<div class="pipeline-stage"><div class="stage-circle ' + circleClass + '">' + icon + '</div><span class="stage-label ' + circleClass + '">' + t('stage.' + s) + '</span>' + badge + '</div>';
  }).join('') +
  (isAgg ? '<button class="wt-expand-btn" id="wt-expand-btn">' + (worktreeExpanded ? '▴' : '▾') + '</button>' : '') +
  (isMultiSession ? '<button class="wt-expand-btn" id="session-expand-btn">' + (sessionExpanded ? '▴' : '▾') + '</button>' : '');

  // Bind worktree expand/collapse
  var expandBtn = document.getElementById('wt-expand-btn');
  if (expandBtn) {
    expandBtn.onclick = function() {
      worktreeExpanded = !worktreeExpanded;
      renderWtExpandedRows(wtData);
      expandBtn.textContent = worktreeExpanded ? '▴' : '▾';
    };
  }

  // Bind session expand/collapse
  var sessionExpandBtn = document.getElementById('session-expand-btn');
  if (sessionExpandBtn) {
    sessionExpandBtn.onclick = function() {
      sessionExpanded = !sessionExpanded;
      renderSessionExpandedRows(activeSessionList);
      sessionExpandBtn.textContent = sessionExpanded ? '▴' : '▾';
    };
  }

  // Render expanded rows
  renderWtExpandedRows(wtData);
  renderSessionExpandedRows(isMultiSession ? activeSessionList : null);
  const artEl = document.getElementById('pipeline-artifacts');
  if (state.artifacts && Object.keys(state.artifacts).length > 0) {
    const entries = Object.entries(state.artifacts).filter(([, v]) => v && v.length > 0);
    if (entries.length > 0) {
      var gitUrl = (project && project.gitRemoteUrl) || '';
      artEl.innerHTML = entries.map(([stageName, items]) => '<div><div class="artifact-section-label">' + esc(stageName) + t('pipeline.artifacts') + '</div>' + items.map(item => {
        var isCommit = /^[0-9a-f]{7,40}$/.test(item);
        if (isCommit && gitUrl) {
          var commitUrl = esc(gitUrl) + '/commit/' + esc(item);
          return '<div class="artifact-item"><span class="artifact-dot"></span><a class="artifact-link" href="#" onclick="window.open(\'' + commitUrl + '\');return false;" title="' + t('pipeline.openCommit') + '">' + esc(item) + '</a></div>';
        } else if (!isCommit) {
          return '<div class="artifact-item"><span class="artifact-dot"></span><a class="artifact-link artifact-file" href="#" onclick="openLocalFile(\'' + esc(item).replace(/'/g, "\\'") + '\');return false;" title="' + t('pipeline.revealFile') + '">' + esc(item) + '</a></div>';
        }
        return '<div class="artifact-item"><span class="artifact-dot"></span><span class="artifact-name">' + esc(item) + '</span></div>';
      }).join('') + '</div>').join('');
      return;
    }
  }
  artEl.innerHTML = '<div class="empty-state">' +
    '<div class="empty-state-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 2"/><path d="M8 5v6M5 8h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></div>' +
    '<div class="empty-state-title">' + t('pipeline.noArtifacts') + '</div>' +
    '<div class="empty-state-hint">' + t('pipeline.noArtifactsHint') + '</div>' +
    '<div class="empty-state-cmd">' + t('pipeline.noArtifactsCmd') + '</div>' +
  '</div>';
}

function renderWtExpandedRows(wtData) {
  var container = document.getElementById('wt-expanded-rows');
  if (!container) return;
  if (!worktreeExpanded || !wtData || wtData.length < 2) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  container.style.display = '';
  container.innerHTML = wtData.map(function(wtp) {
    var wtState = wtp.state && wtp.state.state ? wtp.state.state : {};
    var wtCurrent = wtState.current_stage || 'idle';
    // Only use current-cycle history
    var wtFH = wtState.history || [];
    var wtCS = 0;
    for (var wj = wtFH.length - 1; wj >= 0; wj--) {
      if (wtFH[wj].stage === 'idle') { wtCS = wj + 1; break; }
    }
    var wtHistory = wtFH.slice(wtCS)
      .filter(function(h) { return h.completed; })
      .map(function(h) { return h.stage; });
    var circles = STAGES.map(function(s) {
      var cls = 'wt-mini-circle';
      if (s === wtCurrent) cls += ' active';
      else if (wtHistory.includes(s)) cls += ' completed';
      return '<div class="' + cls + '"></div>';
    }).join('');
    return '<div class="wt-row" data-wt-label="' + esc(wtp.label) + '">' +
      '<span class="wt-row-label">' + esc(wtp.label) + (wtp.isMain ? ' ★' : '') + '</span>' +
      '<div class="wt-row-stages">' + circles + '</div>' +
    '</div>';
  }).join('');
  // Click row → filter mode
  container.querySelectorAll('.wt-row').forEach(function(row) {
    row.addEventListener('click', function() {
      switchToFilter(row.dataset.wtLabel);
    });
  });
}

function renderSessionExpandedRows(sessions) {
  var container = document.getElementById('session-expanded-rows');
  if (!container) return;
  if (!sessionExpanded || !sessions || sessions.length < 2) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  container.style.display = '';
  container.innerHTML = sessions.map(function(sp) {
    var spCurrent = sp.current_stage || 'idle';
    var spFH = sp.history || [];
    var spCS = 0;
    for (var sj = spFH.length - 1; sj >= 0; sj--) {
      if (spFH[sj].stage === 'idle') { spCS = sj + 1; break; }
    }
    var spHistory = spFH.slice(spCS)
      .filter(function(h) { return h.completed; })
      .map(function(h) { return h.stage; });
    var circles = STAGES.map(function(s) {
      var cls = 'wt-mini-circle';
      if (s === spCurrent) cls += ' active';
      else if (spHistory.includes(s)) cls += ' completed';
      return '<div class="' + cls + '"></div>';
    }).join('');
    // Build label: "MMDD-summary" or fallback to "MMDD-randomId"
    var dateStr = '';
    var idMatch = sp.session_id.match(/apex-\d{4}-(\d{2})-(\d{2})/);
    if (idMatch) dateStr = idMatch[1] + idMatch[2];
    var label = dateStr;
    var summaryText = sp.summary && (sp.summary[currentLang] || sp.summary.en || sp.summary.zh);
    if (summaryText) {
      label += '-' + summaryText;
    } else {
      var randMatch = sp.session_id.match(/apex-\d{4}-\d{2}-\d{2}-(.+)/);
      if (randMatch) label += '-' + randMatch[1];
    }
    // CSS tooltip with i18n labels (no native title delay)
    var tooltipHtml = '<div class="session-tooltip">' +
      t('session.apexId') + ': ' + esc(sp.session_id) + '<br>' +
      t('session.stage') + ': ' + esc(sp.current_stage || 'idle') + '<br>' +
      t('session.lastActive') + ': ' + esc(sp.last_updated) +
      '</div>';
    return '<div class="wt-row" data-session-id="' + esc(sp.session_id) + '">' +
      '<div class="session-label-group">' +
        '<span class="session-label">' + esc(label) + '</span>' +
        '<span class="session-info-icon">\u24d8' + tooltipHtml + '</span>' +
      '</div>' +
      '<div class="wt-row-stages">' + circles + '</div>' +
    '</div>';
  }).join('');
}

function renderTelemetry(analytics) {
  const all = analytics || [];
  // Skill events for ranking + success rate
  const pipelineNames = new Set(['brainstorm','plan','execute','review','ship','compound','idle','task','artifact','memory']);
  const skillEvents = all.filter(a => !pipelineNames.has(a.skill || a.name || ''));
  // Stage completed events for avg duration (these have real set→completed time diffs)
  const stageCompleted = all.filter(a => a.outcome === 'success' && pipelineNames.has(a.skill || '') && (a.duration_s || 0) > 0);

  if (skillEvents.length === 0 && stageCompleted.length === 0) {
    document.getElementById('stat-total').textContent = '0';
    document.getElementById('stat-avg').innerHTML = '0<span class="stat-unit">' + t('telemetry.seconds') + '</span>';
    document.getElementById('stat-rate').textContent = '--';
    renderSkillBars([]);
    return;
  }

  // Avg duration from stage completions (real timing data)
  var avgDur = 0;
  if (stageCompleted.length > 0) {
    var totalStageDur = 0;
    for (const s of stageCompleted) totalStageDur += (s.duration_s || 0);
    avgDur = totalStageDur / stageCompleted.length;
  }

  // Skill ranking + success rate from skill invocations
  const bySkill = {}; let successes = 0;
  const okOutcomes = new Set(['success','pass','APPROVED','PASS','completed','PASS_WITH_NOTE']);
  for (const a of skillEvents) { const s = a.skill || a.name || 'unknown'; if (!bySkill[s]) bySkill[s] = { count: 0, dur: 0 }; bySkill[s].count++; if (okOutcomes.has(a.outcome || a.result || '')) successes++; }

  document.getElementById('stat-total').textContent = all.length.toLocaleString();
  document.getElementById('stat-avg').innerHTML = avgDur.toFixed(1) + '<span class="stat-unit">' + t('telemetry.seconds') + '</span>';
  document.getElementById('stat-rate').textContent = skillEvents.length > 0 ? (successes / skillEvents.length * 100).toFixed(1) + '%' : '--';
  const entries = Object.entries(bySkill).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  const maxCount = Math.max(...entries.map(([, v]) => v.count), 1);
  renderSkillBars(entries.map(([name, data]) => ({ name: name.toUpperCase(), count: data.count, pct: Math.round(data.count / maxCount * 100) })));
}

function renderSkillBars(bars) {
  const el = document.getElementById('skill-bars');
  if (bars.length === 0) {
    el.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);text-align:center;padding:12px 0;">' + t('telemetry.noSkillData') + '</div>';
    return;
  }
  el.innerHTML = bars.map(b => '<div class="skill-bar-row"><div class="skill-bar-header"><span class="skill-bar-name">' + esc(b.name) + '</span><span class="skill-bar-count">' + b.count + t('telemetry.calls') + '</span></div><div class="skill-bar-track"><div class="skill-bar-fill" style="width:' + b.pct + '%"></div></div></div>').join('');
}

function renderActivity(analytics) {
  const el = document.getElementById('activity-stream');
  if (!analytics || analytics.length === 0) {
    el.innerHTML = '<div class="empty-state">' +
      '<div class="empty-state-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v3.5l2.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
      '<div class="empty-state-title">' + t('activity.noActivity') + '</div>' +
      '<div class="empty-state-hint">' + t('activity.noActivityHint') + '</div>' +
    '</div>';
    return;
  }
  el.innerHTML = analytics.slice(-30).reverse().map(a => {
    const ts = (a.ts || a.timestamp || '').slice(11, 23) || '--:--:--.---';
    const skill = (a.skill || a.name || 'unknown').toUpperCase();
    const oc = a.outcome || a.result || 'unknown';
    const failOutcomes = new Set(['error', 'failed', 'fail', 'blocked', 'timeout']);
    const isFail = failOutcomes.has(oc);
    const dur = a.source === 'hook' ? (a.meta && a.meta.file ? esc(a.meta.file.split('/').pop()) : '') : (a.duration_s != null ? a.duration_s : (a.duration || 0)).toFixed(3) + 's';
    return renderActivityRow({ time: ts, skill, status: isFail ? 'failed' : 'success', label: oc, dur }, false);
  }).join('');
}

function renderActivityRow(r, highlighted) {
  const statusIcon = r.status === 'success' ? '<svg class="activity-status-icon" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>' : '<svg class="activity-status-icon" viewBox="0 0 10 10"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const statusText = r.label ? esc(r.label) : (r.status === 'success' ? t('activity.success') : t('activity.failed'));
  return '<div class="activity-row' + (highlighted ? ' highlighted' : '') + '"><span class="activity-time">' + esc(r.time) + '</span><span class="activity-skill">' + esc(r.skill) + '</span><span class="activity-status ' + r.status + '">' + statusText + ' ' + statusIcon + '</span><span class="activity-duration">' + esc(r.dur) + '</span></div>';
}

function renderMemory(memory, globalMemory) {
  const el = document.getElementById('memory-list');
  const projectFacts = (memory && memory.facts) || [];
  const globalFacts = (globalMemory && globalMemory.facts) || [];

  if (projectFacts.length === 0 && globalFacts.length === 0) {
    el.innerHTML = '<div class="empty-state">' +
      '<div class="empty-state-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.2"/><path d="M5 6h6M5 8.5h4M5 11h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></div>' +
      '<div class="empty-state-title">' + t('memory.noFacts') + '</div>' +
      '<div class="empty-state-hint">' + t('memory.noFactsHint') + '</div>' +
      '<div class="empty-state-cmd">' + t('memory.noFactsCmd') + '</div>' +
    '</div>';
    return;
  }

  var html = '';

  if (globalFacts.length > 0) {
    html += '<div class="memory-layer-label">' + t('memory.globalLayer') + ' (' + globalFacts.length + ')</div>';
    html += [...globalFacts].sort((a, b) => b.confidence - a.confidence).map(f => {
      const conf = f.confidence != null ? f.confidence : 0;
      return renderMemoryFact({ confidence: conf, level: conf >= 0.8 ? 'high' : conf >= 0.5 ? 'med' : 'low', content: f.content, tags: f.tags || [], layer: 'global' });
    }).join('');
  }

  if (projectFacts.length > 0) {
    html += '<div class="memory-layer-label">' + t('memory.projectLayer') + ' (' + projectFacts.length + ')</div>';
    html += [...projectFacts].sort((a, b) => b.confidence - a.confidence).map(f => {
      const conf = f.confidence != null ? f.confidence : 0;
      return renderMemoryFact({ confidence: conf, level: conf >= 0.8 ? 'high' : conf >= 0.5 ? 'med' : 'low', content: f.content, tags: f.tags || [], layer: 'project' });
    }).join('');
  }

  el.innerHTML = html;
}

function renderMemoryFact(f) {
  const levelLabel = f.level === 'high' ? t('memory.high') : f.level === 'med' ? t('memory.med') : t('memory.low');
  return '<div class="memory-fact confidence-' + f.level + '"><div class="memory-fact-header"><span class="memory-confidence-badge ' + f.level + '">' + levelLabel + t('memory.confidence') + ' (' + f.confidence.toFixed(2) + ')</span><div class="memory-tags">' + f.tags.map(tg => '<span class="memory-tag">' + esc(tg) + '</span>').join('') + '</div></div><div class="memory-fact-content">' + esc(f.content) + '</div></div>';
}

// ===== 6b. Design Comparison =====

function renderDesignComparison() {
  var designsUrl = '/api/designs' + projectQueryParam();
  fetch(designsUrl).then(r => r.json()).then(data => {
    const designs = data.designs || [];
    const gallery = document.getElementById('variant-gallery');
    const countEl = document.getElementById('variant-count');
    if (!gallery) return;

    if (countEl) countEl.textContent = designs.length + t('design.variants');

    if (designs.length === 0) {
      gallery.innerHTML = '<div class="activity-empty">' + t('design.noDesigns') + '</div>';
      return;
    }

    gallery.innerHTML = designs.map((d, i) => {
      const isImage = /\.(png|jpg|jpeg)$/i.test(d.name);
      const previewStyle = isImage
        ? 'background-image:url(/api/designs/file?path=' + encodeURIComponent(d.path) + ');background-size:cover;background-position:center;'
        : '';
      const sizeKB = d.size ? Math.round(d.size / 1024) + ' KB' : '';
      return '<div class="variant-card">' +
        '<div class="variant-preview" style="' + previewStyle + '">' +
          '<div class="variant-preview-gradient"></div>' +
          '<span class="variant-number"></span>' +
          (isImage ? '<div class="variant-expand-btn" onclick="window.open(\'/api/designs/file?path=' + encodeURIComponent(d.path) + '\',\'_blank\')">' +
            '<svg width="22" height="15" viewBox="0 0 22 15" fill="none"><path d="M1 1L8 8L1 15" stroke="currentColor" stroke-width="1.5"/><path d="M14 1L21 8L14 15" stroke="currentColor" stroke-width="1.5"/></svg>' +
          '</div>' : '') +
        '</div>' +
        '<div class="variant-info">' +
          '<div class="variant-name">' + esc(d.name) + '</div>' +
          '<div class="variant-path">' + sizeKB + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }).catch(() => {
    const gallery = document.getElementById('variant-gallery');
    if (gallery) gallery.innerHTML = '<div class="activity-empty">' + t('design.loadError') + '</div>';
  });
}

// ===== 7. Utility =====

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openLocalFile(path) {
  fetch('/api/open-file?path=' + encodeURIComponent(path))
    .then(r => r.json())
    .then(d => { if (d.error) console.warn('open-file:', d.error); })
    .catch(() => {});
}

// ===== 8. SSE =====

function projectQueryParam() {
  return currentProject && currentProject.path ? '?project=' + encodeURIComponent(currentProject.path) : '';
}

function sseEndpoint() {
  if (worktreeMode === 'aggregated' && currentRepoRoot) {
    return '/api/events/aggregated?repo=' + encodeURIComponent(currentRepoRoot);
  }
  if (worktreeMode === 'filter' && worktreeFilter && currentWorktrees) {
    var wt = currentWorktrees.find(function(w) { return w.label === worktreeFilter; });
    if (wt) return '/api/events?project=' + encodeURIComponent(wt.path);
  }
  return '/api/events' + projectQueryParam();
}

function stateEndpoint() {
  if (worktreeMode === 'aggregated' && currentRepoRoot) {
    return '/api/state/aggregated?repo=' + encodeURIComponent(currentRepoRoot);
  }
  if (worktreeMode === 'filter' && worktreeFilter && currentWorktrees) {
    var wt = currentWorktrees.find(function(w) { return w.label === worktreeFilter; });
    if (wt) return '/api/state?project=' + encodeURIComponent(wt.path);
  }
  return '/api/state' + projectQueryParam();
}

function connectSSE() {
  if (evtSource) evtSource.close();
  sseConnected = false;
  var url = sseEndpoint();
  evtSource = new EventSource(url);
  evtSource.onopen = () => { sseConnected = true; };
  evtSource.onmessage = (e) => { sseConnected = true; try { renderWithMode(JSON.parse(e.data)); } catch {} };
  evtSource.onerror = () => { if (evtSource.readyState === EventSource.CLOSED) { sseConnected = false; setTimeout(connectSSE, 5000); } };
}

function renderWithMode(data) {
  if (data.mode === 'aggregated' && data.worktrees) {
    currentWorktrees = data.worktrees;
    // Merge analytics and memory from all worktrees
    var allAnalytics = [];
    var allFacts = [];
    data.worktrees.forEach(function(wtp) {
      if (wtp.state.analytics) allAnalytics = allAnalytics.concat(wtp.state.analytics);
      if (wtp.state.memory && wtp.state.memory.facts) {
        wtp.state.memory.facts.forEach(function(f) { allFacts.push(Object.assign({}, f, { _worktree: wtp.label })); });
      }
    });
    render({
      tasks: data.tasks,
      state: data.worktrees[0] ? data.worktrees[0].state.state : { current_stage: 'idle', history: [], artifacts: {} },
      analytics: allAnalytics,
      memory: { facts: allFacts, next_id: 1 },
      project: data.repo,
      _worktrees: data.worktrees,
      _summary: data.summary,
      _cost: data.cost || null,
      _rateLimit: data.rateLimit || null,
    });
  } else {
    currentWorktrees = null;
    render(data);
  }
}

async function initialLoad() {
  try {
    var url = stateEndpoint();
    var res = await fetch(url);
    renderWithMode(await res.json());
  } catch {
    render({
      tasks: { tasks: [] },
      state: { current_stage: 'idle', history: [], artifacts: {} },
      analytics: [],
      memory: { facts: [] },
      project: { name: currentProject ? currentProject.name : 'unknown' }
    });
  }
  renderDesignComparison();
  connectSSE();
}

// ===== 9. Init =====

document.addEventListener('DOMContentLoaded', () => {
  applyLocale();
  updateAllSectionCollapse();
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
