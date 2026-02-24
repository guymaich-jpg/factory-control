// ============================================================
// script.js — Factory Control App (main controller)
// ============================================================

// ---------- State ----------
// Restore navigation state from sessionStorage so refresh keeps the user's place
let currentScreen = sessionStorage.getItem('fc_screen') || 'dashboard';
let currentModule = sessionStorage.getItem('fc_module') || null;
let currentView = sessionStorage.getItem('fc_view') || 'list';
let editingRecord = null;

// Persist navigation state on every change
function _persistNavState() {
  sessionStorage.setItem('fc_screen', currentScreen || 'dashboard');
  if (currentModule) sessionStorage.setItem('fc_module', currentModule);
  else sessionStorage.removeItem('fc_module');
  sessionStorage.setItem('fc_view', currentView || 'list');
}

// --- Hash-based routing for browser back/forward ---
let _suppressHashChange = false;

function _syncHashToState() {
  _suppressHashChange = true;
  let hash = '#/';
  if (currentModule) {
    hash = '#/' + currentModule;
    if (currentView && currentView !== 'list') hash += '/' + currentView;
  } else if (currentScreen && currentScreen !== 'dashboard') {
    hash = '#/' + currentScreen;
  }
  if (location.hash !== hash) {
    history.pushState(null, '', hash);
  }
  _suppressHashChange = false;
}

function _restoreStateFromHash() {
  const hash = location.hash.replace('#/', '').split('/');
  const segment = hash[0] || '';
  const view = hash[1] || 'list';

  // Handle invitation links: #/invite/TOKEN
  if (segment === 'invite' && hash[1]) {
    authMode = 'invite';
    _inviteToken = hash[1];
    currentScreen = 'dashboard';
    currentModule = null;
    currentView = 'list';
    return;
  }

  const moduleNames = ['rawMaterials', 'dateReceiving', 'fermentation', 'distillation1', 'distillation2', 'bottling', 'inventory'];
  const screenNames = ['dashboard', 'backoffice'];

  if (moduleNames.includes(segment)) {
    currentModule = segment;
    currentScreen = segment === 'inventory' ? 'inventory' : segment;
    currentView = (view === 'form' || view === 'detail') ? view : 'list';
  } else if (screenNames.includes(segment)) {
    currentScreen = segment;
    currentModule = null;
    currentView = 'list';
  } else {
    currentScreen = 'dashboard';
    currentModule = null;
    currentView = 'list';
  }
  // Can't restore editingRecord from URL, fall back to list
  if ((currentView === 'form' || currentView === 'detail') && !editingRecord) {
    currentView = 'list';
  }
}

window.addEventListener('popstate', () => {
  if (_suppressHashChange) return;
  _restoreStateFromHash();
  renderApp();
});
let signatureCanvas = null;
let sigCtx = null;
let sigDrawing = false;
let _navDirection = 'none'; // 'forward' | 'back' | 'none' — for iOS-style transitions
const _scrollPositions = {}; // keyed by "screen:module" — preserves scroll on tab switch

// ---------- Helpers ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
// NOTE: el() sets innerHTML — callers must ensure any user data is escaped via esc()
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

// HTML escape helper — prevents XSS when interpolating user data into innerHTML
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function formatDate(d) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString(currentLang === 'th' ? 'th-TH' : currentLang === 'he' ? 'he-IL' : 'en-GB'); }
  catch { return d; }
}

function showToast(msg) {
  let toast = $('.toast');
  if (!toast) {
    toast = el('div', 'toast');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ============================================================
// GOOGLE SHEETS SYNC
// ============================================================
const SHEETS_SYNC_URL = 'https://script.google.com/macros/s/AKfycbz4IIUXvDoo7qJH1Ytn7hEWZ85Ek7hViA6riSezMZCXQbjKQG3VwfppQlq0kuTwOHT3/exec';
const INVENTORY_SHEET_URL = 'https://docs.google.com/spreadsheets/d/14rYu6QgRD2r4X4ZjOs45Rqtl4p0XOPvJfcs5BpY54EE/edit?gid=1634965365#gid=1634965365';

// Sync state for the visual indicator
let _syncQueue = 0;

// ── Sync infrastructure ──────────────────────────────────────

// Sends a POST to GAS. Always fire-and-forget (no-cors), with 1 retry and console logging.
async function postToSheets(payload) {
  const url = SHEETS_SYNC_URL;
  if (!url) {
    console.warn('[sync] No GAS URL configured — skipping sync');
    return;
  }

  _syncQueue++;
  updateSyncIndicator('syncing');

  const attempt = async (n) => {
    try {
      console.log(`[sync] POST attempt ${n + 1}:`, payload.sheetName, payload.action || 'replace', `(${(payload.records || []).length} records)`);
      await fetch(url, {
        method: 'POST',
        body: JSON.stringify(payload),
        mode: 'no-cors',
      });
      console.log(`[sync] POST sent:`, payload.sheetName);
      return true;
    } catch (err) {
      console.error(`[sync] POST failed (attempt ${n + 1}):`, err.message);
      if (n < 1) {
        console.log('[sync] Retrying in 2s...');
        await new Promise(r => setTimeout(r, 2000));
        return attempt(n + 1);
      }
      return false;
    }
  };

  const sent = await attempt(0);
  _syncQueue--;

  if (!sent) {
    updateSyncIndicator(_syncQueue > 0 ? 'syncing' : 'error');
    showToast(t('syncFailed'));
    return;
  }

  updateSyncIndicator(_syncQueue > 0 ? 'syncing' : 'success');
}

// Verifies sync via GET request (GAS doGet supports CORS — we can read the response)
async function verifySyncStatus(sheetName) {
  const url = SHEETS_SYNC_URL;
  if (!url) return { verified: false, error: 'no-url' };
  try {
    const resp = await fetch(`${url}?action=syncStatus&sheet=${encodeURIComponent(sheetName)}`);
    if (!resp.ok) return { verified: false, error: 'http-' + resp.status };
    const data = await resp.json();
    return { verified: true, ...data };
  } catch (err) {
    console.warn('[sync] Verification failed for', sheetName, err.message);
    return { verified: false, error: err.message };
  }
}

// Shows a small persistent pill in the corner: Syncing / Synced / Sync failed
function updateSyncIndicator(state) {
  let indicator = document.querySelector('.sync-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'sync-indicator';
    document.body.appendChild(indicator);
  }

  indicator.className = 'sync-indicator sync-' + state;

  switch (state) {
    case 'syncing':
      indicator.innerHTML = '<span class="sync-dot pulse"></span>' + t('syncInProgress');
      break;
    case 'success':
      indicator.innerHTML = '<span class="sync-dot green"></span>' + t('syncSuccess');
      setTimeout(() => { if (indicator.classList.contains('sync-success')) indicator.classList.add('sync-fade'); }, 4000);
      break;
    case 'error':
      indicator.innerHTML = '<span class="sync-dot red"></span>' + t('syncFailed');
      break;
    default:
      indicator.classList.add('sync-fade');
  }
}

// ── Module sync ───────────────────────────────────────────────

function syncModuleToSheets(module) {
  const url = SHEETS_SYNC_URL;
  if (!url) return;

  const storeKey = STORE_KEYS[module];
  if (!storeKey) return;

  const records = getData(storeKey);

  // Build field definitions — bypass permission filter for sync
  // so decision/all fields always appear in the sheet regardless of who is logged in
  const allModuleFields = {
    rawMaterials: [
      { key: 'date', labelKey: 'rm_receiveDate' },
      { key: 'supplier', labelKey: 'rm_supplier' },
      { key: 'category', labelKey: 'rm_category' },
      { key: 'item', labelKey: 'rm_item' },
      { key: 'weight', labelKey: 'rm_weight' },
      { key: 'unit', labelKey: 'rm_unit' },
      { key: 'expiry', labelKey: 'rm_expiry' },
      { key: 'tithing', labelKey: 'rm_tithing' },
      { key: 'healthCert', labelKey: 'rm_healthCert' },
      { key: 'kosher', labelKey: 'rm_kosher' },
    ],
    dateReceiving: [
      { key: 'date', labelKey: 'dr_receiveDate' },
      { key: 'supplier', labelKey: 'dr_supplier' },
      { key: 'weight', labelKey: 'dr_weight' },
      { key: 'tithing', labelKey: 'dr_tithing' },
      { key: 'expiryPeriod', labelKey: 'dr_expiryPeriod' },
      { key: 'qtyInDate', labelKey: 'dr_qtyInDate' },
    ],
    fermentation: [
      { key: 'date', labelKey: 'fm_date' },
      { key: 'tankSize', labelKey: 'fm_tankSize' },
      { key: 'datesCrates', labelKey: 'fm_datesCrates' },
      { key: 'temperature', labelKey: 'fm_temperature' },
      { key: 'sugar', labelKey: 'fm_sugar' },
      { key: 'ph', labelKey: 'fm_ph' },
      { key: 'sentToDistillation', labelKey: 'fm_sentToDistillation' },
    ],
    distillation1: [
      { key: 'date', labelKey: 'd1_date' },
      { key: 'type', labelKey: 'd1_type' },
      { key: 'stillName', labelKey: 'd1_stillName' },
      { key: 'fermDate', labelKey: 'd1_fermDate' },
      { key: 'distQty', labelKey: 'd1_distQty' },
      { key: 'initAlcohol', labelKey: 'd1_initAlcohol' },
      { key: 'finalAlcohol', labelKey: 'd1_finalAlcohol' },
      { key: 'temp', labelKey: 'd1_temp' },
      { key: 'timeRange', labelKey: 'd1_timeRange' },
      { key: 'distilledQty', labelKey: 'd1_distilledQty' },
    ],
    distillation2: [
      { key: 'date', labelKey: 'd2_date' },
      { key: 'productType', labelKey: 'd2_productType' },
      { key: 'd1Dates', labelKey: 'd2_d1Dates' },
      { key: 'batchNumber', labelKey: 'd2_batchNumber' },
      { key: 'initAlcohol', labelKey: 'd2_initAlcohol' },
      { key: 'headSep', labelKey: 'd2_headSep' },
      { key: 'tailAlcohol', labelKey: 'd2_tailAlcohol' },
      { key: 'temp', labelKey: 'd2_temp' },
      { key: 'timeRange', labelKey: 'd2_timeRange' },
      { key: 'quantity', labelKey: 'd2_quantity' },
      { key: 'd1InputQty', labelKey: 'd2_d1InputQty' },
    ],
    bottling: [
      { key: 'date', labelKey: 'bt_bottlingDate' },
      { key: 'drinkType', labelKey: 'bt_drinkType' },
      { key: 'batchNumber', labelKey: 'bt_batchNumber' },
      { key: 'barrelNumber', labelKey: 'bt_barrelNumber' },
      { key: 'd2Date', labelKey: 'bt_d2Date' },
      { key: 'alcohol', labelKey: 'bt_alcohol' },
      { key: 'filtered', labelKey: 'bt_filtered' },
      { key: 'color', labelKey: 'bt_color' },
      { key: 'taste', labelKey: 'bt_taste' },
      { key: 'contaminants', labelKey: 'bt_contaminants' },
      { key: 'bottleCount', labelKey: 'bt_bottleCount' },
      { key: 'd2InputQty', labelKey: 'bt_d2InputQty' },
      { key: 'decision', labelKey: 'bt_decision' },
    ],
  };

  const fields = allModuleFields[module];
  if (!fields) return;

  const keys = [...fields.map(f => f.key), 'notes', 'createdAt'];
  const labels = [...fields.map(f => t(f.labelKey)), t('notes'), 'Created At'];

  postToSheets({
    sheetName: t('mod_' + module),
    keys,
    labels,
    records,
  });
}


// ============================================================
// THEME
// ============================================================
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('factory_theme', next);
  // Update icons without a full re-render
  const btn = document.querySelector('.theme-btn');
  if (btn) btn.innerHTML = next === 'dark'
    ? '<i data-feather="sun" style="width:14px;height:14px"></i>'
    : '<i data-feather="moon" style="width:14px;height:14px"></i>';
  if (typeof feather !== 'undefined') feather.replace();
}

// Append a timestamped inventory snapshot row to the Sheets Inventory ledger.
// Called automatically after any record is saved, updated, or deleted.
function syncInventorySnapshot(triggeredBy) {
  const url = SHEETS_SYNC_URL;
  if (!url) return;

  const bottlingRecords = getData(STORE_KEYS.bottling);
  const rawRecords = getData(STORE_KEYS.rawMaterials);
  const dateRecords = getData(STORE_KEYS.dateReceiving);
  const fermRecords = getData(STORE_KEYS.fermentation);
  const d1Records = getData(STORE_KEYS.distillation1);
  const d2Records = getData(STORE_KEYS.distillation2);

  const bottleInv = {};
  DRINK_TYPES.forEach(dt => { bottleInv[dt] = 0; });
  bottlingRecords.forEach(r => {
    if (r.drinkType && r.decision === 'approved') {
      bottleInv[r.drinkType] = (bottleInv[r.drinkType] || 0) + (parseInt(r.bottleCount) || 0);
    }
  });

  const totalDatesReceived = dateRecords.reduce((sum, r) => sum + (parseFloat(r.weight) || 0), 0);
  const totalDatesInFerm = fermRecords.reduce((sum, r) => {
    if (r.datesCrates !== undefined && r.datesCrates !== '') return sum + (parseFloat(r.datesCrates) || 0) * 20;
    return sum + (parseFloat(r.datesKg) || 0);
  }, 0);

  const d1Produced = d1Records.reduce((sum, r) => sum + (parseFloat(r.distilledQty) || 0), 0);
  const d1Consumed = d2Records.reduce((sum, r) => sum + (parseFloat(r.d1InputQty) || 0), 0);
  const d2Produced = d2Records.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0), 0);
  const d2Consumed = bottlingRecords.reduce((sum, r) => sum + (parseFloat(r.d2InputQty) || 0), 0);

  const session = getSession();
  const record = {
    timestamp: new Date().toISOString(),
    user: session?.username || 'unknown',
    triggeredBy: triggeredBy || 'save',
    dates_available: Math.max(0, totalDatesReceived - totalDatesInFerm),
    dates_received: totalDatesReceived,
    dates_in_ferm: totalDatesInFerm,
    d1_produced: d1Produced,
    d1_available: Math.max(0, d1Produced - d1Consumed),
    d2_produced: d2Produced,
    d2_available: Math.max(0, d2Produced - d2Consumed),
    ...DRINK_TYPES.reduce((acc, dt) => ({ ...acc, [dt]: bottleInv[dt] || 0 }), {}),
  };

  const keys = Object.keys(record);
  const labels = [
    'Timestamp', 'User', 'Triggered By',
    t('inv_dates'), 'Dates Received (kg)', t('inv_datesUsed'),
    'D1 Produced (L)', 'D1 Available (L)',
    'D2 Produced (L)', 'D2 Available (L)',
    ...DRINK_TYPES.map(dt => t(dt)),
  ];

  postToSheets({
    sheetName: t('mod_inventory'),
    action: 'append',
    keys,
    labels,
    records: [record],
  });
}

