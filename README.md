# Factory Control — Alcohol Production Documentation App

A bilingual (English / Hebrew) mobile-first web app for documenting and tracking alcohol production processes in a distillery. Built for **Arava Distillery**. Works on any smartphone, tablet, or computer browser — no installation required.

---

## Quick Start

### Option 1: Open Directly (simplest)
Double-click `index.html` in any browser. That's it.

### Option 2: Local Server (recommended for testing)
```bash
cd factory-control
python3 -m http.server 8080
# Open http://localhost:8080
```

### Option 3: Deploy Online
See the **Deployment** section below for GitHub Pages, Netlify, and Vercel instructions.

---

## Demo Accounts

| Username  | Password      | Role      | Permissions                                      |
|-----------|--------------|-----------|--------------------------------------------------|
| `admin`   | `admin123`   | Admin     | Full access: add, edit, delete, export, approve, backoffice |
| `manager` | `manager123` | Manager   | Full production access: add, edit, delete, export |
| `worker1` | `worker123`  | Worker    | Add records, view history                        |
| `worker2` | `worker123`  | Worker    | Add records, view history                        |
| `qa`      | `qa123`      | Worker    | Add records, view history                        |

New users can sign up from the login page. Admins have full control; managers handle day-to-day operations; workers can only add and view records.

---

## Features

- **8 Production Modules** — Raw Materials, Date Receiving, Fermentation, Distillation 1 & 2, Bottling QA, Spirit Stock Pipeline, Inventory
- **Bilingual** — Full English and Hebrew (RTL) support with one-tap toggle
- **3-Tier Role System** — Admin / Manager / Worker with granular permissions
- **Spirit Pipeline** — Visual D1 → D2 → Ready to Bottle tracking with consumption balances
- **Google Sheets Sync** — Auto-append timestamped inventory rows on every save/approve/delete
- **Offline-First** — All data stored in browser localStorage, works without internet
- **Responsive** — Optimized for phones (320px+), tablets (768px+), and desktops (1024px+)
- **CSV Export** — Export any module's data to spreadsheet-ready CSV files
- **QA Signatures** — Touch-based signature capture for bottling approval
- **Dark Theme** — Full dark-mode UI
- **Optional Firebase** — Firestore cloud sync (disabled by default, plug-and-play)
- **Automated Tests** — 42 browser tests + 7 Playwright E2E test suites

---

## Navigation

The app uses a bottom tab bar for navigation:

```
[Dashboard]  [Receiving]  [Production]  [Spirit]  [Bottling]  [Inventory]  [Settings*]
```

\* Settings tab visible to Admin/Manager only.

**Header layout:**
- Left: Back arrow + role badge
- Center: Screen title
- Right: Language toggle (EN/HE) + logout

---

## Modules

| # | Module                 | What it records                                                                  |
|---|------------------------|----------------------------------------------------------------------------------|
| 1 | **Raw Material Receiving** | Supplier, category (spices/labels/packaging), item, weight, expiry, certifications |
| 2 | **Date Receiving**     | Supplier, weight (kg), tithing status, expiry period                             |
| 3 | **Fermentation**       | Tank size, crate count, temperature, sugar content, pH                           |
| 4 | **Distillation 1 (D1)** | Type, still name, fermentation date, alcohol %, time range, distilled output (L) |
| 5 | **Distillation 2 (D2)** | Product type (EDV/Arak/Gin), batch number, head/tail separation, D1 input consumption, output (L) |
| 6 | **Bottling QA**        | Drink type, batch, alcohol %, filtered, color, taste, contaminants, D2 input consumption, bottle count, decision, QA signature |
| 7 | **Spirit Stock**       | Auto-calculated pipeline: D1 produced/consumed → D2 produced/consumed → Ready to Bottle |
| 8 | **Inventory**          | Aggregate view: bottles by type + raw materials on hand                          |

### Spirit Stock Pipeline

The Spirit Stock screen provides a real-time view of spirit flow through the production process:

```
D1 Spirit (Produced - Consumed) → D2 Spirit (Produced - Consumed) → Ready to Bottle
```

- **Gross totals** display immediately from production records
- **Net balances** update as workers fill in the "consumed" fields on D2 and Bottling forms
- Helps identify bottlenecks and imbalances in the production pipeline

### Inventory

The Inventory screen shows two aggregate views:
- **Bottles** — Finished product stock by drink type
- **Raw Materials** — Current stock of spices, labels, packaging, and dates

---

## Permissions Matrix

| Action              | Admin | Manager | Worker |
|---------------------|-------|---------|--------|
| View dashboard      | Yes   | Yes     | Yes    |
| Add records         | Yes   | Yes     | Yes    |
| Edit records        | Yes   | Yes     | No     |
| Delete records      | Yes   | Yes     | No     |
| View history        | Yes   | Yes     | Yes    |
| Export CSV          | Yes   | Yes     | No     |
| Manage users        | Yes   | Yes     | No     |
| View inventory      | Yes   | Yes     | Yes    |
| Approve bottling    | Yes   | No      | No     |
| Access backoffice   | Yes   | No      | No     |

---

## Google Sheets Integration

The app can auto-sync data to Google Sheets on every save, approve, or delete action.

### Setup

1. Create a new Google Sheet
2. Go to **Extensions → Apps Script**
3. Paste the contents of `google-apps-script.js` into the script editor
4. Deploy as a **Web App** (execute as yourself, anyone can access)
5. Copy the Web App URL
6. In the app, go to **Settings** and paste the URL into the Google Sheets field

