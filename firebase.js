// ============================================================
// firebase.js — Firebase / Firestore Database Layer
// ============================================================
// SETUP: Replace the config below with your Firebase project config.
// Get it from: Firebase Console → Project Settings → Your Apps → SDK setup
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ---- Feature flag: set to true after filling in config above ----
const FIREBASE_ENABLED = false;

// ============================================================
// Internal state
// ============================================================
let _db = null;
let _firebaseReady = false;

// ---- Real-time listeners registry ----
const _listeners = {};

function isFirebaseReady() {
  return _firebaseReady && _db !== null;
}

// ============================================================
// Initialization — loads Firebase SDK on-demand (no extra KB when disabled)
// ============================================================
function initFirebase() {
  if (!FIREBASE_ENABLED) return; // SDK never loaded, zero cost

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const BASE = 'https://www.gstatic.com/firebasejs/9.23.0';
  Promise.all([
    loadScript(BASE + '/firebase-app-compat.js'),
    loadScript(BASE + '/firebase-firestore-compat.js'),
  ]).then(() => {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      _db = firebase.firestore();
      _firebaseReady = true;
      console.log('[Firebase] Firestore connected');
    } catch (e) {
      console.warn('[Firebase] Init failed, using localStorage fallback:', e.message);
    }
  }).catch(e => {
    console.warn('[Firebase] SDK load failed, using localStorage fallback:', e.message);
  });
}

// ============================================================
// Generic CRUD — mirrors the localStorage data.js API
// ============================================================

/**
 * Get all documents from a Firestore collection (returns Promise).
 */
async function fbGetAll(collectionName) {
  if (!isFirebaseReady()) return null;
  try {
    const snap = await _db.collection(collectionName)
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map(d => ({ ...d.data(), _fbId: d.id }));
  } catch (e) {
    console.warn('[Firebase] fbGetAll error:', e.message);
    return null;
  }
}

/**
 * Add a document to a Firestore collection.
 */
async function fbAdd(collectionName, record) {
  if (!isFirebaseReady()) return null;
  try {
    const docRef = await _db.collection(collectionName).add(record);
    return { ...record, _fbId: docRef.id };
  } catch (e) {
    console.warn('[Firebase] fbAdd error:', e.message);
    return null;
  }
}

/**
 * Update a document in Firestore by local `id` field.
 */
async function fbUpdate(collectionName, localId, updates) {
  if (!isFirebaseReady()) return null;
  try {
    // find by localId field
    const snap = await _db.collection(collectionName)
      .where('id', '==', localId).limit(1).get();
    if (snap.empty) return null;
    await snap.docs[0].ref.update({ ...updates, updatedAt: new Date().toISOString() });
    return true;
  } catch (e) {
    console.warn('[Firebase] fbUpdate error:', e.message);
    return null;
  }
}

/**
 * Delete a document from Firestore by local `id` field.
 */
async function fbDelete(collectionName, localId) {
  if (!isFirebaseReady()) return null;
  try {
    const snap = await _db.collection(collectionName)
      .where('id', '==', localId).limit(1).get();
    if (snap.empty) return null;
    await snap.docs[0].ref.delete();
    return true;
  } catch (e) {
    console.warn('[Firebase] fbDelete error:', e.message);
    return null;
  }
}

/**
 * Subscribe to real-time updates for a collection.
 * callback(records) is called every time data changes.
 * Returns an unsubscribe function.
 */
function fbSubscribe(collectionName, callback) {
  if (!isFirebaseReady()) return () => {};
  try {
    const unsub = _db.collection(collectionName)
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        const records = snap.docs.map(d => ({ ...d.data(), _fbId: d.id }));
        callback(records);
      }, err => {
        console.warn('[Firebase] onSnapshot error:', err.message);
      });
    return unsub;
  } catch (e) {
    console.warn('[Firebase] fbSubscribe error:', e.message);
    return () => {};
  }
}

// ============================================================
// Custom Options (shared dropdown choices)
// ============================================================
async function fbGetCustomOptions(fieldKey) {
  if (!isFirebaseReady()) {
    return JSON.parse(localStorage.getItem('factory_customOptions_' + fieldKey) || '[]');
  }
  try {
    const snap = await _db.collection('factory_customOptions')
      .where('fieldKey', '==', fieldKey).get();
    return snap.docs.map(d => d.data().value);
  } catch (e) {
    return JSON.parse(localStorage.getItem('factory_customOptions_' + fieldKey) || '[]');
  }
}

