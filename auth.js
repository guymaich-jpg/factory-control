// ============================================================
// auth.js — Authentication & Role Management
// ============================================================

// --- Password hashing (AUTH-01, AUTH-02, AUTH-03) ---
function hashPassword(password) {
  // Simple hash for client-side storage — not a substitute for server-side bcrypt
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < password.length; i++) {
    hash ^= password.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  // Add salt-like mixing with password length
  hash = hash ^ (password.length * 0x5bd1e995);
  return 'hashed:' + (hash >>> 0).toString(36);
}

// --- Password complexity validation (AUTH-08) ---
function validatePassword(password) {
  if (!password || password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least 1 letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least 1 digit' };
  }
  return { valid: true };
}

// --- Email validation (AUTH-11) ---
function validateEmail(email) {
  if (!email) return { valid: false, error: 'Email is required' };
  // Basic email regex check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  return { valid: true };
}

// --- Rate limiting (AUTH-06) ---
const _loginAttempts = {};

// The two owner accounts — login is by email + password
// Passwords are pre-hashed to avoid exposing plaintext credentials in source
const DEFAULT_USERS = [
  {
    username: 'guymaich',
    password: 'hashed:1ap7bdv',
    role: 'admin',
    name: 'Guy Maich',
    nameHe: 'גיא מייך',
    email: 'guymaich@gmail.com',
    status: 'active',
  },
  {
    username: 'yonatangarini',
    password: 'hashed:1ekzbmw',
    role: 'admin',
    name: 'Yonatan Garini',
    nameHe: 'יונתן גריני',
    email: 'yonatangarini@gmail.com',
    status: 'active',
  },
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
    canApproveBottling: false,
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
  let users;
  try {
    users = JSON.parse(localStorage.getItem('factory_users') || 'null');
  } catch (e) {
    users = null;
  }
  if (!users || !Array.isArray(users)) {
    users = DEFAULT_USERS;
    localStorage.setItem('factory_users', JSON.stringify(users));
  } else {
    // Migration: ensure the two owner accounts always exist
    let changed = false;
    for (const required of DEFAULT_USERS) {
      if (!users.find(u => u.username === required.username)) {
        // Use the hashed password from DEFAULT_USERS (already hashed)
        users.push({ ...required });
        changed = true;
      }
    }
    if (changed) localStorage.setItem('factory_users', JSON.stringify(users));
  }
  return users;
}

// Authenticate by email (primary) or username, with password.
// Strategy: Firebase Auth is source of truth for passwords.
//   1. Try Firebase Auth first (signInWithEmailAndPassword)
//   2. If user doesn't exist in Firebase → auto-create (createUserWithEmailAndPassword)
//   3. If Firebase unavailable → fall back to local hash check
// Local user DB provides role/permissions for the session.
async function authenticate(emailOrUsername, password) {
  // --- Rate limiting check (AUTH-06) ---
  const key = emailOrUsername.toLowerCase();
  const now = Date.now();
  const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
  const MAX_ATTEMPTS = 5;

  if (_loginAttempts[key]) {
    _loginAttempts[key] = _loginAttempts[key].filter(t => (now - t) < RATE_LIMIT_WINDOW);
    if (_loginAttempts[key].length >= MAX_ATTEMPTS) {
      return { locked: true };
    }
  }

  const users = getUsers();

  // Find local user by email or username (for role/permissions lookup)
  const localUser = users.find(u => {
    if (u.status === 'inactive') return false;
    return (u.email && u.email.toLowerCase() === key) ||
      u.username.toLowerCase() === key;
  });

  // Resolve the email to use for Firebase Auth
  const emailForAuth = localUser ? localUser.email : (key.includes('@') ? key : null);

  // --- Strategy 1: Try Firebase Auth first ---
  if (emailForAuth && typeof fbAuthSignIn === 'function' && _firebaseReady && _auth) {
    try {
      const fbUser = await fbAuthSignIn(emailForAuth, password);
      if (fbUser && localUser) {
        // Firebase Auth succeeded — build session from local user DB
        delete _loginAttempts[key];
        const session = { ...localUser, loginTime: Date.now(), lastActivity: Date.now() };
        delete session.password;
        localStorage.setItem('factory_session', JSON.stringify(session));
        return session;
      }
      if (fbUser && !localUser) {
        // Firebase Auth succeeded but no local user record — shouldn't normally happen,
        // but record a failed attempt (no role/permissions available)
        if (!_loginAttempts[key]) _loginAttempts[key] = [];
        _loginAttempts[key].push(now);
        return null;
      }
      // fbUser is null — Firebase Auth rejected or account doesn't exist yet.
      // Fall through to local hash check as a safety net.
      console.warn('[Auth] Firebase Auth returned null, trying local fallback');
    } catch (e) {
      // Firebase Auth threw unexpectedly — fall through to local check
      console.warn('[Auth] Firebase Auth error, falling back to local:', e.message);
    }
  }

  // --- Strategy 2: Fallback to local hash check (Firebase unavailable) ---
  if (!localUser) {
    if (!_loginAttempts[key]) _loginAttempts[key] = [];
    _loginAttempts[key].push(now);
    return null;
  }

  const hashedInput = hashPassword(password);
  let passwordMatch = false;

  if (localUser.password && localUser.password.startsWith('hashed:')) {
    passwordMatch = localUser.password === hashedInput;
  } else if (localUser.password === password) {
    passwordMatch = true;
  }

  if (!passwordMatch) {
    if (!_loginAttempts[key]) _loginAttempts[key] = [];
    _loginAttempts[key].push(now);
    return null;
  }

  // Upgrade legacy plaintext password to hashed (AUTH-01)
  if (localUser.password && !localUser.password.startsWith('hashed:')) {
    const idx = users.findIndex(u => u.username === localUser.username);
    if (idx !== -1) {
      users[idx].password = hashedInput;
      localStorage.setItem('factory_users', JSON.stringify(users));
    }
  }

  delete _loginAttempts[key];
  const session = { ...localUser, loginTime: Date.now(), lastActivity: Date.now() };
  delete session.password;
  localStorage.setItem('factory_session', JSON.stringify(session));
  return session;
}

