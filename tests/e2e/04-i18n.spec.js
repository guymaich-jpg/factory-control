// ============================================================
// i18n Tests: Language switching Hebrew ↔ Thai
// ============================================================
const { test, expect } = require('@playwright/test');
const { freshApp, seedTestUsers, TEST_ADMIN } = require('./helpers');

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

  test('language cycles Hebrew → English → Thai → Hebrew with persistence', async ({ page }) => {
    // Hebrew is the default
    await expect(page.locator('h1')).toContainText('בקרת מפעל');

    // Toggle 1 → English (LTR)
    await page.click('.login-lang-toggle');
    await expect(page.locator('h1')).toContainText('Factory Control');
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr');

    // Toggle 2 → Thai (LTR)
    await page.click('.login-lang-toggle');
    await expect(page.locator('h1')).toContainText('ระบบควบคุมโรงงาน');

    // Toggle 3 → back to Hebrew (RTL)
    await page.click('.login-lang-toggle');
    await expect(page.locator('h1')).toContainText('בקרת מפעל');
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');

    // Persistence — switch to English and reload
    await page.click('.login-lang-toggle');
    await page.reload();
    await expect(page.locator('h1')).toContainText('Factory Control');
  });
});

test.describe('Language: In-app', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    // Use CI test account (owner accounts require Firebase Auth, unavailable in CI)
    await seedTestUsers(page);
    await page.fill('#login-user', TEST_ADMIN.email);
    await page.fill('#login-pass', TEST_ADMIN.password);
    await page.click('#login-btn');
    await expect(page.locator('.app-header')).toBeVisible();
  });

  test('in-app language switching and nav translation', async ({ page }) => {
    // Hebrew by default
    await expect(page.locator('.welcome-card h2')).toContainText('ברוך הבא');

    // Toggle 1 → English (verifies the C6 fix: English is reachable + complete)
    await page.click('.lang-btn');
    await expect(page.locator('.welcome-card h2')).toContainText('Welcome');
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr');

    // All nav labels translated to English (inventory nav item removed in
    // v2.11.0 — see #114; spiritStock replaces it in this list)
    await expect(page.locator('[data-nav="home"]')).toContainText('Home');
    await expect(page.locator('[data-nav="receiving"]')).toContainText('Receiving');
    await expect(page.locator('[data-nav="production"]')).toContainText('Production');
    await expect(page.locator('[data-nav="spiritStock"]')).toContainText('Spirit');
    await expect(page.locator('[data-nav="bottling"]')).toContainText('Bottling');
  });
});
