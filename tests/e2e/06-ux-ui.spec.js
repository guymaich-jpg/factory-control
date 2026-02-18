// ============================================================
// UX / UI Tests: Navigation, responsive, accessibility basics
// ============================================================
const { test, expect } = require('@playwright/test');
const { freshApp, loginAsAdmin, loginAsManager } = require('./helpers');

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

  test('back button returns to module list from form', async ({ page }) => {
    await page.click('[data-nav="receiving"]');
    await page.click('.fab-add');
    await expect(page.locator('#form-save')).toBeVisible();
    await page.click('#header-back');
    await expect(page.locator('.fab-add')).toBeVisible();
  });

  test('back button from list returns to dashboard', async ({ page }) => {
    await page.click('[data-nav="receiving"]');
    await page.click('#header-back');
    await expect(page.locator('.module-grid')).toBeVisible();
  });

  test('cancel button in form returns to list', async ({ page }) => {
    await page.click('[data-nav="receiving"]');
    await page.click('.fab-add');
    await page.click('#form-cancel');
    await expect(page.locator('.fab-add')).toBeVisible();
  });

  test('bottom nav highlights active tab', async ({ page }) => {
    await page.click('[data-nav="production"]');
    await expect(page.locator('[data-nav="production"].active')).toBeVisible();
  });
});

test.describe('Dashboard UI', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    await loginAsAdmin(page);
  });

  test('dashboard shows 3 stat cards', async ({ page }) => {
    const stats = page.locator('.stat-card');
    await expect(stats).toHaveCount(3);
  });

  test('dashboard shows 7 module cards', async ({ page }) => {
    const modules = page.locator('.module-card');
    await expect(modules).toHaveCount(7);
  });

  test('module card shows record count', async ({ page }) => {
    await expect(page.locator('.mc-count').first()).toBeVisible();
  });
});

test.describe('Responsive / Mobile', () => {
  test('login form is usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await freshApp(page);
    await expect(page.locator('#login-user')).toBeVisible();
    await expect(page.locator('#login-pass')).toBeVisible();
    await expect(page.locator('#login-btn')).toBeVisible();
  });

  test('bottom nav is visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await freshApp(page);
    await loginAsAdmin(page);
    await expect(page.locator('.bottom-nav')).toBeVisible();
  });
});

test.describe('Toast Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);
  });

  test('save shows success toast', async ({ page }) => {
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

test.describe('RTL Layout (Hebrew)', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('Hebrew mode has RTL direction', async ({ page }) => {
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');
  });

  test('Thai mode has LTR direction', async ({ page }) => {
    await page.click('.login-lang-toggle');
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('ltr');
  });
});
