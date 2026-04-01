// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.panel).classList.add('active');
  });
});

let port = null;
let token = null;
let eventSource = null;

async function connect() {
  const stored = await chrome.storage.local.get(['apex_port', 'apex_token']);
  port = stored.apex_port || 34567;
  token = stored.apex_token || '';

  try {
    const resp = await fetch(`http://127.0.0.1:${port}/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (resp.ok) {
      setConnected(true);
      startActivityStream();
    } else {
      setConnected(false);
      setTimeout(connect, 3000);
    }
  } catch {
    setConnected(false);
    setTimeout(connect, 3000);
  }
}

function setConnected(yes) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const footer = document.getElementById('footer-status');
  dot.className = `status-dot ${yes ? '' : 'disconnected'}`;
  text.textContent = yes
    ? `ORCHESTRATION ACTIVE | PORT ${port}`
    : 'DISCONNECTED \u2014 RETRYING...';
  footer.textContent = yes ? 'MCP: CONNECTED' : 'MCP: --';
}

function startActivityStream() {
  if (eventSource) eventSource.close();
  const url = `http://127.0.0.1:${port}/activity/stream`;
  eventSource = new EventSource(url);

  eventSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    addEvent(data);
  };

  eventSource.addEventListener('refs', (e) => {
    updateRefs(JSON.parse(e.data));
  });

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      setConnected(false);
      setTimeout(connect, 3000);
    }
  };
}

function addEvent(data) {
  const events = document.getElementById('events');
  // Clear empty state
  if (events.querySelector('.empty-state')) events.innerHTML = '';

  const div = document.createElement('div');
  const isOk = data.ok !== false;
  div.className = 'log-entry' + (isOk ? '' : ' error');

  const time = new Date(data.ts).toLocaleTimeString('en-US', { hour12: false });
  const dur = data.duration_ms ? `(${(data.duration_ms / 1000).toFixed(3)}s)` : '';
  const statusLabel = isOk ? 'OK' : 'FAIL';
  const statusClass = isOk ? 'ok' : 'err';
  const statusIcon = isOk
    ? '<svg width="8" height="8" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>'
    : '<svg width="8" height="8" viewBox="0 0 10 10"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  const cmd = esc(data.command || 'UNKNOWN');
  const result = data.result ? esc(String(data.result).slice(0, 120)) : '';

  div.innerHTML =
    '<div class="log-entry-header">' +
      '<span class="log-entry-time">' + time + '</span>' +
      '<span class="log-entry-status ' + statusClass + '">' + statusLabel + ' ' + statusIcon + '</span>' +
    '</div>' +
    '<div class="log-entry-detail">' +
      '<span class="log-entry-skill">' + cmd + '</span>' +
      '<span class="log-entry-target">' + result + ' ' + dur + '</span>' +
    '</div>';

  events.insertBefore(div, events.firstChild);
  while (events.children.length > 200) events.removeChild(events.lastChild);
}

function updateRefs(refs) {
  const list = document.getElementById('ref-list');
  if (!refs || refs.length === 0) {
    list.innerHTML = '<div class="empty-state">No refs yet. Run a snapshot command.</div>';
    return;
  }
  list.innerHTML = refs.map(r =>
    '<div class="ref-item"><span class="ref-id">' + esc(r.id) + '</span> <span class="ref-role">[' + esc(r.role) + ']</span> "' + esc(r.name) + '"</div>'
  ).join('');
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

connect();
