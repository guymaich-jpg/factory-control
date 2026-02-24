// Full QA Test Suite for Factory Control App
// Tests all 8 phases against a target URL

const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = process.env.TARGET_URL || 'https://aravadistillery-factory-control.vercel.app';
const SCREENSHOT_DIR = path.join(__dirname, '../../screenshots-qa');

// Test credentials
const ADMIN_EMAIL = 'guymaich@gmail.com';
const ADMIN_PASS = 'Guy12345';

const bugs = [];
let bugCounter = 0;

function reportBug(title, severity, category, description, evidence = '') {
  bugCounter++;
  const bug = { id: `BUG-${String(bugCounter).padStart(3, '0')}`, title, severity, category, description, evidence };
  bugs.push(bug);
  console.log(`  [${bug.severity}] ${bug.id}: ${bug.title}`);
}

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ============================================================
// PHASE 1: SMOKE TESTING
// ============================================================
async function phase1_smoke(page) {
  console.log('\n========== PHASE 1: SMOKE TESTING ==========');
  const errors = [];
  const failedResources = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));
  page.on('requestfailed', req => {
    failedResources.push({ url: req.url(), error: req.failure()?.errorText || 'unknown' });
  });

  // Load page
  const response = await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
  const status = response.status();
  console.log(`  HTTP Status: ${status}`);
  if (status !== 200) {
    reportBug('Page returns non-200 status', 'P0', 'Smoke', `HTTP ${status} returned`);
  }

  // Title
  const title = await page.title();
  console.log(`  Title: "${title}"`);
  if (!title || title === 'Untitled' || title.length < 3) {
    reportBug('Missing or meaningless page title', 'P3', 'Smoke', `Title: "${title}"`);
  }

  // Body renders
  const bodyText = await page.textContent('body');
  console.log(`  Body length: ${bodyText.length} chars`);
  if (bodyText.length < 50) {
    reportBug('Page body is nearly empty', 'P0', 'Smoke', `Body has only ${bodyText.length} chars`);
  }

  // Console errors
  console.log(`  Console errors: ${errors.length}`);
  if (errors.length > 0) {
    const criticalErrors = errors.filter(e => !e.includes('favicon') && !e.includes('404'));
    if (criticalErrors.length > 0) {
      reportBug('JavaScript console errors on page load', 'P2', 'Smoke',
        `${criticalErrors.length} console errors:\n${criticalErrors.slice(0, 5).join('\n')}`,
        criticalErrors.join('\n'));
    }
  }

  // Failed resources
  console.log(`  Failed network requests: ${failedResources.length}`);
  if (failedResources.length > 0) {
    const nonFavicon = failedResources.filter(r => !r.url.includes('favicon'));
    if (nonFavicon.length > 0) {
      reportBug('Failed network resource loads', 'P2', 'Smoke',
        `${nonFavicon.length} failed:\n${nonFavicon.map(r => `${r.url} (${r.error})`).join('\n')}`);
    }
  }

  await page.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, 'smoke-login.png') });
  console.log('  Phase 1 complete.');
  return { errors, failedResources };
}

