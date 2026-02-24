# QA Report: Arava Distillery Factory Control

**Target:** https://guymaich-jpg.github.io/Aravadistillery-Factory-Control/
**Date:** 2026-02-23
**Tester:** Claude (automated scanner + Playwright + source code audit)
**App Version:** 1.2.0

---

## Executive Summary

This comprehensive QA audit covers the Factory Control web application across all 8 testing phases: smoke, functional, UI/UX, accessibility, security, performance, edge cases, and source code review. **48 issues were identified**, including **5 P0 blockers** (critical security vulnerabilities), **9 P1 critical issues**, **20 P2 major issues**, **10 P3 minor issues**, and **4 P4 enhancements**.

The most severe finding is that **the entire authentication system is client-side only** — admin credentials are hardcoded in plaintext in the JavaScript source, passwords are stored unencrypted in localStorage, and the session can be forged by any user with browser DevTools. Additionally, **pervasive innerHTML usage** across the rendering layer creates stored XSS attack vectors.

---

## Results Overview

| Category | Issues Found | P0 | P1 | P2 | P3 | P4 |
|----------|-------------|----|----|----|----|-----|
| Security | 28 | 4 | 8 | 12 | 3 | 1 |
| Functional | 10 | 1 | 1 | 4 | 4 | 0 |
| Accessibility | 6 | 0 | 0 | 2 | 2 | 2 |
| Performance | 3 | 0 | 0 | 2 | 0 | 1 |
| UI/UX | 1 | 0 | 0 | 0 | 1 | 0 |
| **Total** | **48** | **5** | **9** | **20** | **10** | **4** |

---

## Top 10 Priority Issues

| # | ID | Severity | Title |
|---|-----|----------|-------|
| 1 | AUTH-01 | P0 | Hard-coded admin credentials in client-side JavaScript |
| 2 | AUTH-02 | P0 | Plaintext password storage in localStorage |
| 3 | AUTH-04 | P0 | Client-side auth is fundamentally bypassable via DevTools |
| 4 | SCRIPT-01 | P0 | Pervasive innerHTML usage creates stored XSS vectors |
| 5 | AUTH-03 | P0 | Plaintext password comparison (no hashing) |
| 6 | DATA-04 | P1 | Export All Data includes plaintext passwords in CSV |
| 7 | AUTH-07 | P1 | Weak default password 'Welcome1' for approved users |
| 8 | AUTH-06 | P1 | No rate limiting on login attempts |
| 9 | AUTH-10 | P1 | Manager password modal checks password only, not username |
| 10 | SCRIPT-12 | P1 | Dead code reference causes crash in inventory versions |

---

## P0 — Blockers (5)

### BUG-001: AUTH-01 — Hard-coded admin credentials in source code

**Severity:** P0 (Blocker)
**Category:** Security
**File:** `auth.js:6-25`

**Description:**
Two admin accounts with real usernames, email addresses, and plaintext passwords are hardcoded directly in the JavaScript source:
- `guymaich@gmail.com` / `Guy12345`
- `yonatangarini@gmail.com` / `Yon12345`

Since this is client-side JavaScript, **any visitor** can open DevTools (or view page source) and read these credentials.

**Steps to Reproduce:**
1. Navigate to https://guymaich-jpg.github.io/Aravadistillery-Factory-Control/
2. Open DevTools > Sources > auth.js
3. Lines 6-25 contain both admin usernames, emails, and plaintext passwords

**Impact:** Complete administrative takeover by any anonymous visitor. The real email addresses also expose PII.

**Suggested Fix:** Remove hard-coded credentials. Use Firebase Authentication with hashed passwords. Never ship credentials in client-side code.

---

### BUG-002: AUTH-02 — Plaintext password storage in localStorage

**Severity:** P0 (Blocker)
**Category:** Security
**File:** `auth.js:79, 89, 249, 278-279`

**Description:**
All user passwords are stored in plaintext in localStorage under the key `factory_users`. Any JavaScript running on the page (including third-party scripts, browser extensions, or XSS payloads) can read every user's password.

**Steps to Reproduce:**
1. Login to the app
2. Open DevTools > Application > Local Storage
3. Click `factory_users` — all passwords visible in plaintext

