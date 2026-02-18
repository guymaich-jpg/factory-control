// Shared helpers for all e2e tests
const { expect } = require('@playwright/test');

/**
 * Clear app state (localStorage) and navigate to the app
 */
async function freshApp(page) {
  await page.goto('/');
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter(k => k.startsWith('factory_'))
      .forEach(k => localStorage.removeItem(k));
  });
  await page.reload();
}

/**
 * Login with given credentials
 */
async function login(page, username = 'admin', password = 'admin123') {
  await page.fill('#login-user', username);
  await page.fill('#login-pass', password);
  await page.click('#login-btn');
  await expect(page.locator('.app-header')).toBeVisible({ timeout: 5000 });
}

/**
 * Login as admin (full access)
 */
async function loginAsAdmin(page) {
  return login(page, 'admin', 'admin123');
}

/**
 * Login as manager
 */
async function loginAsManager(page) {
  return login(page, 'manager', 'manager123');
}

/**
 * Login as worker
 */
async function loginAsWorker(page) {
  return login(page, 'worker1', 'worker123');
}

/**
 * Logout
 */
async function logout(page) {
  await page.click('#logout-btn');
  await expect(page.locator('#login-btn')).toBeVisible({ timeout: 3000 });
}

module.exports = { freshApp, login, loginAsAdmin, loginAsManager, loginAsWorker, logout };
