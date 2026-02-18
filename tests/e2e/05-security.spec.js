// ============================================================
// Security Tests: Access control, injection, session
// ============================================================
const { test, expect } = require('@playwright/test');
const { freshApp, loginAsWorker, loginAsManager, loginAsAdmin } = require('./helpers');

test.describe('Security: Session Management', () => {
  test('cannot access app without login', async ({ page }) => {
    await freshApp(page);
    await expect(page.locator('#login-btn')).toBeVisible();
    await expect(page.locator('.app-header')).not.toBeVisible();
  });

  test('clearing session redirects to login', async ({ page }) => {
    await freshApp(page);
    await page.fill('#login-user', 'admin');
    await page.fill('#login-pass', 'admin123');
    await page.click('#login-btn');
    await expect(page.locator('.app-header')).toBeVisible();

    // Simulate session expiry by clearing localStorage session
    await page.evaluate(() => localStorage.removeItem('factory_session'));
    await page.reload();
    await expect(page.locator('#login-btn')).toBeVisible();
  });
});

test.describe('Security: Permission Enforcement', () => {
  test('worker cannot access backoffice via URL manipulation', async ({ page }) => {
    await freshApp(page);
    await loginAsWorker(page);
    // Attempt to manually trigger backoffice render
    const result = await page.evaluate(() => {
      if (typeof hasPermission === 'function') {
        return hasPermission('canAccessBackoffice');
      }
      return 'n/a';
    });
    expect(result).toBe(false);
  });

  test('worker cannot delete records', async ({ page }) => {
    await freshApp(page);
    await loginAsWorker(page);
    const canDelete = await page.evaluate(() => {
      if (typeof hasPermission === 'function') {
        return hasPermission('canDeleteRecords');
      }
      return 'n/a';
    });
    expect(canDelete).toBe(false);
  });

  test('worker cannot export data', async ({ page }) => {
    await freshApp(page);
    await loginAsWorker(page);
    const canExport = await page.evaluate(() => {
      if (typeof hasPermission === 'function') {
        return hasPermission('canExportData');
      }
      return 'n/a';
    });
    expect(canExport).toBe(false);
  });
});

test.describe('Security: Input Handling', () => {
  test('login error message does not execute scripts', async ({ page }) => {
    await freshApp(page);
    // Fill with XSS-like input
    await page.fill('#login-user', '<script>alert(1)</script>');
    await page.fill('#login-pass', 'whatever');
    await page.click('#login-btn');
    // Should show error text, not execute script
    const errorText = await page.locator('#login-error').textContent();
    expect(errorText).not.toContain('<script>');
    await expect(page.locator('.app-header')).not.toBeVisible();
  });

  test('duplicate username is rejected during signup', async ({ page }) => {
    await freshApp(page);
    await page.click('#go-signup');
    await page.fill('#signup-name', 'Admin Copy');
    await page.fill('#signup-user', 'admin');
    await page.fill('#signup-pass', 'pass1234');
    await page.fill('#signup-pass2', 'pass1234');
    await page.selectOption('#signup-role', 'worker');
    await page.click('#signup-btn');
    await expect(page.locator('#signup-error')).not.toBeEmpty();
  });
});

test.describe('Security: Backward Compatibility', () => {
  test('app handles empty localStorage gracefully', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#login-btn')).toBeVisible();
  });

  test('app recovers from corrupted session data', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('factory_session', '{invalid json}');
    });
    await page.reload();
    // Should gracefully show login rather than crashing
    await expect(page.locator('#login-btn')).toBeVisible();
  });

  test('app recovers from corrupted user data', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('factory_users', '{invalid json}');
    });
    await page.reload();
    // getUsers() falls back to defaults on parse error
    await expect(page.locator('#login-btn')).toBeVisible();
  });
});
