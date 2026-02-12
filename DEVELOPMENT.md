# Development Guide

This guide covers how to develop, test, and release the Factory Control App.

---

## 🏗️ Project Structure

- **`index.html`**: Main App entry point (Production/Worker interface).
- **`backoffice.html`**: Admin Portal entry point (User Management).
- **`script.js`**: Core logic (routes based on page URL).
- **`tests/`**: Test suite directory.

---

## 🧪 Running Tests

Before any release, you must run the test suite to ensure stability.

### 1. Functional Tests
Opens `tests.html` to verify core logic (auth, CRUD, i18n).
```bash
npm test
```

### 2. Backward Compatibility Tests (**Critical**)
Verifies that V1 data structures simulate correctly and the app renders without crashing.
**Use this before every release to prevent data loss for existing users.**
```bash
npm run test:compat
```

---

## 📦 Release Workflow

We use a semantic versioning approach (v1.0.0 -> v1.0.1 -> v1.1.0).

### Automated Release Script
To release a new version, run:
```bash
./release.sh
```

**This script will:**
1. Check for uncommitted changes (must be clean).
2. Ask for the new version number.
3. Open standard tests + compatibility tests for you to verify.
4. Update `package.json` version.
5. Create a git commit and tag (e.g., `v1.2.0`).
6. Push code and tags to GitHub.
7. Trigger GitHub Pages deployment.

---

## 🔐 Backoffice Development

The Backoffice is located at `backoffice.html`.
It shares logic with the main app but renders a different UI layout.

- **Files**: Shares `style.css`, `script.js`, `auth.js`.
- **Logic**: Inside `script.js`, `isBackofficePage` detects the URL and renders `renderBackoffice()`.

To test backoffice locally:
1. Run `./start.sh` or `npm start`
2. Go to `http://localhost:8080/backoffice.html`
3. Log in as `admin` / `admin123`

---

## 🤝 Adding New Features

1. **Modify database schema?** Update `tests/legacy_data.js` to ensure migration logic works.
2. **New Module?** Add to `script.js` -> `MODULES` list and `i18n.js`.
3. **New Permission?** Update `auth.js` -> `PERMISSIONS`.

Happy Coding! 🏭
