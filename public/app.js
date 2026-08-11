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

const ENTER_FULLSCREEN_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
  <path d="M21 8V5a2 2 0 0 0-2-2h-3"></path>
  <path d="M3 16v3a2 2 0 0 0 2 2h3"></path>
  <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
</svg>`;

const EXIT_FULLSCREEN_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
  <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
  <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
  <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
</svg>`;

const els = {
  activeBar: document.getElementById('active-bar'),
  liveDot: document.getElementById('live-dot'),
  liveLabel: document.getElementById('live-label'),
  activeName: document.getElementById('active-name'),
  settingsBtn: document.getElementById('settings-btn'),
  connectionScreen: document.getElementById('connection-screen'),
  dashboardScreen: document.getElementById('dashboard-screen'),
  addForm: document.getElementById('add-form'),
  addSubmit: document.getElementById('add-submit'),
  connectionError: document.getElementById('connection-error'),
  seatGrid: document.getElementById('seat-grid'),
  dashboardEmpty: document.getElementById('dashboard-empty'),
  sizeFooter: document.getElementById('size-footer'),
  seatSizeSlider: document.getElementById('seat-size-slider'),
  allOffBtn: document.getElementById('all-off-btn'),
  allOffExceptChairBtn: document.getElementById('all-off-except-chair-btn'),
  fullscreenBtn: document.getElementById('fullscreen-btn'),
  settingsModal: document.getElementById('settings-modal'),
  settingsForm: document.getElementById('settings-form'),
  settingsIp: document.getElementById('settings-ip'),
  settingsApiKey: document.getElementById('settings-apikey'),
  settingsSaveBtn: document.getElementById('settings-save-btn'),
  settingsCancelBtn: document.getElementById('settings-cancel-btn'),
  settingsError: document.getElementById('settings-error'),
};

const state = {
  connectionIp: null,
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
  els.activeName.textContent = state.connectionIp || '';
  updateSeatSizeBounds();
}

const SEAT_SIZE_KEY = 'dcernoSeatSize';
const SEAT_GRID_COLUMNS = 10;
const SEAT_GRID_GAP = 8; // must match the `gap` on .seat-grid in styles.css
const SEAT_CARD_ASPECT_RATIO = 16 / 9; // width:height, must match .seat-card in styles.css
const SEAT_SIZE_MIN_FLOOR = 32;
const SEAT_SIZE_DEFAULT_RATIO = 0.6; // fraction of full-width max used as the first-run default
const SEAT_SIZE_HEIGHT_SAFETY_MARGIN = 12; // breathing room below the last row

let seatSizeBoundsInitialized = false;

function applySeatSize(px) {
  document.documentElement.style.setProperty('--seat-size', `${px}px`);
}

// The slider's max is bounded by whichever runs out first: card width (must
// fit all 10 columns across) or card height (all rows must fit under the
// header/footer without the page scrolling). Without the height half of
// this, a large card size could fit widthwise but still push the grid
// taller than the viewport -- which triggers a vertical scrollbar, which
// narrows the usable width, which then triggers a horizontal one too.
function computeMaxSeatSize() {
  const availableWidth = els.seatGrid.clientWidth;
  if (availableWidth <= 0) return null;
  const maxByWidth = Math.floor((availableWidth - SEAT_GRID_GAP * (SEAT_GRID_COLUMNS - 1)) / SEAT_GRID_COLUMNS);

  const rows = Math.max(1, Math.ceil((state.seats.size || SEAT_GRID_COLUMNS) / SEAT_GRID_COLUMNS));
  const gridTop = els.seatGrid.getBoundingClientRect().top;
  const footerHeight = els.sizeFooter.hidden ? 0 : els.sizeFooter.offsetHeight;
  const availableHeight = window.innerHeight - gridTop - footerHeight - SEAT_SIZE_HEIGHT_SAFETY_MARGIN;
  const maxCardHeight = (availableHeight - SEAT_GRID_GAP * (rows - 1)) / rows;
  const maxByHeight = Math.floor(maxCardHeight * SEAT_CARD_ASPECT_RATIO);

  return Math.max(20, Math.min(maxByWidth, maxByHeight));
}

function updateSeatSizeBounds() {
  const max = computeMaxSeatSize();
  if (max == null) return; // grid isn't visible/laid out yet

  const min = Math.min(SEAT_SIZE_MIN_FLOOR, max);
  els.seatSizeSlider.min = String(min);
  els.seatSizeSlider.max = String(max);

  let value;
  if (!seatSizeBoundsInitialized) {
    const saved = Number(localStorage.getItem(SEAT_SIZE_KEY));
    value = saved && saved >= min && saved <= max ? saved : Math.round(max * SEAT_SIZE_DEFAULT_RATIO);
    seatSizeBoundsInitialized = true;
  } else {
    // A resize after the fact -- keep the current size, just re-clamp it
    // into the new bounds instead of resetting to the default.
    value = clamp(Number(els.seatSizeSlider.value) || min, min, max);
  }

  els.seatSizeSlider.value = String(value);
  applySeatSize(value);
  localStorage.setItem(SEAT_SIZE_KEY, String(value));
}

