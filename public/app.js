const MIC_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
  <line x1="12" y1="19" x2="12" y2="23"></line>
  <line x1="8" y1="23" x2="16" y2="23"></line>
</svg>`;

const MIC_MUTED_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="1" y1="1" x2="23" y2="23"></line>
  <path d="M9 9v3a3 3 0 0 0 5.12 2.12"></path>
  <path d="M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
  <path d="M17 16.95A7 7 0 0 1 5 12v-2"></path>
  <path d="M19 10v2a7 7 0 0 1-.11 1.23"></path>
  <line x1="12" y1="19" x2="12" y2="23"></line>
  <line x1="8" y1="23" x2="16" y2="23"></line>
</svg>`;

const els = {
  activeBar: document.getElementById('active-bar'),
  liveDot: document.getElementById('live-dot'),
  liveLabel: document.getElementById('live-label'),
  activeName: document.getElementById('active-name'),
  switchBtn: document.getElementById('switch-btn'),
  connectionScreen: document.getElementById('connection-screen'),
  dashboardScreen: document.getElementById('dashboard-screen'),
  connectionList: document.getElementById('connection-list'),
  addForm: document.getElementById('add-form'),
  addSubmit: document.getElementById('add-submit'),
  connectionError: document.getElementById('connection-error'),
  seatGrid: document.getElementById('seat-grid'),
  dashboardEmpty: document.getElementById('dashboard-empty'),
  sizeFooter: document.getElementById('size-footer'),
  seatSizeSlider: document.getElementById('seat-size-slider'),
  allOffBtn: document.getElementById('all-off-btn'),
  allOffExceptChairBtn: document.getElementById('all-off-except-chair-btn'),
};

const state = {
  connections: [],
  activeId: null,
  seats: new Map(),
  ws: null,
  wsRetryMs: 1000,
};

async function api(url, options) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

function activeConnection() {
  return state.connections.find((c) => c.id === state.activeId) || null;
}

function showConnectionScreen() {
  els.connectionScreen.hidden = false;
  els.dashboardScreen.hidden = true;
  els.activeBar.hidden = true;
  els.sizeFooter.hidden = true;
}

function showDashboardScreen() {
  els.connectionScreen.hidden = true;
  els.dashboardScreen.hidden = false;
  els.activeBar.hidden = false;
  els.sizeFooter.hidden = false;
  const conn = activeConnection();
  els.activeName.textContent = conn ? conn.ip : '';
}

const SEAT_SIZE_KEY = 'dcernoSeatSize';

function applySeatSize(px) {
  document.documentElement.style.setProperty('--seat-size', `${px}px`);
}

function initSeatSizeSlider() {
  const saved = Number(localStorage.getItem(SEAT_SIZE_KEY));
  const initial = saved && saved >= 44 && saved <= 120 ? saved : Number(els.seatSizeSlider.value);
  els.seatSizeSlider.value = initial;
  applySeatSize(initial);

  els.seatSizeSlider.addEventListener('input', () => {
    const value = Number(els.seatSizeSlider.value);
    applySeatSize(value);
    localStorage.setItem(SEAT_SIZE_KEY, String(value));
  });
}