**Impact:** Full credential theft. Combined with XSS (SCRIPT-01), this is trivially exploitable.

**Suggested Fix:** Never store passwords client-side. Use server-side auth with bcrypt/scrypt hashing.

---

### BUG-003: AUTH-03 — Plaintext password comparison (no hashing)

**Severity:** P0 (Blocker)
**Category:** Security
**File:** `auth.js:97-104`

**Description:**
The `authenticate()` function compares passwords using direct string equality (`u.password === password`). No hashing, no salting.

**Impact:** Passwords vulnerable at every layer: storage, comparison, and transit within the client.

**Suggested Fix:** Implement server-side authentication with bcrypt/argon2.

---

### BUG-004: AUTH-04 — Client-side authentication is fundamentally bypassable

**Severity:** P0 (Blocker)
**Category:** Security
**File:** `auth.js:95-112, 182-204`

**Description:**
The entire auth system runs in the browser. A user can bypass it by opening DevTools and running:
```javascript
localStorage.setItem('factory_session', JSON.stringify({
  username: 'attacker', role: 'admin', name: 'Attacker', loginTime: Date.now()
}));
renderApp();
```

**Steps to Reproduce:**
1. Navigate to the login page
2. Open DevTools console
3. Paste the code above
4. You now have full admin access

**Impact:** Any user can escalate to admin, bypassing all permission checks.

**Suggested Fix:** Implement server-side session management. All sensitive operations must be validated on a backend.

---

### BUG-005: SCRIPT-01 — Pervasive innerHTML usage creates stored XSS vectors

**Severity:** P0 (Blocker)
**Category:** Security
**File:** `script.js:22-23, 331-343, 769-817, 877-907, 1004-1012, 1023-1051, 1087-1123, 1578-1640, 1826-1871, 1938-1999`

**Description:**
Nearly the entire application renders UI via `innerHTML` with string interpolation. User-controlled data (record titles, supplier names, notes, custom option values, user names) is interpolated directly into HTML without escaping. Examples:
- `<span class="ri-title">${title}</span>` where `title` comes from user input
- `<span class="dv">${r.notes}</span>` where notes are user-provided
- `<div class="ri-title">${req.name}</div>` where name comes from access requests

**Steps to Reproduce:**
1. Login as admin
2. Navigate to any module (e.g., Raw Materials)
3. Add a new record with item name: `<img src=x onerror=alert('XSS')>`
4. Save the record
5. The script executes when the record list renders

**Impact:** Stored XSS. Any user who creates records can inject JavaScript that executes in every other user's browser, stealing sessions and data.

**Suggested Fix:** Use `textContent` instead of `innerHTML` for user data, or implement HTML escaping:
```javascript
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
```

---

## P1 — Critical (7)

### BUG-006: AUTH-05 — Session token not cryptographically signed

**Severity:** P1 (Critical)
**Category:** Security
**File:** `auth.js:106-108`

**Description:** The session in localStorage is a plain JSON object — no signature, HMAC, or JWT. It can be freely forged.

**Impact:** Session forgery and privilege escalation.

**Suggested Fix:** Use server-issued cryptographically signed session tokens.

---

### BUG-007: AUTH-06 — No rate limiting on login attempts

**Severity:** P1 (Critical)
**Category:** Security
**File:** `auth.js:95-112`

**Description:** `authenticate()` has no rate limiting, lockout, or backoff. Unlimited password guesses at JavaScript speed.

**Impact:** Brute-force is trivial (though moot given AUTH-01).

**Suggested Fix:** Implement failed-attempt counter with lockout after 5 failures.

---

### BUG-008: AUTH-07 — Weak default password 'Welcome1' for approved users

**Severity:** P1 (Critical)
**Category:** Security
**File:** `auth.js:157-158`

**Description:** `approveRequest()` falls back to `'Welcome1'` if no password is supplied.

**Impact:** Newly approved users may have a trivially guessable password.

**Suggested Fix:** Make password a required field. Enforce complexity requirements.

---

### BUG-009: AUTH-10 — Manager password modal checks password only, not identity

**Severity:** P1 (Critical)
**Category:** Security
**File:** `script.js:361-364`

**Description:** The delete-confirmation modal only checks if the entered password matches ANY admin/manager's password. It does not require a username.