function initSeatSizeSlider() {
  els.seatSizeSlider.addEventListener('input', () => {
    const value = Number(els.seatSizeSlider.value);
    applySeatSize(value);
    localStorage.setItem(SEAT_SIZE_KEY, String(value));
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateSeatSizeBounds, 150);
  });
}

function fullscreenElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    null
  );
}

function requestFullscreen(el) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (fn) return fn.call(el);
  return Promise.reject(new Error('Fullscreen is not supported in this browser'));
}

function exitFullscreenApi() {
  const fn =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.mozCancelFullScreen ||
    document.msExitFullscreen;
  if (fn) return fn.call(document);
  return Promise.reject(new Error('Fullscreen is not supported in this browser'));
}

function fullscreenSupported() {
  const el = document.documentElement;
  return Boolean(
    el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen
  );
}

function updateFullscreenButton() {
  const active = Boolean(fullscreenElement());
  els.fullscreenBtn.innerHTML = active
    ? `${EXIT_FULLSCREEN_ICON}<span>Exit fullscreen</span>`
    : `${ENTER_FULLSCREEN_ICON}<span>Fullscreen</span>`;
}

function initFullscreenButton() {
  if (!fullscreenSupported()) {
    els.fullscreenBtn.hidden = true;
    return;
  }

  updateFullscreenButton();

  els.fullscreenBtn.addEventListener('click', () => {
    const action = fullscreenElement() ? exitFullscreenApi() : requestFullscreen(document.documentElement);
    Promise.resolve(action).catch((err) => console.error(`Fullscreen toggle failed: ${err.message}`));
  });

  ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach((event) => {
    document.addEventListener(event, updateFullscreenButton);
  });
}

async function loadConnection() {
  const data = await api('/api/connection');
  state.connectionIp = data.ip;

  if (state.connectionIp) {
    showDashboardScreen();
    await enterDashboard();
  } else {
    showConnectionScreen();
  }
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
    await api('/api/connection', { method: 'PUT', body: JSON.stringify(payload) });
    els.addForm.reset();
    await loadConnection();
  } catch (err) {
    els.connectionError.textContent = err.message;
    els.connectionError.hidden = false;
  } finally {
    els.addSubmit.disabled = false;
    els.addSubmit.textContent = 'Connect';
  }
});

function openSettingsModal() {
  els.settingsError.hidden = true;
  els.settingsIp.value = state.connectionIp || '';
  els.settingsApiKey.value = '';
  els.settingsModal.classList.add('is-open');
}

function closeSettingsModal() {
  els.settingsModal.classList.remove('is-open');
}

els.settingsBtn.addEventListener('click', openSettingsModal);
els.settingsCancelBtn.addEventListener('click', closeSettingsModal);

els.settingsModal.addEventListener('click', (e) => {
  if (e.target === els.settingsModal) closeSettingsModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && els.settingsModal.classList.contains('is-open')) closeSettingsModal();
});

els.settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.settingsError.hidden = true;
  els.settingsSaveBtn.disabled = true;
  els.settingsSaveBtn.textContent = 'Saving…';

  const payload = {
    ip: els.settingsIp.value.trim(),
    apiKey: els.settingsApiKey.value.trim(),
  };

  try {
    await api('/api/connection', { method: 'PUT', body: JSON.stringify(payload) });
    closeSettingsModal();
    await loadConnection();
  } catch (err) {
    els.settingsError.textContent = err.message;
    els.settingsError.hidden = false;
  } finally {
    els.settingsSaveBtn.disabled = false;
    els.settingsSaveBtn.textContent = 'Save';
  }
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

  updateSeatSizeBounds(); // row count may have just changed
  loadAllSensitivities();
}

async function loadAllSensitivities() {
  try {
    const { values } = await api('/api/seats/sensitivity');
    for (const [seatStr, value] of Object.entries(values)) {
      if (value == null) continue;
      const card = els.seatGrid.querySelector(`[data-seat="${seatStr}"]`);
      card?._sensitivityApi?.setValue(value);
    }
  } catch (err) {
    console.error(`Failed to load sensitivities: ${err.message}`);
  }
}

const ROLE_LABELS = { vip: 'VIP', chairperson: 'Chair', delegate: 'Delegate' };

function roleLabel(role) {
  return ROLE_LABELS[role] || '';
}