// ---- Manager Password Modal (required for any delete action) ----
function showManagerPasswordModal(onSuccess) {
  // Remove any existing modal
  const existing = document.querySelector('.manager-pwd-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'manager-pwd-modal';
  modal.innerHTML = `
    <div class="manager-pwd-backdrop"></div>
    <div class="manager-pwd-dialog">
      <div class="mpd-title"><i data-feather="lock" style="width:20px;height:20px;margin-inline-end:8px;"></i>${t('deleteConfirmTitle')}</div>
      <p class="mpd-subtitle">${t('deleteConfirmSubtitle')}</p>
      <input type="password" class="form-input mpd-input" id="mpd-password" placeholder="${t('managerPasswordPlaceholder')}" aria-label="${t('managerPasswordPlaceholder')}" autocomplete="current-password">
      <div class="mpd-error" id="mpd-error"></div>
      <div class="mpd-actions">
        <button class="btn btn-secondary mpd-cancel">${t('cancel')}</button>
        <button class="btn btn-danger mpd-confirm">${t('delete')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  if (typeof feather !== 'undefined') feather.replace();

  const input = modal.querySelector('#mpd-password');
  const errorEl = modal.querySelector('#mpd-error');
  input.focus();

  const close = () => modal.remove();

  modal.querySelector('.mpd-cancel').addEventListener('click', close);
  modal.querySelector('.manager-pwd-backdrop').addEventListener('click', close);

  const doConfirm = () => {
    const pwd = input.value;
    if (!pwd) { errorEl.textContent = t('required'); return; }

    // Verify: must be a manager or admin password
    const users = getUsers();
    const hashedPwd = typeof hashPassword === 'function' ? hashPassword(pwd) : pwd;
    const authorized = users.find(
      u => (u.role === 'manager' || u.role === 'admin') &&
           (u.password === hashedPwd || u.password === pwd)
    );
    if (!authorized) {
      errorEl.textContent = t('deleteWrongPassword');
      input.value = '';
      input.focus();
      return;
    }
    close();
    onSuccess(authorized);
  };

  modal.querySelector('.mpd-confirm').addEventListener('click', doConfirm);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doConfirm(); });
}

// ---------- Main Render ----------
function renderApp() {
  const app = $('#app');
  const session = getSession();

  if (!session) {
    // Clear nav state when logged out
    currentScreen = 'dashboard';
    currentModule = null;
    currentView = 'list';
    _persistNavState();
    app.innerHTML = renderLogin();
    if (typeof feather !== 'undefined') feather.replace();
    bindLogin();
    return;
  }

  // Persist current navigation state for refresh recovery
  _persistNavState();
  _syncHashToState();

  app.innerHTML = `
    ${renderHeader()}
    <main class="screen-content" id="screen-content"></main>
    ${renderBottomNav()}
  `;

  const content = $('#screen-content');

  // Apply iOS-style transition direction class
  if (_navDirection === 'forward') content.classList.add('nav-forward');
  else if (_navDirection === 'back') content.classList.add('nav-back');
  _navDirection = 'none'; // reset after applying

  if (currentModule && currentView === 'form') {
    renderModuleForm(content);
  } else if (currentModule && currentView === 'detail') {
    renderModuleDetail(content);
  } else if (currentModule && currentView === 'list') {
    renderModuleList(content);
  } else if (currentScreen === 'backoffice') {
    renderBackoffice(content);
  } else {
    renderDashboard(content);
  }

  if (typeof feather !== 'undefined') feather.replace();
  bindNav();
  checkSecurity();

  // Restore scroll position if we saved one for this view
  const scrollKey = (currentModule || currentScreen) + ':' + currentView;
  if (_scrollPositions[scrollKey]) {
    content.scrollTop = _scrollPositions[scrollKey];
  }
}

function checkSecurity() {
  const session = getSession();
  if (!session && currentScreen !== 'login') {
    currentScreen = 'dashboard'; // Reset
    renderApp();
  }
}

// ============================================================
// LOGIN & REQUEST ACCESS
// ============================================================
let authMode = 'login'; // 'login' | 'invite'
let _inviteToken = null;

// Date-palm SVG mark — the Arava region's signature crop + distillery theme
const ARAVA_MARK_SVG = `
  <svg viewBox="0 0 36 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <line x1="18" y1="46" x2="18" y2="22" stroke="#EFEFEC" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M18 22 C18 22 9 15 3 10 C9 13 15 20 18 24" fill="#EFEFEC" opacity="0.90"/>
    <path d="M18 22 C18 22 27 15 33 10 C27 13 21 20 18 24" fill="#EFEFEC" opacity="0.90"/>
    <path d="M18 28 C18 28 8 22 1 21 C8 22 15 27 18 30" fill="#EFEFEC" opacity="0.60"/>
    <path d="M18 28 C18 28 28 22 35 21 C28 22 21 27 18 30" fill="#EFEFEC" opacity="0.60"/>
    <path d="M18 22 C18 12 17 6 18 2 C19 6 18 12 18 22" fill="#EFEFEC" opacity="0.85"/>
  </svg>`;

function renderLogin() {
  if (authMode === 'invite') return renderInviteRegistration();

  return `
    <button class="login-lang-toggle" onclick="toggleLang()">${t('langToggle')}</button>
    <div class="login-screen">

      <div class="login-brand">
        <div class="login-logo-mark">${ARAVA_MARK_SVG}</div>
        <h1 class="login-brand-name">${t('loginTitle')}</h1>
        <p class="login-brand-sub">${t('loginSubtitle')}</p>
        <div class="login-brand-rule"></div>
      </div>

      <div class="login-form">
        <div class="field">
          <input type="email" id="login-user" placeholder="${t('emailAddress')}"
            aria-label="${t('emailAddress')}" autocomplete="email" autocapitalize="none" spellcheck="false">
        </div>
        <div class="field">
          <input type="password" id="login-pass" placeholder="${t('password')}"
            aria-label="${t('password')}" autocomplete="current-password">
        </div>
        <button class="login-btn" id="login-btn">${t('login')}</button>
        <div class="login-error" id="login-error" role="alert" aria-live="polite"></div>
      </div>
    </div>
  `;
}

// ============================================================
// INVITE REGISTRATION SCREEN
// ============================================================
function renderInviteRegistration() {
  return `
    <button class="login-lang-toggle" onclick="toggleLang()">${t('langToggle')}</button>
    <div class="login-screen">

      <div class="login-brand">
        <div class="login-logo-mark">${ARAVA_MARK_SVG}</div>
        <div class="login-brand-name">Arava</div>
        <div class="login-brand-sub">${t('inviteRegistration')}</div>
        <div class="login-brand-rule"></div>
      </div>

      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:24px;max-width:280px;line-height:1.6">
        ${t('inviteRegistrationSubtitle')}
      </p>

      <div id="invite-loading" style="text-align:center;padding:24px 0;">
        <p style="font-size:13px;color:var(--text-secondary)">${t('inviteLoading')}</p>
      </div>

      <div id="invite-form-wrap" class="login-form" style="display:none;">
        <div class="field">
          <input type="email" id="inv-email" placeholder="${t('emailAddress')}" disabled
            aria-label="${t('emailAddress')}" class="invite-email-locked" autocomplete="email">
        </div>
        <div class="field">
          <input type="text" id="inv-name" placeholder="${t('nameEnglish')}" aria-label="${t('nameEnglish')}" autocomplete="name">
        </div>
        <div class="field">
          <input type="text" id="inv-nameHe" placeholder="${t('nameHebrew')}" aria-label="${t('nameHebrew')}" dir="rtl" autocomplete="off">
        </div>
        <div class="field">
          <input type="password" id="inv-password" placeholder="${t('password')}" aria-label="${t('password')}" autocomplete="new-password">
        </div>
        <button class="login-btn" id="inv-submit-btn">${t('createAccount')}</button>
        <div class="login-error" id="inv-error" role="alert" aria-live="polite"></div>
        <div class="login-success" id="inv-success" role="status" aria-live="polite"></div>
      </div>

      <div id="invite-error-wrap" style="display:none;text-align:center;padding:24px 0;">
        <p class="login-error" id="inv-token-error" role="alert" aria-live="polite" style="display:block"></p>
        <button class="login-btn" id="inv-retry-btn" style="margin-top:12px;display:none">${t('inviteRetry')}</button>
      </div>

      <div class="login-switch" style="margin-top:24px;">
        <a href="#" id="inv-go-login">${t('login')}</a>
      </div>
    </div>
  `;
}

function bindLogin() {
  // --- Login ---
  const loginBtn = $('#login-btn');
  if (loginBtn) {
    const userInput = $('#login-user');
    const passInput = $('#login-pass');
    const errEl = $('#login-error');

    const doLogin = async () => {
      const email = userInput.value.trim();
      const pass = passInput.value;
      if (!email || !pass) return;

      // Disable button and show loading state while authenticating
      loginBtn.disabled = true;
      errEl.textContent = '';
      const origText = loginBtn.textContent;
      loginBtn.textContent = '...';

      try {
        const session = await authenticate(email, pass);
        if (session && session.locked) {
          const lockErrEl = document.querySelector('.login-error') || document.querySelector('#login-error');
          if (lockErrEl) {
            lockErrEl.textContent = t('loginLocked') || 'Too many failed attempts. Try again in 15 minutes.';
            lockErrEl.style.display = 'block';
          }
          return;
        }
        if (session) {
          currentScreen = 'dashboard';
          currentModule = null;
          renderApp();
        } else {
          errEl.textContent = t('loginError');
        }
      } catch (e) {
        console.error('[Auth] Login error:', e);
        errEl.textContent = t('loginError');
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = origText;
      }
    };

    loginBtn.addEventListener('click', doLogin);
    passInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  }

  // --- Invite Registration ---
  if (authMode === 'invite' && _inviteToken) {
    bindInviteRegistration(_inviteToken);
  }

  // --- "Go to login" link from invite screen ---
  const goLogin = $('#inv-go-login');
  if (goLogin) {
    goLogin.addEventListener('click', e => {
      e.preventDefault();
      authMode = 'login';
      _inviteToken = null;
      history.replaceState(null, '', location.pathname);
      renderApp();
    });
  }
}

// Fetch invite details from backend API (primary) or GAS (fallback) and bind the registration form
function bindInviteRegistration(token) {
  const loadingEl = $('#invite-loading');
  const formWrap = $('#invite-form-wrap');
  const errorWrap = $('#invite-error-wrap');
  const tokenErrorEl = $('#inv-token-error');
  const retryBtn = $('#inv-retry-btn');

  function showError(msg, showRetry) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (formWrap) formWrap.style.display = 'none';
    if (errorWrap) errorWrap.style.display = 'block';
    if (tokenErrorEl) tokenErrorEl.textContent = msg;
    if (retryBtn) retryBtn.style.display = showRetry ? 'inline-block' : 'none';
  }

  function showForm(email, role) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (formWrap) formWrap.style.display = 'block';
    const emailEl = $('#inv-email');
    if (emailEl) emailEl.value = email;

    const submitBtn = $('#inv-submit-btn');
    const errEl = $('#inv-error');
    const successEl = $('#inv-success');
    const nameInput = $('#inv-name');
    const nameHeInput = $('#inv-nameHe');
    const passInput = $('#inv-password');

    const doSubmit = async () => {
      errEl.textContent = '';
      successEl.textContent = '';

      const name = nameInput ? nameInput.value.trim() : '';
      const nameHe = nameHeInput ? nameHeInput.value.trim() : '';
      const password = passInput ? passInput.value : '';

      if (!name) { errEl.textContent = t('signUpError_fillAll'); return; }
      const pwCheck = validatePassword(password);
      if (!pwCheck.valid) { errEl.textContent = pwCheck.error; return; }

      submitBtn.disabled = true;

      // Try backend accept endpoint first (creates Firebase Auth + Firestore in one call)
      if (typeof apiAcceptInvitation === 'function') {
        const apiResult = await apiAcceptInvitation({
          token, password, name, nameHe, app: 'factory',
        });
        if (apiResult && apiResult.success) {
          // Also notify GAS (fire-and-forget)
          notifyInviteAccepted(token, apiResult.user ? apiResult.user.username : email.split('@')[0]);
          successEl.textContent = t('inviteAccountCreated');
          setTimeout(() => {
            authMode = 'login';
            _inviteToken = null;
            history.replaceState(null, '', location.pathname);
            renderApp();
          }, 2500);
          return;
        }
        if (apiResult && apiResult.error) {
          submitBtn.disabled = false;
          errEl.textContent = apiResult.error;
          return;
        }
        // apiResult null = backend unavailable, fall through to local creation
      }

      // Fallback: create user locally
      const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
      const result = await createUser({
        username: baseUsername, password, name, nameHe, email, role: role || 'worker', status: 'active',
      });

      if (!result.success) {
        submitBtn.disabled = false;
        errEl.textContent = t(result.error) || result.error;
        return;
      }

      notifyInviteAccepted(token, baseUsername);
      successEl.textContent = t('inviteAccountCreated');
      setTimeout(() => {
        authMode = 'login';
        _inviteToken = null;
        history.replaceState(null, '', location.pathname);
        renderApp();
      }, 2500);
    };

    if (submitBtn) submitBtn.addEventListener('click', doSubmit);
    if (passInput) passInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSubmit(); });
  }

  // Strategy: try backend API first, then GAS as fallback
  (async () => {
    // 1. Try backend API
    if (typeof apiValidateInvitation === 'function') {
      try {
        const result = await apiValidateInvitation(token, 'factory');
        if (result) {
          if (result.valid === false) {
            showError(result.reason === 'Invitation already used' ? t('inviteAlreadyUsed') : t('inviteTokenInvalid'), false);
            return;
          }
          if (result.valid && result.invitation) {
            showForm(result.invitation.email, result.invitation.role);
            return;
          }
        }
      } catch (e) { /* fall through to GAS */ }
    }

    // 2. Fallback: fetch from GAS
    const url = SHEETS_SYNC_URL;
    if (!url) { showError(t('inviteNetworkError'), true); return; }

    try {
      const resp = await fetch(`${url}?action=getInvite&token=${encodeURIComponent(token)}`);
      if (!resp.ok) throw new Error('http');
      const data = await resp.json();

      if (data.status === 'not_found') { showError(t('inviteTokenInvalid'), false); return; }
      if (data.invite && data.invite.inviteStatus === 'accepted') { showError(t('inviteAlreadyUsed'), false); return; }
      if (data.invite) { showForm(data.invite.email, data.invite.role); }
    } catch (e) {
      showError(t('inviteNetworkError'), true);
    }
  })();

  // Retry button
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      if (errorWrap) errorWrap.style.display = 'none';
      if (loadingEl) loadingEl.style.display = 'block';
      bindInviteRegistration(token);
    });
  }
}

// Fire-and-forget POST to GAS to mark invite as accepted
function notifyInviteAccepted(token, username) {
  const url = SHEETS_SYNC_URL;
  if (!url) return;
  fetch(url, {
    method: 'POST',
    body: JSON.stringify({ action: 'accept_invite', token, username }),
    mode: 'no-cors',
  }).catch(() => {});
}

// ============================================================
// HEADER
// ============================================================
function renderHeader() {
  const session = getSession();
  const showBack = currentModule !== null;
  const title = currentModule ? getModuleTitle(currentModule)
    : currentScreen === 'backoffice' ? t('nav_backoffice')
    : t('appName');
  const roleClass = session.role === 'worker' ? 'worker' : '';

  return `
    <header class="app-header" role="banner">
      <div class="header-left">
        ${showBack ? `<button class="header-back" id="header-back" aria-label="${t('back') || 'Back'}"><i data-feather="arrow-left"></i></button>` : ''}
        <span class="user-badge"><span class="role-dot ${roleClass}"></span>${esc(getUserDisplayName())}</span>
      </div>
      <span class="header-title">${esc(title)}</span>
      <div class="header-right">
        <button class="theme-btn" onclick="toggleTheme()" aria-label="${t('toggleTheme') || 'Toggle theme'}">
          ${(document.documentElement.getAttribute('data-theme') || 'light') === 'dark'
            ? '<i data-feather="sun" style="width:14px;height:14px"></i>'
            : '<i data-feather="moon" style="width:14px;height:14px"></i>'}
        </button>
        <button class="lang-btn" onclick="toggleLang()">${t('langToggle')}</button>
        <button class="logout-btn" id="logout-btn" aria-label="${t('logoutLabel') || 'Log out'}"><i data-feather="log-out" style="width:14px;height:14px"></i></button>
      </div>
    </header>
  `;
}

function getModuleTitle(mod) {
  const map = {
    rawMaterials: 'mod_rawMaterials',
    dateReceiving: 'mod_dateReceiving',
    fermentation: 'mod_fermentation',
    distillation1: 'mod_distillation1',
    distillation2: 'mod_distillation2',
    bottling: 'mod_bottling',
    inventory: 'mod_inventory',
  };
  return t(map[mod] || mod);
}

// ============================================================
// BOTTOM NAV
// ============================================================
function renderBottomNav() {
  const items = [
    { id: 'dashboard', icon: 'grid', label: 'nav_dashboard' },
    { id: 'receiving', icon: 'package', label: 'nav_receiving' },
    { id: 'production', icon: 'activity', label: 'nav_production' },
    { id: 'bottling', icon: 'check-circle', label: 'nav_bottling' },
    { id: 'inventory', icon: 'database', label: 'nav_inventory' },
  ];

  if (hasPermission('canManageUsers')) {
    items.push({ id: 'backoffice', icon: 'settings', label: 'nav_backoffice' });
  }

  return `
    <nav class="bottom-nav">
      ${items.map(it => `
        <button class="nav-item ${currentScreen === it.id ? 'active' : ''}" data-nav="${it.id}">
          <i data-feather="${it.icon}"></i>
          ${t(it.label)}
        </button>
      `).join('')}
    </nav>
  `;
}

function bindNav() {
  // Save current scroll before navigating away
  function saveScroll() {
    const sc = $('#screen-content');
    if (sc) _scrollPositions[(currentModule || currentScreen) + ':' + currentView] = sc.scrollTop;
  }

  // Bottom nav
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      saveScroll();
      const nav = btn.dataset.nav;
      _navDirection = 'forward';
      currentScreen = nav;
      currentView = 'list';
      editingRecord = null;

      if (nav === 'dashboard') { currentModule = null; _navDirection = 'back'; }
      else if (nav === 'receiving') { currentModule = 'rawMaterials'; }
      else if (nav === 'production') { currentModule = 'fermentation'; }
      else if (nav === 'bottling') { currentModule = 'bottling'; }
      else if (nav === 'inventory') { currentModule = 'inventory'; }
      else if (nav === 'backoffice') { currentModule = null; }

      renderApp();
    });
  });

  // Back button
  const backBtn = $('#header-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      saveScroll();
      _navDirection = 'back';
      if (currentView === 'form' || currentView === 'detail') {
        currentView = 'list';
        editingRecord = null;
      } else {
        currentModule = null;
        currentScreen = 'dashboard';
      }
      renderApp();
    });
  }

  // Logout
  const logoutBtn = $('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logout();
      renderApp();
    });
  }
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard(container) {
  const session = getSession();
  const modules = [
    { key: 'rawMaterials', icon: 'package', store: STORE_KEYS.rawMaterials, color: 'var(--color-receiving)' },
    { key: 'dateReceiving', icon: 'sun', store: STORE_KEYS.dateReceiving, color: 'var(--color-dates)' },
    { key: 'fermentation', icon: 'thermometer', store: STORE_KEYS.fermentation, color: 'var(--color-fermentation)' },
    { key: 'distillation1', icon: 'droplet', store: STORE_KEYS.distillation1, color: 'var(--color-dist1)' },
    { key: 'distillation2', icon: 'filter', store: STORE_KEYS.distillation2, color: 'var(--color-dist2)' },
    { key: 'bottling', icon: 'check-circle', store: STORE_KEYS.bottling, color: 'var(--color-bottling)' },
    { key: 'inventory', icon: 'database', store: null, color: 'var(--color-inventory)' },
  ];

  const totalRecords = Object.values(STORE_KEYS).reduce((sum, k) => sum + getRecordCount(k), 0);
  const todayTotal = Object.values(STORE_KEYS).reduce((sum, k) => sum + getTodayRecords(k).length, 0);

  // Pending approvals: bottling records without a decision
  const bottlingRecords = getData(STORE_KEYS.bottling);
  const pendingApprovals = bottlingRecords.filter(r => !r.decision || (r.decision !== 'approved' && r.decision !== 'notApproved')).length;

  // Recent activity: latest 5 records across all modules
  const recentRecords = [];
  const moduleEntries = modules.filter(m => m.store);
  moduleEntries.forEach(m => {
    getData(m.store).forEach(r => {
      recentRecords.push({ ...r, _module: m.key, _icon: m.icon, _color: m.color });
    });
  });
  recentRecords.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const topRecent = recentRecords.slice(0, 5);

  container.innerHTML = `
    <h1 class="sr-only">${t('nav_dashboard')}</h1>
    <div class="welcome-card">
      <div style="font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:rgba(239,239,236,0.45);margin-bottom:10px;font-family:'Quattrocento Sans',sans-serif">Arava Distillery · Production Control</div>
      <h2>${t('welcome')}, ${esc(getUserDisplayName())}</h2>
      <p>${new Date().toLocaleDateString(currentLang === 'th' ? 'th-TH' : currentLang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>

    <div class="stats-row" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:16px;">
      <div class="stat-card">
        <div class="stat-num">${todayTotal}</div>
        <div class="stat-label">${t('todayActivity')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${totalRecords}</div>
        <div class="stat-label">${t('totalRecords')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color:var(--warning,#f59e0b)">${pendingApprovals}</div>
        <div class="stat-label">${t('pendingApprovals')}</div>
      </div>
    </div>

    <div class="section-title">${t('quickActions')}</div>
    <div class="module-grid">
      ${modules.map(m => `
        <div class="module-card" data-module="${m.key}">
          <div class="mc-icon"><i data-feather="${m.icon}"></i></div>
          <div class="mc-title">${esc(getModuleTitle(m.key))}</div>
          <div class="mc-count">${m.store ? getRecordCount(m.store) + ' ' + t('totalRecords').toLowerCase() : ''}</div>
        </div>
      `).join('')}
    </div>

    ${topRecent.length ? `
      <div class="section-title" style="margin-top:24px;">${t('recentActivity')}</div>
      ${topRecent.map(r => {
        const title = r.item || r.supplier || r.drinkType || r.type || r.batchNumber || getModuleTitle(r._module);
        const time = r.createdAt ? formatDate(r.createdAt) : '';
        return `
          <div class="recent-activity-item" data-ra-module="${esc(r._module)}" data-ra-id="${esc(r.id)}">
            <div class="ra-icon" style="background:${r._color}20;color:${r._color}"><i data-feather="${r._icon}"></i></div>
            <div class="ra-content">
              <div class="ra-title">${esc(title)}</div>
              <div class="ra-meta">${esc(getModuleTitle(r._module))} &bull; ${esc(time)}</div>
            </div>
          </div>`;
      }).join('')}
    ` : ''}
  `;

  // Bind module cards
  container.querySelectorAll('.module-card').forEach(card => {
    card.addEventListener('click', () => {
      currentModule = card.dataset.module;
      currentView = 'list';
      _navDirection = 'forward';
      renderApp();
    });
  });

  // Bind recent activity items
  container.querySelectorAll('.recent-activity-item').forEach(item => {
    item.addEventListener('click', () => {
      const mod = item.dataset.raModule;
      const id = item.dataset.raId;
      const storeKey = STORE_KEYS[mod];
      if (storeKey) {
        const record = getData(storeKey).find(r => r.id === id);
        if (record) {
          currentModule = mod;
          editingRecord = record;
          currentView = 'detail';
          _navDirection = 'forward';
          renderApp();
        }
      }
    });
  });
}

// ============================================================
// MODULE LIST VIEW
// ============================================================
function renderModuleList(container) {
  if (currentModule === 'inventory') {
    renderInventory(container);
    return;
  }
  const storeKey = STORE_KEYS[currentModule];
  if (!storeKey) { container.innerHTML = '<p>Unknown module</p>'; return; }

  // Sub-tabs for receiving and production
  let tabs = null;
  if (currentModule === 'rawMaterials' || currentModule === 'dateReceiving') {
    tabs = [
      { key: 'rawMaterials', label: 'mod_rawMaterials' },
      { key: 'dateReceiving', label: 'mod_dateReceiving' },
    ];
  } else if (currentModule === 'fermentation' || currentModule === 'distillation1' || currentModule === 'distillation2') {
    tabs = [
      { key: 'fermentation', label: 'mod_fermentation' },
      { key: 'distillation1', label: 'mod_distillation1' },
      { key: 'distillation2', label: 'mod_distillation2' },
    ];
  }

  const records = getData(storeKey);

  container.innerHTML = `
    ${tabs ? `
      <div class="tab-bar">
        ${tabs.map(tb => `
          <button class="tab-btn ${currentModule === tb.key ? 'active' : ''}" data-tab="${tb.key}">${t(tb.label)}</button>
        `).join('')}
      </div>
    ` : ''}

    ${hasPermission('canExportData') && records.length ? `
      <div style="text-align:right;margin-bottom:12px;">
        <button class="btn btn-secondary" id="export-btn" style="flex:none;padding:8px 16px;font-size:12px;">
          <i data-feather="download" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>${t('exportCSV')}
        </button>
      </div>
    ` : ''}

    <div class="section-title">${t('recentEntries')} (${records.length})</div>

    ${records.length === 0 ? `
      <div class="empty-state">
        <i data-feather="inbox"></i>
        <p>${t('noData')}</p>
        ${hasPermission('canAddRecords') ? `<p style="font-size:12px;color:var(--text-muted);margin-top:4px;">${t('tapPlusToAdd')}</p>` : ''}
      </div>
    ` : `
      <div class="record-list">
        ${records.map(r => renderRecordItem(r)).join('')}
      </div>
    `}
  `;

  // FAB
  if (hasPermission('canAddRecords')) {
    const fab = el('button', 'fab-add', '<i data-feather="plus"></i>');
    fab.setAttribute('aria-label', t('tapPlusToAdd') || 'Add new record');
    fab.addEventListener('click', () => {
      editingRecord = null;
      currentView = 'form';
      _navDirection = 'forward';
      renderApp();
    });
    container.appendChild(fab);
  }

  // Bind tabs (save/restore scroll per tab)
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sc = $('#screen-content');
      if (sc) _scrollPositions[(currentModule || currentScreen) + ':' + currentView] = sc.scrollTop;
      currentModule = btn.dataset.tab;
      currentView = 'list';
      renderApp();
    });
  });

  // Bind export
  const exportBtn = container.querySelector('#export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportToCSV(storeKey, currentModule + '_' + todayStr() + '.csv');
      showToast(t('exportCSV') + ' ✓');
    });
  }

  // Bind approve buttons (bottling quick-approve for admin)
  container.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (records.find(r => r.id === btn.dataset.id)) {
        updateRecord(storeKey, btn.dataset.id, { decision: 'approved' });
        syncModuleToSheets(currentModule);
        syncInventorySnapshot('approve');
        renderApp();
      }
    });
  });

  // Bind record items
  container.querySelectorAll('.record-item').forEach(item => {
    item.addEventListener('click', () => {
      editingRecord = records.find(r => r.id === item.dataset.id);
      currentView = 'detail';
      _navDirection = 'forward';
      renderApp();
    });
  });
}

function renderRecordItem(r) {
  let title = '';
  let details = '';
  let badge = '';

  switch (currentModule) {
    case 'rawMaterials':
      title = esc(r.item || r.category || '-');
      details = `${t('rm_supplier')}: ${esc(r.supplier || '-')} &bull; ${esc(r.weight || '-')} ${esc(r.unit || '')}`;
      break;
    case 'dateReceiving':
      title = esc(r.supplier || '-');
      details = `${esc(r.weight || '-')} kg`;
      break;
    case 'fermentation': {
      const crates = r.datesCrates !== undefined ? r.datesCrates : Math.round((parseFloat(r.datesKg) || 0) / 20);
      title = `${esc(r.tankSize || '-')}L ${t('fm_tankSize')}`;
      details = `${esc(crates)} ${t('fm_datesCrates').split('(')[0].trim()}`;
      break;
    }
    case 'distillation1':
      title = r.type ? esc(t(r.type)) : '-';
      details = `${t('d1_stillName')}: ${r.stillName ? esc(t(r.stillName)) : '-'} &bull; ${esc(r.distilledQty || '-')} L`;
      break;
    case 'distillation2':
      title = `${esc(r.batchNumber || '-')} (${r.productType ? esc(t(r.productType)) : '-'})`;
      details = `${esc(r.initAlcohol || '-')}% &bull; ${esc(r.quantity || '-')} L`;
      break;
    case 'bottling':
      title = r.drinkType ? esc(t(r.drinkType)) : '-';
      details = `${t('bt_batchNumber')}: ${esc(r.batchNumber || '-')} &bull; ${esc(r.bottleCount || '-')} ${t('bt_bottleCount').toLowerCase()}`;
      badge = r.decision === 'approved'
        ? `<span class="ri-badge approved">${t('approved')}</span>`
        : r.decision === 'notApproved'
          ? `<span class="ri-badge not-approved">${t('notApproved')}</span>`
          : `<span class="ri-badge pending">${t('bt_pendingApproval')}</span>${hasPermission('canApproveBottling') ? `<button class="approve-btn" data-id="${esc(r.id)}" style="margin-inline-start:6px;padding:2px 10px;font-size:11px;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer;">${t('bt_approve')}</button>` : ''}`;
      break;
  }

  return `
    <div class="record-item" data-id="${esc(r.id)}">
      <div class="ri-top">
        <span class="ri-title">${title}</span>
        <span class="ri-date">${formatDate(r.date || r.createdAt)}</span>
      </div>
      <div class="ri-details">${details} ${badge}</div>
    </div>
  `;
}

// ============================================================
// MODULE DETAIL VIEW
// ============================================================
function renderModuleDetail(container) {
  if (!editingRecord) { currentView = 'list'; renderApp(); return; }
  const r = editingRecord;

  const fields = getModuleFields(currentModule);
  let html = '<div class="detail-card">';

  fields.forEach(f => {
    let val = r[f.key];
    if (f.type === 'toggle') val = val ? t('yes') : t('no');
    else if (f.type === 'select' && val) {
      const opt = f.options?.find(o => o.value === val);
      val = opt?.labelKey ? t(opt.labelKey) : val;
    }
    else if (f.type === 'date') val = formatDate(val);
    if (val === undefined || val === null || val === '') val = '-';

    html += `<div class="detail-row"><span class="dl">${t(f.labelKey)}</span><span class="dv">${esc(val)}</span></div>`;
  });

  if (r.notes) {
    html += `<div class="detail-row"><span class="dl">${t('notes')}</span><span class="dv">${esc(r.notes)}</span></div>`;
  }

  html += '</div>';

  // Action buttons
  html += '<div class="form-actions">';
  if (hasPermission('canEditRecords')) {
    html += `<button class="btn btn-primary" id="edit-record-btn">${t('edit')}</button>`;
  }
  if (hasPermission('canDeleteRecords')) {
    html += `<button class="btn btn-danger" id="delete-record-btn">${t('delete')}</button>`;
  }
  html += '</div>';

  container.innerHTML = html;

  // Bind
  const editBtn = container.querySelector('#edit-record-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      currentView = 'form';
      _navDirection = 'forward';
      renderApp();
    });
  }

  const delBtn = container.querySelector('#delete-record-btn');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      showManagerPasswordModal(() => {
        deleteRecord(STORE_KEYS[currentModule], editingRecord.id);
        syncModuleToSheets(currentModule);
        syncInventorySnapshot('delete');
        editingRecord = null;
        currentView = 'list';
        _navDirection = 'back';
        renderApp();
        showToast(t('delete') + ' ✓');
      });
    });
  }
}

// ============================================================
// MODULE FORM VIEW
// ============================================================
function renderModuleForm(container) {
  const fields = getModuleFields(currentModule);
  const isEdit = editingRecord !== null;

  let html = '<div class="form-container">';

  fields.forEach(f => {
    const val = isEdit ? (editingRecord[f.key] ?? '') : (f.default ?? '');
    html += renderFormField(f, val);
  });

  // Notes field (all modules)
  const notesVal = isEdit ? (editingRecord.notes || '') : '';
  html += `
    <div class="form-group">
      <label class="form-label">${t('notes')}</label>
      <textarea class="form-textarea" id="field-notes" placeholder="${t('addNote')}">${esc(notesVal)}</textarea>
    </div>
  `;

  // Signature for bottling
  if (currentModule === 'bottling') {
    html += `
      <div class="form-group">
        <label class="form-label">${t('bt_qaSignature')}</label>
        <div class="sig-pad-wrapper">
          <canvas id="sig-canvas"></canvas>
          <button class="sig-clear" id="sig-clear">${t('clearSignature')}</button>
        </div>
      </div>
    `;
  }

  html += `
    <div class="form-actions">
      <button class="btn btn-secondary" id="form-cancel">${t('cancel')}</button>
      <button class="btn btn-primary" id="form-save">${t('save')}</button>
    </div>
  `;

  html += '</div>';
  container.innerHTML = html;

  // Init signature canvas
  if (currentModule === 'bottling') {
    initSignaturePad();
  }

  // Bind cascading dropdowns
  bindCascadingDropdowns();

  // Bind save/cancel
  container.querySelector('#form-cancel').addEventListener('click', () => {
    currentView = editingRecord ? 'detail' : 'list';
    if (!editingRecord) editingRecord = null;
    _navDirection = 'back';
    renderApp();
  });

  container.querySelector('#form-save').addEventListener('click', () => {
    saveCurrentForm();
  });

  // Bind custom "Add new" option for all selects
  bindCustomSelects();
}

function bindCustomSelects() {
  document.querySelectorAll('.custom-select-group').forEach(group => {
    const fieldKey = group.dataset.fieldKey;
    const select = group.querySelector('select');
    const form = group.querySelector('.custom-option-form');
    if (!select || !form) return;

    let prevValue = select.value;

    select.addEventListener('change', () => {
      if (select.value === '__ADD_NEW__') {
        form.style.display = '';
        const input = form.querySelector('.custom-option-input');
        if (input) { input.value = ''; input.focus(); }
        select.value = prevValue; // revert selection visually
      } else {
        prevValue = select.value;
        form.style.display = 'none';
      }
    });

    const cancelBtn = form.querySelector('.custom-opt-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        form.style.display = 'none';
        select.value = prevValue;
      });
    }

    const confirmBtn = form.querySelector('.custom-opt-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const input = form.querySelector('.custom-option-input');
        const newVal = input ? input.value.trim() : '';
        if (!newVal) { showToast(t('required')); return; }

        await addCustomOption(fieldKey, newVal);

        // Add option to select and pick it
        const opt = document.createElement('option');
        opt.value = newVal;
        opt.textContent = newVal;
        // Insert before the __ADD_NEW__ option
        const addNewOpt = select.querySelector('option[value="__ADD_NEW__"]');
        if (addNewOpt) select.insertBefore(opt, addNewOpt);
        else select.appendChild(opt);

        select.value = newVal;
        prevValue = newVal;
        form.style.display = 'none';
        showToast(t('optionAdded'));
      });
    }
  });
}

// bindSupplierAddNew is replaced by bindCustomSelects() — see below

function renderFormField(f, val) {
  const reqMark = f.required ? '<span class="req">*</span>' : '';

  switch (f.type) {
    case 'date':
      return `
        <div class="form-group">
          <label class="form-label">${t(f.labelKey)}${reqMark}</label>
          <input type="date" class="form-input" id="field-${f.key}" value="${esc(val || todayStr())}">
        </div>`;

    case 'number':
      return `
        <div class="form-group">
          <label class="form-label">${t(f.labelKey)}${reqMark}</label>
          <input type="number" class="form-input" id="field-${f.key}" value="${esc(val)}" step="${f.step || 'any'}" min="${f.min ?? ''}" max="${f.max ?? ''}" placeholder="${f.placeholder || ''}">
        </div>`;

    case 'text':
      const display = f.hidden ? 'display:none' : '';
      return `
        <div class="form-group" style="${display}">
          <label class="form-label">${t(f.labelKey)}${reqMark}</label>
          <input type="text" class="form-input" id="field-${f.key}" value="${esc(val)}" placeholder="${f.placeholder || ''}">
        </div>`;


    case 'select': {
      const customOpts = getCustomOptions(f.key);
      const allCustom = customOpts.filter(c => !(f.options || []).some(o => (o.value || o) === c));
      const skipAddNew = f.noCustom === true;
      return `
        <div class="form-group custom-select-group" data-field-key="${f.key}">
          <label class="form-label">${t(f.labelKey)}${reqMark}</label>
          <select class="form-select" id="field-${f.key}">
            <option value="">${t('selectOne')}</option>
            ${(f.options || []).map(o => {
              const optVal = o.value || o;
              const optLabel = o.labelKey ? t(o.labelKey) : (o.label || o);
              return `<option value="${esc(optVal)}" ${val === optVal ? 'selected' : ''}>${esc(optLabel)}</option>`;
            }).join('')}
            ${allCustom.map(c => `<option value="${esc(c)}" ${val === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            ${!skipAddNew ? `<option value="__ADD_NEW__">${t('addNewOption')}</option>` : ''}
          </select>
          ${!skipAddNew ? `
          <div class="custom-option-form" id="custom-form-${f.key}" style="display:none;">
            <input type="text" class="form-input custom-option-input" id="custom-input-${f.key}" placeholder="${t('newOptionPlaceholder')}">
            <div class="custom-option-actions">
              <button class="btn btn-secondary custom-opt-cancel" data-fkey="${f.key}">${t('cancel')}</button>
              <button class="btn btn-primary custom-opt-confirm" data-fkey="${f.key}">${t('confirm')}</button>
            </div>
          </div>
          ` : ''}
        </div>`; }


    case 'cascading-select':
      return `
        <div class="form-group">
          <label class="form-label">${t(f.labelKey)}${reqMark}</label>
          <select class="form-select" id="field-${f.key}" data-cascade-parent="${f.parentKey}">
            <option value="">${t('selectOne')}</option>
          </select>
        </div>`;

    case 'toggle':
      const checked = val === true || val === 'true' ? 'checked' : '';
      return `
        <div class="form-group">
          <div class="toggle-row">
            <span class="toggle-label">${t(f.labelKey)}${reqMark}</span>
            <label class="toggle-switch">
              <input type="checkbox" id="field-${f.key}" ${checked}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>`;

    case 'time-range':
      const parts = (val || '').split('-');
      return `
        <div class="form-group">
          <label class="form-label">${t(f.labelKey)}</label>
          <div class="time-range-row">
            <input type="time" class="form-input" id="field-${f.key}-start" value="${esc(parts[0] || '')}">
            <span>—</span>
            <input type="time" class="form-input" id="field-${f.key}-end" value="${esc(parts[1] || '')}">
          </div>
        </div>`;

    case 'decision':
      return `
        <div class="form-group">
          <label class="form-label">${t(f.labelKey)}${reqMark}</label>
          <div style="display:flex;gap:8px;">
            <button class="btn ${val === 'approved' ? 'btn-success' : 'btn-secondary'}" data-decision="approved" id="field-${f.key}-approved" style="flex:1">${t('approved')}</button>
            <button class="btn ${val === 'notApproved' ? 'btn-danger' : 'btn-secondary'}" data-decision="notApproved" id="field-${f.key}-notApproved" style="flex:1">${t('notApproved')}</button>
          </div>
          <input type="hidden" id="field-${f.key}" value="${esc(val || '')}">
        </div>`;

    default:
      return '';
  }
}

function bindCascadingDropdowns() {
  // Raw materials: category -> item
  const catSelect = document.querySelector('#field-category');
  const itemSelect = document.querySelector('#field-item');

  if (catSelect && itemSelect) {
    const updateItems = () => {
      const cat = catSelect.value;
      const items = ITEMS_BY_CATEGORY[cat] || [];
      itemSelect.innerHTML = `<option value="">${t('selectOne')}</option>` +
        items.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
    };
    catSelect.addEventListener('change', updateItems);

    // If editing, populate items for current category
    if (editingRecord && editingRecord.category) {
      catSelect.value = editingRecord.category;
      updateItems();
      if (editingRecord.item) itemSelect.value = editingRecord.item;
    }
  }

  // Decision buttons
  document.querySelectorAll('[data-decision]').forEach(btn => {
    btn.addEventListener('click', () => {
      const decision = btn.dataset.decision;
      const hiddenInput = document.querySelector('#field-decision');
      if (hiddenInput) hiddenInput.value = decision;

      // Update button styles
      const approvedBtn = document.querySelector('#field-decision-approved');
      const notApprovedBtn = document.querySelector('#field-decision-notApproved');
      if (approvedBtn) {
        approvedBtn.className = `btn ${decision === 'approved' ? 'btn-success' : 'btn-secondary'}`;
        approvedBtn.style.flex = '1';
      }
      if (notApprovedBtn) {
        notApprovedBtn.className = `btn ${decision === 'notApproved' ? 'btn-danger' : 'btn-secondary'}`;
        notApprovedBtn.style.flex = '1';
      }
    });
  });

  // Auto-calculate number of crates from tank size (fermentation)
  // Formula: tank_size * 0.28 kg of dates / 20 kg per crate
  const tankSelect = document.querySelector('#field-tankSize');
  const datesCratesInput = document.querySelector('#field-datesCrates');
  if (tankSelect && datesCratesInput) {
    tankSelect.addEventListener('change', () => {
      const size = parseFloat(tankSelect.value) || 0;
      datesCratesInput.value = Math.round(size * 0.28 / 20).toString();
    });
  }
}

function saveCurrentForm() {
  // Disable save button during submission (BUG-047)
  const saveBtn = document.querySelector('#form-save');
  if (saveBtn) saveBtn.disabled = true;

  const fields = getModuleFields(currentModule);
  const record = {};

  // Clear previous validation errors
  document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
  document.querySelectorAll('.field-error-msg').forEach(el => el.remove());

  // Validate required fields with inline error highlighting
  const missing = [];
  fields.forEach(f => {
    if (!f.required) return;
    const fieldEl = document.querySelector(`#field-${f.key}`);
    const val = fieldEl ? (fieldEl.type === 'checkbox' ? null : fieldEl.value) : null;
    if (!val || val.trim() === '') {
      missing.push(t(f.labelKey));
      if (fieldEl) {
        fieldEl.classList.add('field-error');
        const errMsg = document.createElement('div');
        errMsg.className = 'field-error-msg';
        errMsg.textContent = t('required');
        fieldEl.parentElement.appendChild(errMsg);
      }
    }
  });
  if (missing.length > 0) {
    showToast(`${t('required')}: ${missing.join(', ')}`);
    // Scroll to first error
    const firstErr = document.querySelector('.field-error');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (saveBtn) saveBtn.disabled = false;
    return;
  }

  fields.forEach(f => {
    if (f.type === 'toggle') {
      const el = document.querySelector(`#field-${f.key}`);
      record[f.key] = el ? el.checked : false;
    } else if (f.type === 'time-range') {
      const startEl = document.querySelector(`#field-${f.key}-start`);
      const endEl = document.querySelector(`#field-${f.key}-end`);
      record[f.key] = (startEl?.value || '') + '-' + (endEl?.value || '');
    } else {
      const el = document.querySelector(`#field-${f.key}`);
      record[f.key] = el ? (el.type === 'checkbox' ? el.checked : el.value) : '';
    }
  });

  // Guard: if any select still has __ADD_NEW__ selected, block save
  for (const f of fields) {
    if (f.type === 'select' && record[f.key] === '__ADD_NEW__') {
      showToast(`${t('required')}: ${t(f.labelKey)}`);
      if (saveBtn) saveBtn.disabled = false;
      return;
    }
  }

  // Notes
  const notesEl = document.querySelector('#field-notes');
  record.notes = notesEl ? notesEl.value : '';

  // Signature
  if (currentModule === 'bottling' && signatureCanvas) {
    // Detect blank canvas by checking if any non-transparent pixel exists
    const ctx = signatureCanvas.getContext('2d');
    const pixelData = ctx.getImageData(0, 0, signatureCanvas.width, signatureCanvas.height).data;
    const isSigned = pixelData.some((v, i) => i % 4 === 3 && v > 0);
    if (!isSigned) {
      showToast(`${t('required')}: ${t('bt_qaSignature')}`);
      if (saveBtn) saveBtn.disabled = false;
      return;
    }
    record.signature = signatureCanvas.toDataURL();
  }

  // Date field (use the date field or today)
  if (!record.date) record.date = todayStr();

  // Show loading state on save button
  if (saveBtn) saveBtn.classList.add('is-loading');

  const storeKey = STORE_KEYS[currentModule];

  if (editingRecord) {
    updateRecord(storeKey, editingRecord.id, record);
  } else {
    addRecord(storeKey, record);
  }

  showToast(t('saved'));
  syncModuleToSheets(currentModule);
  syncInventorySnapshot('save');
  if (saveBtn) saveBtn.disabled = false;
  editingRecord = null;
  currentView = 'list';
  _navDirection = 'back';
  renderApp();
}

// ============================================================
// SIGNATURE PAD
// ============================================================
function initSignaturePad() {
  signatureCanvas = document.querySelector('#sig-canvas');
  if (!signatureCanvas) return;

  const rect = signatureCanvas.parentElement.getBoundingClientRect();
  signatureCanvas.width = rect.width;
  signatureCanvas.height = 120;
  sigCtx = signatureCanvas.getContext('2d');
  sigCtx.strokeStyle = '#e8e8f0';
  sigCtx.lineWidth = 2;
  sigCtx.lineCap = 'round';

  sigDrawing = false;

  const getPos = (e) => {
    const r = signatureCanvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX - r.left, y: touch.clientY - r.top };
  };

  signatureCanvas.addEventListener('mousedown', e => { sigDrawing = true; sigCtx.beginPath(); const p = getPos(e); sigCtx.moveTo(p.x, p.y); });
  signatureCanvas.addEventListener('mousemove', e => { if (!sigDrawing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); });
  signatureCanvas.addEventListener('mouseup', () => { sigDrawing = false; });

  signatureCanvas.addEventListener('touchstart', e => { e.preventDefault(); sigDrawing = true; sigCtx.beginPath(); const p = getPos(e); sigCtx.moveTo(p.x, p.y); }, { passive: false });
  signatureCanvas.addEventListener('touchmove', e => { e.preventDefault(); if (!sigDrawing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); }, { passive: false });
  signatureCanvas.addEventListener('touchend', () => { sigDrawing = false; });

  const clearBtn = document.querySelector('#sig-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      sigCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    });
  }
}

// ============================================================
// INVENTORY VIEW
// ============================================================

// Returns records where createdAt is at least 60 seconds old (1-min buffer).
// Also returns the count of pending (< 1 min) records for the badge.
function getBufferedRecords(key) {
  const all = getData(key);
  const cutoff = Date.now() - 60 * 1000;
  const visible = all.filter(r => !r.createdAt || new Date(r.createdAt).getTime() <= cutoff);
  const pending = all.length - visible.length;
  return { visible, pending };
}

// Schedule a re-render of inventory after oldest pending record becomes visible.
let _invRefreshTimer = null;
function scheduleInventoryRefresh(container) {
  if (_invRefreshTimer) clearTimeout(_invRefreshTimer);
  const all = [
    ...getData(STORE_KEYS.bottling),
    ...getData(STORE_KEYS.rawMaterials),
    ...getData(STORE_KEYS.dateReceiving),
    ...getData(STORE_KEYS.fermentation),
  ];
  const cutoff = Date.now() - 60 * 1000;
  const pending = all.filter(r => r.createdAt && new Date(r.createdAt).getTime() > cutoff);
  if (pending.length === 0) return;

  // Find the one that will become visible soonest
  const earliest = Math.min(...pending.map(r => new Date(r.createdAt).getTime()));
  const delay = earliest + 60 * 1000 - Date.now() + 200; // +200ms margin
  _invRefreshTimer = setTimeout(() => {
    if (currentModule === 'inventory') {
      renderApp();
    }
  }, Math.max(delay, 1000));
}

function renderInventory(container) {
  // 1-minute buffer: only count records older than 60s
  const { visible: bottlingRecords, pending: pendingBottling } = getBufferedRecords(STORE_KEYS.bottling);
  const { visible: rawRecords, pending: pendingRaw } = getBufferedRecords(STORE_KEYS.rawMaterials);
  const { visible: dateRecords, pending: pendingDates } = getBufferedRecords(STORE_KEYS.dateReceiving);
  const { visible: fermRecords, pending: pendingFerm } = getBufferedRecords(STORE_KEYS.fermentation);

  const totalPending = pendingBottling + pendingRaw + pendingDates + pendingFerm;

  const bottleInv = {};
  DRINK_TYPES.forEach(dt => { bottleInv[dt] = 0; });
  bottlingRecords.forEach(r => {
    if (r.drinkType && r.decision === 'approved') {
      const count = parseInt(r.bottleCount) || 0;
      bottleInv[r.drinkType] = (bottleInv[r.drinkType] || 0) + count;
    }
  });

  const rawInv = {};
  rawRecords.forEach(r => {
    const key = r.item || r.category || 'Unknown';
    const qty = parseFloat(r.weight) || 0;
    rawInv[key] = (rawInv[key] || 0) + qty;
  });

  const totalDatesReceived = dateRecords.reduce((sum, r) => sum + (parseFloat(r.weight) || 0), 0);
  // Support both new records (datesCrates) and legacy records (datesKg stored as kg)
  const totalDatesInFerm = fermRecords.reduce((sum, r) => {
    if (r.datesCrates !== undefined && r.datesCrates !== '') {
      return sum + (parseFloat(r.datesCrates) || 0) * 20;
    }
    return sum + (parseFloat(r.datesKg) || 0);
  }, 0);
  const availableDates = Math.max(0, totalDatesReceived - totalDatesInFerm);
  const activeFerm = fermRecords.filter(r => !r.sentToDistillation).length;

  container.innerHTML = `
    <h1 class="sr-only">${t('mod_inventory')}</h1>
    ${totalPending > 0 ? `
    <div class="inv-pending-banner">
      <i data-feather="clock" style="width:14px;height:14px;margin-inline-end:6px;"></i>
      ${t('pendingChanges').replace('{n}', totalPending)}
    </div>` : ''}

    <div class="tab-bar">
      <button class="tab-btn active" data-inv-tab="bottles">${t('mod_bottleInventory')}</button>
      <button class="tab-btn" data-inv-tab="raw">${t('mod_rawInventory')}</button>
    </div>

    <div id="inv-bottles">
      <div class="inv-section">
        <div class="stats-row" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:16px;">
          <div class="stat-card">
            <div class="stat-num" style="color:var(--success)">${availableDates.toFixed(0)}</div>
            <div class="stat-label">${t('inv_dates')}</div>
            <div style="font-size:10px;opacity:0.6;margin-top:2px;">+${totalDatesReceived.toFixed(0)} / -${totalDatesInFerm.toFixed(0)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-num">${activeFerm}</div>
            <div class="stat-label">${t('mod_fermentation')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-num" style="color:var(--warning,#f59e0b)">${totalDatesInFerm.toFixed(0)}</div>
            <div class="stat-label">${t('inv_datesUsed')}</div>
          </div>
        </div>

        <h3>${t('mod_bottleInventory')}</h3>
        <table class="inv-table">
          <thead><tr><th>${t('inv_drinkType')}</th><th style="text-align:right">${t('inv_warehouseQty')}</th></tr></thead>
          <tbody>
            ${DRINK_TYPES.map(dt => {
    const qty = bottleInv[dt] || 0;
    const cls = qty > 0 ? 'stock-positive' : qty < 0 ? 'stock-negative' : 'stock-zero';
    return `<tr><td>${t(dt)}</td><td style="text-align:right" class="${cls}">${qty}</td></tr>`;
  }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div id="inv-raw" style="display:none;">
      <div class="inv-section">
        <h3>${t('mod_rawInventory')}</h3>
        <table class="inv-table">
          <thead><tr><th>${t('inv_item')}</th><th style="text-align:right">${t('inv_stock')}</th></tr></thead>
          <tbody>
            ${Object.entries(rawInv).length === 0 ? `<tr><td colspan="2" style="text-align:center">${t('noData')}</td></tr>` :
      Object.entries(rawInv).map(([item, qty]) => {
        const cls = qty > 0 ? 'stock-positive' : qty < 0 ? 'stock-negative' : 'stock-zero';
        return `<tr><td>${esc(item)}</td><td style="text-align:right" class="${cls}">${esc(qty)}</td></tr>`;
      }).join('')
    }
          </tbody>
        </table>
      </div>
    </div>


  `;

  // Bind tabs
  container.querySelectorAll('[data-inv-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.invTab;
      container.querySelector('#inv-bottles').style.display = tab === 'bottles' ? '' : 'none';
      container.querySelector('#inv-raw').style.display = tab === 'raw' ? '' : 'none';
    });
  });

  // Version Detail View — removed: dead code referencing undefined 'versions' variable (BUG-012)

  // Schedule auto-refresh when pending records become visible
  scheduleInventoryRefresh(container);
}

// ============================================================
// SPIRIT PIPELINE SCREEN
// ============================================================
// ============================================================
// MODULE FIELD DEFINITIONS
// ============================================================
function getModuleFields(mod) {
  switch (mod) {
    case 'rawMaterials':
      return [
        {
          key: 'supplier', labelKey: 'rm_supplier', type: 'select', required: true,
          options: SUPPLIERS_RAW.map(s => ({ value: s, labelKey: s }))
        },
        { key: 'date', labelKey: 'rm_receiveDate', type: 'date', required: true, default: todayStr() },
        {
          key: 'category', labelKey: 'rm_category', type: 'select', required: true,
          options: CATEGORIES.map(c => ({ value: c, labelKey: c }))
        },
        { key: 'item', labelKey: 'rm_item', type: 'cascading-select', required: true, parentKey: 'category' },
        { key: 'weight', labelKey: 'rm_weight', type: 'number', required: true, step: '0.01', min: 0 },
        { key: 'expiry', labelKey: 'rm_expiry', type: 'date' },
        { key: 'tithing', labelKey: 'rm_tithing', type: 'toggle' },
        { key: 'healthCert', labelKey: 'rm_healthCert', type: 'toggle' },
        { key: 'kosher', labelKey: 'rm_kosher', type: 'toggle' },
      ];

    case 'dateReceiving':
      return [
        {
          key: 'supplier', labelKey: 'dr_supplier', type: 'select', required: true,
          options: SUPPLIERS_DATES.map(s => ({ value: s, labelKey: s }))
        },
        { key: 'date', labelKey: 'dr_receiveDate', type: 'date', required: true, default: todayStr() },
        { key: 'weight', labelKey: 'dr_weight', type: 'number', required: true, step: '0.1', min: 0 },
        { key: 'tithing', labelKey: 'dr_tithing', type: 'toggle' },
        {
          key: 'expiryPeriod', labelKey: 'dr_expiryPeriod', type: 'select',
          options: [
            { value: '1year', labelKey: 'dr_expiryPeriod_1year' },
            { value: 'custom', labelKey: 'dr_expiryPeriod_custom' },
          ]
        },
      ];

    case 'fermentation':
      return [
        { key: 'date', labelKey: 'fm_date', type: 'date', required: true, default: todayStr() },
        {
          key: 'tankSize', labelKey: 'fm_tankSize', type: 'select', required: true, noCustom: true,
          options: TANK_SIZES.map(s => ({ value: String(s), label: s + ' L' }))
        },
        { key: 'datesCrates', labelKey: 'fm_datesCrates', type: 'number', required: true, step: '1', min: '0' },
        { key: 'temperature', labelKey: 'fm_temperature', type: 'number', step: '0.1' },
        { key: 'sugar', labelKey: 'fm_sugar', type: 'number', step: '0.1' },
        { key: 'ph', labelKey: 'fm_ph', type: 'number', step: '0.01', min: 0, max: 14 },
        { key: 'sentToDistillation', labelKey: 'fm_sentToDistillation', type: 'toggle' },
      ];

    case 'distillation1':
      return [
        { key: 'date', labelKey: 'd1_date', type: 'date', required: true, default: todayStr() },
        {
          key: 'type', labelKey: 'd1_type', type: 'select', required: true,
          options: D1_TYPES.map(t => ({ value: t, labelKey: t }))
        },
        {
          key: 'stillName', labelKey: 'd1_stillName', type: 'select', required: true,
          options: STILL_NAMES.map(s => ({ value: s, labelKey: s }))
        },
        { key: 'fermDate', labelKey: 'd1_fermDate', type: 'date' },
        { key: 'distQty', labelKey: 'd1_distQty', type: 'number', step: '0.1' },
        { key: 'initAlcohol', labelKey: 'd1_initAlcohol', type: 'number', step: '0.1', min: 0, max: 100 },
        { key: 'finalAlcohol', labelKey: 'd1_finalAlcohol', type: 'number', step: '0.1', min: 0, max: 100 },
        { key: 'temp', labelKey: 'd1_temp', type: 'number', step: '0.1', default: '99.9' },
        { key: 'timeRange', labelKey: 'd1_timeRange', type: 'time-range' },
        { key: 'distilledQty', labelKey: 'd1_distilledQty', type: 'number', required: true, step: '0.1' },
      ];

    case 'distillation2':
      return [
        { key: 'date', labelKey: 'd2_date', type: 'date', required: true, default: todayStr() },
        {
          key: 'productType', labelKey: 'd2_productType', type: 'select', required: true,
          options: D2_PRODUCT_TYPES.map(t => ({ value: t, labelKey: t }))
        },
        { key: 'd1Dates', labelKey: 'd2_d1Dates', type: 'text', placeholder: 'e.g. 1.1 / 2.1 / 5.1' },
        { key: 'batchNumber', labelKey: 'd2_batchNumber', type: 'text', required: true, placeholder: 'e.g. E51, A102, G7' },
        { key: 'initAlcohol', labelKey: 'd2_initAlcohol', type: 'number', step: '0.1', min: 0, max: 100 },
        { key: 'headSep', labelKey: 'd2_headSep', type: 'toggle', default: true },
        { key: 'tailAlcohol', labelKey: 'd2_tailAlcohol', type: 'number', step: '0.01', default: '0.55' },
        { key: 'temp', labelKey: 'd2_temp', type: 'number', step: '0.1', default: '99.9' },
        { key: 'timeRange', labelKey: 'd2_timeRange', type: 'time-range' },
        { key: 'quantity', labelKey: 'd2_quantity', type: 'number', required: true, step: '0.1' },
        { key: 'd1InputQty', labelKey: 'd2_d1InputQty', type: 'number', step: '0.1', min: 0 },
      ];

    case 'bottling':
      return [
        {
          key: 'drinkType', labelKey: 'bt_drinkType', type: 'select', required: true,
          options: DRINK_TYPES.map(t => ({ value: t, labelKey: t }))
        },
        { key: 'date', labelKey: 'bt_bottlingDate', type: 'date', required: true, default: todayStr() },
        { key: 'batchNumber', labelKey: 'bt_batchNumber', type: 'text', required: true, placeholder: 'e.g. E51, A102' },
        { key: 'barrelNumber', labelKey: 'bt_barrelNumber', type: 'text', placeholder: 'e.g. B1, B2' },
        { key: 'd2Date', labelKey: 'bt_d2Date', type: 'date' },
        { key: 'alcohol', labelKey: 'bt_alcohol', type: 'number', required: true, step: '0.001', min: 0, max: 1 },
        { key: 'filtered', labelKey: 'bt_filtered', type: 'toggle' },
        {
          key: 'color', labelKey: 'bt_color', type: 'select', noCustom: true,
          options: [
            { value: 'normal', labelKey: 'normal' },
            { value: 'abnormal', labelKey: 'abnormal' },
          ]
        },
        {
          key: 'taste', labelKey: 'bt_taste', type: 'select', noCustom: true,
          options: [
            { value: 'normal', labelKey: 'normal' },
            { value: 'abnormal', labelKey: 'abnormal' },
          ]
        },
        { key: 'contaminants', labelKey: 'bt_contaminants', type: 'toggle' },
        { key: 'bottleCount', labelKey: 'bt_bottleCount', type: 'number', required: true, min: 0 },
        { key: 'd2InputQty', labelKey: 'bt_d2InputQty', type: 'number', step: '0.1', min: 0 },
        ...(hasPermission('canApproveBottling') ? [
          { key: 'decision', labelKey: 'bt_decision', type: 'decision', required: true },
        ] : []),
      ];

    default:
      return [];
  }
}

// ============================================================
// BACKOFFICE UI
// ============================================================

function renderBackoffice(container) {
  if (!hasPermission('canManageUsers')) {
    container.innerHTML = `<div class="perm-overlay"><i data-feather="lock"></i><p>${t('perm_denied')}</p></div>`;
    return;
  }

  // Sync users from backend in background (updates localStorage, then re-renders)
  if (typeof syncUsersFromBackend === 'function' && !container._syncStarted) {
    container._syncStarted = true;
    syncUsersFromBackend().then(synced => {
      if (synced && synced.length !== getUsers().length) {
        renderBackoffice(container); // re-render with merged data
      }
    }).catch(() => {});
  }

  const users = getUsers();

  if (currentView === 'form') {
    renderUserForm(container);
    return;
  }

  container.innerHTML = `
    <div class="section-title">${t('userManagement')}</div>
    <p class="backoffice-subtitle">${t('backofficeSubtitle')}</p>

    <div class="record-list" style="margin-top:16px;">
      ${users.map(u => `
        <div class="record-item user-item" data-username="${esc(u.username)}">
          <div class="ri-top">
            <span class="ri-title">
              ${esc(u.username)}
              <span class="role-pill role-pill-${esc(u.role)}" style="margin-inline-start:6px;">${t('role_' + u.role)}</span>
            </span>
            <span class="ri-badge ${u.status === 'inactive' ? 'not-approved' : 'approved'}">
              ${u.status === 'inactive' ? t('inactive') : t('active')}
            </span>
          </div>
          <div class="ri-details">
            ${u.email ? `<div style="font-size:11px;color:var(--text-secondary)">${esc(u.email)}</div>` : ''}
            ${esc(currentLang === 'he' ? (u.nameHe || u.name || '-') : currentLang === 'th' ? (u.nameTh || u.name || '-') : (u.name || '-'))}
            <div style="font-size:10px; margin-top:4px; color:var(--text-muted);">
              ${t('lastActivity')}: ${u.lastActivity ? formatDate(u.lastActivity) : '-'}
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="invite-section" style="margin-top:24px;">
      <div class="section-title" style="margin-bottom:12px;">${t('inviteUser')}</div>
      <div style="display:flex;gap:8px;align-items:flex-end;">
        <div style="flex:1;">
          <input type="email" class="form-input" id="invite-email" placeholder="${t('inviteEmailPlaceholder')}"
            aria-label="${t('inviteEmailPlaceholder')}" autocomplete="off" autocapitalize="none" spellcheck="false" style="margin:0;">
        </div>
        <select class="form-select" id="invite-role" style="width:auto;min-width:100px;margin:0;">
          <option value="worker">${t('role_worker')}</option>
          <option value="manager">${t('role_manager')}</option>
          <option value="admin">${t('role_admin')}</option>
        </select>
      </div>
      <button class="btn btn-primary" id="btn-send-invite" style="margin-top:10px;width:100%;">
        <i data-feather="send"></i> ${t('sendInvitation')}
      </button>
      <div class="login-error" id="invite-error" role="alert" aria-live="polite" style="margin-top:8px;"></div>
      <div class="login-success" id="invite-success" role="status" aria-live="polite" style="margin-top:8px;"></div>
    </div>

    <div style="margin-top:24px;">
      <div class="section-title" style="margin-bottom:12px;">${t('invitationsTitle')}</div>
      <div id="invitations-list" class="record-list">
        <div class="empty-state" style="padding:16px 0;"><p style="font-size:13px;color:var(--text-muted)">${t('invitationsEmpty')}</p></div>
      </div>
    </div>

    <div style="margin-top:24px;">
      <div class="section-title" style="margin-bottom:12px;">${t('sheetsIntegration')}</div>
      <a href="${INVENTORY_SHEET_URL}" target="_blank" rel="noopener noreferrer"
         id="inventory-sheet-link" class="btn btn-secondary"
         style="display:flex;align-items:center;gap:8px;margin-bottom:12px;text-decoration:none;">
        <i data-feather="external-link"></i> ${t('viewInventorySheet')}
      </a>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-secondary" id="btn-sync-all-sheets" style="flex:1;">
          <i data-feather="refresh-cw"></i> ${t('sheetsSyncAll')}
        </button>
      </div>
    </div>

    <div style="margin-top:16px; display:flex; gap:10px;">
      <button class="btn btn-secondary" id="btn-export-all" style="flex:1;">
        <i data-feather="download"></i> ${t('exportAllData')}
      </button>
    </div>
  `;

  // Bind export
  const exportBtn = container.querySelector('#btn-export-all');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (confirm(t('confirmExport'))) {
        exportAllData();
      }
    });
  }

  // Bind Sync All — pushes every module to Sheets at once
  const syncAllBtn = container.querySelector('#btn-sync-all-sheets');
  if (syncAllBtn) {
    syncAllBtn.addEventListener('click', async () => {
      syncAllBtn.disabled = true;
      const origHtml = syncAllBtn.innerHTML;
      syncAllBtn.innerHTML = `<i data-feather="loader"></i> ${t('syncInProgress')}`;
      if (typeof feather !== 'undefined') feather.replace();

      ['rawMaterials', 'dateReceiving', 'fermentation', 'distillation1', 'distillation2', 'bottling']
        .forEach(m => syncModuleToSheets(m));
      syncInventorySnapshot('manual');

      // Wait for GAS to process, then verify via GET
      await new Promise(r => setTimeout(r, 4000));
      const check = await verifySyncStatus(t('mod_bottling'));
      console.log('[sync] Sync All verification:', check);

      syncAllBtn.disabled = false;
      syncAllBtn.innerHTML = origHtml;
      if (typeof feather !== 'undefined') feather.replace();

      if (check.verified && check.exists) {
        showToast(t('syncSuccess'));
      } else {
        showToast(t('sheetsSyncAll') + ' ✓');
      }
    });
  }

  // Bind user items to edit
  container.querySelectorAll('.user-item').forEach(item => {
    item.addEventListener('click', () => {
      const username = item.dataset.username;
      editingRecord = users.find(u => u.username === username);
      currentView = 'form';
      renderApp();
    });
  });

  // --- Invitation bindings ---
  const sendInviteBtn = container.querySelector('#btn-send-invite');
  if (sendInviteBtn) {
    sendInviteBtn.addEventListener('click', () => {
      const emailInput = container.querySelector('#invite-email');
      const roleInput = container.querySelector('#invite-role');
      const errEl = container.querySelector('#invite-error');
      const successEl = container.querySelector('#invite-success');
      errEl.textContent = '';
      successEl.textContent = '';

      const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
      const role = roleInput ? roleInput.value : 'worker';

      if (!email) { errEl.textContent = t('inviteError_fillEmail'); return; }
      const emailCheck = validateEmail(email);
      if (!emailCheck.valid) { errEl.textContent = t('inviteError_invalidEmail'); return; }

      // Check duplicate in existing users
      const existingUsers = getUsers();
      if (existingUsers.find(u => u.email && u.email.toLowerCase() === email)) {
        errEl.textContent = t('requestError_emailExists');
        return;
      }

      // Check duplicate in local invitations
      const invites = getInvitations();
      if (invites.find(inv => inv.email === email && inv.status === 'pending')) {
        errEl.textContent = t('inviteError_duplicate');
        return;
      }

      // Generate token and send
      const token = generateInviteToken();
      const appUrl = location.origin + location.pathname;
      const session = getSession();

      // Save locally
      addInvitation({
        token,
        email,
        role,
        status: 'pending',
        sentAt: new Date().toISOString(),
        sentBy: session ? session.username : '',
        username: '',
      });

      // Also create invitation via backend (for Firestore storage, fire-and-forget)
      if (typeof apiCreateInvitation === 'function') {
        apiCreateInvitation({
          email,
          role,
          app: 'factory',
          sentBy: session ? session.username : '',
        }).catch(function() {});
      }

      // Send to GAS (fire-and-forget)
      const url = SHEETS_SYNC_URL;
      if (url) {
        sendInviteBtn.disabled = true;
        sendInviteBtn.innerHTML = `<i data-feather="loader"></i> ${t('inviteSending')}`;
        if (typeof feather !== 'undefined') feather.replace();

        fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            action: 'send_invite',
            email,
            token,
            role,
            appUrl,
            sentBy: session ? session.username : '',
          }),
          mode: 'no-cors',
        }).then(() => {
          successEl.textContent = t('inviteSent');
          emailInput.value = '';
          sendInviteBtn.disabled = false;
          sendInviteBtn.innerHTML = `<i data-feather="send"></i> ${t('sendInvitation')}`;
          if (typeof feather !== 'undefined') feather.replace();
          // Refresh invitations list
          loadInvitationsList(container);
        }).catch(() => {
          sendInviteBtn.disabled = false;
          sendInviteBtn.innerHTML = `<i data-feather="send"></i> ${t('sendInvitation')}`;
          if (typeof feather !== 'undefined') feather.replace();
          successEl.textContent = t('inviteSent');
          emailInput.value = '';
          loadInvitationsList(container);
        });
      } else {
        successEl.textContent = t('inviteSent');
        emailInput.value = '';
        loadInvitationsList(container);
      }
    });
  }

  // Load invitations from GAS on backoffice render
  loadInvitationsList(container);
}

// Fetch invitations from backend API (primary) or GAS (fallback) and render
function loadInvitationsList(container) {
  const listEl = container.querySelector('#invitations-list');
  if (!listEl) return;

  // Show local invitations immediately
  const localInvites = getInvitations();
  renderInvitationItems(listEl, localInvites);

  // Try backend API first
  if (typeof apiListInvitations === 'function') {
    apiListInvitations('factory').then(result => {
      if (result && result.invitations) {
        // Map backend format to local format
        const mapped = result.invitations.map(inv => ({
          token: inv.token || inv._fbId,
          email: inv.email,
          role: inv.role,
          status: inv.status,
          sentAt: inv.createdAt || inv.sentAt,
          sentBy: inv.createdBy || inv.sentBy || '',
          username: inv.username || '',
        }));
        saveInvitations(mapped);
        renderInvitationItems(listEl, mapped);
        return; // backend succeeded, skip GAS
      }
      // Backend returned null (unavailable) — fallback to GAS
      fetchInvitationsFromGAS(listEl);
    }).catch(() => fetchInvitationsFromGAS(listEl));
  } else {
    fetchInvitationsFromGAS(listEl);
  }
}

function fetchInvitationsFromGAS(listEl) {
  const url = SHEETS_SYNC_URL;
  if (!url) return;

  fetch(`${url}?action=listInvites`)
    .then(resp => { if (!resp.ok) throw new Error('http'); return resp.json(); })
    .then(data => {
      if (data.status === 'ok' && Array.isArray(data.invites)) {
        saveInvitations(data.invites);
        renderInvitationItems(listEl, data.invites);
      }
    })
    .catch(() => {});
}

function renderInvitationItems(listEl, invites) {
  if (!invites || invites.length === 0) {
    listEl.innerHTML = `<div class="empty-state" style="padding:16px 0;"><p style="font-size:13px;color:var(--text-muted)">${t('invitationsEmpty')}</p></div>`;
    return;
  }

  listEl.innerHTML = invites.map(inv => `
    <div class="record-item">
      <div class="ri-top">
        <span class="ri-title" style="font-size:13px;">
          ${inv.username ? esc(inv.username) : esc(inv.email)}
        </span>
        <span style="display:flex;align-items:center;gap:6px;">
          ${inv.status === 'pending' ? `<button class="inv-delete-btn" data-token="${esc(inv.token)}" title="${t('delete')}" style="background:none;border:none;cursor:pointer;padding:2px;color:var(--text-muted);"><i data-feather="x-circle" style="width:16px;height:16px;"></i></button>` : ''}
          <span class="ri-badge ${inv.status === 'accepted' ? 'approved' : 'pending'}">
            ${inv.status === 'accepted' ? t('inviteAccepted') : t('invitePending')}
          </span>
        </span>
      </div>
      <div class="ri-details">
        ${inv.username ? `<div style="font-size:11px;color:var(--text-secondary)">${esc(inv.email)}</div>` : ''}
        <span class="role-pill role-pill-${esc(inv.role || 'worker')}" style="font-size:9px;">${t('role_' + (inv.role || 'worker'))}</span>
        <span style="font-size:10px;color:var(--text-muted);margin-inline-start:8px;">
          ${inv.sentAt ? new Date(inv.sentAt).toLocaleDateString() : ''}
        </span>
      </div>
    </div>
  `).join('');

  // Bind delete buttons
  listEl.querySelectorAll('.inv-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const token = btn.dataset.token;
      if (!confirm(t('inviteDeleteConfirm'))) return;
      deleteInvitation(token, listEl);
    });
  });

  if (typeof feather !== 'undefined') feather.replace();
}

function deleteInvitation(token, listEl) {
  // Remove from local storage
  const invites = getInvitations().filter(i => i.token !== token);
  saveInvitations(invites);
  renderInvitationItems(listEl, invites);

  // Remove from backend API (fire-and-forget)
  if (typeof apiDeleteInvitation === 'function') {
    apiDeleteInvitation(token).catch(() => {});
  }

  // Remove from GAS (fire-and-forget)
  const url = SHEETS_SYNC_URL;
  if (url) {
    fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'delete_invite', token }),
      mode: 'no-cors',
    }).catch(() => {});
  }
}

function renderUserForm(container) {
  const isEdit = !!editingRecord;
  const u = editingRecord || {};

  container.innerHTML = `
    <div class="section-title">${isEdit ? t('editUser') : t('addUser')}</div>
    <div class="form-container">
      
      <div class="form-group">
        <label class="form-label">${t('username')} <span class="req">*</span></label>
        <input type="text" class="form-input" id="bo-username" value="${esc(u.username || '')}" ${isEdit ? 'disabled style="opacity:0.7"' : ''}>
      </div>

      ${!isEdit ? `
      <div class="form-group">
        <label class="form-label">${t('password')} <span class="req">*</span></label>
        <input type="password" class="form-input" id="bo-password" placeholder="${t('password')}">
      </div>
      ` : `
      <div class="form-group">
        <label class="form-label">${t('password')} <small>(${t('optional')})</small></label>
        <input type="password" class="form-input" id="bo-password" placeholder="${t('keepCurrentPassword')}">
      </div>
      `}

      <div class="form-group">
        <label class="form-label">${t('nameEnglish')} <span class="req">*</span></label>
        <input type="text" class="form-input" id="bo-name" value="${esc(u.name || '')}">
      </div>

      <div class="form-group">
        <label class="form-label">${t('nameHebrew')}</label>
        <input type="text" class="form-input" id="bo-nameHe" value="${esc(u.nameHe || '')}" dir="rtl">
      </div>

      <div class="form-group">
        <label class="form-label">${t('fullName')} (Thai)</label>
        <input type="text" class="form-input" id="bo-nameTh" value="${esc(u.nameTh || '')}">
      </div>

      <div class="form-group">
        <label class="form-label">${t('selectRole')} <span class="req">*</span></label>
        <select class="form-select" id="bo-role">
          <option value="worker" ${u.role === 'worker' ? 'selected' : ''}>${t('role_worker')}</option>
          <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>${t('role_manager')}</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>${t('role_admin') || 'Admin'}</option>
        </select>
      </div>
      
      <div class="form-group">
        <label class="form-label">${t('status')}</label>
        <select class="form-select" id="bo-status">
          <option value="active" ${u.status !== 'inactive' ? 'selected' : ''}>${t('active')}</option>
          <option value="inactive" ${u.status === 'inactive' ? 'selected' : ''}>${t('inactive')}</option>
        </select>
      </div>

      <div class="login-error" id="bo-error" role="alert" aria-live="polite"></div>

      <div class="form-actions">
        <button class="btn btn-secondary" id="bo-cancel">${t('cancel')}</button>
        ${isEdit ? `<button class="btn btn-danger" id="bo-delete">${t('deleteUser')}</button>` : ''}
        <button class="btn btn-primary" id="bo-save">${t('save')}</button>
      </div>
    </div>
  `;

  // Bind actions
  const cancelBtn = container.querySelector('#bo-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    currentView = 'list';
    editingRecord = null;
    renderApp();
  });

  const deleteBtn = container.querySelector('#bo-delete');
  if (deleteBtn && isEdit) {
    deleteBtn.addEventListener('click', () => {
      if (u.username === 'admin') {
        showToast(t('cannotDeleteAdmin'));
        return;
      }
      if (u.username === getSession().username) {
        showToast(t('cannotDeleteSelf'));
        return;
      }
      showManagerPasswordModal(async () => {
        const delResult = await deleteUserByUsername(u.username);
        if (delResult && !delResult.success) {
          showToast(delResult.error || t('error'));
          return;
        }
        showToast(t('delete') + ' ✓');
        currentView = 'list';
        editingRecord = null;
        renderApp();
      });
    });
  }

  const saveBtn = container.querySelector('#bo-save');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const errorEl = container.querySelector('#bo-error');
    errorEl.textContent = '';

    const usernameInput = container.querySelector('#bo-username');
    const passwordInput = container.querySelector('#bo-password');
    const nameInput = container.querySelector('#bo-name');
    const nameHeInput = container.querySelector('#bo-nameHe');
    const nameThInput = container.querySelector('#bo-nameTh');
    const roleInput = container.querySelector('#bo-role');
    const statusInput = container.querySelector('#bo-status');

    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const name = nameInput ? nameInput.value.trim() : '';
    const nameHe = nameHeInput ? nameHeInput.value.trim() : '';
    const nameTh = nameThInput ? nameThInput.value.trim() : '';
    const role = roleInput ? roleInput.value : '';
    const status = statusInput ? statusInput.value : 'active';

    if (!username || !name || (!isEdit && !password)) {
      errorEl.textContent = t('signUpError_fillAll');
      return;
    }

    saveBtn.disabled = true;

    if (isEdit) {
      // Update
      const updates = { name, nameHe, nameTh, role, status };
      if (password) updates.password = password;

      const res = await updateUser(username, updates);
      if (res.success) {
        showToast(t('saved'));
        currentView = 'list';
        editingRecord = null;
        renderApp();
      } else {
        saveBtn.disabled = false;
        errorEl.textContent = res.error;
      }
    } else {
      // Create (async — may create Firebase Auth account)
      const res = await createUser({ username, password, name, nameHe, nameTh, role, status });
      if (res.success) {
        showToast(t('signUpSuccess'));
        currentView = 'list';
        editingRecord = null;
        renderApp();
      } else {
        saveBtn.disabled = false;
        errorEl.textContent = t(res.error) || res.error;
      }
    }
  });
}

// ============================================================
// ACCESS REQUESTS
// ============================================================

// ============================================================
// AUTO HARD-REFRESH
// ============================================================
function scheduleHardRefresh(intervalMs = 30 * 60 * 1000) {
  setInterval(() => {
    // Don't reload if user is editing a form (BUG-030)
    if (currentView === 'form' || document.querySelector('.modal-overlay')) return;
    location.reload(true);
  }, intervalMs);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  if (typeof initFirebase === 'function') initFirebase();
  // Check backend availability (non-blocking)
  if (typeof apiHealthCheck === 'function') {
    apiHealthCheck();
  }
  // Restore from URL hash if present, otherwise use sessionStorage state
  if (location.hash && location.hash !== '#/') {
    _restoreStateFromHash();
  }
  // On restore, if we're in form/detail view but have no editingRecord, fall back to list
  if ((currentView === 'form' || currentView === 'detail') && !editingRecord) {
    currentView = 'list';
  }
  renderApp();
  scheduleHardRefresh();
});