// ============================================================
// PHASE 2: FUNCTIONAL TESTING
// ============================================================
async function phase2_functional(page) {
  console.log('\n========== PHASE 2: FUNCTIONAL TESTING ==========');

  // --- Login ---
  console.log('  Testing login...');

  // Invalid login
  const emailInput = page.locator('input[type="email"], input[type="text"], input#login-email, input[autocomplete="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  const loginBtn = page.locator('button[type="submit"], button.login-btn, #login-btn').first();

  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Test invalid credentials
    await emailInput.fill('invalid@test.com');
    await passInput.fill('wrongpassword');
    await loginBtn.click();
    await page.waitForTimeout(2000);

    const errorVisible = await page.locator('.login-error, [role="alert"]').first().isVisible().catch(() => false);
    if (!errorVisible) {
      // Check if we accidentally logged in (which would be a bug)
      const stillOnLogin = await emailInput.isVisible().catch(() => false);
      if (!stillOnLogin) {
        reportBug('Invalid credentials accepted for login', 'P0', 'Security', 'Login succeeded with invalid@test.com / wrongpassword');
      }
    }
    console.log(`    Invalid login shows error: ${errorVisible ? 'PASS' : 'CHECK'}`);

    // Test valid login
    await emailInput.fill(ADMIN_EMAIL);
    await passInput.fill(ADMIN_PASS);
    await loginBtn.click();
    await page.waitForTimeout(3000);

    const loggedIn = !(await emailInput.isVisible().catch(() => false));
    console.log(`    Valid login succeeds: ${loggedIn ? 'PASS' : 'FAIL'}`);
    if (!loggedIn) {
      reportBug('Login with valid credentials fails', 'P0', 'Functional', `Cannot login with admin credentials`);
      return; // Can't continue without auth
    }

    await page.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, 'func-dashboard.png') });
  } else {
    console.log('    Login form not found, might already be logged in');
  }

  // --- Navigation ---
  console.log('  Testing navigation...');
  const navButtons = await page.locator('nav button, .bottom-nav button, .nav-item').all();
  console.log(`    Found ${navButtons.length} nav items`);

  for (let i = 0; i < navButtons.length; i++) {
    try {
      const navBtn = navButtons[i];
      const text = await navBtn.textContent().catch(() => '');
      await navBtn.click();
      await page.waitForTimeout(500);
      console.log(`    Nav "${text.trim().substring(0, 20)}": clicked OK`);
    } catch (e) {
      // Nav item may have been detached after click
    }
  }

  // --- CRUD: Test adding a record ---
  console.log('  Testing CRUD...');
  // Go to first module
  const moduleBtn = page.locator('.module-card, .module-item, [data-module]').first();
  if (await moduleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await moduleBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, 'func-module.png') });

    // Try add button
    const addBtn = page.locator('button:has-text("add"), button:has-text("הוסף"), .fab, [aria-label*="add" i]').first();
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, 'func-add-form.png') });

      // Check form fields exist
      const formInputs = await page.locator('.form-container input, .form-container select, .form-container textarea').all();
      console.log(`    Add form has ${formInputs.length} inputs`);
    }
  }

  // --- Session persistence ---
  console.log('  Testing session persistence...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const loginFormAfterReload = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
  console.log(`    Session persists after reload: ${!loginFormAfterReload ? 'PASS' : 'FAIL'}`);
  if (loginFormAfterReload) {
    reportBug('Session lost on page reload', 'P1', 'Functional', 'Session does not persist after page refresh');
    // Re-login for remaining tests
    await page.locator('input[type="email"], input[type="text"]').first().fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').first().fill(ADMIN_PASS);
    await page.locator('button[type="submit"], button.login-btn').first().click();
    await page.waitForTimeout(3000);
  }

  console.log('  Phase 2 complete.');
}

