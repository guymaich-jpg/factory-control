// ============================================================
// Module Tests: CRUD for all production modules
// ============================================================
const { test, expect } = require('@playwright/test');
const { freshApp, loginAsManager } = require('./helpers');

test.describe('Raw Materials Module', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);
    await page.click('[data-nav="receiving"]');
  });

  test('shows empty state initially', async ({ page }) => {
    await expect(page.locator('.empty-state')).toBeVisible();
  });

  test('can open add form', async ({ page }) => {
    await page.click('.fab-add');
    await expect(page.locator('#field-supplier')).toBeVisible();
    await expect(page.locator('#field-category')).toBeVisible();
    await expect(page.locator('#field-weight')).toBeVisible();
  });

  test('cannot save with missing required fields', async ({ page }) => {
    await page.click('.fab-add');
    await page.click('#form-save');
    // Should show toast with required fields message, not navigate away
    await expect(page.locator('#field-supplier')).toBeVisible();
  });

  test('can add a raw material record', async ({ page }) => {
    await page.click('.fab-add');
    await page.selectOption('#field-supplier', { index: 1 });
    await page.selectOption('#field-category', 'rm_cat_spices');
    // Wait for cascading dropdown to populate
    await page.waitForTimeout(300);
    await page.selectOption('#field-item', { index: 1 });
    await page.fill('#field-weight', '10');
    await page.click('#form-save');
    await expect(page.locator('.record-item')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Fermentation Module', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);
    await page.click('[data-nav="production"]');
  });

  test('shows fermentation tab by default', async ({ page }) => {
    await expect(page.locator('.tab-btn.active')).toContainText(/תסיסה|การหมัก/);
  });

  test('can switch to distillation tabs', async ({ page }) => {
    await page.click('.tab-btn:nth-child(2)');
    await expect(page.locator('.tab-btn.active').nth(0)).toBeVisible();
  });

  test('can add fermentation record', async ({ page }) => {
    await page.click('.fab-add');
    await page.selectOption('#field-tankSize', '400');
    await page.fill('#field-datesCrates', '6');
    await page.fill('#field-temperature', '25');
    await page.fill('#field-sugar', '18');
    await page.fill('#field-ph', '4.5');
    await page.click('#form-save');
    await expect(page.locator('.record-item')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Bottling Module', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);
    await page.click('[data-nav="bottling"]');
  });

  test('bottling form has signature pad', async ({ page }) => {
    await page.click('.fab-add');
    await expect(page.locator('#sig-canvas')).toBeVisible();
    await expect(page.locator('#sig-clear')).toBeVisible();
  });

  test('cannot save bottling without signing', async ({ page }) => {
    await page.click('.fab-add');
    await page.selectOption('#field-drinkType', { index: 1 });
    await page.fill('#field-batchNumber', 'TEST001');
    await page.fill('#field-alcohol', '0.4');
    await page.fill('#field-bottleCount', '100');
    // Try to save without signature
    await page.click('#form-save');
    // Should still see the form (not navigated away)
    await expect(page.locator('#sig-canvas')).toBeVisible();
  });
});

test.describe('Inventory Module', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);
    await page.click('[data-nav="inventory"]');
  });

  test('shows inventory tabs', async ({ page }) => {
    await expect(page.locator('[data-inv-tab="bottles"]')).toBeVisible();
    await expect(page.locator('[data-inv-tab="raw"]')).toBeVisible();
    // versions tab removed — inventory is now simplified to bottles + raw materials
    await expect(page.locator('[data-inv-tab="versions"]')).toHaveCount(0);
  });

  test('can switch inventory tabs', async ({ page }) => {
    await page.click('[data-inv-tab="raw"]');
    await expect(page.locator('#inv-raw')).toBeVisible();
    await expect(page.locator('#inv-bottles')).not.toBeVisible();
  });
});

test.describe('Spirit Stock Screen', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);
  });

  test('spirit stock nav item exists and screen loads', async ({ page }) => {
    await expect(page.locator('[data-nav="spiritStock"]')).toBeVisible();
    await page.click('[data-nav="spiritStock"]');
    // Should show either empty state or the pipeline section title
    const emptyState = page.locator('.empty-state');
    const pipeline = page.locator('.spirit-pipeline');
    await expect(emptyState.or(pipeline)).toBeVisible({ timeout: 3000 });
  });
});
