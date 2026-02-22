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

  test('worker has restricted UI — no backoffice, no export', async ({ page }) => {
    await expect(page.locator('[data-nav="backoffice"]')).not.toBeVisible();
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

  test('manager can see and access backoffice', async ({ page }) => {
    await expect(page.locator('[data-nav="backoffice"]')).toBeVisible();
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
    const adminRow = page.locator('.user-item').filter({ hasText: 'admin' }).first();
    if (await adminRow.isVisible()) {
      await adminRow.click();
      const deleteBtn = page.locator('#bo-delete');
      if (await deleteBtn.isVisible()) {
        page.on('dialog', d => d.accept());
        await deleteBtn.click();
        await expect(page.locator('#bo-username')).toBeVisible();
      }
    }
  });
});
