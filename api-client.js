// ============================================================
// api-client.js — Backend API Client
// ============================================================
// Calls the shared Vercel backend for privileged operations
// (user CRUD, invitations, role management).
//
// Set API_BASE to the deployed Vercel URL to enable.
// When API_BASE is empty, all operations fall back to local logic.
// ============================================================

// Backend URL — set after deploying to Vercel.
// Leave empty to disable backend calls (all operations use local fallback).
const API_BASE = '';

/**
 * Make an authenticated API call to the backend.
 *
 * Returns:
 *   - Object with data on success (e.g. { success: true, user: {...} })
 *   - Object with { error: string } on server error
 *   - null if backend is unavailable or disabled (caller should fall back to local logic)
 */
async function apiCall(method, path, body) {
  // Backend disabled — fall back to local
  if (!API_BASE) return null;

  const token = typeof fbGetIdToken === 'function' ? await fbGetIdToken() : null;
  if (!token) return null; // no token = can't authenticate with backend

  try {
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(API_BASE + path, options);

    if (!res.ok) {
      const err = await res.json().catch(function() { return {}; });
      return { error: err.error || 'API error (HTTP ' + res.status + ')' };
    }

    return await res.json();
  } catch (e) {
    console.warn('[API] Backend call failed, using local fallback:', e.message);
    return null; // null signals backend unavailable — caller should fall back
  }
}