function renderConnectionList() {
  els.connectionList.innerHTML = '';
  if (state.connections.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No saved connections yet.';
    li.style.color = 'var(--text-dim)';
    els.connectionList.appendChild(li);
    return;
  }

  for (const conn of state.connections) {
    const li = document.createElement('li');

    const info = document.createElement('span');
    info.className = 'connection-info';
    info.innerHTML = `<span class="ip">${escapeHtml(conn.ip)}</span>`;

    const actions = document.createElement('span');
    actions.className = 'connection-actions';

    if (conn.id === state.activeId) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Active';
      actions.appendChild(badge);
    } else {
      const connectBtn = document.createElement('button');
      connectBtn.className = 'btn-sm';
      connectBtn.textContent = 'Connect';
      connectBtn.addEventListener('click', () => activateConnection(conn.id));
      actions.appendChild(connectBtn);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-sm danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeConnection(conn.id));
    actions.appendChild(removeBtn);

    li.appendChild(info);
    li.appendChild(actions);
    els.connectionList.appendChild(li);
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadConnections() {
  const data = await api('/api/connections');
  state.connections = data.connections;
  state.activeId = data.activeId;
  renderConnectionList();

  if (state.activeId && activeConnection()) {
    showDashboardScreen();
    await enterDashboard();
  } else {
    showConnectionScreen();
  }
}

async function activateConnection(id) {
  await api(`/api/connections/${id}/activate`, { method: 'POST' });
  await loadConnections();
}

async function removeConnection(id) {
  closeSocket();
  await api(`/api/connections/${id}`, { method: 'DELETE' });
  await loadConnections();
}

els.addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.connectionError.hidden = true;
  els.addSubmit.disabled = true;
  els.addSubmit.textContent = 'Connecting…';

  const formData = new FormData(els.addForm);
  const payload = {
    ip: formData.get('ip').trim(),
    apiKey: formData.get('apiKey').trim(),
  };

  try {
    await api('/api/connections', { method: 'POST', body: JSON.stringify(payload) });
    els.addForm.reset();
    await loadConnections();
  } catch (err) {
    els.connectionError.textContent = err.message;
    els.connectionError.hidden = false;
  } finally {
    els.addSubmit.disabled = false;
    els.addSubmit.textContent = 'Add & connect';
  }
});

els.switchBtn.addEventListener('click', () => {
  closeSocket();
  showConnectionScreen();
});

async function enterDashboard() {
  state.seats = new Map();
  renderSeatGrid();

  try {
    const data = await api('/api/seats');
    for (const seat of data.seats) state.seats.set(seat.seatNumber, seat);
    renderSeatGrid();
  } catch (err) {
    els.dashboardEmpty.textContent = `Failed to load seats: ${err.message}`;
    els.dashboardEmpty.hidden = false;
  }

  openSocket();
}

function renderSeatGrid() {
  els.seatGrid.innerHTML = '';
  const seats = [...state.seats.values()].sort((a, b) => a.seatNumber - b.seatNumber);
  els.dashboardEmpty.hidden = seats.length > 0;

  for (const seat of seats) {
    els.seatGrid.appendChild(buildSeatCard(seat));
  }
}

const ROLE_LABELS = { vip: 'VIP', chairperson: 'Chair', delegate: 'Delegate' };

function roleLabel(role) {
  return ROLE_LABELS[role] || '';
}

function buildSeatCard(seat) {
  const card = document.createElement('button');
  card.className = 'seat-card';
  card.dataset.seat = String(seat.seatNumber);
  applySeatCardState(card, seat);

  card.innerHTML = `
    <span class="seat-number">${seat.seatNumber}</span>
    <span class="mic-icon-wrap">
      <span class="icon icon-normal">${MIC_ICON}</span>
      <span class="icon icon-muted">${MIC_MUTED_ICON}</span>
    </span>
    <span class="role-tag role-${seat.role || 'none'}">${roleLabel(seat.role)}</span>
  `;

  card.addEventListener('click', () => toggleMic(seat.seatNumber));
  return card;
}

function applySeatCardState(card, seat) {
  card.classList.toggle('mic-on', Boolean(seat.microphoneOn));
  card.classList.toggle('offline', !seat.online);
  card.disabled = !seat.online;

  const roleTag = card.querySelector('.role-tag');
  if (roleTag) {
    roleTag.textContent = roleLabel(seat.role);
    roleTag.className = `role-tag role-${seat.role || 'none'}`;
  }
}

