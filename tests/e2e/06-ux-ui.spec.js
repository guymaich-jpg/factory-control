// ============================================================
// UX / UI Tests: Navigation, responsive, accessibility basics
// ============================================================
const { test, expect } = require('@playwright/test');
const { freshApp, loginAsAdmin, loginAsManager } = require('./helpers');

// ============================================================
// Navigation
// ============================================================
test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    await loginAsAdmin(page);
  });

  test('all module cards on dashboard are clickable', async ({ page }) => {
    const cards = page.locator('.module-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    await cards.first().click();
    await expect(page.locator('.screen-content')).toBeVisible();
  });

  test('form exit navigation (back and cancel)', async ({ page }) => {
    await page.click('[data-nav="receiving"]');
    // Back from form → list
    await page.click('.fab-add');
    await expect(page.locator('#form-save')).toBeVisible();
    await page.click('#header-back');
    await expect(page.locator('.fab-add')).toBeVisible();

    // Cancel from form → list
    await page.click('.fab-add');
    await page.click('#form-cancel');
    await expect(page.locator('.fab-add')).toBeVisible();
  });

  test('back button from list returns to dashboard', async ({ page }) => {
    await page.click('[data-nav="receiving"]');
    await page.click('#header-back');
    await expect(page.locator('.module-grid')).toBeVisible();
  });
});

// ============================================================
// Screen Transitions — desktop only
// ============================================================
test.describe('Screen Transitions', () => {
  test.beforeEach(async ({ page, browserName }, testInfo) => {
    test.skip(testInfo.project.name === 'Mobile Chrome', 'Desktop only — CSS animations');
    await freshApp(page);
    await loginAsAdmin(page);
  });

  test('directional animation on forward, back, and cancel', async ({ page }) => {
    // Forward
    await page.click('.module-card >> nth=0');
    await expect(page.locator('#screen-content')).toHaveClass(/nav-forward/);

    // Back
    await page.click('#header-back');
    await expect(page.locator('#screen-content')).toHaveClass(/nav-back/);

    // Tab switch — no directional animation
    await page.click('[data-nav="production"]');
    const tabs = page.locator('.tab-btn');
    if (await tabs.count() > 1) {
      await tabs.nth(1).click();
      const cls = await page.locator('#screen-content').getAttribute('class');
      expect(cls).not.toContain('nav-forward');
      expect(cls).not.toContain('nav-back');
    }

    // Cancel animates back
    await page.click('[data-nav="receiving"]');
    await page.click('.fab-add');
    await page.click('#form-cancel');
    await expect(page.locator('#screen-content')).toHaveClass(/nav-back/);
  });
});

// ============================================================
// Dashboard UI — desktop only
// ============================================================
test.describe('Dashboard UI', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'Mobile Chrome', 'Desktop only — dashboard layout');
    await freshApp(page);
    await loginAsAdmin(page);
  });

  test('dashboard shows correct stat and module card counts', async ({ page }) => {
    await expect(page.locator('.stat-card')).toHaveCount(3);
    await expect(page.locator('.module-card')).toHaveCount(7);
    await expect(page.locator('.mc-count').first()).toBeVisible();
  });

  test('third stat card shows pending approvals dynamically', async ({ page }) => {
    const thirdStatNum = page.locator('.stat-card >> nth=2 >> .stat-num');
    const text = await thirdStatNum.textContent();
    expect(Number(text)).toBeGreaterThanOrEqual(0);
    const thirdStatLabel = page.locator('.stat-card >> nth=2 >> .stat-label');
    const labelText = await thirdStatLabel.textContent();
    expect(labelText.toLowerCase()).not.toContain('modules');
  });

  test('recent activity: appears and navigates to detail', async ({ page }) => {
    // Add a record
    await page.click('[data-nav="receiving"]');
    await page.click('.fab-add');
    await page.selectOption('#field-supplier', { index: 1 });
    await page.selectOption('#field-category', 'rm_cat_spices');
    await page.waitForTimeout(300);
    await page.selectOption('#field-item', { index: 1 });
    await page.fill('#field-weight', '5');
    await page.click('#form-save');
    await page.waitForTimeout(500);

    // Go to dashboard — activity should appear
    await page.click('[data-nav="dashboard"]');
    await expect(page.locator('.recent-activity-item').first()).toBeVisible();

    // Click recent item → detail
    await page.click('.recent-activity-item >> nth=0');
    await expect(page.locator('.detail-card')).toBeVisible();
  });
});