function buildSeatCard(seat) {
  // A plain div, not a <button> -- the sensitivity slider below is
  // interactive content, which the HTML content model forbids inside a
  // <button> (browsers silently break the markup apart when parsed).
  const card = document.createElement('div');
  card.className = 'seat-card';
  card.dataset.seat = String(seat.seatNumber);
  applySeatCardState(card, seat);

  card.innerHTML = `
    <span class="sensitivity-badge">&ndash;</span>
    <span class="seat-number">${seat.seatNumber}</span>
    <span class="mic-icon-wrap">
      <span class="icon icon-normal">${MIC_ICON}</span>
      <span class="icon icon-muted">${MIC_MUTED_ICON}</span>
    </span>
    <span class="role-tag role-${seat.role || 'none'}">${roleLabel(seat.role)}</span>
    <div class="sensitivity-popover">
      <div class="sensitivity-value">&mdash;</div>
      <div class="sensitivity-slider-wrap">
        <input type="range" class="sensitivity-slider" min="-12" max="12" step="1" value="0" />
      </div>
      <div class="sensitivity-caption">Sensitivity</div>
    </div>
  `;

  card.addEventListener('click', () => toggleMic(seat.seatNumber));
  card._sensitivityApi = wireSensitivityPopover(card, seat.seatNumber);
  return card;
}

function applySeatCardState(card, seat) {
  card.classList.toggle('mic-on', Boolean(seat.microphoneOn));
  card.classList.toggle('offline', !seat.online);

  const roleTag = card.querySelector('.role-tag');
  if (roleTag) {
    roleTag.textContent = roleLabel(seat.role);
    roleTag.className = `role-tag role-${seat.role || 'none'}`;
  }
}

function formatSensitivity(value) {
  const n = Number(value);
  return n > 0 ? `+${n} dB` : `${n} dB`;
}

function formatSensitivityCompact(value) {
  const n = Number(value);
  return n > 0 ? `+${n}` : `${n}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wireSensitivityPopover(card, seatNumber) {
  const popover = card.querySelector('.sensitivity-popover');
  const slider = popover.querySelector('.sensitivity-slider');
  const valueEl = popover.querySelector('.sensitivity-value');
  const badge = card.querySelector('.sensitivity-badge');
  let loaded = false;
  let debounceTimer = null;

  // Updates the always-visible corner badge and the hover popover's
  // readout together, so they never fall out of sync with each other.
  const render = (value) => {
    valueEl.textContent = formatSensitivity(value);
    badge.textContent = formatSensitivityCompact(value);
  };

  const commit = (value) => {
    api(`/api/seats/${seatNumber}/sensitivity`, { method: 'PUT', body: JSON.stringify({ value }) }).catch((err) =>
      console.error(`Failed to set sensitivity for seat ${seatNumber}: ${err.message}`)
    );
  };

  card.addEventListener('mouseenter', async () => {
    try {
      const { value } = await api(`/api/seats/${seatNumber}/sensitivity`);
      slider.value = value;
      render(value);
      loaded = true;
    } catch (err) {
      valueEl.textContent = '—';
      console.error(`Failed to load sensitivity for seat ${seatNumber}: ${err.message}`);
    }
  });

  // Keep interactions with the slider from bubbling up to the card's own
  // click handler (which toggles the mic).
  popover.addEventListener('mousedown', (e) => e.stopPropagation());
  popover.addEventListener('click', (e) => e.stopPropagation());

  slider.addEventListener('input', () => {
    if (!loaded) return;
    render(Number(slider.value));
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => commit(Number(slider.value)), 150);
  });

  slider.addEventListener('change', () => {
    if (!loaded) return;
    clearTimeout(debounceTimer);
    commit(Number(slider.value));
  });

  // Mouse wheel or trackpad two-finger scroll over the card also adjusts
  // sensitivity -- scroll up increases, scroll down decreases. Deltas are
  // accumulated so a fast mouse-wheel notch and a slow trackpad scroll both
  // feel proportionate instead of the trackpad racing through the range.
  let wheelAccum = 0;
  const WHEEL_STEP_THRESHOLD = 40;

  card.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (!loaded) return;

      wheelAccum -= e.deltaY;
      let value = Number(slider.value);
      let changed = false;

      while (Math.abs(wheelAccum) >= WHEEL_STEP_THRESHOLD) {
        const direction = wheelAccum > 0 ? 1 : -1;
        wheelAccum -= direction * WHEEL_STEP_THRESHOLD;
        const next = clamp(value + direction, -12, 12);
        if (next === value) continue;
        value = next;
        changed = true;
      }

      if (!changed) return;
      slider.value = value;
      render(value);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => commit(value), 150);
    },
    { passive: false }
  );

  return {
    setValue(value) {
      slider.value = value;
      render(value);
      loaded = true;
    },
  };
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
      if (state.connectionIp) openSocket();
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
initFullscreenButton();

loadConnection()
  .catch((err) => {
    els.connectionError.textContent = err.message;
    els.connectionError.hidden = false;
    showConnectionScreen();
  })
  .finally(prefillDevDefaults);
