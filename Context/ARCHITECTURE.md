# Factory Control App — Architecture Reference

> **Arava Distillery** production tracking system.
> Bilingual (Hebrew/English) mobile-first PWA for documenting the full spirits production pipeline.

---

## 1. High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
│                                                                 │
│  index.html ──┬── style.css       (design system / CSS)         │
│               ├── firebase.js     (Firebase SDK + Firestore)    │
│               ├── i18n.js         (Hebrew/English translations) │
│               ├── auth.js         (authentication & RBAC)       │
│               ├── data.js         (data layer / CRUD)           │
│               └── script.js       (UI controller / SPA router)  │
│                                                                 │
│  External CDN:                                                  │
│    • Feather Icons (SVG icon set)                               │
│    • Google Fonts (Inter, Noto Sans Thai, Trirong, Quattrocento)│
└─────────────┬──────────────────┬────────────────────────────────┘
              │                  │
              ▼                  ▼
┌─────────────────────┐  ┌──────────────────────────┐
│   Firebase (GCP)    │  │  Google Apps Script (GAS) │
│                     │  │                           │
│  • Firestore DB     │  │  • doPost / doGet         │
│  • Firebase Auth    │  │  • Writes to Google Sheet  │
│                     │  │  • Invitation emails       │
└─────────────────────┘  └───────────┬──────────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │   Google Sheets      │
                          │   (reporting mirror) │
                          └─────────────────────┘
```

**Deployment**: Static files served via **GitHub Pages** (no server).
**Offline**: PWA manifest present (`manifest.json`); localStorage-first data layer enables offline use.

---

## 2. File Map & Responsibilities

| File | Lines | Role |
|------|------:|------|
| `index.html` | 54 | Shell: loads CSS/JS, sets CSP, initial theme/lang flash prevention |
| `script.js` | ~2,500 | **Main controller** — SPA router, all screen renderers, event binding, Google Sheets sync |
| `style.css` | ~1,860 | Complete design system: CSS custom properties, light/dark themes, RTL+LTR, responsive grid |
| `i18n.js` | ~1,030 | Translation dictionary (`I18N.en` / `I18N.he`), `t()` helper, `toggleLang()` |
| `auth.js` | ~500 | Authentication, session management, RBAC permissions, invitation system |
| `data.js` | ~320 | CRUD over localStorage with async Firebase sync, CSV export, inventory versioning |
| `firebase.js` | ~340 | Firebase SDK loader, Firestore CRUD (`fbAdd`/`fbUpdate`/`fbDelete`/`fbSubscribe`), Firebase Auth |
| `google-apps-script.js` | ~380 | **Deployed separately in GAS** — receives POST from app, writes rows to Google Sheets, handles invitations |
| `manifest.json` | 10 | PWA manifest (standalone display) |

---

## 3. Data Architecture

### 3.1 Storage Strategy: localStorage-first + Firebase sync

```
 ┌──────────────┐    fire-and-forget     ┌──────────────────────┐
 │ localStorage  │ ────────────────────► │ Firestore (cloud)     │
 │ (primary)     │ ◄──── real-time sub ──│ (secondary / shared)  │
 └──────────────┘                        └──────────────────────┘
        │
        │  on every write
        ▼
 ┌──────────────────┐   POST (no-cors)   ┌──────────────────────┐
 │ postToSheets()   │ ─────────────────► │ Google Apps Script     │
 │ (in script.js)   │                    │ → Google Sheet mirror  │
 └──────────────────┘                    └──────────────────────┘