// ============================================================
// Access Request System
// ============================================================
const ACCESS_REQUESTS_KEY = 'factory_access_requests';

function getPendingRequests() {
  try {
    return JSON.parse(localStorage.getItem(ACCESS_REQUESTS_KEY) || '[]');
  } catch (e) { return []; }
}

function submitAccessRequest(name, email) {
  if (!name || !email) return { success: false, error: 'requestError_fillAll' };

  // Validate email (AUTH-11)
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    return { success: false, error: emailCheck.error };
  }

  const requests = getPendingRequests();
  if (requests.find(r => r.email.toLowerCase() === email.toLowerCase())) {
    return { success: false, error: 'requestError_alreadyPending' };
  }

  const users = getUsers();
  if (users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase())) {
    return { success: false, error: 'requestError_emailExists' };
  }

  const request = {
    id: Date.now().toString(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    requestedAt: new Date().toISOString(),
  };

  requests.push(request);
  localStorage.setItem(ACCESS_REQUESTS_KEY, JSON.stringify(requests));
  return { success: true, request };
}

async function approveRequest(requestId, password, role) {
  const requests = getPendingRequests();
  const req = requests.find(r => r.id === requestId);
  if (!req) return { success: false, error: 'Request not found' };

  // Require password — no weak default (AUTH-07)
  if (!password) return { success: false, error: 'Password is required' };

  // Validate password complexity (AUTH-08)
  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) return { success: false, error: pwCheck.error };

  const baseUsername = req.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
  const result = await createUser({
    username: baseUsername,
    password: password,
    role: role || 'worker',
    name: req.name,
    email: req.email,
    status: 'active',
  });

  if (!result.success) return result;

  const updated = requests.filter(r => r.id !== requestId);
  localStorage.setItem(ACCESS_REQUESTS_KEY, JSON.stringify(updated));
  return { success: true };
}

function denyRequest(requestId) {
  const requests = getPendingRequests();
  const updated = requests.filter(r => r.id !== requestId);
  localStorage.setItem(ACCESS_REQUESTS_KEY, JSON.stringify(updated));
  return { success: true };
}

// Session expires after 12 hours of inactivity
const SESSION_TIMEOUT_MS = 12 * 60 * 60 * 1000;

function getSession() {
  let session;
  try {
    session = JSON.parse(localStorage.getItem('factory_session') || 'null');
  } catch (e) {
    localStorage.removeItem('factory_session');
    return null;
  }
  if (!session) return null;

  // Check session timeout against lastActivity (preferred) or loginTime (AUTH-09)
  const now = Date.now();
  const lastActive = session.lastActivity || session.loginTime;
  if (lastActive && (now - lastActive) > SESSION_TIMEOUT_MS) {
    localStorage.removeItem('factory_session');
    return null;
  }

  if (!session.username || !session.role) {
    localStorage.removeItem('factory_session');
    return null;
  }

  return session;
}

// Refresh session activity timestamp (AUTH-09)
function refreshSession() {
  let session;
  try {
    session = JSON.parse(localStorage.getItem('factory_session') || 'null');
  } catch (e) {
    return;
  }
  if (session) {
    session.lastActivity = Date.now();
    localStorage.setItem('factory_session', JSON.stringify(session));
  }
}

function logout() {
  localStorage.removeItem('factory_session');
  // Sign out of Firebase Auth
  if (typeof fbAuthSignOut === 'function') {
    fbAuthSignOut().catch(() => {});
  }
  if (typeof renderApp === 'function') {
    currentScreen = 'dashboard';
    currentModule = null;
    renderApp();
  }
}

