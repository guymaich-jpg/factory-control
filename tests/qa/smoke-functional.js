const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Use local server since the CI environment may not reach GitHub Pages directly.
// The GitHub Pages URL is: https://guymaich-jpg.github.io/Aravadistillery-Factory-Control/
// We serve the same files locally on port 8765 for reliable testing.
const BASE_URL = 'http://localhost:8765/';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const TIMEOUT = 30000;
const VIEWPORT = { width: 1920, height: 1080 };

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Helpers
function log(label, msg) {
  console.log(`[${label}] ${msg}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function logPass(test) {
  console.log(`  PASS: ${test}`);
}

function logFail(test, detail) {
  console.log(`  FAIL: ${test}`);
  if (detail) console.log(`        Detail: ${detail}`);
}

function logInfo(msg) {
  console.log(`  INFO: ${msg}`);
}

(async () => {
  const results = { pass: 0, fail: 0, info: [] };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // ============================================================
  // COLLECTORS: Console errors, page errors, failed network requests
  // ============================================================
  const consoleErrors = [];
  const consoleWarnings = [];
  const consoleAll = [];
  const pageErrors = [];
  const failedRequests = [];
  const allRequests = [];

  page.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text() };
    consoleAll.push(entry);
    if (msg.type() === 'error') consoleErrors.push(entry);
    if (msg.type() === 'warning') consoleWarnings.push(entry);
  });

  page.on('pageerror', err => {
    pageErrors.push({ message: err.message, stack: err.stack });
  });

  page.on('requestfinished', async request => {
    try {
      const response = await request.response();
      const status = response ? response.status() : 0;
      const url = request.url();
      allRequests.push({ url, status, method: request.method() });
      if (status >= 400) {
        failedRequests.push({ url, status, method: request.method() });
      }
    } catch (e) { /* ignore detached requests */ }
  });

  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      status: 0,
      method: request.method(),
      failure: request.failure()?.errorText || 'unknown',
    });
  });

  // ============================================================
  // PHASE 1: SMOKE TESTS
  // ============================================================
  logSection('PHASE 1: SMOKE TESTS');

  // --- 1. Navigate to URL with networkidle wait ---
  logSection('1.1 Navigation');
  let navigationResponse;
  try {
    navigationResponse = await page.goto(BASE_URL, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT,
    });
    logPass('Page loaded successfully with networkidle wait');
    results.pass++;
  } catch (err) {
    logFail('Page navigation', err.message);
    results.fail++;
  }

  // --- 2. HTTP Status ---
  logSection('1.2 HTTP Status');
  if (navigationResponse) {
    const status = navigationResponse.status();
    logInfo(`HTTP Status: ${status}`);
    if (status === 200) {
      logPass('HTTP status is 200');
      results.pass++;
    } else {
      logFail(`HTTP status is ${status}, expected 200`);
      results.fail++;
    }
  } else {
    logFail('No navigation response to check status');
    results.fail++;
  }

  // --- 3. Page Title ---
  logSection('1.3 Page Title');
  const title = await page.title();
  logInfo(`Page title: "${title}"`);
  if (title && title.length > 0) {
    logPass(`Page has a non-empty title: "${title}"`);
    results.pass++;
  } else {
    logFail('Page title is empty');
    results.fail++;
  }

  // --- 4. Body is non-empty ---
  logSection('1.4 Body Content');
  const bodyText = await page.evaluate(() => (document.body && document.body.innerText) || '');
  const bodyHTML = await page.evaluate(() => (document.body && document.body.innerHTML) || '');
  logInfo(`Body text length: ${bodyText.length} chars`);
  logInfo(`Body HTML length: ${bodyHTML.length} chars`);
  if (bodyHTML.length > 0) {
    logPass('Body has non-empty HTML content');
    results.pass++;
  } else {
    logFail('Body HTML is empty');
    results.fail++;
  }
  if (bodyText.length > 0) {
    logPass('Body has visible text content');
    results.pass++;
  } else {
    logFail('Body has no visible text');
    results.fail++;
  }

  // --- 5. Console errors and page errors ---
  logSection('1.5 Console Errors & Page Errors');
  logInfo(`Total console messages: ${consoleAll.length}`);
  logInfo(`Console errors: ${consoleErrors.length}`);
  logInfo(`Console warnings: ${consoleWarnings.length}`);
  logInfo(`Page errors (uncaught exceptions): ${pageErrors.length}`);

  if (consoleErrors.length > 0) {
    logFail(`Found ${consoleErrors.length} console error(s):`);
    consoleErrors.forEach((e, i) => {
      console.log(`        [Error ${i + 1}] ${e.text}`);
    });
    results.fail++;
  } else {
    logPass('No console errors detected');
    results.pass++;
  }

  if (pageErrors.length > 0) {
    logFail(`Found ${pageErrors.length} page error(s):`);
    pageErrors.forEach((e, i) => {
      console.log(`        [PageError ${i + 1}] ${e.message}`);
    });
    results.fail++;
  } else {
    logPass('No page errors (uncaught exceptions) detected');
    results.pass++;
  }

  if (consoleWarnings.length > 0) {
    logInfo(`Console warnings (${consoleWarnings.length}):`);
    consoleWarnings.forEach((w, i) => {
      console.log(`        [Warning ${i + 1}] ${w.text}`);
    });
  }

  // --- 6. Failed network requests ---
  logSection('1.6 Failed Network Requests (4xx, 5xx)');
  logInfo(`Total network requests tracked: ${allRequests.length}`);
  if (failedRequests.length > 0) {
    logFail(`Found ${failedRequests.length} failed network request(s):`);
    failedRequests.forEach((r, i) => {
      console.log(`        [${i + 1}] ${r.method} ${r.url} => status ${r.status}${r.failure ? ' (' + r.failure + ')' : ''}`);
    });
    results.fail++;
  } else {
    logPass('No failed network requests (4xx/5xx)');
    results.pass++;
  }

  // --- 7. Full-page screenshot ---
  logSection('1.7 Desktop Screenshot');
  try {
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'smoke-desktop.png'),
      fullPage: true,
      timeout: 15000,
    });
    logPass('Screenshot saved to screenshots/smoke-desktop.png');
    results.pass++;
  } catch (err) {
    logFail('Failed to take screenshot', err.message);
    results.fail++;
  }

  // ============================================================
  // PHASE 2: FUNCTIONAL TESTS
  // ============================================================
  logSection('PHASE 2: FUNCTIONAL TESTS');

  // --- 2.1 Map ALL interactive elements ---
  logSection('2.1 Interactive Elements Map');
  const interactiveMap = await page.evaluate(() => {
    const map = { buttons: [], links: [], inputs: [], selects: [], textareas: [], modals: [] };

    document.querySelectorAll('button').forEach(el => {
      map.buttons.push({
        text: (el.innerText || '').trim().substring(0, 80),
        id: el.id || '',
        class: (el.className || '').substring(0, 80),
        disabled: el.disabled,
        type: el.type,
        ariaLabel: el.getAttribute('aria-label') || '',
      });
    });

    document.querySelectorAll('a').forEach(el => {
      map.links.push({
        text: (el.innerText || '').trim().substring(0, 80),
        href: el.href || '',
        id: el.id || '',
      });
    });

    document.querySelectorAll('input').forEach(el => {
      map.inputs.push({
        type: el.type,
        name: el.name || '',
        id: el.id || '',
        placeholder: el.placeholder || '',
        value: el.value || '',
        required: el.required,
      });
    });

    document.querySelectorAll('select').forEach(el => {
      const opts = Array.from(el.options).map(o => (o.text || '').substring(0, 40));
      map.selects.push({
        name: el.name || '',
        id: el.id || '',
        options: opts,
      });
    });

    document.querySelectorAll('textarea').forEach(el => {
      map.textareas.push({
        name: el.name || '',
        id: el.id || '',
        placeholder: el.placeholder || '',
      });
    });

    document.querySelectorAll('[role="dialog"], .modal, .modal-overlay, [aria-modal="true"]').forEach(el => {
      map.modals.push({
        id: el.id || '',
        class: (el.className || '').substring(0, 80),
        visible: el.offsetParent !== null || getComputedStyle(el).display !== 'none',
      });
    });

    return map;
  });

  logInfo(`Buttons found: ${interactiveMap.buttons.length}`);
  interactiveMap.buttons.forEach((b, i) => {
    console.log(`        [Button ${i + 1}] text="${b.text}" id="${b.id}" disabled=${b.disabled} aria-label="${b.ariaLabel}"`);
  });

  logInfo(`Links found: ${interactiveMap.links.length}`);
  interactiveMap.links.forEach((l, i) => {
    console.log(`        [Link ${i + 1}] text="${l.text}" href="${l.href}"`);
  });

  logInfo(`Inputs found: ${interactiveMap.inputs.length}`);
  interactiveMap.inputs.forEach((inp, i) => {
    console.log(`        [Input ${i + 1}] type="${inp.type}" name="${inp.name}" placeholder="${inp.placeholder}" required=${inp.required}`);
  });

  logInfo(`Selects found: ${interactiveMap.selects.length}`);
  interactiveMap.selects.forEach((s, i) => {
    console.log(`        [Select ${i + 1}] name="${s.name}" options=[${s.options.join(', ')}]`);
  });

  logInfo(`Textareas found: ${interactiveMap.textareas.length}`);
  logInfo(`Modals found: ${interactiveMap.modals.length}`);

  if (interactiveMap.buttons.length > 0 || interactiveMap.inputs.length > 0) {
    logPass('Interactive elements found on page');
    results.pass++;
  } else {
    logFail('No interactive elements found on page');
    results.fail++;
  }

  // --- 2.2 Check for login screen ---
  logSection('2.2 Login Screen Detection');
  const loginDetection = await page.evaluate(() => {
    const body = (document.body && document.body.innerHTML) || '';
    const bodyText = (document.body && document.body.innerText) || '';
    const hasLoginForm = !!document.querySelector('.login-card, .login-form, [data-screen="login"], #login');
    const hasPasswordInput = !!document.querySelector('input[type="password"]');
    const hasEmailInput = !!document.querySelector('input[type="email"]');
    const hasLoginButton = !!Array.from(document.querySelectorAll('button')).find(
      b => /login|sign.?in|enter|כניס/i.test(b.innerText || '')
    );
    const loginTexts = [];
    if (/login|sign.?in|כניס|התחבר/i.test(body)) loginTexts.push('login-related text detected');
    if (hasPasswordInput) loginTexts.push('password input present');
    if (hasEmailInput) loginTexts.push('email input present');
    if (hasLoginButton) loginTexts.push('login button present');
    if (hasLoginForm) loginTexts.push('login form/card present');

    return {
      isLoginScreen: hasPasswordInput || hasLoginForm || hasLoginButton,
      details: loginTexts,
      visibleText: bodyText.substring(0, 500),
    };
  });

  if (loginDetection.isLoginScreen) {
    logInfo('LOGIN SCREEN DETECTED');
    loginDetection.details.forEach(d => logInfo(`  - ${d}`));
    logInfo(`Visible text preview: "${loginDetection.visibleText.substring(0, 300)}"`);
    logPass('Login screen is present and functional-looking');
    results.pass++;
  } else {
    logInfo('No login screen detected (app may auto-login or show dashboard directly)');
    logInfo(`Visible text preview: "${loginDetection.visibleText.substring(0, 300)}"`);
    results.info.push('No login screen detected');
  }

  // Take login screen screenshot
  try {
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'login-screen.png'),
      fullPage: true,
      timeout: 10000,
    });
    logInfo('Screenshot saved: login-screen.png');
  } catch (e) {
    logInfo(`Screenshot failed: ${e.message}`);
  }

  // --- 2.3 Test login with known credentials ---
  logSection('2.3 Login Attempt');
  let loggedIn = false;
  if (loginDetection.isLoginScreen) {
    try {
      // Try to fill login form using known credentials from auth.js
      const emailInput = await page.$('input[type="email"]');
      const passwordInput = await page.$('input[type="password"]');
      const textInputs = await page.$$('input[type="text"]');

      if (emailInput) {
        await emailInput.fill('guymaich@gmail.com');
        logInfo('Filled email input with guymaich@gmail.com');
      } else if (textInputs.length > 0) {
        await textInputs[0].fill('guymaich@gmail.com');
        logInfo('Filled text input with guymaich@gmail.com');
      }

      if (passwordInput) {
        await passwordInput.fill('Guy12345');
        logInfo('Filled password input');
      }

      // Find and click login button
      const loginButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const loginBtn = buttons.find(b => /login|sign.?in|enter|כניס|התחבר/i.test(b.innerText || ''));
        if (loginBtn) {
          loginBtn.click();
          return (loginBtn.innerText || '').trim();
        }
        // Also try submitting the form
        const form = document.querySelector('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true }));
          return 'form-submit';
        }
        return null;
      });

      if (loginButton) {
        logInfo(`Clicked login button: "${loginButton}"`);
        await page.waitForTimeout(2000);

        // Check if we are now past login
        const afterLoginCheck = await page.evaluate(() => {
          const hasPassword = !!document.querySelector('input[type="password"]');
          return {
            stillOnLogin: hasPassword,
            bodyText: ((document.body && document.body.innerText) || '').substring(0, 300),
          };
        });

        if (!afterLoginCheck.stillOnLogin) {
          logPass('Login succeeded - navigated past login screen');
          loggedIn = true;
          results.pass++;
        } else {
          logInfo('Still on login screen after attempt - login may have failed');
          logInfo(`Current text: "${afterLoginCheck.bodyText}"`);
        }
      } else {
        logInfo('Could not find a login button to click');
      }
    } catch (err) {
      logInfo(`Login attempt error: ${err.message}`);
    }

    // Take post-login screenshot
    try {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'post-login.png'),
        fullPage: true,
        timeout: 10000,
      });
      logInfo('Screenshot saved: post-login.png');
    } catch (e) {
      logInfo(`Post-login screenshot failed: ${e.message}`);
    }
  } else {
    logInfo('Skipping login test - no login screen detected');
  }

  // --- 2.4 Navigation elements ---
  logSection('2.4 Navigation Elements');
  const navElements = await page.evaluate(() => {
    const navItems = [];
    // Check for nav, sidebar, header navigation
    document.querySelectorAll('nav a, nav button, .nav-item, .sidebar a, .sidebar button, [role="navigation"] a, [role="navigation"] button, .nav-btn, .bottom-nav button, .tab-bar button').forEach(el => {
      navItems.push({
        tag: el.tagName,
        text: (el.innerText || '').trim().substring(0, 60),
        href: el.href || '',
        class: (el.className || '').substring(0, 80),
        id: el.id || '',
      });
    });

    // Also check for any clickable elements with navigation-like roles
    document.querySelectorAll('[role="tab"], [role="menuitem"], [data-module], [data-screen], .module-card').forEach(el => {
      navItems.push({
        tag: el.tagName,
        text: (el.innerText || '').trim().substring(0, 60),
        class: (el.className || '').substring(0, 80),
        dataModule: el.getAttribute('data-module') || '',
        dataScreen: el.getAttribute('data-screen') || '',
      });
    });

    return navItems;
  });

  logInfo(`Navigation elements found: ${navElements.length}`);
  navElements.forEach((n, i) => {
    console.log(`        [Nav ${i + 1}] <${n.tag}> text="${n.text}" class="${n.class}" ${n.dataModule ? 'data-module=' + n.dataModule : ''} ${n.href ? 'href=' + n.href : ''}`);
  });

  if (navElements.length > 0) {
    logPass(`Found ${navElements.length} navigation elements`);
    results.pass++;
  } else {
    logInfo('No standard navigation elements found (may be dynamically rendered)');
  }

  // --- 2.5 Test clicking nav elements and taking screenshots ---
  logSection('2.5 Navigation Click Tests');

  // Explore all clickable buttons on the current page
  const allButtons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: (b.innerText || '').trim().substring(0, 60),
      class: (b.className || '').substring(0, 80),
      onclick: b.getAttribute('onclick') || '',
      disabled: b.disabled,
    }));
  });

  logInfo(`All buttons on current page: ${allButtons.length}`);
  allButtons.forEach((b, i) => {
    console.log(`        [Btn ${i + 1}] text="${b.text}" class="${b.class}" onclick="${b.onclick}" disabled=${b.disabled}`);
  });

  // --- 2.6 Hash-based routing tests ---
  logSection('2.6 Hash-Based Routing Tests');
  const routes = [
    { hash: '#/', name: 'Dashboard (root)' },
    { hash: '#/dashboard', name: 'Dashboard' },
    { hash: '#/rawMaterials', name: 'Raw Materials' },
    { hash: '#/dateReceiving', name: 'Date Receiving' },
    { hash: '#/fermentation', name: 'Fermentation' },
    { hash: '#/distillation1', name: 'Distillation 1' },
    { hash: '#/distillation2', name: 'Distillation 2' },
    { hash: '#/bottling', name: 'Bottling' },
    { hash: '#/inventory', name: 'Inventory' },
    { hash: '#/backoffice', name: 'Backoffice' },
  ];

  for (const route of routes) {
    try {
      // Navigate to the route by changing hash
      await page.evaluate((hash) => {
        location.hash = hash;
      }, route.hash);
      await page.waitForTimeout(1500);

      const routeState = await page.evaluate(() => {
        return {
          hash: location.hash,
          bodyText: ((document.body && document.body.innerText) || '').substring(0, 200),
          hasContent: ((document.body && document.body.innerHTML) || '').length > 100,
          visibleElements: document.querySelectorAll('button, input, select, table, .card, .module-card, .record').length,
        };
      });

      logInfo(`Route: ${route.name} (${route.hash})`);
      logInfo(`  Current hash: ${routeState.hash}`);
      logInfo(`  Has content: ${routeState.hasContent}`);
      logInfo(`  Visible interactive elements: ${routeState.visibleElements}`);
      logInfo(`  Text preview: "${routeState.bodyText.substring(0, 120)}"`);

      if (routeState.hasContent) {
        logPass(`Route ${route.name} renders content`);
        results.pass++;
      } else {
        logFail(`Route ${route.name} has no content`);
        results.fail++;
      }

      // Take screenshot for each major route
      const screenshotName = route.hash.replace('#/', '').replace(/\//g, '-') || 'root';
      try {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `route-${screenshotName}.png`),
          fullPage: true,
          timeout: 10000,
        });
        logInfo(`  Screenshot saved: route-${screenshotName}.png`);
      } catch (ssErr) {
        logInfo(`  Screenshot failed for ${route.name}: ${ssErr.message}`);
      }

    } catch (err) {
      logFail(`Route ${route.name}`, err.message);
      results.fail++;
    }
  }

  // --- 2.7 localStorage inspection ---
  logSection('2.7 localStorage Inspection');
  const storageData = await page.evaluate(() => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      let value = localStorage.getItem(key);
      // Truncate very long values
      if (value && value.length > 500) {
        value = value.substring(0, 500) + '... [TRUNCATED]';
      }
      data[key] = value;
    }
    return { keys: Object.keys(data), data, count: localStorage.length };
  });

  logInfo(`localStorage entries: ${storageData.count}`);
  storageData.keys.forEach(key => {
    logInfo(`  Key: "${key}"`);
    console.log(`        Value: ${storageData.data[key]}`);
  });

  if (storageData.count > 0) {
    logPass(`localStorage has ${storageData.count} entries`);
    results.pass++;
  } else {
    logInfo('localStorage is empty');
  }

  // --- 2.8 sessionStorage inspection ---
  logSection('2.8 sessionStorage Inspection');
  const sessionData = await page.evaluate(() => {
    const data = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      let value = sessionStorage.getItem(key);
      if (value && value.length > 500) {
        value = value.substring(0, 500) + '... [TRUNCATED]';
      }
      data[key] = value;
    }
    return { keys: Object.keys(data), data, count: sessionStorage.length };
  });

  logInfo(`sessionStorage entries: ${sessionData.count}`);
  sessionData.keys.forEach(key => {
    logInfo(`  Key: "${key}"`);
    console.log(`        Value: ${sessionData.data[key]}`);
  });

  // --- 2.9 Detailed interactive element test on dashboard (if logged in) ---
  logSection('2.9 Dashboard / Module Card Analysis');

  // Go back to dashboard
  await page.evaluate(() => { location.hash = '#/dashboard'; });
  await page.waitForTimeout(1500);

  const dashboardDetails = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.module-card, .card, .dash-card, .stat-card'));
    const tables = Array.from(document.querySelectorAll('table'));
    const forms = Array.from(document.querySelectorAll('form'));
    const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => (h.innerText || '').trim());

    return {
      cardCount: cards.length,
      cards: cards.map(c => ({
        text: (c.innerText || '').trim().substring(0, 100),
        class: (c.className || '').substring(0, 80),
      })),
      tableCount: tables.length,
      formCount: forms.length,
      headings: headings.slice(0, 20),
    };
  });

  logInfo(`Cards/widgets: ${dashboardDetails.cardCount}`);
  dashboardDetails.cards.forEach((c, i) => {
    console.log(`        [Card ${i + 1}] class="${c.class}" text="${c.text}"`);
  });
  logInfo(`Tables: ${dashboardDetails.tableCount}`);
  logInfo(`Forms: ${dashboardDetails.formCount}`);
  logInfo(`Headings: ${dashboardDetails.headings.join(' | ')}`);

  // Take final dashboard screenshot
  try {
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'dashboard-final.png'),
      fullPage: true,
      timeout: 10000,
    });
    logInfo('Screenshot saved: dashboard-final.png');
  } catch (e) {
    logInfo(`Dashboard screenshot failed: ${e.message}`);
  }

  // --- 2.10 Check all console errors collected across all navigation ---
  logSection('2.10 Full Console Error Summary (Across All Tests)');
  logInfo(`Total console messages collected: ${consoleAll.length}`);
  logInfo(`Total console errors: ${consoleErrors.length}`);
  logInfo(`Total console warnings: ${consoleWarnings.length}`);
  logInfo(`Total page errors: ${pageErrors.length}`);
  logInfo(`Total failed network requests: ${failedRequests.length}`);

  if (consoleErrors.length > 0) {
    console.log('\n  --- All Console Errors ---');
    consoleErrors.forEach((e, i) => {
      console.log(`  [${i + 1}] ${e.text}`);
    });
  }

  if (pageErrors.length > 0) {
    console.log('\n  --- All Page Errors ---');
    pageErrors.forEach((e, i) => {
      console.log(`  [${i + 1}] ${e.message}`);
    });
  }

  if (failedRequests.length > 0) {
    console.log('\n  --- All Failed Requests ---');
    failedRequests.forEach((r, i) => {
      console.log(`  [${i + 1}] ${r.method} ${r.url} => ${r.status}${r.failure ? ' (' + r.failure + ')' : ''}`);
    });
  }

  // ============================================================
  // FINAL SUMMARY
  // ============================================================
  logSection('FINAL TEST SUMMARY');
  console.log(`  Total PASS: ${results.pass}`);
  console.log(`  Total FAIL: ${results.fail}`);
  console.log(`  Screenshots saved to: ${SCREENSHOT_DIR}`);

  // List screenshots
  const screenshots = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'));
  console.log(`  Screenshots taken: ${screenshots.length}`);
  screenshots.forEach(s => console.log(`    - ${s}`));

  console.log('\n' + '='.repeat(70));
  console.log(results.fail === 0 ? '  ALL TESTS PASSED' : `  ${results.fail} TEST(S) FAILED`);
  console.log('='.repeat(70) + '\n');

  await browser.close();
  process.exit(results.fail > 0 ? 1 : 0);
})();
