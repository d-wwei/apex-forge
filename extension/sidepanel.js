// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.panel).classList.add('active');
  });
});

// Read connection info from storage
let port = null;
let token = null;
let eventSource = null;

async function connect() {
  // Try to read port from storage or default
  const stored = await chrome.storage.local.get(['apex_port', 'apex_token']);
  port = stored.apex_port || 34567;
  token = stored.apex_token || '';

  // Also try to read from auth file via fetch
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
    setTimeout(connect, 3000); // retry
  }
}

function setConnected(yes) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  dot.className = `dot ${yes ? 'connected' : 'disconnected'}`;
  text.textContent = yes ? `Connected (port ${port})` : 'Disconnected \u2014 retrying...';
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
    const refs = JSON.parse(e.data);
    updateRefs(refs);
  });

  eventSource.onerror = () => {
    setConnected(false);
    eventSource.close();
    setTimeout(connect, 3000);
  };
}

function addEvent(data) {
  const events = document.getElementById('events');
  const div = document.createElement('div');
  div.className = 'event';

  const time = new Date(data.ts).toLocaleTimeString();
  const dur = data.duration_ms ? `${data.duration_ms}ms` : '';
  const status = data.ok !== false ? 'ok' : 'err';

  div.innerHTML = `
    <span class="time">${time}</span>
    <span class="cmd">${data.command || ''}</span>
    <span class="${status}">${data.ok !== false ? '\u2713' : '\u2717'}</span>
    <span class="dur">${dur}</span>
    ${data.result ? `<div style="color:#aaa;margin-top:2px">${String(data.result).slice(0, 200)}</div>` : ''}
  `;

  events.insertBefore(div, events.firstChild);

  // Cap at 200 events
  while (events.children.length > 201) events.removeChild(events.lastChild);
}

function updateRefs(refs) {
  const list = document.getElementById('ref-list');
  if (!refs || refs.length === 0) {
    list.innerHTML = 'No refs yet.';
    return;
  }
  list.innerHTML = refs.map(r =>
    `<div class="ref-item"><span class="ref-id">${r.id}</span> <span class="ref-role">[${r.role}]</span> "${r.name}"</div>`
  ).join('');
}

connect();
