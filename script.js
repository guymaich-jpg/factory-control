// ============================================================
// script.js — Factory Control App (main controller)
// ============================================================

// ---------- State ----------
let currentScreen = 'dashboard';
let currentModule = null;   // which form/list is open
let currentView = 'list';   // 'list' | 'form' | 'detail'
let editingRecord = null;
let signatureCanvas = null;
let sigCtx = null;
let sigDrawing = false;
let _navDirection = 'none'; // 'forward' | 'back' | 'none' — for iOS-style transitions
const _scrollPositions = {}; // keyed by "screen:module" — preserves scroll on tab switch

// ---------- Helpers ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

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
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ============================================================
// GOOGLE SHEETS SYNC
// ============================================================
const SHEETS_URL_KEY = 'factory_sheets_url';

function syncModuleToSheets(module) {
  const url = localStorage.getItem(SHEETS_URL_KEY) || '';
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

  fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      sheetName: t('mod_' + module),
      keys,
      labels,
      records,
    }),
    mode: 'no-cors',
  }).catch(() => {});
}

// Append a timestamped inventory snapshot row to the Sheets Inventory ledger.
// Called automatically after any record is saved, updated, or deleted.
function syncInventorySnapshot(triggeredBy) {
  const url = localStorage.getItem(SHEETS_URL_KEY) || '';
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

  fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      sheetName: t('mod_inventory'),
      action: 'append',
      keys,
      labels,
      records: [record],
    }),
    mode: 'no-cors',
  }).catch(() => {});
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
      <input type="password" class="form-input mpd-input" id="mpd-password" placeholder="${t('managerPasswordPlaceholder')}" autocomplete="current-password">
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
    const authorized = users.find(
      u => (u.role === 'manager' || u.role === 'admin') && u.password === pwd
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
    app.innerHTML = renderLogin();
    if (typeof feather !== 'undefined') feather.replace();
    bindLogin();
    return;
  }

  app.innerHTML = `
    ${renderHeader()}
    <div class="screen-content" id="screen-content"></div>
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
// LOGIN & SIGN UP
// ============================================================
let authMode = 'login'; // 'login' | 'signup'

function renderLogin() {
  if (authMode === 'signup') return renderSignUp();

  return `
    <button class="login-lang-toggle" onclick="toggleLang()">${t('langToggle')}</button>
    <div class="login-screen">
      <div class="login-logo">FC</div>
      <h1>${t('loginTitle')}</h1>
      <p>${t('loginSubtitle')}</p>
      <div class="login-form">
        <div class="field">
          <input type="text" id="login-user" placeholder="${t('username')}" autocomplete="username" autocapitalize="none">
        </div>
        <div class="field">
          <input type="password" id="login-pass" placeholder="${t('password')}" autocomplete="current-password">
        </div>
        <button class="login-btn" id="login-btn">${t('login')}</button>
        <div class="login-error" id="login-error"></div>
      </div>
      <div class="login-switch">
        ${t('dontHaveAccount')} <a href="#" id="go-signup">${t('signUp')}</a>
      </div>
      <div class="login-hint">
        <strong>Demo:</strong> manager / manager123 &bull; worker1 / worker123
      </div>
    </div>
  `;
}

function renderSignUp() {
  return `
    <button class="login-lang-toggle" onclick="toggleLang()">${t('langToggle')}</button>
    <div class="login-screen">
      <div class="login-logo">
        <i data-feather="user-plus" style="width:36px;height:36px;"></i>
      </div>
      <h1>${t('signUpTitle')}</h1>
      <p>${t('signUpSubtitle')}</p>
      <div class="login-form">
        <div class="field">
          <input type="text" id="signup-name" placeholder="${t('fullName')}" autocomplete="name">
        </div>
        <div class="field">
          <input type="text" id="signup-user" placeholder="${t('username')}" autocomplete="username" autocapitalize="none">
        </div>
        <div class="field">
          <input type="password" id="signup-pass" placeholder="${t('password')}" autocomplete="new-password">
        </div>
        <div class="field">
          <input type="password" id="signup-pass2" placeholder="${t('confirmPassword')}" autocomplete="new-password">
        </div>
        <div class="field">
          <select class="signup-role-select" id="signup-role">
            <option value="">${t('selectRole')}</option>
            <option value="worker">${t('role_worker')}</option>
            <option value="manager">${t('role_manager')}</option>
          </select>
        </div>
        <button class="login-btn" id="signup-btn">${t('signUp')}</button>
        <div class="login-error" id="signup-error"></div>
        <div class="login-success" id="signup-success"></div>
      </div>
      <div class="login-switch">
        ${t('alreadyHaveAccount')} <a href="#" id="go-login">${t('login')}</a>
      </div>
    </div>
  `;
}

function bindLogin() {
  // --- Login mode ---
  const loginBtn = $('#login-btn');
  if (loginBtn) {
    const userInput = $('#login-user');
    const passInput = $('#login-pass');
    const errEl = $('#login-error');

    const doLogin = () => {
      const user = userInput.value.trim();
      const pass = passInput.value;
      if (!user || !pass) return;
      const session = authenticate(user, pass);
      if (session) {
        currentScreen = 'dashboard';
        currentModule = null;
        renderApp();
      } else {
        errEl.textContent = t('loginError');
      }
    };

    loginBtn.addEventListener('click', doLogin);
    passInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  }

  // --- Sign Up mode ---
  const signupBtn = $('#signup-btn');
  if (signupBtn) {
    const nameInput = $('#signup-name');
    const userInput = $('#signup-user');
    const passInput = $('#signup-pass');
    const pass2Input = $('#signup-pass2');
    const roleSelect = $('#signup-role');
    const errEl = $('#signup-error');
    const successEl = $('#signup-success');

    const doSignup = () => {
      errEl.textContent = '';
      successEl.textContent = '';

      const result = registerUser(
        userInput.value.trim(),
        passInput.value,
        pass2Input.value,
        nameInput.value.trim(),
        roleSelect.value
      );

      if (result.success) {
        successEl.textContent = t('signUpSuccess');
        // Clear form
        nameInput.value = '';
        userInput.value = '';
        passInput.value = '';
        pass2Input.value = '';
        roleSelect.value = '';
        // Switch to login after a short delay
        setTimeout(() => {
          authMode = 'login';
          renderApp();
        }, 1800);
      } else {
        errEl.textContent = t(result.error);
      }
    };

    signupBtn.addEventListener('click', doSignup);
    pass2Input.addEventListener('keydown', e => { if (e.key === 'Enter') doSignup(); });
  }

  // --- Toggle between login / signup ---
  const goSignup = $('#go-signup');
  if (goSignup) {
    goSignup.addEventListener('click', e => {
      e.preventDefault();
      authMode = 'signup';
      renderApp();
    });
  }

  const goLogin = $('#go-login');
  if (goLogin) {
    goLogin.addEventListener('click', e => {
      e.preventDefault();
      authMode = 'login';
      renderApp();
    });
  }
}

// ============================================================
// HEADER
// ============================================================
function renderHeader() {
  const session = getSession();
  const showBack = currentModule !== null;
  const title = currentModule ? getModuleTitle(currentModule) : (currentScreen === 'backoffice' ? t('nav_backoffice') : t('appName'));
  const roleClass = session.role === 'worker' ? 'worker' : '';

  return `
    <div class="app-header">
      <div class="header-left">
        ${showBack ? `<button class="header-back" id="header-back"><i data-feather="arrow-left"></i></button>` : ''}
        <span class="user-badge"><span class="role-dot ${roleClass}"></span>${getUserDisplayName()}</span>
      </div>
      <span class="header-title">${title}</span>
      <div class="header-right">
        <button class="lang-btn" onclick="toggleLang()">${t('langToggle')}</button>
        <button class="logout-btn" id="logout-btn"><i data-feather="log-out" style="width:14px;height:14px"></i></button>
      </div>
    </div>
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
    spiritStock: 'mod_spiritStock',
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
    { id: 'spiritStock', icon: 'droplet', label: 'nav_spiritStock' },
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
      else if (nav === 'spiritStock') { currentModule = 'spiritStock'; }
      else if (nav === 'bottling') { currentModule = 'bottling'; }
      else if (nav === 'inventory') { currentModule = 'inventory'; }
      else if (nav === 'settings') { currentModule = null; }

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
    <div class="welcome-card">
      <h2>${t('welcome')}, ${getUserDisplayName()}</h2>
      <p>${t('role_' + session.role)} &bull; ${new Date().toLocaleDateString(currentLang === 'th' ? 'th-TH' : currentLang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-num">${totalRecords}</div>
        <div class="stat-label">${t('totalRecords')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${todayTotal}</div>
        <div class="stat-label">${t('todayActivity')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${pendingApprovals}</div>
        <div class="stat-label">${t('pendingApprovals')}</div>
      </div>
    </div>

    <div class="section-title">${t('quickActions')}</div>
    <div class="module-grid">
      ${modules.map(m => `
        <div class="module-card" data-module="${m.key}">
          <div class="mc-icon"><i data-feather="${m.icon}"></i></div>
          <div class="mc-title">${getModuleTitle(m.key)}</div>
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
          <div class="recent-activity-item" data-ra-module="${r._module}" data-ra-id="${r.id}">
            <div class="ra-icon" style="background:${r._color}20;color:${r._color}"><i data-feather="${r._icon}"></i></div>
            <div class="ra-content">
              <div class="ra-title">${title}</div>
              <div class="ra-meta">${getModuleTitle(r._module)} &bull; ${time}</div>
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
  if (currentModule === 'spiritStock') {
    renderSpiritStock(container);
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
      title = r.item || r.category || '-';
      details = `${t('rm_supplier')}: ${r.supplier || '-'} &bull; ${r.weight || '-'} ${r.unit || ''}`;
      break;
    case 'dateReceiving':
      title = r.supplier || '-';
      details = `${r.weight || '-'} kg`;
      break;
    case 'fermentation': {
      const crates = r.datesCrates !== undefined ? r.datesCrates : Math.round((parseFloat(r.datesKg) || 0) / 20);
      title = `${r.tankSize || '-'}L ${t('fm_tankSize')}`;
      details = `${crates} ${t('fm_datesCrates').split('(')[0].trim()}`;
      break;
    }
    case 'distillation1':
      title = r.type ? t(r.type) : '-';
      details = `${t('d1_stillName')}: ${r.stillName ? t(r.stillName) : '-'} &bull; ${r.distilledQty || '-'} L`;
      break;
    case 'distillation2':
      title = `${r.batchNumber || '-'} (${r.productType ? t(r.productType) : '-'})`;
      details = `${r.initAlcohol || '-'}% &bull; ${r.quantity || '-'} L`;
      break;
    case 'bottling':
      title = r.drinkType ? t(r.drinkType) : '-';
      details = `${t('bt_batchNumber')}: ${r.batchNumber || '-'} &bull; ${r.bottleCount || '-'} ${t('bt_bottleCount').toLowerCase()}`;
      badge = r.decision === 'approved'
        ? `<span class="ri-badge approved">${t('approved')}</span>`
        : r.decision === 'notApproved'
          ? `<span class="ri-badge not-approved">${t('notApproved')}</span>`
          : `<span class="ri-badge pending">${t('bt_pendingApproval')}</span>${hasPermission('canApproveBottling') ? `<button class="approve-btn" data-id="${r.id}" style="margin-inline-start:6px;padding:2px 10px;font-size:11px;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer;">${t('bt_approve')}</button>` : ''}`;
      break;
  }

  return `
    <div class="record-item" data-id="${r.id}">
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
    else if (f.type === 'select' && val) val = f.options ? (f.options.find(o => o.value === val)?.labelKey ? t(f.options.find(o => o.value === val).labelKey) : val) : val;
    else if (f.type === 'date') val = formatDate(val);
    if (val === undefined || val === null || val === '') val = '-';

    html += `<div class="detail-row"><span class="dl">${t(f.labelKey)}</span><span class="dv">${val}</span></div>`;
  });

  if (r.notes) {
    html += `<div class="detail-row"><span class="dl">${t('notes')}</span><span class="dv">${r.notes}</span></div>`;
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
      <textarea class="form-textarea" id="field-notes" placeholder="${t('addNote')}">${notesVal}</textarea>
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
          <input type="date" class="form-input" id="field-${f.key}" value="${val || todayStr()}">
        </div>`;

    case 'number':
      return `
        <div class="form-group">
          <label class="form-label">${t(f.labelKey)}${reqMark}</label>
          <input type="number" class="form-input" id="field-${f.key}" value="${val}" step="${f.step || 'any'}" min="${f.min ?? ''}" max="${f.max ?? ''}" placeholder="${f.placeholder || ''}">
        </div>`;

    case 'text':
      const display = f.hidden ? 'display:none' : '';
      return `
        <div class="form-group" style="${display}">
          <label class="form-label">${t(f.labelKey)}${reqMark}</label>
          <input type="text" class="form-input" id="field-${f.key}" value="${val}" placeholder="${f.placeholder || ''}">
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
              return `<option value="${optVal}" ${val === optVal ? 'selected' : ''}>${optLabel}</option>`;
            }).join('')}
            ${allCustom.map(c => `<option value="${c}" ${val === c ? 'selected' : ''}>${c}</option>`).join('')}
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
            <input type="time" class="form-input" id="field-${f.key}-start" value="${parts[0] || ''}">
            <span>—</span>
            <input type="time" class="form-input" id="field-${f.key}-end" value="${parts[1] || ''}">
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
          <input type="hidden" id="field-${f.key}" value="${val || ''}">
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
        items.map(i => `<option value="${i}">${i}</option>`).join('');
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
      return;
    }
    record.signature = signatureCanvas.toDataURL();
  }

  // Date field (use the date field or today)
  if (!record.date) record.date = todayStr();

  // Show loading state on save button
  const saveBtn = document.querySelector('#form-save');
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
        return `<tr><td>${item}</td><td style="text-align:right" class="${cls}">${qty}</td></tr>`;
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

  // Schedule auto-refresh when pending records become visible
  scheduleInventoryRefresh(container);
}

