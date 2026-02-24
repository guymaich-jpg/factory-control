// Shared helpers for all e2e tests
const { expect } = require('@playwright/test');

// Test users — seeded into localStorage for manager/worker tests
const TEST_MANAGER = {
  username: 'testmanager',
  password: 'manager123',
  email: 'testmanager@test.com',
  role: 'manager',
  name: 'Test Manager',
  nameHe: 'מנהל בדיקה',
  status: 'active',
};

const TEST_WORKER = {
  username: 'testworker',
  password: 'Worker123',
  email: 'testworker@test.com',
  role: 'worker',
  name: 'Test Worker',
  nameHe: 'עובד בדיקה',
  status: 'active',
};

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
 * Seed test manager and worker users into localStorage (after freshApp)
 */
async function seedTestUsers(page) {
  await page.evaluate(([mgr, wrk]) => {
    const existing = JSON.parse(localStorage.getItem('factory_users') || 'null') || [];
    const toAdd = [mgr, wrk].filter(u => !existing.find(e => e.username === u.username));
    localStorage.setItem('factory_users', JSON.stringify([...existing, ...toAdd]));
  }, [TEST_MANAGER, TEST_WORKER]);
}

/**
 * Login with given credentials (email or username)
 */
async function login(page, emailOrUser = 'guymaich@gmail.com', password = 'Guy12345') {
  await page.fill('#login-user', emailOrUser);
  await page.fill('#login-pass', password);
  await page.click('#login-btn');
  await expect(page.locator('.app-header')).toBeVisible({ timeout: 5000 });
}

/**
 * Login as admin (full access) — uses hardcoded owner account
 */
async function loginAsAdmin(page) {
  return login(page, 'guymaich@gmail.com', 'Guy12345');
}

/**
 * Login as manager — seeds test manager user first
 */
async function loginAsManager(page) {
  await seedTestUsers(page);
  return login(page, TEST_MANAGER.email, TEST_MANAGER.password);
}

/**
 * Login as worker — seeds test worker user first
 */
async function loginAsWorker(page) {
  await seedTestUsers(page);
  return login(page, TEST_WORKER.email, TEST_WORKER.password);
}

/**
 * Logout
 */
async function logout(page) {
  await page.click('#logout-btn');
  await expect(page.locator('#login-btn')).toBeVisible({ timeout: 3000 });
}

module.exports = {
  freshApp, login, loginAsAdmin, loginAsManager, loginAsWorker, logout, seedTestUsers,
  TEST_MANAGER, TEST_WORKER,
};