// ============================================================
// Form Validation — desktop only
// ============================================================
test.describe('Form Validation', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'Mobile Chrome', 'Desktop only — form logic');
    await freshApp(page);
    await loginAsManager(page);
  });

  test('inline errors appear and clear on valid re-save', async ({ page }) => {
    await page.click('[data-nav="receiving"]');
    await page.click('.fab-add');
    await page.click('#form-save');

    // Error styling and messages appear
    expect(await page.locator('.field-error').count()).toBeGreaterThan(0);
    expect(await page.locator('.field-error-msg').count()).toBeGreaterThan(0);

    // Fill required fields → errors clear
    await page.selectOption('#field-supplier', { index: 1 });
    await page.selectOption('#field-category', 'rm_cat_spices');
    await page.waitForTimeout(300);
    await page.selectOption('#field-item', { index: 1 });
    await page.fill('#field-weight', '5');
    await page.click('#form-save');
    await expect(page.locator('.field-error')).toHaveCount(0);
  });
});

// ============================================================
// Toast Notifications — desktop only
// ============================================================
test.describe('Toast Notifications', () => {
  test('save shows success toast', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'Mobile Chrome', 'Desktop only');
    await freshApp(page);
    await loginAsManager(page);
    await page.click('[data-nav="receiving"]');
    await page.click('.fab-add');
    await page.selectOption('#field-supplier', { index: 1 });
    await page.selectOption('#field-category', 'rm_cat_spices');
    await page.waitForTimeout(300);
    await page.selectOption('#field-item', { index: 1 });
    await page.fill('#field-weight', '5');
    await page.click('#form-save');
    await expect(page.locator('.toast.show')).toBeVisible({ timeout: 3000 });
  });
});

// ============================================================
// Responsive / Mobile
// ============================================================
test.describe('Responsive / Mobile', () => {
  test('login form is usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await freshApp(page);
    await expect(page.locator('#login-user')).toBeVisible();
    await expect(page.locator('#login-pass')).toBeVisible();
    await expect(page.locator('#login-btn')).toBeVisible();
  });

  test('bottom nav visible and touch targets adequate', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await freshApp(page);
    await loginAsAdmin(page);
    await expect(page.locator('.bottom-nav')).toBeVisible();

    // Header button touch target
    const logoutHeight = await page.locator('#logout-btn').evaluate(el => el.getBoundingClientRect().height);
    expect(logoutHeight).toBeGreaterThanOrEqual(36);

    // Form input/button touch targets
    await page.click('[data-nav="receiving"]');
    await page.click('.fab-add');
    await page.waitForSelector('#field-weight');
    const inputHeight = await page.locator('#field-weight').evaluate(el =>
      el.offsetHeight || parseInt(window.getComputedStyle(el).minHeight) || 0
    );
    expect(inputHeight).toBeGreaterThanOrEqual(48);
    const btnHeight = await page.locator('#form-save').evaluate(el =>
      el.offsetHeight || parseInt(window.getComputedStyle(el).minHeight) || 0
    );
    expect(btnHeight).toBeGreaterThanOrEqual(48);
  });

  test('viewport allows user zoom (accessibility)', async ({ page }) => {
    await freshApp(page);
    const viewport = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta ? meta.getAttribute('content') : '';
    });
    expect(viewport).not.toContain('user-scalable=no');
    expect(viewport).not.toContain('maximum-scale=1.0');
  });
});

// ============================================================
// App Internals — desktop only (pure JS checks)
// ============================================================
test.describe('App Internals', () => {
  test('scheduleHardRefresh and scroll state exist', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'Mobile Chrome', 'Desktop only — JS internals');
    await freshApp(page);
    await loginAsAdmin(page);
    expect(await page.evaluate(() => typeof scheduleHardRefresh === 'function')).toBe(true);
    expect(await page.evaluate(() => typeof _scrollPositions === 'object')).toBe(true);
  });
});

// ============================================================
// CSS Consistency — desktop only
// ============================================================
test.describe('CSS Consistency', () => {
  test('stat cards have correct border-radius and box-shadow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'Mobile Chrome', 'Desktop only — CSS checks');
    await freshApp(page);
    await loginAsAdmin(page);
    const statRadius = await page.locator('.stat-card >> nth=0').evaluate(el =>
      getComputedStyle(el).borderRadius
    );
    expect(statRadius).toBe('12px');
    const shadow = await page.locator('.stat-card >> nth=0').evaluate(el =>
      getComputedStyle(el).boxShadow
    );
    expect(shadow).not.toBe('none');
  });
});

// ============================================================
// i18n Keys — desktop only (pure JS checks)
// ============================================================
test.describe('i18n New Keys', () => {
  test('all new i18n keys exist in every language', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'Mobile Chrome', 'Desktop only — i18n keys');
    await freshApp(page);
    const keys = ['pendingApprovals', 'recentActivity', 'tapPlusToAdd'];
    const result = await page.evaluate((ks) => {
      return ks.map(k => ({
        key: k,
        en: !!I18N.en[k],
        he: !!I18N.he[k],
        th: !!I18N.th[k],
      }));
    }, keys);
    for (const r of result) {
      expect(r.en, `${r.key} missing in en`).toBe(true);
      expect(r.he, `${r.key} missing in he`).toBe(true);
      expect(r.th, `${r.key} missing in th`).toBe(true);
    }
  });
});
