// ============================================================
// script.js — Factory Control App (main controller)
// ============================================================

// ---------- State ----------
// ---------- State ----------
let currentScreen = 'dashboard';
let currentModule = null;   // which form/list is open
let currentView = 'list';   // 'list' | 'form' | 'detail'
let editingRecord = null;
let signatureCanvas = null;
let sigCtx = null;
let sigDrawing = false;

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

// ---------- Main Render ----------
function renderApp() {
  const app = $('#app');
  const session = getSession();

  if (!session) {
    app.innerHTML = renderLogin();
    feather.replace();
    bindLogin();
    return;
  }

  app.innerHTML = `
    ${renderHeader()}
    <div class="screen-content" id="screen-content"></div>
    ${renderBottomNav()}
  `;

  const content = $('#screen-content');

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

  feather.replace();
  bindNav();
  checkSecurity();
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
        <span class="header-title">${title}</span>
      </div>
      <div class="header-right">
        <span class="user-badge"><span class="role-dot ${roleClass}"></span>${getUserDisplayName()}</span>
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
  // Bottom nav
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const nav = btn.dataset.nav;
      currentScreen = nav;
      currentView = 'list';
      editingRecord = null;

      if (nav === 'dashboard') { currentModule = null; }
      else if (nav === 'receiving') { currentModule = 'rawMaterials'; }
      else if (nav === 'production') { currentModule = 'fermentation'; }
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
    { key: 'rawMaterials', icon: 'package', store: STORE_KEYS.rawMaterials },
    { key: 'dateReceiving', icon: 'sun', store: STORE_KEYS.dateReceiving },
    { key: 'fermentation', icon: 'thermometer', store: STORE_KEYS.fermentation },
    { key: 'distillation1', icon: 'droplet', store: STORE_KEYS.distillation1 },
    { key: 'distillation2', icon: 'filter', store: STORE_KEYS.distillation2 },
    { key: 'bottling', icon: 'check-circle', store: STORE_KEYS.bottling },
    { key: 'inventory', icon: 'database', store: null },
  ];

  const totalRecords = Object.values(STORE_KEYS).reduce((sum, k) => sum + getRecordCount(k), 0);
  const todayTotal = Object.values(STORE_KEYS).reduce((sum, k) => sum + getTodayRecords(k).length, 0);

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
        <div class="stat-num">7</div>
        <div class="stat-label">${t('modulesLabel')}</div>
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
  `;

  // Bind module cards
  container.querySelectorAll('.module-card').forEach(card => {
    card.addEventListener('click', () => {
      currentModule = card.dataset.module;
      currentView = 'list';
      renderApp();
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
      renderApp();
    });
    container.appendChild(fab);
  }

  // Bind tabs
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
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

  // Bind record items
  container.querySelectorAll('.record-item').forEach(item => {
    item.addEventListener('click', () => {
      editingRecord = records.find(r => r.id === item.dataset.id);
      currentView = 'detail';
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
    case 'fermentation':
      title = `${r.tankSize || '-'}L ${t('fm_tankSize')}`;
      details = `${r.datesKg || '-'} kg &bull; ${r.quantity || '-'} L`;
      break;
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
          : '';
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
      renderApp();
    });
  }

  const delBtn = container.querySelector('#delete-record-btn');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      if (confirm(t('perm_deleteConfirm'))) {
        deleteRecord(STORE_KEYS[currentModule], editingRecord.id);
        editingRecord = null;
        currentView = 'list';
        renderApp();
        showToast(t('delete') + ' ✓');
      }
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
    renderApp();
  });

  container.querySelector('#form-save').addEventListener('click', () => {
    saveCurrentForm();
  });

  // Supplier Add New Logic
  if (currentModule === 'rawMaterials') {
    bindSupplierAddNew();
  }
}

function bindSupplierAddNew() {
  const supSelect = document.querySelector('#field-supplier');
  const customSupGroup = document.querySelector('#field-supplier_custom')?.parentElement;
  if (supSelect && customSupGroup) {
    const updateVisibility = () => {
      const isNew = supSelect.value === 'ADD_NEW';
      customSupGroup.style.display = isNew ? '' : 'none';
    };
    supSelect.addEventListener('change', updateVisibility);
    updateVisibility();
  }
}

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


    case 'select':
      return `
        <div class="form-group">
          <label class="form-label">${t(f.labelKey)}${reqMark}</label>
          <select class="form-select" id="field-${f.key}">
            <option value="">${t('selectOne')}</option>
            ${(f.options || []).map(o => {
        const optVal = o.value || o;
        const optLabel = o.labelKey ? t(o.labelKey) : (o.label || o);
        return `<option value="${optVal}" ${val === optVal ? 'selected' : ''}>${optLabel}</option>`;
      }).join('')}
          </select>
        </div>`;

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

  // Auto-calculate dates kg from tank size (fermentation)
  const tankSelect = document.querySelector('#field-tankSize');
  const datesKgInput = document.querySelector('#field-datesKg');
  if (tankSelect && datesKgInput) {
    tankSelect.addEventListener('change', () => {
      const size = parseFloat(tankSelect.value) || 0;
      datesKgInput.value = (size * 0.28).toFixed(0);
    });
  }
}

function saveCurrentForm() {
  const fields = getModuleFields(currentModule);
  const record = {};

  // Validate required fields
  const missing = [];
  fields.forEach(f => {
    if (!f.required) return;
    const el = document.querySelector(`#field-${f.key}`);
    const val = el ? (el.type === 'checkbox' ? null : el.value) : null;
    if (!val || val.trim() === '') missing.push(t(f.labelKey));
  });
  if (missing.length > 0) {
    showToast(`${t('required')}: ${missing.join(', ')}`);
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

  // Handle Custom Supplier
  if (currentModule === 'rawMaterials' && record.supplier === 'ADD_NEW') {
    const customName = document.querySelector('#field-supplier_custom')?.value.trim();
    if (customName) {
      addCustomSupplier(customName);
      record.supplier = customName;
    } else {
      showToast(`${t('required')}: ${t('supplierName')}`);
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

  const storeKey = STORE_KEYS[currentModule];

  if (editingRecord) {
    updateRecord(storeKey, editingRecord.id, record);
  } else {
    addRecord(storeKey, record);
  }

  showToast(t('saved'));
  editingRecord = null;
  currentView = 'list';
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
function renderInventory(container) {
  // Inventory calculations...
  const bottlingRecords = getData(STORE_KEYS.bottling);
  const bottleInv = {};
  DRINK_TYPES.forEach(dt => { bottleInv[dt] = 0; });
  bottlingRecords.forEach(r => {
    if (r.drinkType && r.decision === 'approved') {
      const count = parseInt(r.bottleCount) || 0;
      bottleInv[r.drinkType] = (bottleInv[r.drinkType] || 0) + count;
    }
  });

  const rawRecords = getData(STORE_KEYS.rawMaterials);
  const rawInv = {};
  rawRecords.forEach(r => {
    const key = r.item || r.category || 'Unknown';
    const qty = parseFloat(r.weight) || 0;
    rawInv[key] = (rawInv[key] || 0) + qty;
  });

  const dateRecords = getData(STORE_KEYS.dateReceiving);
  const totalDates = dateRecords.reduce((sum, r) => sum + (parseFloat(r.weight) || 0), 0);
  const fermRecords = getData(STORE_KEYS.fermentation);
  const activeFerm = fermRecords.filter(r => !r.sentToDistillation).length;

  const currentSnapshot = {
    items: {
      ...bottleInv,
      ...rawInv,
      totalDates,
      activeFerm
    }
  };

  const versions = getData(STORE_KEYS.inventoryVersions);
  const lastVersion = versions[0] || null;

  container.innerHTML = `
    <div class="tab-bar">
      <button class="tab-btn active" data-inv-tab="bottles">${t('mod_bottleInventory')}</button>
      <button class="tab-btn" data-inv-tab="raw">${t('mod_rawInventory')}</button>
      <button class="tab-btn" data-inv-tab="versions">${t('inventoryHistory')}</button>
    </div>

    <div id="inv-bottles">
      <div class="inv-section">
        <div class="stats-row" style="grid-template-columns:1fr 1fr;margin-bottom:16px;">
          <div class="stat-card">
            <div class="stat-num">${totalDates.toFixed(0)}</div>
            <div class="stat-label">${t('inv_dates')} (kg)</div>
          </div>
          <div class="stat-card">
            <div class="stat-num">${activeFerm}</div>
            <div class="stat-label">${t('mod_fermentation')}</div>
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

    <div id="inv-versions" style="display:none;">
      <div class="inv-section">
        ${versions.length === 0 ? `<div class="empty-state"><i data-feather="clock"></i><p>${t('noData')}</p></div>` : `
          <div class="record-list">
            ${versions.map(v => `
              <div class="record-item inv-ver-item" data-ver="${v.version}">
                <div class="ri-top">
                  <span class="ri-title">${t('versionLabel')} ${v.version}</span>
                  <span class="ri-date">${formatDate(v.createdAt)}</span>
                </div>
                <div class="ri-details">
                   ${v.createdBy} &bull; ${Object.keys(v.gaps).length > 0 ? t('gapAnalysis') : t('saved')}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>

    <div class="inventory-actions" style="margin-top:24px; display:flex; gap:12px;">
      <button class="btn btn-secondary" id="export-inv-btn" style="flex:1;">
        <i data-feather="download"></i> ${t('exportCSV')}
      </button>
      <button class="btn btn-primary" id="release-ver-btn" style="flex:1;">
        <i data-feather="check-circle"></i> ${t('releaseVersion')}
      </button>
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
      container.querySelector('#inv-versions').style.display = tab === 'versions' ? '' : 'none';
    });
  });

  // Bind Version Release
  container.querySelector('#release-ver-btn').addEventListener('click', () => {
    if (confirm(`${t('releaseVersion')}?`)) {
      saveInventoryVersion(currentSnapshot);
      showToast(t('saved'));
      renderApp();
    }
  });

  // Bind Export (with gaps if applicable)
  container.querySelector('#export-inv-btn').addEventListener('click', () => {
    if (lastVersion) {
      // Export current state with gaps
      const exportData = Object.keys(currentSnapshot.items).map(key => ({
        Item: key,
        CurrentQty: currentSnapshot.items[key],
        PreviousQty: lastVersion.items[key] || 0,
        Gap: (currentSnapshot.items[key] || 0) - (lastVersion.items[key] || 0)
      }));
      exportToCSV(exportData, `inventory_audit_${todayStr()}.csv`);
    } else {
      const exportData = Object.entries(currentSnapshot.items).map(([key, val]) => ({ Item: key, Qty: val }));
      exportToCSV(exportData, `inventory_${todayStr()}.csv`);
    }
    showToast(t('exportCSV') + ' ✓');
  });

  // Version Detail View
  container.querySelectorAll('.inv-ver-item').forEach(item => {
    item.addEventListener('click', () => {
      const verId = item.dataset.ver;
      const ver = versions.find(v => String(v.version) === verId);
      if (ver) {
        // Simple alert for gaps or render a detail view
        let gapSummary = Object.entries(ver.gaps)
          .filter(([_, diff]) => diff !== 0)
          .map(([key, diff]) => `${key}: ${diff > 0 ? '+' : ''}${diff}`)
          .join('\n');
        alert(`${t('versionLabel')} ${ver.version} ${t('gapsLabel')}:\n${gapSummary || t('noGaps')}`);
      }
    });
  });
}

// ============================================================
// MODULE FIELD DEFINITIONS
// ============================================================
function getModuleFields(mod) {
  switch (mod) {
    case 'rawMaterials':
      const allSuppliers = [...SUPPLIERS_RAW, ...getCustomSuppliers()];
      return [
        {
          key: 'supplier', labelKey: 'rm_supplier', type: 'select', required: true,
          options: [...allSuppliers.map(s => ({ value: s, labelKey: s })), { value: 'ADD_NEW', labelKey: 'addNewSupplier' }]
        },
        { key: 'supplier_custom', labelKey: 'supplierName', type: 'text', hidden: true },
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
          key: 'tankSize', labelKey: 'fm_tankSize', type: 'select', required: true,
          options: TANK_SIZES.map(s => ({ value: String(s), label: s + ' L' }))
        },
        { key: 'datesKg', labelKey: 'fm_datesKg', type: 'number', required: true, step: '0.1' },
        { key: 'quantity', labelKey: 'fm_quantity', type: 'number', step: '0.1' },
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
          key: 'color', labelKey: 'bt_color', type: 'select',
          options: [
            { value: 'normal', labelKey: 'normal' },
            { value: 'abnormal', labelKey: 'abnormal' },
          ]
        },
        {
          key: 'taste', labelKey: 'bt_taste', type: 'select',
          options: [
            { value: 'normal', labelKey: 'normal' },
            { value: 'abnormal', labelKey: 'abnormal' },
          ]
        },
        { key: 'contaminants', labelKey: 'bt_contaminants', type: 'toggle' },
        { key: 'bottleCount', labelKey: 'bt_bottleCount', type: 'number', required: true, min: 0 },
        { key: 'decision', labelKey: 'bt_decision', type: 'decision', required: true },
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
    <div class="section-title">${t('dataExport')}</div>
    <div class="card" style="margin-bottom: 24px;">
       <button class="btn btn-primary" id="btn-export-all">
         <i data-feather="download"></i> ${t('exportAllData')}
       </button>
    </div>

    <div class="section-title">${t('userManagement')}</div>
    <div class="record-list">
      ${users.map(u => `
        <div class="record-item user-item" data-username="${u.username}">
          <div class="ri-top">
            <span class="ri-title">${u.username} <small style="color:var(--text-muted)">(${t('role_' + u.role)})</small></span>
            <span class="ri-badge ${u.status === 'inactive' ? 'not-approved' : 'approved'}">
              ${u.status === 'inactive' ? t('inactive') : t('active')}
            </span>
          </div>
          <div class="ri-details">
            ${u.name || '-'}${u.nameHe ? ' &bull; ' + u.nameHe : ''}${u.nameTh ? ' &bull; ' + u.nameTh : ''}
            <div style="font-size:10px; margin-top:4px;">
              ${t('lastActivity')}: ${u.lastActivity ? formatDate(u.lastActivity) + ' ' + new Date(u.lastActivity).toLocaleTimeString() : '-'}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
    
    <div style="margin-top:20px;">
       <button class="btn btn-secondary" id="btn-invite-user" style="width:100%;">
         <i data-feather="mail"></i> ${t('emailInvite')}
       </button>
    </div>
  `;

  // Bind invite
  container.querySelector('#btn-invite-user').addEventListener('click', () => {
    const email = prompt("Enter user email for invitation:");
    if (email) {
      alert(`Invitation link generated for ${email}:\nhttps://guymaich-jpg.github.io/factory-control/#invite=${btoa(email)}`);
      showToast("Invitation sent (simulated)");
    }
  });

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
  container.querySelector('#btn-export-all').addEventListener('click', () => {
    if (confirm(t('confirmExport'))) {
      exportAllData();
    }
  });

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
  if (deleteBtn) {
    if (isEdit) {
      deleteBtn.addEventListener('click', () => {
        if (confirm(t('perm_deleteConfirm'))) {
          if (u.username === 'admin') {
            alert("Cannot delete the main admin user");
            return;
          }
          if (u.username === getSession().username) {
            alert("Cannot delete yourself");
            return;
          }
          deleteUserByUsername(u.username);
          showToast(t('delete') + ' ✓');
          currentView = 'list';
          editingRecord = null;
          renderApp();
        }
      });
    }
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
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  renderApp();
});