function secureRecordAction(action) {
  const session = getSession();
  if (!session) {
    alert(typeof t === 'function' ? t('sessionExpired') : 'Session expired. Please log in.');
    logout();
    return false;
  }
  // Refresh session on activity (AUTH-09)
  refreshSession();
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

function updateUser(username, updates) {
  const users = getUsers();
  const idx = users.findIndex(u => u.username === username);
  if (idx !== -1) {
    const rawPassword = updates.password; // keep plaintext for Firebase sync

    // Hash password if it's being updated (AUTH-03)
    if (updates.password && !updates.password.startsWith('hashed:')) {
      updates.password = hashPassword(updates.password);
    }
    users[idx] = { ...users[idx], ...updates, updatedAt: new Date().toISOString() };
    localStorage.setItem('factory_users', JSON.stringify(users));

    // Sync password change to Firebase Auth (fire-and-forget)
    // Note: fbAuthUpdatePassword needs the old password, which we don't have here.
    // Instead, if the admin is changing a user's password, we create/update the
    // Firebase Auth account. The user's next login will use the new password via
    // Firebase Auth's signIn, which will fail, then auto-create with new password.
    // For a clean sync, we just attempt to create the account with the new password.
    if (rawPassword && users[idx].email && typeof fbAuthCreateUser === 'function') {
      fbAuthCreateUser(users[idx].email, rawPassword).catch(() => {});
    }

    // Sync user profile to Firestore
    if (typeof fbSaveUser === 'function') {
      fbSaveUser(users[idx]).catch(() => {});
    }

    return { success: true };
  }
  return { success: false, error: 'User not found' };
}

function deleteUserByUsername(username) {
  // Block deletion of owner accounts (AUTH-10, AUTH-11)
  const ownerUsernames = DEFAULT_USERS.map(u => u.username);
  if (ownerUsernames.includes(username)) {
    return { success: false, error: 'Cannot delete owner accounts' };
  }

  const users = getUsers();
  const filtered = users.filter(u => u.username !== username);
  if (filtered.length < users.length) {
    localStorage.setItem('factory_users', JSON.stringify(filtered));
    return { success: true };
  }
  return { success: false, error: 'User not found' };
}

async function createUser(userData) {
  const users = getUsers();
  if (users.find(u => u.username.toLowerCase() === userData.username.toLowerCase())) {
    return { success: false, error: 'signUpError_userExists' };
  }

  // Validate email if provided (AUTH-11)
  if (userData.email) {
    const emailCheck = validateEmail(userData.email);
    if (!emailCheck.valid) {
      return { success: false, error: emailCheck.error };
    }
  }

  // Validate password complexity (AUTH-08)
  const pwCheck = validatePassword(userData.password);
  if (!pwCheck.valid) {
    return { success: false, error: pwCheck.error };
  }

  // Auto-create Firebase Auth account for the new user
  if (userData.email && typeof fbAuthCreateUser === 'function') {
    const fbResult = await fbAuthCreateUser(userData.email, userData.password);
    // fbResult is user object, 'exists', or null — proceed regardless
    if (fbResult && fbResult !== 'exists') {
      console.log('[Auth] Firebase Auth account created for', userData.email);
    }
  }

  // Hash password before storing locally (AUTH-01)
  const hashedPw = (userData.password && !userData.password.startsWith('hashed:'))
    ? hashPassword(userData.password)
    : userData.password;

  const newUser = {
    ...userData,
    password: hashedPw,
    createdAt: new Date().toISOString(),
    status: userData.status || 'active',
  };

  users.push(newUser);
  localStorage.setItem('factory_users', JSON.stringify(users));

  // Sync user profile to Firestore (without password)
  if (typeof fbSaveUser === 'function') {
    fbSaveUser(newUser).catch(() => {});
  }

  return { success: true };
}

// ============================================================
// Invitation System
// ============================================================
const INVITATIONS_KEY = 'factory_invitations';

function getInvitations() {
  try {
    return JSON.parse(localStorage.getItem(INVITATIONS_KEY) || '[]');
  } catch (e) { return []; }
}

function saveInvitations(list) {
  localStorage.setItem(INVITATIONS_KEY, JSON.stringify(list));
}

function addInvitation(invite) {
  const invites = getInvitations();
  invites.push(invite);
  saveInvitations(invites);
}

function updateInvitationStatus(token, status, username) {
  const invites = getInvitations();
  const idx = invites.findIndex(i => i.token === token);
  if (idx !== -1) {
    invites[idx].status = status;
    if (username) invites[idx].username = username;
    saveInvitations(invites);
  }
}

function generateInviteToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
    + Math.random().toString(36).slice(2, 9);
}