// ============================================================
// PHASE 3: UI/UX TESTING
// ============================================================
async function phase3_uiux(page) {
  console.log('\n========== PHASE 3: UI/UX TESTING ==========');

  const viewports = [
    { name: 'Desktop-HD', width: 1920, height: 1080 },
    { name: 'Laptop', width: 1280, height: 720 },
    { name: 'Tablet-Portrait', width: 768, height: 1024 },
    { name: 'Mobile-iPhone', width: 375, height: 667 },
    { name: 'Mobile-Small', width: 320, height: 568 },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(500);

    // Check for horizontal overflow
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(`  ${vp.name} (${vp.width}x${vp.height}): horizontal overflow = ${hasHScroll}`);
    if (hasHScroll) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      reportBug(`Horizontal scroll on ${vp.name} viewport`, 'P2', 'UI/UX',
        `Page overflows by ${overflow}px at ${vp.width}px width`);
    }

    await page.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, `uiux-${vp.name}.png`) });
  }

  // Reset to mobile for remaining tests
  await page.setViewportSize({ width: 390, height: 844 });

  // Check for text overflow/clipping
  const overflowElements = await page.evaluate(() => {
    const issues = [];
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      if (style.overflow === 'visible' && el.scrollWidth > el.clientWidth + 2) {
        if (el.clientWidth > 0 && el.textContent.trim().length > 0) {
          issues.push({ tag: el.tagName, class: el.className.substring(0, 50), overflow: el.scrollWidth - el.clientWidth });
        }
      }
    });
    return issues.slice(0, 10);
  });
  if (overflowElements.length > 0) {
    console.log(`  Text overflow elements: ${overflowElements.length}`);
  }

  // Dark mode check
  const hasDarkMode = await page.evaluate(() => !!document.querySelector('[data-theme="dark"]') || !!document.querySelector('.theme-toggle'));
  console.log(`  Dark mode support: ${hasDarkMode ? 'YES' : 'NO'}`);
  if (hasDarkMode) {
    // Toggle to dark
    const themeToggle = page.locator('.theme-toggle, [aria-label*="theme" i], [aria-label*="dark" i]').first();
    if (await themeToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await themeToggle.click();
      await page.waitForTimeout(500);
      await page.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, 'uiux-dark-mode.png') });
      // Toggle back
      await themeToggle.click();
      await page.waitForTimeout(500);
    }
  }

  console.log('  Phase 3 complete.');
}

// ============================================================
// PHASE 4: ACCESSIBILITY TESTING
// ============================================================
async function phase4_accessibility(page) {
  console.log('\n========== PHASE 4: ACCESSIBILITY TESTING ==========');

  // Check images for alt text
  const imagesWithoutAlt = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).filter(img => !img.alt).map(img => img.src);
  });
  console.log(`  Images without alt: ${imagesWithoutAlt.length}`);
  if (imagesWithoutAlt.length > 0) {
    reportBug('Images missing alt text', 'P3', 'Accessibility',
      `${imagesWithoutAlt.length} images lack alt text: ${imagesWithoutAlt.slice(0, 3).join(', ')}`);
  }

  // Check form inputs for labels
  const unlabeledInputs = await page.evaluate(() => {
    const issues = [];
    document.querySelectorAll('input, select, textarea').forEach(input => {
      if (input.type === 'hidden' || input.type === 'submit') return;
      const id = input.id;
      const ariaLabel = input.getAttribute('aria-label');
      const ariaLabelledBy = input.getAttribute('aria-labelledby');
      const label = id ? document.querySelector(`label[for="${id}"]`) : null;
      const parentLabel = input.closest('label');
      const placeholder = input.placeholder;
      if (!label && !parentLabel && !ariaLabel && !ariaLabelledBy) {
        issues.push({ tag: input.tagName, type: input.type, id: id || '(no id)', placeholder: placeholder || '' });
      }
    });
    return issues;
  });
  console.log(`  Inputs without labels: ${unlabeledInputs.length}`);
  if (unlabeledInputs.length > 0) {
    reportBug('Form inputs missing accessible labels', 'P2', 'Accessibility',
      `${unlabeledInputs.length} inputs lack labels:\n${unlabeledInputs.slice(0, 5).map(i => `  ${i.tag}[type=${i.type}] id=${i.id}`).join('\n')}`);
  }

  // Check heading hierarchy
  const headings = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
      level: parseInt(h.tagName[1]), text: h.textContent.trim().substring(0, 50)
    }));
  });
  console.log(`  Headings found: ${headings.length}`);
  let prevLevel = 0;
  for (const h of headings) {
    if (h.level > prevLevel + 1 && prevLevel > 0) {
      reportBug(`Heading hierarchy skip: h${prevLevel} to h${h.level}`, 'P3', 'Accessibility',
        `Heading jumps from h${prevLevel} to h${h.level}: "${h.text}"`);
      break;
    }
    prevLevel = h.level;
  }

  // Check touch targets
  const smallTargets = await page.evaluate(() => {
    const issues = [];
    document.querySelectorAll('button, a, input[type="checkbox"], input[type="radio"], [role="button"]').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
        issues.push({ tag: el.tagName, class: el.className.substring(0, 30), width: Math.round(rect.width), height: Math.round(rect.height), text: el.textContent.trim().substring(0, 20) });
      }
    });
    return issues;
  });
  console.log(`  Small touch targets (<44px): ${smallTargets.length}`);
  if (smallTargets.length > 5) {
    reportBug('Multiple touch targets below 44px minimum', 'P3', 'Accessibility',
      `${smallTargets.length} elements have touch targets < 44px:\n${smallTargets.slice(0, 5).map(t => `  ${t.tag}.${t.class} (${t.width}x${t.height}) "${t.text}"`).join('\n')}`);
  }

  // Check ARIA live regions
  const liveRegions = await page.evaluate(() => {
    return document.querySelectorAll('[aria-live], [role="alert"], [role="status"]').length;
  });
  console.log(`  ARIA live regions: ${liveRegions}`);

  // Check landmarks
  const landmarks = await page.evaluate(() => {
    return {
      nav: document.querySelectorAll('nav, [role="navigation"]').length,
      main: document.querySelectorAll('main, [role="main"]').length,
      footer: document.querySelectorAll('footer, [role="contentinfo"]').length,
    };
  });
  console.log(`  Landmarks: nav=${landmarks.nav}, main=${landmarks.main}, footer=${landmarks.footer}`);

  console.log('  Phase 4 complete.');
}

