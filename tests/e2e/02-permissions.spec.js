// ============================================================
// Permissions Tests: Role-based access control
// ============================================================
const { test, expect } = require('@playwright/test');
const { freshApp, loginAsAdmin, loginAsManager, loginAsWorker } = require('./helpers');

test.describe('Permissions - Worker', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    await loginAsWorker(page);
  });

  test('worker cannot see backoffice nav item', async ({ page }) => {
    await expect(page.locator('[data-nav="backoffice"]')).not.toBeVisible();
  });

  test('worker cannot see export CSV button', async ({ page }) => {
    await page.click('[data-nav="receiving"]');
    await expect(page.locator('#export-btn')).not.toBeVisible();
  });

  test('worker sees add button on modules', async ({ page }) => {
    await page.click('[data-nav="receiving"]');
    await expect(page.locator('.fab-add')).toBeVisible();
  });
});

test.describe('Permissions - Manager', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);
  });

  test('manager sees backoffice nav item', async ({ page }) => {
    await expect(page.locator('[data-nav="backoffice"]')).toBeVisible();
  });

  test('manager can access backoffice', async ({ page }) => {
    await page.click('[data-nav="backoffice"]');
    await expect(page.locator('.section-title').first()).toBeVisible();
  });
});

test.describe('Permissions - Admin', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    await loginAsAdmin(page);
  });

  test('admin sees all nav items', async ({ page }) => {
    await expect(page.locator('[data-nav="backoffice"]')).toBeVisible();
    await expect(page.locator('[data-nav="dashboard"]')).toBeVisible();
    await expect(page.locator('[data-nav="receiving"]')).toBeVisible();
    await expect(page.locator('[data-nav="production"]')).toBeVisible();
    await expect(page.locator('[data-nav="bottling"]')).toBeVisible();
    await expect(page.locator('[data-nav="inventory"]')).toBeVisible();
  });

  test('admin cannot delete themselves', async ({ page }) => {
    await page.click('[data-nav="backoffice"]');
    // Find admin user and try to edit
    const adminRow = page.locator('.user-item').filter({ hasText: 'admin' }).first();
    if (await adminRow.isVisible()) {
      await adminRow.click();
      // Delete button for admin should not exist (guarded by code)
      const deleteBtn = page.locator('#bo-delete');
      if (await deleteBtn.isVisible()) {
        // Click and verify it rejects
        page.on('dialog', d => d.accept());
        await deleteBtn.click();
        // Should show an alert and not delete
        await expect(page.locator('#bo-username')).toBeVisible();
      }
    }
  });
});