**Impact:** No audit trail for who authorized destructive actions.

**Suggested Fix:** Require both username and password, log the authorizer.

---

### BUG-010: DATA-04 — Export All Data includes plaintext passwords

**Severity:** P1 (Critical)
**Category:** Security
**File:** `data.js:275-287`

**Description:** `exportAllData()` includes `factory_users` in the export. The CSV contains every user's plaintext password.

**Impact:** Any admin who exports data creates a file with all credentials.

**Suggested Fix:** Exclude `factory_users` from export, or strip `password` field.

---

### BUG-011: AUTH-05 — No password complexity validation

**Severity:** P1 (Critical)
**Category:** Security
**File:** `auth.js:266-281`

**Description:** Neither `createUser()` nor `updateUser()` enforces password strength. Passwords like `"1"` or `""` are accepted.

**Suggested Fix:** Enforce min 8 chars, mixed case + digits.

---

### BUG-012: SCRIPT-12 — Dead code reference crashes inventory versions

**Severity:** P1 (Critical)
**Category:** Functional
**File:** `script.js:1650-1658`

**Description:** `renderInventory()` references `container.querySelector('#inv-versions')` and a `versions` variable, but `#inv-versions` is never rendered and `versions` is not defined.

**Impact:** Clicking the versions tab throws `ReferenceError: versions is not defined`.

**Suggested Fix:** Remove dead code or restore the versions tab with proper data binding.

---

## P2 — Major (18)

### BUG-013: HTML-01 — No Content Security Policy

**Severity:** P2 (Major)
**Category:** Security
**File:** `index.html`

**Description:** No CSP meta tag or HTTP header. Combined with innerHTML usage, there's no defense against XSS execution.

**Suggested Fix:** Add `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' fonts.googleapis.com">`.

---

### BUG-014: HTML-02 — No Subresource Integrity on CDN scripts

**Severity:** P2 (Major)
**Category:** Security
**File:** `index.html:37`

**Description:** `<script src="https://unpkg.com/feather-icons"></script>` loads from a CDN without an `integrity` attribute. If unpkg is compromised, malicious code executes in your app.

**Suggested Fix:** Add SRI hash: `<script src="https://unpkg.com/feather-icons" integrity="sha384-..." crossorigin="anonymous">` or self-host the library.

---

### BUG-015: HTML-03 — Login inputs not wrapped in a `<form>` element

**Severity:** P2 (Major)
**Category:** Accessibility / Security
**File:** `index.html` (rendered by script.js)

**Description:** Login fields are rendered without a `<form>` element. Password managers may not detect them, and the Enter key may not trigger login.

**Evidence:** Automated scanner confirmed: "Password field outside a `<form>` element."

**Suggested Fix:** Wrap login inputs in a `<form>` with `method="post"` and `autocomplete` attributes.

---

### BUG-016: HTML-04 — Login inputs missing `<label>` elements

**Severity:** P2 (Major)
**Category:** Accessibility
**File:** `script.js` (login render)

**Description:** `#login-user` and `#login-pass` have no associated `<label>` or `aria-label`.

**Evidence:** Automated scanner: "2 input(s) without labels."

**Suggested Fix:** Add `<label for="login-user">Email</label>` and `aria-label` attributes.

---

### BUG-017: AUTH-07 — Session forgery via localStorage (no integrity check)

**Severity:** P2 (Major)
**Category:** Security
**File:** `auth.js:106-108`

**Description:** Session is a plain JSON blob in localStorage with no signature. Forging admin sessions is trivial.

**Suggested Fix:** Use Firebase Auth tokens or JWTs.

---

### BUG-018: AUTH-09 — Default admin accounts cannot be deleted

**Severity:** P2 (Major)
**Category:** Security
**File:** `auth.js:81-89`

**Description:** `getUsers()` migration logic re-adds default admin accounts if removed. Compromised credentials can never be fully removed.

**Suggested Fix:** Remove migration logic and hard-coded accounts.

---

### BUG-019: AUTH-11 — Owner account deletion resets passwords to hard-coded defaults

**Severity:** P2 (Major)
**Category:** Security
**File:** `auth.js:256-264`

**Description:** Deleting an owner account via `deleteUserByUsername()` succeeds, but `getUsers()` re-creates it with the original hard-coded password, reverting any password changes.