function upsertSeat(seat) {
  state.seats.set(seat.seatNumber, seat);
  const existingCard = els.seatGrid.querySelector(`[data-seat="${seat.seatNumber}"]`);
  if (existingCard) {
    applySeatCardState(existingCard, seat);
  } else {
    els.seatGrid.appendChild(buildSeatCard(seat));
    els.dashboardEmpty.hidden = true;
  }
}

function removeSeatCard(seatNumber) {
  state.seats.delete(seatNumber);
  const card = els.seatGrid.querySelector(`[data-seat="${seatNumber}"]`);
  if (card) card.remove();
  els.dashboardEmpty.hidden = state.seats.size > 0;
}

async function toggleMic(seatNumber) {
  const seat = state.seats.get(seatNumber);
  if (!seat || !seat.online) return;

  const card = els.seatGrid.querySelector(`[data-seat="${seatNumber}"]`);
  const desired = !seat.microphoneOn;

  const optimistic = { ...seat, microphoneOn: desired };
  state.seats.set(seatNumber, optimistic);
  if (card) {
    applySeatCardState(card, optimistic);
    card.classList.add('pending');
  }

  try {
    await api(`/api/seats/${seatNumber}/mic`, { method: 'PUT', body: JSON.stringify({ on: desired }) });
  } catch (err) {
    state.seats.set(seatNumber, seat);
    if (card) applySeatCardState(card, seat);
    console.error(`Failed to toggle mic for seat ${seatNumber}:`, err.message);
  } finally {
    if (card) card.classList.remove('pending');
  }
}

async function runBulkAction(button, url) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Working…';
  try {
    await api(url, { method: 'POST' });
  } catch (err) {
    console.error(`Bulk action failed: ${err.message}`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

els.allOffBtn.addEventListener('click', () => runBulkAction(els.allOffBtn, '/api/seats/all-off'));
els.allOffExceptChairBtn.addEventListener('click', () =>
  runBulkAction(els.allOffExceptChairBtn, '/api/seats/all-off-except-chair')
);

function setLiveStatus(status) {
  els.liveDot.classList.remove('live', 'reconnecting');
  if (status === 'live') {
    els.liveDot.classList.add('live');
    els.liveLabel.textContent = 'Live';
  } else if (status === 'reconnecting') {
    els.liveDot.classList.add('reconnecting');
    els.liveLabel.textContent = 'Reconnecting…';
  } else {
    els.liveLabel.textContent = 'Connecting…';
  }
}

function openSocket() {
  closeSocket();
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}/ws`);
  state.ws = ws;

  ws.addEventListener('open', () => {
    state.wsRetryMs = 1000;
    setLiveStatus('live');
  });

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'snapshot') {
      state.seats = new Map(message.seats.map((s) => [s.seatNumber, s]));
      renderSeatGrid();
    } else if (message.type === 'seatChanged') {
      upsertSeat(message.seat);
    } else if (message.type === 'seatRemoved') {
      removeSeatCard(message.seatNumber);
    }
  });

  ws.addEventListener('close', () => {
    if (state.ws !== ws) return; // superseded by a newer socket
    setLiveStatus('reconnecting');
    setTimeout(() => {
      if (state.activeId) openSocket();
    }, state.wsRetryMs);
    state.wsRetryMs = Math.min(state.wsRetryMs * 2, 15000);
  });

  ws.addEventListener('error', () => ws.close());
}

function closeSocket() {
  if (state.ws) {
    const ws = state.ws;
    state.ws = null;
    ws.close();
  }
}

async function prefillDevDefaults() {
  try {
    const { apiKey } = await api('/api/dev-defaults');
    if (apiKey) els.addForm.elements.apiKey.value = apiKey;
  } catch {
    // dev convenience only, safe to ignore
  }
}

initSeatSizeSlider();

loadConnections()
  .catch((err) => {
    els.connectionError.textContent = err.message;
    els.connectionError.hidden = false;
    showConnectionScreen();
  })
  .finally(prefillDevDefaults);