### How It Works

- Every record save/approve/delete auto-appends a timestamped row to the Inventory sheet (ledger format)
- Creates separate tabs per module with formatted headers (blue background, bold, frozen rows)
- Auto-resizes columns for readability
- Signatures display as `[signed]` placeholder text
- Alcohol fractions (0–1) are auto-converted to percentages

---

## Firebase Integration (Optional)

Firebase/Firestore cloud sync is available but disabled by default.

To enable:
1. Set `FIREBASE_ENABLED = true` in `firebase.js`
2. Add your Firebase project config
3. Data will sync bidirectionally between localStorage and Firestore

Collections mirror localStorage keys (`factory_rawMaterials`, `factory_distillation1`, etc.).

---

## File Structure

```
factory-control/
├── index.html              — Main app entry point (SPA)
├── style.css               — All styles (mobile-first, dark theme, RTL support)
├── script.js               — App controller (routing, forms, rendering)
├── i18n.js                 — English + Hebrew translations (500+ keys)
├── auth.js                 — Login, sign-up, roles, session management
├── data.js                 — LocalStorage CRUD, dropdown data, CSV export
├── firebase.js             — Firebase/Firestore integration (optional)
├── google-apps-script.js   — Google Sheets sync script (deploy to Apps Script)
├── manifest.json           — PWA manifest (add to home screen)
├── tests.html              — Browser test suite (42 tests)
├── tests/
│   ├── legacy_data.js      — V1 backward compatibility test data
│   └── e2e/                — Playwright E2E tests (7 suites)
├── scripts/
│   ├── release-staging.sh  — Staging release automation
│   └── release-prod.sh     — Production release automation
├── start.sh                — Quick-start dev server (port 8080)
├── deploy-github.sh        — GitHub deployment helper
├── release.sh              — Version bump + push automation
├── .nojekyll               — Prevents Jekyll processing on GitHub Pages
└── README.md               — This file
```

---

## Data Storage

All data is stored in the browser's `localStorage`. Each module has its own key:

| Key                            | Contents              |
|--------------------------------|-----------------------|
| `factory_rawMaterials`         | Raw Materials records |
| `factory_dateReceiving`        | Date Receiving records|
| `factory_fermentation`         | Fermentation records  |
| `factory_distillation1`        | Distillation 1 records|
| `factory_distillation2`        | Distillation 2 records|
| `factory_bottling`             | Bottling QA records   |
| `factory_inventoryVersions`    | Inventory snapshots   |
| `factory_users`                | User accounts         |
| `factory_session`              | Current login session |
| `factory_lang`                 | Language setting (en/he) |
| `factory_sheets_url`           | Google Sheets sync URL |
| `factory_customSuppliers`      | Custom supplier options|
| `factory_customOptions_*`      | Dynamic dropdown items |

To reset all data, open browser DevTools → Application → Local Storage → Clear.

---

## Running Tests

### Browser Tests
Open `tests.html` in a browser. Tests run automatically on page load.

**42 tests across 8 sections:**
- i18n (translation parity, fallbacks, toggle)
- Auth (login, logout, session management)
- Sign-up (validation, duplicates, password rules)
- Permissions (manager vs worker access)
- Data CRUD (add, update, delete, unique IDs)
- Dropdown data (suppliers, categories, bilingual items)
- CSV export (blob generation, empty data handling)
- Cross-module integration (inventory aggregation)

### E2E Tests (Playwright)

```bash
npm install                  # Install Playwright
npm run test:e2e             # Run all E2E tests
npm run test:e2e:headed      # Run with visible browser
npm run test:e2e:ui          # Run with Playwright UI
```

**7 test suites:** Auth, Permissions, Modules, i18n, Security, UX/UI, Security v2

---

## Tech Stack

- **Pure HTML/CSS/JavaScript** — no build step, no framework
- **Feather Icons** (CDN)
- **Google Fonts** — Inter (English) + Noto Sans Hebrew
- **localStorage** — Primary data persistence
- **Google Sheets API** — Via Apps Script (optional)
- **Firebase/Firestore** — Cloud sync (optional, disabled by default)
- **Playwright** — E2E testing

---

## Deployment

### GitHub Pages (free, recommended)

1. Create a new repository on GitHub
2. Push your code:
```bash
git init
git add .
git commit -m "Factory Control app"
git remote add origin https://github.com/YOUR_USERNAME/factory-control.git
git branch -M main
git push -u origin main
```
3. Go to repo **Settings → Pages**
4. Set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**
5. Your app will be live at: `https://YOUR_USERNAME.github.io/factory-control/`

### Netlify (free, drag-and-drop)

1. Go to https://app.netlify.com/drop
2. Drag the entire `factory-control` folder onto the page
3. Done — you get a live URL instantly

### Vercel (free)

```bash
npm i -g vercel
cd factory-control && vercel
```

### Any Static Host

This is a pure static site. It works on any web host: AWS S3, Google Cloud Storage, Firebase Hosting, Cloudflare Pages, or any shared hosting with FTP.

---

## Security

- **Session expiry** — 12-hour inactivity timeout
- **Password-protected deletes** — Requires manager/admin password confirmation
- **Input validation** — Required fields, data type checks, range validation
- **CSV injection prevention** — Formula characters escaped
- **Role-based UI** — Sensitive actions hidden from unauthorized roles
- **No hardcoded API keys** — Firebase config is a template

---

## License

Internal use only. Built for Arava Distillery production documentation.
