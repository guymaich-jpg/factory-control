# Factory Control — Arava Distillery

A bilingual (English / Hebrew) mobile-first web app for documenting and tracking alcohol production. Works on any smartphone, tablet, or computer browser — no installation required.

---

## Quick Start

**Option 1 — Open directly:**
Double-click `index.html` in any browser.

**Option 2 — Local server (recommended for development):**
```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

---

## Features

- **8 Production Modules** — Raw Materials, Date Receiving, Fermentation, Distillation 1 & 2, Bottling QA, Spirit Stock Pipeline, Inventory
- **Bilingual** — English and Hebrew (RTL) with one-tap toggle
- **3-Tier Role System** — Admin / Manager / Worker with granular permissions
- **Spirit Pipeline** — Visual D1 → D2 → Ready to Bottle tracking with consumption balances
- **Google Sheets Sync** — Auto-append timestamped inventory rows on every save/approve/delete
- **Offline-First** — All data stored in browser localStorage, works without internet
- **Responsive** — Phones (320px+), tablets (768px+), desktops (1024px+)
- **CSV Export** — Export any module's data to spreadsheet-ready CSV files
- **QA Signatures** — Touch-based signature capture for bottling approval
- **Dark Theme** — Full dark-mode UI
- **Firebase** — Optional Firestore cloud sync (disabled by default)

---

## Default Accounts

| Username  | Password      | Role    | Access                                           |
|-----------|--------------|---------|--------------------------------------------------|
| `admin`   | `admin123`   | Admin   | Full access + backoffice user management         |
| `manager` | `manager123` | Manager | Full production access                           |
| `worker1` | `worker123`  | Worker  | Add records, view history                        |
| `worker2` | `worker123`  | Worker  | Add records, view history                        |
| `qa`      | `qa123`      | Worker  | Add records, view history                        |

---

## Modules

| # | Module                   | Records                                                                   |
|---|--------------------------|---------------------------------------------------------------------------|
| 1 | Raw Material Receiving   | Supplier, category, item, weight, expiry, certifications                  |
| 2 | Date Receiving           | Supplier, weight (kg), tithing status, expiry period                      |
| 3 | Fermentation             | Tank size, crate count, temperature, sugar content, pH                    |
| 4 | Distillation 1 (D1)     | Type, still name, fermentation date, alcohol %, time range, output (L)    |
| 5 | Distillation 2 (D2)     | Product type (EDV/Arak/Gin), batch, head/tail separation, D1 input, output (L) |
| 6 | Bottling QA              | Drink type, batch, alcohol %, filtered, color, taste, contaminants, D2 input, bottle count, decision, signature |
| 7 | Spirit Stock             | Auto-calculated pipeline: D1 produced/consumed → D2 produced/consumed → Ready to Bottle |
| 8 | Inventory                | Aggregate view: bottles by type + raw materials on hand                   |

---

## Permissions

| Action              | Admin | Manager | Worker |
|---------------------|-------|---------|--------|
| View dashboard      | Yes   | Yes     | Yes    |
| Add records         | Yes   | Yes     | Yes    |
| Edit records        | Yes   | Yes     | No     |
| Delete records      | Yes   | Yes     | No     |
| View history        | Yes   | Yes     | Yes    |
| Export CSV          | Yes   | Yes     | No     |
| Manage users        | Yes   | Yes     | No     |
| Approve bottling    | Yes   | No      | No     |
| Access backoffice   | Yes   | No      | No     |

---

## Google Sheets Integration

1. Create a new Google Sheet
2. Go to **Extensions → Apps Script**
3. Paste the contents of `google-apps-script.js` into the script editor
4. Deploy as a **Web App** (execute as yourself, anyone can access)
5. Copy the Web App URL
6. In the app, go to **Settings** and paste the URL into the Google Sheets field

Every record save/approve/delete auto-appends a timestamped row. Separate tabs are created per module with formatted headers.

---

## Firebase Integration (Optional)

Firestore cloud sync is disabled by default. To enable:

1. Set `FIREBASE_ENABLED = true` in `firebase.js`
2. Add your Firebase project config
3. Data will sync bidirectionally between localStorage and Firestore

---

## File Structure

```
├── index.html              — Main app (SPA)
├── style.css               — All styles (mobile-first, dark theme, RTL)
├── script.js               — App controller (routing, forms, rendering)
├── i18n.js                 — English + Hebrew translations
├── auth.js                 — Login, sign-up, roles, session management
├── data.js                 — localStorage CRUD, dropdown data, CSV export
├── firebase.js             — Firebase/Firestore integration (optional)
├── api-client.js           — Backend API integration
├── google-apps-script.js   — Google Sheets sync (deploy to Apps Script)
├── manifest.json           — PWA manifest
├── tests.html              — Browser test suite (42 tests)
├── tests/
│   ├── legacy_data.js      — V1 backward compatibility test data
│   ├── e2e/                — Playwright E2E tests
│   └── qa/                 — QA test scripts
├── backend/                — Vercel serverless backend
│   ├── api/                — Health, users, invitations endpoints
│   └── lib/                — Auth, Firebase, CORS helpers
├── scripts/
│   ├── release-staging.sh  — Staging release automation
│   └── release-prod.sh     — Production release automation
├── start.sh                — Quick-start dev server (port 8080)
└── package.json            — v1.2.0
```

---

## Data Storage

All data is stored in the browser's `localStorage`. Each module has its own key:

| Key                         | Contents               |
|-----------------------------|------------------------|
| `factory_rawMaterials`      | Raw Materials records  |
| `factory_dateReceiving`     | Date Receiving records |
| `factory_fermentation`      | Fermentation records   |
| `factory_distillation1`     | Distillation 1 records |
| `factory_distillation2`     | Distillation 2 records |
| `factory_bottling`          | Bottling QA records    |
| `factory_inventoryVersions` | Inventory snapshots    |
| `factory_users`             | User accounts          |
| `factory_session`           | Current login session  |
| `factory_lang`              | Language setting (en/he) |

To reset all data: browser DevTools → Application → Local Storage → Clear.

---

## Running Tests

### Browser Tests
Open `tests.html` in a browser. Tests run automatically on page load (42 tests).

### E2E Tests (Playwright)
```bash
npm install
npm run test:e2e
npm run test:e2e:headed    # with visible browser
```

---

## Deployment

### GitHub Pages (free)

1. Push code to a GitHub repository
2. Go to repo **Settings → Pages**
3. Set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**
4. Live at: `https://YOUR_USERNAME.github.io/REPO_NAME/`

### Other Options

- **Netlify** — Drag the project folder onto https://app.netlify.com/drop
- **Vercel** — Run `vercel` in the project directory
- **Any static host** — Pure static site, works anywhere

---

## Tech Stack

- Pure HTML/CSS/JavaScript — no build step, no framework
- Feather Icons (CDN)
- Google Fonts — Inter + Noto Sans Hebrew
- localStorage — primary data persistence
- Google Sheets API — via Apps Script (optional)
- Firebase/Firestore — cloud sync (optional)
- Playwright — E2E testing

---

## Security

- Session expiry — 12-hour inactivity timeout
- Password-protected deletes — requires manager/admin password
- Input validation — required fields, data type checks, range validation
- CSV injection prevention — formula characters escaped
- Role-based UI — sensitive actions hidden from unauthorized roles

---

## License

Internal use only. Built for Arava Distillery.