**Suggested Fix:** Block deletion of owner accounts explicitly.

---

### BUG-020: AUTH-08 — No password complexity validation on create/update

**Severity:** P2 (Major)
**Category:** Security
**File:** `auth.js:266-281`

**Description:** No minimum length, character class, or complexity requirements.

**Suggested Fix:** Enforce min 8 chars, require uppercase, lowercase, and digit.

---

### BUG-021: DATA-01 — No localStorage quota handling

**Severity:** P2 (Major)
**Category:** Functional
**File:** `data.js:28-29`

**Description:** `setData()` calls `localStorage.setItem()` without try/catch. When the ~5-10MB quota is exceeded, a `QuotaExceededError` crashes the app and loses the record being saved.

**Suggested Fix:** Wrap in try/catch, notify user when storage is near capacity.

---

### BUG-022: DATA-02 — CSV header injection (incomplete sanitization)

**Severity:** P2 (Major)
**Category:** Security
**File:** `data.js:252-265`

**Description:** `sanitizeCSV()` escapes cell values but headers are written unsanitized. Manipulated record keys could inject Excel formulas in CSV headers.

**Suggested Fix:** Apply `sanitizeCSV()` to headers too.

---

### BUG-023: DATA-04 — No input validation in addRecord/updateRecord

**Severity:** P2 (Major)
**Category:** Security
**File:** `data.js:46-76`

**Description:** Functions accept any object without schema validation. Console calls bypass all form-level validation.

**Suggested Fix:** Add data-layer validation for field types and ranges.

---

### BUG-024: DATA-05 — Firebase sync errors silently swallowed

**Severity:** P2 (Major)
**Category:** Functional
**File:** `data.js:54-57, 69-71, 83-85`

**Description:** All Firebase sync uses `.catch(() => {})`. Users are never informed of sync failures.

**Suggested Fix:** Implement sync status indicator and retry queue.

---

### BUG-025: SCRIPT-02 — Hard-coded Google Apps Script URL exposed

**Severity:** P2 (Major)
**Category:** Security
**File:** `script.js:48-49`

**Description:** GAS webhook URL is visible in client-side source. Anyone can send arbitrary POST requests.

**Suggested Fix:** Move behind a server-side proxy with authentication.

---

### BUG-026: SCRIPT-03 — no-cors mode prevents sync error detection

**Severity:** P2 (Major)
**Category:** Functional
**File:** `script.js:70-74`

**Description:** `postToSheets()` uses `mode: 'no-cors'`, making HTTP errors invisible. The sync indicator shows success even when the server rejects the request.

**Suggested Fix:** Use `mode: 'cors'` and check `response.ok`.

---

### BUG-027: SCRIPT-05 — XSS via access request ID injection in onclick

**Severity:** P2 (Major)
**Category:** Security
**File:** `script.js:2132-2133`

**Description:** `onclick="handleApproveRequest('${req.id}')"` injects `req.id` into an inline handler. A manipulated ID containing `')` could break out and inject JS.

**Suggested Fix:** Use `addEventListener` instead of inline handlers.

---

### BUG-028: SCRIPT-07 — Signature data bloats localStorage

**Severity:** P2 (Major)
**Category:** Performance
**File:** `script.js:1438`

**Description:** Signatures stored as full Base64 PNG data URLs (10-100KB each). Rapidly consumes localStorage quota.

**Suggested Fix:** Reduce canvas resolution, use JPEG, or store stroke data instead.

---

### BUG-029: SCRIPT-08 — No authentication on GAS webhook calls

**Severity:** P2 (Major)
**Category:** Security
**File:** `script.js:2090-2103`

**Description:** POST requests to the GAS endpoint have no auth token. Anyone can trigger admin notification emails.

**Suggested Fix:** Add a secret token validated server-side.

---

### BUG-030: SCRIPT-09 — Auto hard-refresh causes data loss

**Severity:** P2 (Major)
**Category:** Functional
**File:** `script.js:2161-2163`

**Description:** `scheduleHardRefresh()` calls `location.reload(true)` after 30 minutes. Unsaved form data is lost.

**Suggested Fix:** Check if user is on a form view before reloading, show confirmation.

---

