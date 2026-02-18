// ============================================================
// Auth Tests: Login, Logout, Sign Up, Session
// ============================================================
const { test, expect } = require('@playwright/test');
const { freshApp, loginAsAdmin, loginAsManager, loginAsWorker, logout } = require('./helpers');

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('shows Hebrew login screen by default', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('בקרת מפעל');
  });

  test('rejects wrong password', async ({ page }) => {
    await page.fill('#login-user', 'admin');
    await page.fill('#login-pass', 'wrongpassword');
    await page.click('#login-btn');
    await expect(page.locator('#login-error')).not.toBeEmpty();
    await expect(page.locator('.app-header')).not.toBeVisible();
  });

  test('rejects empty credentials', async ({ page }) => {
    await page.click('#login-btn');
    await expect(page.locator('.app-header')).not.toBeVisible();
  });

  test('admin can login', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator('.app-header')).toBeVisible();
    await expect(page.locator('.user-badge')).toBeVisible();
  });

  test('manager can login', async ({ page }) => {
    await loginAsManager(page);
    await expect(page.locator('.app-header')).toBeVisible();
  });

  test('worker can login', async ({ page }) => {
    await loginAsWorker(page);
    await expect(page.locator('.app-header')).toBeVisible();
  });

  test('logout clears session and returns to login', async ({ page }) => {
    await loginAsAdmin(page);
    await logout(page);
    await expect(page.locator('#login-btn')).toBeVisible();
    await expect(page.locator('.app-header')).not.toBeVisible();
  });

  test('Enter key submits login form', async ({ page }) => {
    await page.fill('#login-user', 'admin');
    await page.fill('#login-pass', 'admin123');
    await page.press('#login-pass', 'Enter');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 5000 });
  });

  test('can sign up a new user', async ({ page }) => {
    await page.click('#go-signup');
    await expect(page.locator('#signup-btn')).toBeVisible();
    await page.fill('#signup-name', 'Test User');
    await page.fill('#signup-user', 'testuser_e2e');
    await page.fill('#signup-pass', 'pass1234');
    await page.fill('#signup-pass2', 'pass1234');
    await page.selectOption('#signup-role', 'worker');
    await page.click('#signup-btn');
    await expect(page.locator('#signup-success')).not.toBeEmpty();
  });

  test('sign up rejects short password', async ({ page }) => {
    await page.click('#go-signup');
    await page.fill('#signup-name', 'Test User');
    await page.fill('#signup-user', 'shortpwduser');
    await page.fill('#signup-pass', '12');
    await page.fill('#signup-pass2', '12');
    await page.selectOption('#signup-role', 'worker');
    await page.click('#signup-btn');
    await expect(page.locator('#signup-error')).not.toBeEmpty();
  });

  test('sign up rejects mismatched passwords', async ({ page }) => {
    await page.click('#go-signup');
    await page.fill('#signup-name', 'Test User');
    await page.fill('#signup-user', 'mismatchuser');
    await page.fill('#signup-pass', 'pass1234');
    await page.fill('#signup-pass2', 'pass9999');
    await page.selectOption('#signup-role', 'worker');
    await page.click('#signup-btn');
    await expect(page.locator('#signup-error')).not.toBeEmpty();
  });

  test('session persists on page reload', async ({ page }) => {
    await loginAsAdmin(page);
    await page.reload();
    await expect(page.locator('.app-header')).toBeVisible();
  });
});
