// ============================================================
// auth.js — Authentication & Role Management
// ============================================================

// Default users (in production, this would be a backend)
const DEFAULT_USERS = [
  { username: 'admin', password: 'admin123', role: 'admin', name: 'System Administrator', nameHe: 'מנהל מערכת', email: 'admin@arava.com', status: 'active' },
  { username: 'manager', password: 'manager123', role: 'manager', name: 'Factory Manager', nameHe: 'מנהל מפעל', email: 'manager@arava.com', status: 'active' },
  { username: 'worker1', password: 'worker123', role: 'worker', name: 'Worker 1', nameHe: 'עובד 1', email: 'worker1@arava.com', status: 'active' },
  { username: 'worker2', password: 'worker123', role: 'worker', name: 'Worker 2', nameHe: 'עובד 2', email: 'worker2@arava.com', status: 'active' },
  { username: 'qa', password: 'qa123', role: 'worker', name: 'QA Inspector', nameHe: 'בודק איכות', email: 'qa@arava.com', status: 'active' },
];

// Permissions map
const PERMISSIONS = {
  admin: {
    canViewDashboard: true,
    canAddRecords: true,
    canEditRecords: true,
    canDeleteRecords: true,
    canViewHistory: true,
    canExportData: true,
    canManageUsers: true,
    canViewInventory: true,
    canApproveBottling: true,
    canViewAllModules: true,
    canAccessBackoffice: true,
  },
  manager: {
    canViewDashboard: true,
    canAddRecords: true,
    canEditRecords: true,
    canDeleteRecords: true,
    canViewHistory: true,
    canExportData: true,
    canManageUsers: true,
    canViewInventory: true,
    canApproveBottling: true,
    canViewAllModules: true,
    canAccessBackoffice: true,
  },
  worker: {
    canViewDashboard: true,
    canAddRecords: true,
    canEditRecords: false,
    canDeleteRecords: false,
    canViewHistory: true,
    canExportData: false,
    canManageUsers: false,
    canViewInventory: true,
    canApproveBottling: false,
    canViewAllModules: true,
    canAccessBackoffice: false,
  }
};

function getUsers() {
  let users = JSON.parse(localStorage.getItem('factory_users') || 'null');
  if (!users) {
    users = DEFAULT_USERS;
    localStorage.setItem('factory_users', JSON.stringify(users));
  } else {
    // Ensure admin user exists (migration)
    if (!users.find(u => u.username === 'admin')) {
      const adminUser = DEFAULT_USERS.find(u => u.username === 'admin');
      if (adminUser) {
        users.push(adminUser);
        localStorage.setItem('factory_users', JSON.stringify(users));
      }
    }
  }
  return users;
}

function authenticate(username, password) {
  const users = getUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    const session = { ...user, loginTime: Date.now() };
    delete session.password;
    localStorage.setItem('factory_session', JSON.stringify(session));
    return session;
  }
  return null;
}

/**
 * Register a new user.
 * Returns { success: true } or { success: false, error: 'translationKey' }
 */
function registerUser(username, password, confirmPassword, fullName, role) {
  // Validation
  if (!username || !password || !confirmPassword || !fullName || !role) {
    return { success: false, error: 'signUpError_fillAll' };
  }
  if (password.length < 4) {
    return { success: false, error: 'signUpError_passwordShort' };
  }
  if (password !== confirmPassword) {
    return { success: false, error: 'signUpError_passwordMismatch' };
  }

  const users = getUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { success: false, error: 'signUpError_userExists' };
  }

  const newUser = {
    username: username,
    password: password,
    role: role,
    name: fullName,
    nameTh: fullName, // user can update later
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  localStorage.setItem('factory_users', JSON.stringify(users));
  return { success: true };
}

function getSession() {
  return JSON.parse(localStorage.getItem('factory_session') || 'null');
}

function logout() {
  localStorage.removeItem('factory_session');
  // Clear any temporary state
  if (typeof renderApp === 'function') {
    currentScreen = 'dashboard';
    currentModule = null;
    renderApp();
  }
}

// Security Wrapper for data actions
function secureRecordAction(action) {
  const session = getSession();
  if (!session) {
    alert(typeof t === 'function' ? t('sessionExpired') : 'Session expired. Please log in.');
    logout();
    return false;
  }
  return action();
}
function hasPermission(perm) {
  const session = getSession();
  if (!session) return false;
  return PERMISSIONS[session.role] && PERMISSIONS[session.role][perm];
}

function getUserDisplayName() {
  const session = getSession();
  if (!session) return '';
  if (currentLang === 'he') return session.nameHe || session.name;
  if (currentLang === 'th') return session.nameTh || session.name;
  return session.name;
}

function getUserRole() {
  const session = getSession();
  if (!session) return '';
  return session.role;
}

// User management functions for backoffice
function updateUser(username, updates) {
  const users = getUsers();
  const idx = users.findIndex(u => u.username === username);
  if (idx !== -1) {
    users[idx] = { ...users[idx], ...updates, updatedAt: new Date().toISOString() };
    localStorage.setItem('factory_users', JSON.stringify(users));
    return { success: true };
  }
  return { success: false, error: 'User not found' };
}

function deleteUserByUsername(username) {
  const users = getUsers();
  const filtered = users.filter(u => u.username !== username);
  if (filtered.length < users.length) {
    localStorage.setItem('factory_users', JSON.stringify(filtered));
    return { success: true };
  }
  return { success: false, error: 'User not found' };
}

function createUser(userData) {
  const users = getUsers();
  if (users.find(u => u.username.toLowerCase() === userData.username.toLowerCase())) {
    return { success: false, error: 'signUpError_userExists' };
  }

  const newUser = {
    ...userData,
    createdAt: new Date().toISOString(),
    status: userData.status || 'active',
  };

  users.push(newUser);
  localStorage.setItem('factory_users', JSON.stringify(users));
  return { success: true };
}