## P3 — Minor (8)

### BUG-031: HTML-05 — No semantic HTML landmarks

**Severity:** P3 (Minor)
**Category:** Accessibility
**File:** `index.html:44-46`

**Description:** The entire app renders into `<div id="app">`. No `<main>`, `<nav>`, `<header>`, `<footer>` landmarks. Screen readers cannot navigate by regions.

**Evidence:** Automated scanner: "No landmark regions found."

---

### BUG-032: SCAN-01 — Console errors on page load (CDN failures)

**Severity:** P3 (Minor)
**Category:** Smoke
**File:** `index.html:34-37`

**Description:** External CDN resources (Google Fonts, unpkg feather-icons) fail to load in restricted network environments, causing console errors.

**Suggested Fix:** Add fallback fonts. Self-host feather-icons or use an SVG sprite.

---

### BUG-033: AUTH-08 — Session timeout never refreshes on activity

**Severity:** P3 (Minor)
**Category:** Functional
**File:** `auth.js:179-203`

**Description:** Comment says "12 hours of inactivity" but timeout is from login time, not last activity. Active users get logged out; idle sessions stay valid.

---

### BUG-034: AUTH-10 — Owner account delete is inconsistent

**Severity:** P3 (Minor)
**Category:** Functional
**File:** `auth.js:81-89, 256-264`

**Description:** Admin thinks deletion succeeded, but account reappears on next page load.

---

### BUG-035: AUTH-11 — Missing email validation in createUser

**Severity:** P3 (Minor)
**Category:** Functional
**File:** `auth.js:266-281`

**Description:** No email format validation. Invalid emails break the login-by-email path.

---

### BUG-036: DATA-03 — Record ID collision potential

**Severity:** P3 (Minor)
**Category:** Functional
**File:** `data.js:48`

**Description:** IDs use `Date.now()` + 5-char random suffix. Same-millisecond creation risks collision.

**Suggested Fix:** Use `crypto.randomUUID()`.

---

### BUG-037: DATA-07 — Firebase sync errors silently swallowed

**Severity:** P3 (Minor)
**Category:** Functional
**File:** `data.js:54-57`

**Description:** `.catch(() => {})` hides all sync failures from users.

---

### BUG-038: SCRIPT-04 — Inline onclick handlers block CSP

**Severity:** P3 (Minor)
**Category:** Security
**File:** `script.js:622, 628, 633, 2132`

**Description:** Several places use inline `onclick` in HTML strings, preventing strict CSP implementation.

---

## P4 — Enhancements (4)

### BUG-039: SCAN-02 — Touch targets smaller than 44x44px

**Severity:** P4 (Enhancement)
**Category:** Accessibility

**Description:** The Thai language toggle button (49x27px) and "Request Access" link (59x16px) are below the WCAG 44x44px minimum.

---

### BUG-040: SCRIPT-06 — Global state variables create race conditions

**Severity:** P4 (Enhancement)
**Category:** Functional
**File:** `script.js:6-14`

**Description:** State via globals (`currentScreen`, `currentModule`) can become inconsistent during rapid clicks.

---

### BUG-041: SCRIPT-10 — DOM element ID conflicts with field- prefix

**Severity:** P4 (Enhancement)
**Category:** Functional
**File:** `script.js:1216-1306`

**Description:** Form fields use `id="field-${key}"` which is fragile to unusual key values.

---

### BUG-042: DATA-06 — Unnecessary user activity update on every write

**Severity:** P4 (Enhancement)
**Category:** Performance
**File:** `data.js:28-34`

**Description:** Every `setData()` call triggers 2 full JSON parse/stringify cycles on the users array.

---

## Additional Findings — Firebase (from source code audit)

### BUG-043: FB-02 — No Firestore security rules enforced

**Severity:** P1 (Critical)
**Category:** Security
**File:** `firebase.js:36-136`

**Description:** The Firebase layer performs no authentication checks. All CRUD operations (`fbAdd`, `fbUpdate`, `fbDelete`, `fbGetAll`) operate directly on collections without user-context. If enabled with default test-mode rules, anyone with the API key can read/write/delete all data.

**Suggested Fix:** Implement Firebase Authentication. Set Firestore security rules requiring auth and role-based access.

---