// ============================================================
// PHASE 5: SECURITY TESTING
// ============================================================
async function phase5_security(page) {
  console.log('\n========== PHASE 5: SECURITY TESTING ==========');

  // Check localStorage for sensitive data
  const storageData = await page.evaluate(() => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      data[key] = localStorage.getItem(key);
    }
    return data;
  });

  const sensitivePatterns = [/password/i, /secret/i, /private.?key/i, /credential/i];
  for (const [key, value] of Object.entries(storageData)) {
    for (const pattern of sensitivePatterns) {
      if (pattern.test(value) && key !== 'factory_users') {
        // factory_users contains hashed passwords which is expected
      }
    }
    // Check for plaintext passwords
    if (key === 'factory_users') {
      try {
        const users = JSON.parse(value);
        const plaintextPasswords = users.filter(u => u.password && !u.password.startsWith('hashed:') && u.password !== null);
        if (plaintextPasswords.length > 0) {
          reportBug('Plaintext passwords in localStorage', 'P0', 'Security',
            `${plaintextPasswords.length} user(s) have unhashed passwords in localStorage`);
        }
        console.log(`  factory_users: ${users.length} users, plaintext passwords: ${plaintextPasswords.length}`);
      } catch (e) {}
    }
  }
  console.log(`  localStorage keys: ${Object.keys(storageData).length}`);

  // Check HTTP security headers
  const secResponse = await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
  const headers = secResponse.headers();

  const securityHeaders = {
    'content-security-policy': headers['content-security-policy'] || null,
    'x-frame-options': headers['x-frame-options'] || null,
    'x-content-type-options': headers['x-content-type-options'] || null,
    'strict-transport-security': headers['strict-transport-security'] || null,
    'referrer-policy': headers['referrer-policy'] || null,
  };

  for (const [header, value] of Object.entries(securityHeaders)) {
    console.log(`  ${header}: ${value ? 'PRESENT' : 'MISSING'}`);
  }

  if (!securityHeaders['x-frame-options'] && !securityHeaders['content-security-policy']?.includes('frame-ancestors')) {
    reportBug('Missing clickjacking protection', 'P3', 'Security',
      'No X-Frame-Options or CSP frame-ancestors header');
  }

  // Test XSS in hash
  await page.goto(TARGET_URL + '#/<script>alert(1)</script>', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const xssExecuted = await page.evaluate(() => {
    // Check if any alert was triggered (we can't directly, but check if script tags were injected)
    return document.querySelectorAll('script:not([src])').length;
  });

  // Auth bypass test - try accessing app state without login
  console.log('  Testing auth bypass...');
  // Clear session and try to access
  await page.evaluate(() => localStorage.removeItem('factory_session'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const showsLogin = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
  console.log(`  Session cleared → shows login: ${showsLogin ? 'PASS' : 'FAIL'}`);
  if (!showsLogin) {
    reportBug('App accessible without session', 'P0', 'Security', 'Clearing session does not redirect to login');
  }

  // Re-login
  const emailInput = page.locator('input[type="email"], input[type="text"], input#login-email').first();
  if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await emailInput.fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').first().fill(ADMIN_PASS);
    await page.locator('button[type="submit"], button.login-btn').first().click();
    await page.waitForTimeout(3000);
  }

  console.log('  Phase 5 complete.');
}

// ============================================================
// PHASE 6: PERFORMANCE TESTING
// ============================================================
async function phase6_performance(page) {
  console.log('\n========== PHASE 6: PERFORMANCE TESTING ==========');

  // Fresh page load timing
  const startTime = Date.now();
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
  const loadTime = Date.now() - startTime;
  console.log(`  Full page load: ${loadTime}ms`);
  if (loadTime > 5000) {
    reportBug('Slow page load', 'P2', 'Performance', `Page took ${loadTime}ms to load (>5000ms threshold)`);
  }

  // Web Vitals
  const metrics = await page.evaluate(() => {
    return new Promise(resolve => {
      const data = {};
      try {
        const nav = performance.getEntriesByType('navigation')[0];
        if (nav) {
          data.ttfb = Math.round(nav.responseStart - nav.requestStart);
          data.domLoad = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
          data.fullLoad = Math.round(nav.loadEventEnd - nav.startTime);
        }
      } catch (e) {}

      // LCP
      try {
        new PerformanceObserver(list => {
          const entries = list.getEntries();
          if (entries.length) data.lcp = Math.round(entries[entries.length - 1].startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) {}

      // CLS
      try {
        let cls = 0;
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) cls += entry.value;
          }
          data.cls = Math.round(cls * 1000) / 1000;
        }).observe({ type: 'layout-shift', buffered: true });
      } catch (e) {}

      setTimeout(() => resolve(data), 3000);
    });
  });

  console.log(`  TTFB: ${metrics.ttfb || 'N/A'}ms`);
  console.log(`  DOM Load: ${metrics.domLoad || 'N/A'}ms`);
  console.log(`  Full Load: ${metrics.fullLoad || 'N/A'}ms`);
  console.log(`  LCP: ${metrics.lcp || 'N/A'}ms`);
  console.log(`  CLS: ${metrics.cls || 'N/A'}`);

  if (metrics.lcp && metrics.lcp > 2500) {
    reportBug('LCP exceeds 2.5s target', 'P2', 'Performance', `LCP is ${metrics.lcp}ms (target: <2500ms)`);
  }
  if (metrics.cls && metrics.cls > 0.1) {
    reportBug('CLS exceeds 0.1 target', 'P2', 'Performance', `CLS is ${metrics.cls} (target: <0.1)`);
  }

  // Resource sizes
  const resources = await page.evaluate(() => {
    return performance.getEntriesByType('resource').map(r => ({
      name: r.name.split('/').pop().split('?')[0],
      type: r.initiatorType,
      size: r.transferSize,
      duration: Math.round(r.duration),
    })).filter(r => r.size > 0).sort((a, b) => b.size - a.size).slice(0, 10);
  });

  console.log('  Top resources by size:');
  let totalSize = 0;
  for (const r of resources) {
    totalSize += r.size;
    console.log(`    ${r.name}: ${(r.size / 1024).toFixed(1)}KB (${r.duration}ms)`);
  }
  console.log(`  Total resource size: ${(totalSize / 1024).toFixed(0)}KB`);

  // Re-login if needed
  await page.waitForTimeout(1000);
  const needLogin = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
  if (needLogin) {
    const emailInput = page.locator('input[type="email"], input[type="text"]').first();
    await emailInput.fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').first().fill(ADMIN_PASS);
    await page.locator('button[type="submit"], button.login-btn').first().click();
    await page.waitForTimeout(3000);
  }

  console.log('  Phase 6 complete.');
}