```

- **Reads** always come from `localStorage` (instant, offline-capable).
- **Writes** go to `localStorage` first, then sync to Firestore (`fbAdd`/`fbUpdate`/`fbDelete`) as fire-and-forget.
- **Google Sheets sync** is a separate write path via `postToSheets()` — a no-cors POST to a Google Apps Script Web App that mirrors data into a Google Sheet for reporting.
- **Real-time**: `fbSubscribe()` provides Firestore `onSnapshot` listeners, but the app mainly relies on localStorage.

### 3.2 Data Collections (localStorage keys → Firestore collections)

| Key / Collection | Description |
|---|---|
| `factory_rawMaterials` | Raw material receiving records (spices, labels, packaging) |
| `factory_dateReceiving` | Date fruit receiving records |
| `factory_fermentation` | Fermentation batch records |
| `factory_distillation1` | First distillation runs |
| `factory_distillation2` | Second distillation runs |
| `factory_bottling` | Bottling records (with QA approval workflow) |
| `factory_inventoryVersions` | Point-in-time inventory snapshots with gap analysis |
| `factory_customSuppliers` | Custom dropdown options |
| `factory_users` | User accounts (local only — passwords never sent to Firestore) |
| `factory_session` | Current logged-in session (local only) |
| `factory_invitations` | Pending user invitations |
| `factory_access_requests` | Pending access requests |
| `factory_customOptions_*` | Per-field custom dropdown values |

### 3.3 Record Shape (common fields)

Every record created via `addRecord()` gets:
```
{
  id:        crypto.randomUUID(),
  createdAt: ISO timestamp,
  createdBy: session.username,
  ...module-specific fields
}
```

---

## 4. Authentication & Authorization

### 4.1 Auth Flow

```
┌──────────┐    email + password    ┌────────────────┐
│  Login    │ ───────────────────► │  authenticate()  │
│  Screen   │                      │  (auth.js)       │
└──────────┘                       └───────┬──────────┘
                                           │
                         ┌─────────────────┼─────────────────┐
                         ▼                                   ▼
              ┌──────────────────┐               ┌──────────────────┐
              │ Firebase Auth    │               │ Local hash check  │
              │ (primary)        │               │ (fallback)        │
              │ signInWithEmail  │               │ FNV-1a hash       │
              └──────────────────┘               └──────────────────┘
                         │                                   │
                         └─────────────┬─────────────────────┘
                                       ▼
                              ┌─────────────────┐
                              │ Session stored   │
                              │ in localStorage  │
                              │ (12h timeout)    │
                              └─────────────────┘
```

### 4.2 Roles & Permissions

| Permission | admin | manager | worker |
|---|:---:|:---:|:---:|
| View Dashboard | Y | Y | Y |
| Add Records | Y | Y | Y |
| Edit Records | Y | Y | - |
| Delete Records | Y | Y | - |
| View History | Y | Y | Y |
| Export Data | Y | Y | - |
| Manage Users | Y | Y | - |
| View Inventory | Y | Y | Y |
| Approve Bottling | Y | - | - |
| Access Backoffice | Y | Y | - |

### 4.3 Security Features

- **Rate limiting**: 5 attempts per 15-minute window per email
- **Password hashing**: FNV-1a hash with length-mixing salt (client-side)
- **Password complexity**: min 6 chars, at least 1 letter + 1 digit
- **Session timeout**: 12 hours of inactivity
- **CSP**: Content-Security-Policy meta tag restricting script/style/connect sources
- **XSS prevention**: `esc()` HTML-escape helper used in all innerHTML interpolation
- **CSV injection prevention**: Prefixes formula chars with `'` on export
- **Prototype pollution guard**: Rejects `__proto__`/`constructor` keys in records
- **Owner accounts**: Two hardcoded admin accounts that cannot be deleted

---

## 5. UI Architecture (SPA)

### 5.1 Routing

Hash-based SPA routing (`#/module/view`):

```
#/                    → Dashboard
#/rawMaterials        → Raw Materials list
#/rawMaterials/form   → Raw Materials add/edit form
#/dateReceiving       → Date Receiving list
#/fermentation        → Fermentation list
#/distillation1       → Distillation 1 list
#/distillation2       → Distillation 2 list
#/bottling            → Bottling list
#/inventory           → Inventory dashboard
#/backoffice          → User management / settings
#/invite/TOKEN        → Invitation registration
```

### 5.2 Screen Hierarchy

```
renderApp()
  │
  ├── [Not logged in] → renderLogin()
  │                       └── renderInviteRegistration()
  │
  └── [Logged in] → renderHeader() + renderBottomNav()
                      │
                      ├── renderDashboard()        — stat cards, recent entries, module quick-links
                      │
                      ├── renderModuleList()        — record list for any production module
                      │     └── renderRecordItem()
                      │
                      ├── renderModuleDetail()      — single record detail view
                      │
                      ├── renderModuleForm()        — add/edit form for any module
                      │     └── renderFormField()   — per-field renderer (text, number, select, date, signature, etc.)
                      │
                      ├── renderInventory()         — bottles + raw materials inventory with tabs
                      │
                      └── renderBackoffice()        — user management, invitations, Sheets sync, export
                            └── renderUserForm()
```

### 5.3 Bottom Navigation Tabs

| Tab | Icon | Navigates To |
|---|---|---|
| Dashboard | grid | `renderDashboard` |
| Receiving | package | `rawMaterials` module |
| Production | activity | `fermentation` module |
| Bottling | check-circle | `bottling` module |
| Inventory | database | `renderInventory` |
| Backoffice | settings | `renderBackoffice` (admin/manager only) |

### 5.4 Design System

- **Themes**: Light (warm cream `#EFEFEC`) / Dark (forest green `#1A1E1B`), toggleable + system-preference aware
- **Direction**: RTL (Hebrew) / LTR (English), toggled at runtime
- **Typography**: Inter (UI), Noto Sans Thai, Trirong (serif accent), Quattrocento Sans
- **Icons**: Feather Icons (SVG, loaded from CDN)
- **Layout**: Mobile-first, CSS Grid/Flexbox, no framework
- **Transitions**: iOS-style forward/back navigation animations