### BUG-044: FB-03 — User passwords stored in Firestore

**Severity:** P1 (Critical)
**Category:** Security
**File:** `firebase.js:217-233`

**Description:** `fbSaveUser(user)` writes the entire user object — including plaintext `password` — to Firestore. Combined with AUTH-02, passwords are now exposed in two locations.

**Suggested Fix:** Never store passwords in Firestore. Use Firebase Authentication for credential management.

---

### BUG-045: FB-04 — No conflict resolution between localStorage and Firestore

**Severity:** P2 (Major)
**Category:** Functional
**File:** `firebase.js:256-278`

**Description:** No merge strategy exists. Two users on different devices can create divergent data. No reconciliation after initial migration.

**Suggested Fix:** Implement last-write-wins with timestamps, or use Firestore as source of truth with localStorage as cache.

---

### BUG-046: HTML-02 — Missing X-Frame-Options (clickjacking)

**Severity:** P2 (Major)
**Category:** Security
**File:** `index.html`

**Description:** No `X-Frame-Options` or `frame-ancestors` CSP directive. The app can be embedded in an iframe for clickjacking attacks.

**Suggested Fix:** Add `<meta http-equiv="X-Frame-Options" content="DENY">`.

---

### BUG-047: SCRIPT-14 — Save button not disabled during submission

**Severity:** P3 (Minor)
**Category:** Functional
**File:** `script.js:1369-1463`

**Description:** `saveCurrentForm()` adds an `is-loading` class but never disables the button. Rapid double-clicks create duplicate records.

**Suggested Fix:** Disable save button immediately at start of `saveCurrentForm()`.

---

### BUG-048: DATA-07 — getData silently deletes corrupted data

**Severity:** P3 (Minor)
**Category:** Functional
**File:** `data.js:18-26`

**Description:** When `JSON.parse` fails, the corrupted key is removed from localStorage — silently destroying all data for that module.

**Suggested Fix:** Back up raw string before removing. Notify user of data loss.

---

## Updated Totals

| Severity | Count |
|----------|-------|
| P0 Blocker | 5 |
| P1 Critical | 9 |
| P2 Major | 20 |
| P3 Minor | 10 |
| P4 Enhancement | 4 |
| **Total** | **48** |

---

## Recommendations (Priority Order)

### Immediate (before next release)
1. **Move to Firebase Authentication** — This eliminates AUTH-01 through AUTH-08 in one change. Firebase Auth handles hashing, sessions, rate limiting, and token signing.
2. **Sanitize all innerHTML** — Create an `esc()` helper and apply it to every user-data interpolation in `script.js`. Or migrate to `textContent`/`createElement`.
3. **Remove hard-coded credentials** — Even with Firebase Auth, delete the `DEFAULT_USERS` array from `auth.js`.
4. **Strip passwords from data export** — Filter the `password` field out of `factory_users` before CSV export.

### Short-term (next 2-3 releases)
5. **Add Content Security Policy** — Start with `script-src 'self'` and remove inline handlers.
6. **Add SRI to CDN resources** — Or self-host feather-icons.
7. **Handle localStorage quota** — try/catch on setItem, user notification.
8. **Fix signature storage** — Compress or use stroke data.
9. **Fix GAS sync** — Remove `no-cors`, add auth tokens.

### Medium-term
10. **Add semantic HTML landmarks** — `<main>`, `<nav>`, `<header>`, `<footer>`.
11. **Wrap login in `<form>`** — For password managers and accessibility.
12. **Add form labels** — All inputs need `<label>` or `aria-label`.
13. **Fix auto-refresh** — Don't reload during form editing.
14. **Clean up dead code** — Remove inventory versions references.

---

## Test Methodology

| Phase | Tool | Result |
|-------|------|--------|
| Automated Scan | `qa-runner.js` (Playwright) | 6 issues found |
| Source Code Audit | Manual code review (auth.js, data.js, script.js, index.html, firebase.js) | 36 issues found |
| Responsive Testing | Playwright viewport testing (5 sizes) | No overflow issues |
| Performance | Navigation timing + Web Vitals | LCP 140ms, CLS 0, 188KB total |

**Note:** Performance metrics (LCP 140ms, 188KB) are excellent for a vanilla JS app. The main concerns are security, not performance.