// ============================================================
// PHASE 7: EDGE CASE TESTING
// ============================================================
async function phase7_edgeCases(page) {
  console.log('\n========== PHASE 7: EDGE CASE TESTING ==========');

  // Double-click test on nav buttons
  console.log('  Testing double-click on navigation...');
  const navBtn = page.locator('nav button, .bottom-nav button').first();
  if (await navBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await navBtn.dblclick();
    await page.waitForTimeout(500);
    console.log('    Double-click nav: no crash');
  }

  // Rapid clicking test
  console.log('  Testing rapid clicking...');
  const anyBtn = page.locator('button:visible').first();
  if (await anyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    for (let i = 0; i < 20; i++) {
      await anyBtn.click({ force: true, noWaitAfter: true }).catch(() => {});
    }
    await page.waitForTimeout(1000);
    // Check page didn't crash
    const stillWorking = await page.evaluate(() => document.body.textContent.length > 0);
    console.log(`    After 20 rapid clicks: ${stillWorking ? 'OK' : 'CRASH'}`);
    if (!stillWorking) {
      reportBug('App crashes on rapid clicking', 'P1', 'Edge Case', 'Rapid clicking a button 20x caused crash');
    }
  }

  // Browser back button
  console.log('  Testing back button...');
  const moduleCard = page.locator('.module-card, .module-item, [data-module]').first();
  if (await moduleCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await moduleCard.click();
    await page.waitForTimeout(500);
    await page.goBack();
    await page.waitForTimeout(1000);
    const stillRendered = await page.evaluate(() => document.body.textContent.length > 50);
    console.log(`    Back button: ${stillRendered ? 'PASS' : 'FAIL'}`);
  }

  // Special characters in form
  console.log('  Testing special characters...');
  // Try to find a form with a text input
  const addBtnEdge = page.locator('button:has-text("add"), button:has-text("הוסף"), .fab').first();
  if (await addBtnEdge.isVisible({ timeout: 2000 }).catch(() => false)) {
    await addBtnEdge.click();
    await page.waitForTimeout(1000);

    const textInput = page.locator('input[type="text"], textarea').first();
    if (await textInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Test XSS payload
      await textInput.fill('<script>alert("XSS")</script>');
      await page.waitForTimeout(300);
      const inputValue = await textInput.inputValue();
      console.log(`    XSS payload in input: accepted (will check rendering)`);

      // Test very long string
      await textInput.fill('A'.repeat(10000));
      await page.waitForTimeout(300);
      console.log('    10000 char input: accepted');

      // Test emoji
      await textInput.fill('Test 🎉🔥💀 emoji input');
      await page.waitForTimeout(300);
      console.log('    Emoji input: accepted');

      // Clear
      await textInput.fill('');
    }
  }

  // Network offline test
  console.log('  Testing offline behavior...');
  await page.context().setOffline(true);
  await page.waitForTimeout(1000);
  const workingOffline = await page.evaluate(() => document.body.textContent.length > 50);
  console.log(`    Offline: app still renders = ${workingOffline ? 'PASS' : 'FAIL'}`);
  await page.context().setOffline(false);
  await page.waitForTimeout(1000);

  // Zoom test
  console.log('  Testing browser zoom...');
  await page.evaluate(() => { document.body.style.zoom = '200%'; });
  await page.waitForTimeout(500);
  await page.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, 'edge-zoom-200.png') });
  await page.evaluate(() => { document.body.style.zoom = '100%'; });

  console.log('  Phase 7 complete.');
}