async function fbAddCustomOption(fieldKey, value) {
  // Always save to localStorage as backup
  const local = JSON.parse(localStorage.getItem('factory_customOptions_' + fieldKey) || '[]');
  if (!local.includes(value)) {
    local.push(value);
    localStorage.setItem('factory_customOptions_' + fieldKey, JSON.stringify(local));
  }

  if (!isFirebaseReady()) return;
  try {
    // Check for duplicate
    const snap = await _db.collection('factory_customOptions')
      .where('fieldKey', '==', fieldKey)
      .where('value', '==', value)
      .get();
    if (snap.empty) {
      await _db.collection('factory_customOptions').add({
        fieldKey,
        value,
        createdAt: new Date().toISOString()
      });
    }
  } catch (e) {
    console.warn('[Firebase] fbAddCustomOption error:', e.message);
  }
}

// ============================================================
// Users
// ============================================================
async function fbGetUsers() {
  if (!isFirebaseReady()) return null;
  try {
    const snap = await _db.collection('factory_users').get();
    return snap.docs.map(d => ({ ...d.data(), _fbId: d.id }));
  } catch (e) {
    return null;
  }
}

async function fbSaveUser(user) {
  if (!isFirebaseReady()) return null;
  try {
    // Upsert by username
    const snap = await _db.collection('factory_users')
      .where('username', '==', user.username).limit(1).get();
    if (snap.empty) {
      await _db.collection('factory_users').add(user);
    } else {
      await snap.docs[0].ref.update(user);
    }
    return true;
  } catch (e) {
    console.warn('[Firebase] fbSaveUser error:', e.message);
    return null;
  }
}

async function fbDeleteUser(username) {
  if (!isFirebaseReady()) return null;
  try {
    const snap = await _db.collection('factory_users')
      .where('username', '==', username).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.delete();
      return true;
    }
    return null;
  } catch (e) {
    console.warn('[Firebase] fbDeleteUser error:', e.message);
    return null;
  }
}

// ============================================================
// Google SSO — Identity Services (GIS)
// ============================================================
// SETUP:
//   1. Go to console.cloud.google.com → APIs & Services → Credentials
//   2. Create an OAuth 2.0 Client ID (Web application)
//   3. Add your app's URL to "Authorized JavaScript origins"
//   4. Paste the Client ID below and set GOOGLE_SSO_ENABLED = true
// ============================================================

const GOOGLE_CLIENT_ID = '564527226666-j3pc4v60q4evuha2peg19jq07sbk3cn0.apps.googleusercontent.com';
const GOOGLE_SSO_ENABLED = true;

let _gsiReady = false;
let _gsiCallback = null;

/**
 * Load the Google Identity Services library and initialise it.
 * callback(googleUser) is called with { email, name, picture } on success.
 */
function initGoogleSSO(callback) {
  if (!GOOGLE_SSO_ENABLED || !GOOGLE_CLIENT_ID ||
      GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') return;

  _gsiCallback = callback;

  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.onload = () => {
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: _handleGsiCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      _gsiReady = true;
    } catch (e) {
      console.warn('[Google SSO] Init error:', e.message);
    }
  };
  script.onerror = () => console.warn('[Google SSO] Failed to load GIS library');
  document.head.appendChild(script);
}

/** Decode the signed JWT and pass user info to the app callback. */
function _handleGsiCredential(response) {
  try {
    const parts = response.credential.split('.');
    // base64url → base64 → JSON
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (_gsiCallback) {
      _gsiCallback({ email: payload.email, name: payload.name, picture: payload.picture });
    }
  } catch (e) {
    console.warn('[Google SSO] Credential decode error:', e);
  }
}

/**
 * Trigger the Google One Tap / Sign-In prompt.
 * Returns false if SSO is not ready (not configured or library not loaded yet).
 */
function triggerGoogleSignIn() {
  if (!_gsiReady || typeof google === 'undefined') return false;
  google.accounts.id.prompt();
  return true;
}

/** Returns true if Google SSO is configured and the library has loaded. */
function isGoogleSSOReady() {
  return _gsiReady;
}

// ============================================================
// Sync: push all localStorage data to Firestore (one-time migration)
// ============================================================
async function migrateLocalStorageToFirebase() {
  if (!isFirebaseReady()) return;
  const keys = [
    'factory_rawMaterials', 'factory_dateReceiving', 'factory_fermentation',
    'factory_distillation1', 'factory_distillation2', 'factory_bottling',
    'factory_inventoryVersions'
  ];
  for (const key of keys) {
    const local = JSON.parse(localStorage.getItem(key) || '[]');
    for (const record of local) {
      try {
        const existing = await _db.collection(key)
          .where('id', '==', record.id).get();
        if (existing.empty) {
          await _db.collection(key).add(record);
        }
      } catch (e) {
        // skip
      }
    }
  }
  console.log('[Firebase] Migration complete');
}
