// ============================================================
// i18n Tests: Language switching Hebrew ↔ Thai
// ============================================================
const { test, expect } = require('@playwright/test');
const { freshApp } = require('./helpers');

test.describe('Language: Hebrew (default)', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('default language is Hebrew', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('בקרת מפעל');
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');
  });

  test('login subtitle is in Hebrew', async ({ page }) => {
    await expect(page.locator('p').first()).toContainText('תיעוד ייצור אלכוהול');
  });
});

test.describe('Language Toggle: Hebrew → Thai', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('toggles to Thai when clicking lang button', async ({ page }) => {
    await page.click('.login-lang-toggle');
    await expect(page.locator('h1')).toContainText('ระบบควบคุมโรงงาน');
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('ltr');
  });

  test('Thai toggles back to Hebrew', async ({ page }) => {
    await page.click('.login-lang-toggle'); // → Thai
    await page.click('.login-lang-toggle'); // → Hebrew
    await expect(page.locator('h1')).toContainText('בקרת מפעל');
  });

  test('language preference persists after reload', async ({ page }) => {
    await page.click('.login-lang-toggle'); // → Thai
    await page.reload();
    await expect(page.locator('h1')).toContainText('ระบบควบคุมโรงงาน');
  });
});

test.describe('Language in app (logged in)', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    await page.fill('#login-user', 'admin');
    await page.fill('#login-pass', 'admin123');
    await page.click('#login-btn');
    await expect(page.locator('.app-header')).toBeVisible();
  });

  test('dashboard is in Hebrew', async ({ page }) => {
    await expect(page.locator('.welcome-card h2')).toContainText('ברוך הבא');
  });

  test('can toggle to Thai inside app', async ({ page }) => {
    await page.click('.lang-btn');
    await expect(page.locator('.welcome-card h2')).toContainText('ยินดีต้อนรับ');
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('ltr');
  });

  test('all nav labels translate to Thai', async ({ page }) => {
    await page.click('.lang-btn');
    await expect(page.locator('[data-nav="dashboard"]')).toContainText('แดชบอร์ด');
    await expect(page.locator('[data-nav="receiving"]')).toContainText('การรับของ');
    await expect(page.locator('[data-nav="production"]')).toContainText('การผลิต');
    await expect(page.locator('[data-nav="bottling"]')).toContainText('การบรรจุขวด');
    await expect(page.locator('[data-nav="inventory"]')).toContainText('คลังสินค้า');
  });
});