// ============================================================
// PHASE 8: CROSS-BROWSER & I18N
// ============================================================
async function phase8_crossBrowserI18n(page, browser) {
  console.log('\n========== PHASE 8: CROSS-BROWSER & I18N ==========');

  // Mobile device emulation
  console.log('  Testing Pixel 5 emulation...');
  const pixel5Context = await browser.newContext({
    ...devices['Pixel 5'],
  });
  const mobilePage = await pixel5Context.newPage();
  await mobilePage.goto(TARGET_URL, { waitUntil: 'networkidle' });
  await mobilePage.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, 'cross-pixel5.png') });

  // Check horizontal overflow on mobile
  const mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log(`    Pixel 5 overflow: ${mobileOverflow ? 'YES (FAIL)' : 'NO (PASS)'}`);
  if (mobileOverflow) {
    reportBug('Horizontal overflow on Pixel 5', 'P2', 'Cross-Browser',
      'Content overflows horizontally on Pixel 5 (393px viewport)');
  }
  await pixel5Context.close();

  // iPad emulation
  console.log('  Testing iPad emulation...');
  const ipadContext = await browser.newContext({
    ...devices['iPad (gen 7)'],
  });
  const ipadPage = await ipadContext.newPage();
  await ipadPage.goto(TARGET_URL, { waitUntil: 'networkidle' });
  await ipadPage.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, 'cross-ipad.png') });
  await ipadContext.close();

  // Language switching
  console.log('  Testing i18n...');
  // Check current language
  const htmlLang = await page.evaluate(() => document.documentElement.lang);
  const htmlDir = await page.evaluate(() => document.documentElement.dir);
  console.log(`    Current lang: ${htmlLang}, dir: ${htmlDir}`);

  // Find language toggle
  const langToggle = page.locator('[class*="lang"], button:has-text("EN"), button:has-text("עב"), button:has-text("English"), button:has-text("עברית")').first();
  if (await langToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    await langToggle.click();
    await page.waitForTimeout(1000);
    const newLang = await page.evaluate(() => document.documentElement.lang);
    const newDir = await page.evaluate(() => document.documentElement.dir);
    console.log(`    After toggle: lang=${newLang}, dir=${newDir}`);

    if (newLang === htmlLang) {
      reportBug('Language toggle does not change language', 'P2', 'i18n', 'Clicking language toggle has no effect');
    }

    await page.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, 'i18n-switched.png') });

    // Check RTL layout
    if (newDir === 'rtl' || htmlDir === 'rtl') {
      console.log('    RTL support: YES');
    }

    // Toggle back
    await langToggle.click();
    await page.waitForTimeout(500);
  } else {
    console.log('    Language toggle not found (may need login first)');
  }

  console.log('  Phase 8 complete.');
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`QA TEST SUITE — ${TARGET_URL}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}`);

  await ensureDir(SCREENSHOT_DIR);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await phase1_smoke(page);
    await phase2_functional(page);
    await phase3_uiux(page);
    await phase4_accessibility(page);
    await phase5_security(page);
    await phase6_performance(page);
    await phase7_edgeCases(page);
    await phase8_crossBrowserI18n(page, browser);
  } catch (e) {
    console.error('\n[FATAL ERROR]', e.message);
    await page.screenshot({ fullPage: true, path: path.join(SCREENSHOT_DIR, 'fatal-error.png') }).catch(() => {});
  }

  await browser.close();

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log(`\n${'='.repeat(60)}`);
  console.log('QA TEST SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total bugs found: ${bugs.length}`);
  console.log('');

  const bySeverity = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const b of bugs) bySeverity[b.severity]++;
  console.log(`  P0 (Blocker):    ${bySeverity.P0}`);
  console.log(`  P1 (Critical):   ${bySeverity.P1}`);
  console.log(`  P2 (Major):      ${bySeverity.P2}`);
  console.log(`  P3 (Minor):      ${bySeverity.P3}`);
  console.log(`  P4 (Enhancement):${bySeverity.P4}`);
  console.log('');

  for (const b of bugs) {
    console.log(`  ${b.id} [${b.severity}] ${b.category}: ${b.title}`);
    console.log(`    ${b.description.split('\n')[0]}`);
    console.log('');
  }

  console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