// ============================================================
// SPIRIT PIPELINE SCREEN
// ============================================================
function renderSpiritStock(container) {
  const d1Records = getData(STORE_KEYS.distillation1);
  const d2Records = getData(STORE_KEYS.distillation2);
  const bottlingRecords = getData(STORE_KEYS.bottling);

  // D1 totals
  const d1Produced = d1Records.reduce((sum, r) => sum + (parseFloat(r.distilledQty) || 0), 0);
  const d1Consumed = d2Records.reduce((sum, r) => sum + (parseFloat(r.d1InputQty) || 0), 0);
  const d1Available = Math.max(0, d1Produced - d1Consumed);
  const d1HasConsumed = d1Consumed > 0;

  // D2 totals
  const d2Produced = d2Records.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0), 0);
  const d2Consumed = bottlingRecords.reduce((sum, r) => sum + (parseFloat(r.d2InputQty) || 0), 0);
  const d2Available = Math.max(0, d2Produced - d2Consumed);
  const d2HasConsumed = d2Consumed > 0;

  const hasAnyData = d1Records.length > 0 || d2Records.length > 0;

  if (!hasAnyData) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-feather="droplet"></i>
        <p>${t('spirit_noData')}</p>
      </div>`;
    return;
  }

  const fmtL = n => n.toFixed(1) + ' L';

  container.innerHTML = `
    <div class="section-title">${t('spirit_pipeline')}</div>

    <div class="spirit-pipeline">

      <!-- D1 Stage -->
      <div class="spirit-stage">
        <div class="spirit-stage-header">
          <i data-feather="zap" style="width:16px;height:16px;"></i>
          <span>${t('spirit_d1Label')}</span>
        </div>
        <div class="spirit-stage-stats">
          <div class="spirit-stat">
            <span class="spirit-stat-label">${t('spirit_produced')}</span>
            <span class="spirit-stat-val">${fmtL(d1Produced)}</span>
          </div>
          ${d1HasConsumed ? `
          <div class="spirit-stat">
            <span class="spirit-stat-label">${t('spirit_consumed')}</span>
            <span class="spirit-stat-val spirit-stat-out">− ${fmtL(d1Consumed)}</span>
          </div>` : ''}
          <div class="spirit-stat spirit-stat-available">
            <span class="spirit-stat-label">${t('spirit_available')}</span>
            <span class="spirit-stat-val spirit-stat-in">${fmtL(d1Available)}</span>
          </div>
        </div>
        <div class="spirit-count-note">${d1Records.length} ${t('recentEntries').toLowerCase()}</div>
      </div>

      <div class="spirit-arrow"><i data-feather="arrow-down"></i></div>

      <!-- D2 Stage -->
      <div class="spirit-stage">
        <div class="spirit-stage-header">
          <i data-feather="filter" style="width:16px;height:16px;"></i>
          <span>${t('spirit_d2Label')}</span>
        </div>
        <div class="spirit-stage-stats">
          <div class="spirit-stat">
            <span class="spirit-stat-label">${t('spirit_produced')}</span>
            <span class="spirit-stat-val">${fmtL(d2Produced)}</span>
          </div>
          ${d2HasConsumed ? `
          <div class="spirit-stat">
            <span class="spirit-stat-label">${t('spirit_consumed')}</span>
            <span class="spirit-stat-val spirit-stat-out">− ${fmtL(d2Consumed)}</span>
          </div>` : ''}
          <div class="spirit-stat spirit-stat-available">
            <span class="spirit-stat-label">${t('spirit_available')}</span>
            <span class="spirit-stat-val spirit-stat-in">${fmtL(d2Available)}</span>
          </div>
        </div>
        <div class="spirit-count-note">${d2Records.length} ${t('recentEntries').toLowerCase()}</div>
      </div>

      <div class="spirit-arrow"><i data-feather="arrow-down"></i></div>

      <!-- Ready to Bottle -->
      <div class="spirit-stage spirit-stage-final">
        <div class="spirit-stage-header">
          <i data-feather="package" style="width:16px;height:16px;"></i>
          <span>${t('spirit_readyToBottle')}</span>
        </div>
        <div class="spirit-stage-stats">
          <div class="spirit-stat spirit-stat-available">
            <span class="spirit-stat-label">${t('spirit_available')}</span>
            <span class="spirit-stat-val spirit-stat-in" style="font-size:22px;">${fmtL(d2Available)}</span>
          </div>
        </div>
      </div>

    </div>

    ${(!d1HasConsumed || !d2HasConsumed) ? `
    <div class="spirit-hint">
      <i data-feather="info" style="width:13px;height:13px;margin-inline-end:5px;vertical-align:middle;"></i>
      ${!d1HasConsumed && !d2HasConsumed
        ? 'Add "D1 Spirit Consumed" to D2 records and "D2 Spirit Consumed" to Bottling records to track net balances.'
        : !d1HasConsumed
          ? 'Add "D1 Spirit Consumed" to D2 records to track D1 net balance.'
          : 'Add "D2 Spirit Consumed" to Bottling records to track D2 net balance.'}
    </div>` : ''}
  `;
}

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

  const users = getUsers();

  if (currentView === 'form') {
    renderUserForm(container);
    return;
  }

  container.innerHTML = `
    <div class="section-title">${t('userManagement')}</div>
    <p class="backoffice-subtitle">${t('backofficeSubtitle')}</p>

    <div class="permissions-legend">
      <div class="perm-legend-row">
        <span class="role-pill role-pill-manager">${t('role_manager')}</span>
        <span>${t('permManager')}</span>
      </div>
      <div class="perm-legend-row">
        <span class="role-pill role-pill-worker">${t('role_worker')}</span>
        <span>${t('permWorker')}</span>
      </div>
    </div>

    <div class="record-list" style="margin-top:16px;">
      ${users.map(u => `
        <div class="record-item user-item" data-username="${u.username}">
          <div class="ri-top">
            <span class="ri-title">
              ${u.username}
              <span class="role-pill role-pill-${u.role}" style="margin-inline-start:6px;">${t('role_' + u.role)}</span>
            </span>
            <span class="ri-badge ${u.status === 'inactive' ? 'not-approved' : 'approved'}">
              ${u.status === 'inactive' ? t('inactive') : t('active')}
            </span>
          </div>
          <div class="ri-details">
            ${u.nameHe || u.name || '-'}${u.name ? ' &bull; ' + u.name : ''}
            <div style="font-size:10px; margin-top:4px; color:var(--text-muted);">
              ${t('lastActivity')}: ${u.lastActivity ? formatDate(u.lastActivity) : '-'}
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <div style="margin-top:24px;">
      <div class="section-title" style="margin-bottom:12px;">${t('sheetsIntegration')}</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">${t('sheetsUrlHint')}</p>
      <div class="form-group">
        <label class="form-label">${t('sheetsUrl')}</label>
        <input type="url" id="sheets-url-input" class="form-control"
          placeholder="${t('sheetsUrlPlaceholder')}"
          value="${localStorage.getItem(SHEETS_URL_KEY) || ''}"
          style="font-size:12px;">
      </div>
      <div style="display:flex;gap:10px;margin-top:8px;">
        <button class="btn btn-primary" id="btn-save-sheets-url" style="flex:1;">
          <i data-feather="link"></i> ${t('sheetsSave')}
        </button>
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

  // FAB
  const fab = el('button', 'fab-add', '<i data-feather="user-plus"></i>');
  fab.id = 'add-user-btn';
  fab.addEventListener('click', () => {
    editingRecord = null;
    currentView = 'form';
    renderApp();
  });
  container.appendChild(fab);

  // Bind export
  const exportBtn = container.querySelector('#btn-export-all');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (confirm(t('confirmExport'))) {
        exportAllData();
      }
    });
  }

  // Bind Sheets URL save
  const saveSheetsBtn = container.querySelector('#btn-save-sheets-url');
  if (saveSheetsBtn) {
    saveSheetsBtn.addEventListener('click', () => {
      const input = container.querySelector('#sheets-url-input');
      const url = input ? input.value.trim() : '';
      localStorage.setItem(SHEETS_URL_KEY, url);
      showToast(t('sheetsSaved'));
    });
  }

  // Bind Sync All — pushes every module to Sheets at once
  const syncAllBtn = container.querySelector('#btn-sync-all-sheets');
  if (syncAllBtn) {
    syncAllBtn.addEventListener('click', () => {
      const url = localStorage.getItem(SHEETS_URL_KEY) || '';
      if (!url) { showToast(t('sheetsUrlPlaceholder')); return; }
      ['rawMaterials', 'dateReceiving', 'fermentation', 'distillation1', 'distillation2', 'bottling']
        .forEach(m => syncModuleToSheets(m));
      showToast(t('sheetsSyncAll') + ' ✓');
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
}

function renderUserForm(container) {
  const isEdit = !!editingRecord;
  const u = editingRecord || {};

  container.innerHTML = `
    <div class="section-title">${isEdit ? t('editUser') : t('addUser')}</div>
    <div class="form-container">
      
      <div class="form-group">
        <label class="form-label">${t('username')} <span class="req">*</span></label>
        <input type="text" class="form-input" id="bo-username" value="${u.username || ''}" ${isEdit ? 'disabled style="opacity:0.7"' : ''}>
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
        <input type="text" class="form-input" id="bo-name" value="${u.name || ''}">
      </div>

      <div class="form-group">
        <label class="form-label">${t('nameHebrew')}</label>
        <input type="text" class="form-input" id="bo-nameHe" value="${u.nameHe || ''}" dir="rtl">
      </div>

      <div class="form-group">
        <label class="form-label">${t('fullName')} (Thai)</label>
        <input type="text" class="form-input" id="bo-nameTh" value="${u.nameTh || ''}">
      </div>

      <div class="form-group">
        <label class="form-label">${t('selectRole')} <span class="req">*</span></label>
        <select class="form-select" id="bo-role">
          <option value="worker" ${u.role === 'worker' ? 'selected' : ''}>${t('role_worker')}</option>
          <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>${t('role_manager')}</option>
        </select>
      </div>
      
      <div class="form-group">
        <label class="form-label">${t('status')}</label>
        <select class="form-select" id="bo-status">
          <option value="active" ${u.status !== 'inactive' ? 'selected' : ''}>${t('active')}</option>
          <option value="inactive" ${u.status === 'inactive' ? 'selected' : ''}>${t('inactive')}</option>
        </select>
      </div>

      <div class="login-error" id="bo-error"></div>

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
      showManagerPasswordModal(() => {
        deleteUserByUsername(u.username);
        showToast(t('delete') + ' ✓');
        currentView = 'list';
        editingRecord = null;
        renderApp();
      });
    });
  }

  const saveBtn = container.querySelector('#bo-save');
  if (saveBtn) saveBtn.addEventListener('click', () => {
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

    if (isEdit) {
      // Update
      const updates = { name, nameHe, nameTh, role, status };
      if (password) updates.password = password;

      const res = updateUser(username, updates);
      if (res.success) {
        showToast(t('saved'));
        currentView = 'list';
        editingRecord = null;
        renderApp();
      } else {
        errorEl.textContent = res.error;
      }
    } else {
      // Create
      const res = createUser({ username, password, name, nameHe, nameTh, role, status });
      if (res.success) {
        showToast(t('signUpSuccess'));
        currentView = 'list';
        editingRecord = null;
        renderApp();
      } else {
        errorEl.textContent = t(res.error) || res.error;
      }
    }
  });
}

// ============================================================
// AUTO HARD-REFRESH (every 5 minutes, only when not editing)
// ============================================================
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

function scheduleHardRefresh() {
  setTimeout(() => {
    const active = document.activeElement;
    const isEditing = active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT'
    );
    if (!isEditing) {
      location.reload(true);
    } else {
      // User is actively typing — retry in 60 seconds
      setTimeout(() => location.reload(true), 60 * 1000);
    }
  }, AUTO_REFRESH_MS);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  if (typeof initFirebase === 'function') initFirebase();
  renderApp();
  scheduleHardRefresh();
});