---

## 6. Production Pipeline (Domain Model)

The app tracks the full spirits production workflow:

```
 ┌─────────────────┐     ┌──────────────────┐
 │  Raw Materials   │     │  Date Receiving   │
 │  (spices, labels,│     │  (date fruits     │
 │   packaging)     │     │   from suppliers)  │
 └────────┬────────┘     └────────┬──────────┘
          │                       │
          │                       ▼
          │              ┌──────────────────┐
          │              │  Fermentation     │
          │              │  (tank, temp,     │
          │              │   sugar, pH)      │
          │              └────────┬──────────┘
          │                       │
          │                       ▼
          │              ┌──────────────────┐
          │              │  Distillation 1   │
          │              │  (still, alcohol%, │
          │              │   temp, time)      │
          │              └────────┬──────────┘
          │                       │
          │                       ▼
          │              ┌──────────────────┐
          │              │  Distillation 2   │
          │              │  (product type,   │
          │              │   batch#, quality) │
          │              └────────┬──────────┘
          │                       │
          └───────────────────────┤
                                  ▼
                         ┌──────────────────┐
                         │  Bottling         │
                         │  (QA checks:      │
                         │   color, taste,   │
                         │   contaminants)   │
                         │  → admin approval │
                         └────────┬──────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │  Inventory        │
                         │  (auto-calculated │
                         │   from all above,  │
                         │   version history) │
                         └──────────────────┘
```

**Products**: Arak, Gin, Eau de Vie (EDV), Licorice liqueur, Brandy VS, Brandy VSOP, Brandy Medicated

---

## 7. External Integrations

### 7.1 Firebase (Firestore + Auth)

- **Project**: `aravadistillery-crm`
- **SDK**: Firebase 9.23.0 (compat mode, loaded on-demand)
- **Firestore**: Mirrors all production data collections for cloud persistence and multi-device sync
- **Auth**: Email/password authentication; lazy-migrates local users to Firebase Auth on first login
- **Graceful degradation**: If Firebase SDK fails to load, app runs entirely on localStorage

### 7.2 Google Apps Script → Google Sheets

- **Purpose**: Mirror production data to a Google Sheet for reporting, sharing with regulators, and Excel-compatible access
- **Mechanism**: `postToSheets()` sends a no-cors POST with `{ sheetName, keys, labels, records }`
- **Features**: Sheet auto-creation, header formatting, color-coded status columns, `doGet` for sync verification
- **Invitation emails**: GAS also handles sending invitation emails with registration links

### 7.3 CDN Dependencies

| Library | Version | Purpose |
|---|---|---|
| Firebase SDK | 9.23.0 | Firestore + Auth (loaded dynamically) |
| Feather Icons | 4.29.2 | SVG icon set (with SRI hash) |
| Google Fonts | latest | Inter, Noto Sans Thai, Trirong, Quattrocento Sans |

---

## 8. Testing

| Layer | Tool | Location |
|---|---|---|
| Browser unit tests | Custom test runner | `tests.html` |
| E2E tests | Playwright | `tests/` directory, `playwright.config.js` |
| QA automation | Custom Node.js runner | `tests/qa/qa-runner.js` |

Run commands:
```bash
npm run test:e2e          # Playwright E2E
npm run test:qa           # QA test suite
npm run dev               # Dev server on :8080
```

---

## 9. Build & Deployment

- **No build step** — pure vanilla JS/CSS/HTML, served as-is
- **Dev server**: `python3 -m http.server 8080`
- **Deploy**: Push to GitHub → GitHub Pages serves from root
- **Preview**: `build-preview.js` generates `preview.html` (single-file bundle for offline review)
- **Release scripts**: `scripts/release-staging.sh`, `scripts/release-prod.sh`

---

## 10. Key Design Decisions

1. **No framework**: Vanilla JS with manual DOM rendering — keeps bundle at zero build, instant load
2. **localStorage-first**: Guarantees offline functionality; Firebase is an enhancement, not a requirement
3. **Dual sync**: Both Firestore (real-time cloud DB) and Google Sheets (human-readable reporting) receive writes
4. **Client-side auth**: FNV-1a password hashing — acceptable for an internal tool; Firebase Auth adds the server-side layer
5. **Bilingual from day one**: RTL/LTR switching, all strings in `i18n.js`
6. **Mobile-first PWA**: Designed for factory floor use on phones/tablets
7. **Single-file modules**: Each concern (auth, data, i18n, firebase) is one file — simple mental model, no module bundler needed
