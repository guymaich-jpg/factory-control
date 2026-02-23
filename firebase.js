// ============================================================
// firebase.js — Firebase / Firestore Database Layer
// ============================================================
// SETUP: Replace the config below with your Firebase project config.
// Get it from: Firebase Console → Project Settings → Your Apps → SDK setup
//
// IMPORTANT: Before enabling Firebase, you MUST configure Firestore Security Rules
// to require authentication and enforce role-based access. Default test-mode rules
// allow anyone with the API key to read/write all data. See:
// https://firebase.google.com/docs/firestore/security/get-started
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
    // Strip password before writing to Firestore (BUG-044: FB-03)
    const safeUser = { ...user };
    delete safeUser.password;
    // Upsert by username
    const snap = await _db.collection('factory_users')
      .where('username', '==', user.username).limit(1).get();
    if (snap.empty) {
      await _db.collection('factory_users').add(safeUser);
    } else {
      await snap.docs[0].ref.update(safeUser);
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

// Google SSO removed — login is handled via email + password only.

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
