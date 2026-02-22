// ============================================================
// i18n Tests: Language switching Hebrew ↔ Thai
// ============================================================
const { test, expect } = require('@playwright/test');
const { freshApp } = require('./helpers');

test.describe('Language: Login screen', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('default language is Hebrew with correct content', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('בקרת מפעל');
    await expect(page.locator('p').first()).toContainText('תיעוד ייצור אלכוהול');
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');
  });

  test('language toggles between Hebrew and Thai with persistence', async ({ page }) => {
    // Toggle to Thai
    await page.click('.login-lang-toggle');
    await expect(page.locator('h1')).toContainText('ระบบควบคุมโรงงาน');
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr');

    // Toggle back to Hebrew
    await page.click('.login-lang-toggle');
    await expect(page.locator('h1')).toContainText('בקרת מפעל');

    // Persistence — switch to Thai and reload
    await page.click('.login-lang-toggle');
    await page.reload();
    await expect(page.locator('h1')).toContainText('ระบบควบคุมโรงงาน');
  });
});

test.describe('Language: In-app', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    await page.fill('#login-user', 'guymaich@gmail.com');
    await page.fill('#login-pass', 'Guy1234');
    await page.click('#login-btn');
    await expect(page.locator('.app-header')).toBeVisible();
  });

  test('in-app language switching and nav translation', async ({ page }) => {
    // Hebrew by default
    await expect(page.locator('.welcome-card h2')).toContainText('ברוך הבא');

    // Switch to Thai
    await page.click('.lang-btn');
    await expect(page.locator('.welcome-card h2')).toContainText('ยินดีต้อนรับ');
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr');

    // All nav labels translated
    await expect(page.locator('[data-nav="dashboard"]')).toContainText('แดชบอร์ด');
    await expect(page.locator('[data-nav="receiving"]')).toContainText('การรับของ');
    await expect(page.locator('[data-nav="production"]')).toContainText('การผลิต');
    await expect(page.locator('[data-nav="bottling"]')).toContainText('การบรรจุขวด');
    await expect(page.locator('[data-nav="inventory"]')).toContainText('คลังสินค้า');
  });
});
