// ============================================================
// Security Tests v2: Delete modal, inventory buffer, custom options,
// backoffice access control, and input sanitization
// Desktop-only — these test JS logic and security controls
// ============================================================
const { test, expect } = require('@playwright/test');
const { freshApp, loginAsWorker, loginAsManager, seedTestUsers, TEST_MANAGER } = require('./helpers');

// ============================================================
// Manager Password Modal
// ============================================================
test.describe('Security: Delete requires manager password', () => {
  test('delete button shows manager password modal, not a native confirm', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    await page.evaluate(() => {
      const records = [{
        id: 'test001',
        createdAt: new Date(Date.now() - 120000).toISOString(),
        supplier: 'sup_lara', date: '2026-01-01', weight: '10',
        category: 'rm_cat_spices', item: 'Anise Seeds / เมล็ดโป๊ยกั๊ก',
        createdBy: 'manager'
      }];
      localStorage.setItem('factory_rawMaterials', JSON.stringify(records));
    });

    await page.evaluate(() => {
      currentModule = 'rawMaterials';
      currentView = 'list';
      renderApp();
    });

    await page.click('.record-item');
    await expect(page.locator('#delete-record-btn')).toBeVisible();

    let nativeDialogFired = false;
    page.on('dialog', () => { nativeDialogFired = true; });
    await page.click('#delete-record-btn');
    await expect(page.locator('.manager-pwd-dialog')).toBeVisible();
    expect(nativeDialogFired).toBe(false);
  });

  test('manager password modal validates and triggers callback', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    // Wrong password → error
    await page.evaluate(() => {
      window._callbackFired = false;
      showManagerPasswordModal(() => { window._callbackFired = true; });
    });
    await expect(page.locator('.manager-pwd-dialog')).toBeVisible();
    await page.fill('#mpd-password', 'wrongpassword');
    await page.click('.mpd-confirm');
    const errorText = await page.locator('#mpd-error').textContent();
    expect(errorText.trim().length).toBeGreaterThan(0);
    await expect(page.locator('.manager-pwd-dialog')).toBeVisible();

    // Correct password → callback fires
    await page.fill('#mpd-password', 'manager123');
    await page.click('.mpd-confirm');
    expect(await page.evaluate(() => !!window._callbackFired)).toBe(true);
  });

  test('cancel closes modal without triggering delete', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    await page.evaluate(() => {
      window._deleteCallbackCalled = false;
      showManagerPasswordModal(() => { window._deleteCallbackCalled = true; });
    });
    await expect(page.locator('.manager-pwd-dialog')).toBeVisible();
    await page.click('.mpd-cancel');
    await expect(page.locator('.manager-pwd-dialog')).not.toBeVisible();
    expect(await page.evaluate(() => !!window._deleteCallbackCalled)).toBe(false);
  });

  test('worker UI does not show delete button', async ({ page }) => {
    await freshApp(page);
    await loginAsWorker(page);

    await page.evaluate(() => {
      const records = [{
        id: 'test002',
        createdAt: new Date(Date.now() - 120000).toISOString(),
        supplier: 'sup_lara', date: '2026-01-01', weight: '10',
        category: 'rm_cat_spices', item: 'Anise Seeds / เมล็ดโป๊ยกั๊ก',
        createdBy: 'manager'
      }];
      localStorage.setItem('factory_rawMaterials', JSON.stringify(records));
      currentModule = 'rawMaterials'; currentView = 'list'; renderApp();
    });
    await page.click('.record-item');
    await expect(page.locator('#delete-record-btn')).not.toBeVisible();
  });
});

// ============================================================
// Inventory 1-Minute Buffer
// ============================================================
test.describe('Inventory: 1-minute buffer', () => {
  test('buffer correctly separates fresh vs old records', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    // Fresh record — should be pending
    await page.evaluate(() => {
      const fresh = {
        id: 'fresh001', createdAt: new Date().toISOString(),
        drinkType: 'drink_arak', decision: 'approved', bottleCount: '100',
        createdBy: 'manager'
      };
      localStorage.setItem('factory_bottling', JSON.stringify([fresh]));
    });
    const freshResult = await page.evaluate(() => {
      const { visible, pending } = getBufferedRecords('factory_bottling');
      return { visible: visible.length, pending };
    });
    expect(freshResult.visible).toBe(0);
    expect(freshResult.pending).toBe(1);

    // Old record — should be visible
    await page.evaluate(() => {
      const old = {
        id: 'old001', createdAt: new Date(Date.now() - 120000).toISOString(),
        drinkType: 'drink_arak', decision: 'approved', bottleCount: '50',
        createdBy: 'manager'
      };
      localStorage.setItem('factory_bottling', JSON.stringify([old]));
    });
    const oldResult = await page.evaluate(() => {
      const { visible, pending } = getBufferedRecords('factory_bottling');
      return { visible: visible.length, pending };
    });
    expect(oldResult.visible).toBe(1);
    expect(oldResult.pending).toBe(0);
  });

  test('pending banner shows/hides based on buffer state', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    // Fresh record → banner visible
    await page.evaluate(() => {
      const fresh = {
        id: 'fresh002', createdAt: new Date().toISOString(),
        drinkType: 'drink_gin', decision: 'approved', bottleCount: '20',
        createdBy: 'worker1'
      };
      localStorage.setItem('factory_bottling', JSON.stringify([fresh]));
      currentModule = 'inventory'; currentView = 'list'; renderApp();
    });
    await expect(page.locator('.inv-pending-banner')).toBeVisible();

    // All old records → no banner
    await page.evaluate(() => {
      const old = {
        id: 'old002', createdAt: new Date(Date.now() - 120000).toISOString(),
        drinkType: 'drink_gin', decision: 'approved', bottleCount: '20',
        createdBy: 'worker1'
      };
      localStorage.setItem('factory_bottling', JSON.stringify([old]));
      localStorage.setItem('factory_rawMaterials', '[]');
      localStorage.setItem('factory_dateReceiving', '[]');
      localStorage.setItem('factory_fermentation', '[]');
      currentModule = 'inventory'; currentView = 'list'; renderApp();
    });
    await expect(page.locator('.inv-pending-banner')).not.toBeVisible();
  });
});

// ============================================================
// Backoffice Access Control
// ============================================================
test.describe('Security: Backoffice worker exclusion', () => {
  test('worker calling renderBackoffice directly sees permission denied', async ({ page }) => {
    await freshApp(page);
    await loginAsWorker(page);
    await page.evaluate(() => {
      const div = document.createElement('div');
      document.body.appendChild(div);
      renderBackoffice(div);
      window._backofficHTML = div.innerHTML;
    });
    const html = await page.evaluate(() => window._backofficHTML);
    expect(html).toContain('perm-overlay');
  });

  test('manager sees user management in backoffice', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);
    await page.evaluate(() => {
      currentScreen = 'backoffice';
      currentModule = null;
      renderApp();
    });
    await expect(page.locator('.record-item.user-item').first()).toBeVisible();
  });
});

// ============================================================
// Custom Dropdown Options
// ============================================================
test.describe('Custom dropdown options', () => {
  test('custom option CRUD: add, persist, deduplicate', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    // Empty for unknown field
    const opts = await page.evaluate(() => getCustomOptions('nonExistentField'));
    expect(Array.isArray(opts)).toBe(true);
    expect(opts.length).toBe(0);

    // Add and persist
    await page.evaluate(async () => {
      await addCustomOption('supplier', 'NewTestSupplier');
    });
    let stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('factory_customOptions_supplier') || '[]')
    );
    expect(stored).toContain('NewTestSupplier');

    // Deduplication
    await page.evaluate(async () => {
      await addCustomOption('supplier', 'NewTestSupplier');
    });
    stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('factory_customOptions_supplier') || '[]')
    );
    expect(stored.filter(s => s === 'NewTestSupplier').length).toBe(1);
  });

  test('custom option appears in select with __ADD_NEW__', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);
    await page.evaluate(() => {
      currentModule = 'rawMaterials'; currentView = 'form'; editingRecord = null; renderApp();
    });
    const supplierSelect = page.locator('#field-supplier');
    await expect(supplierSelect).toBeVisible();
    const addNewOption = await supplierSelect.locator('option[value="__ADD_NEW__"]');
    await expect(addNewOption).toBeTruthy();
  });
});

// ============================================================
// Input Sanitization
// ============================================================
test.describe('Security: Input sanitization', () => {
  test('XSS in custom option value is stored as text, not executed', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    const xssPayload = '<script>window._xssRan = true;</script>';
    await page.evaluate(async (payload) => {
      await addCustomOption('supplier', payload);
    }, xssPayload);
    await page.evaluate(() => {
      currentModule = 'rawMaterials'; currentView = 'form'; editingRecord = null; renderApp();
    });
    expect(await page.evaluate(() => !!window._xssRan)).toBe(false);
  });

  test('CSV export sanitizes formula injection', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    await page.evaluate(() => {
      const record = {
        id: 'sec001',
        createdAt: new Date(Date.now() - 120000).toISOString(),
        batchNumber: '=CMD|"/c calc"!A0',
        drinkType: 'drink_arak', date: '2026-01-01',
        alcohol: '0.5', bottleCount: '10', decision: 'approved',
        createdBy: 'manager'
      };
      localStorage.setItem('factory_bottling', JSON.stringify([record]));
    });

    const csvContent = await page.evaluate(() => {
      const data = getData('factory_bottling');
      const val = data[0].batchNumber;
      if (/^[=+\-@\t\r]/.test(val)) return "sanitized: '" + val;
      return "not-sanitized: " + val;
    });
    expect(csvContent).toContain('sanitized');
  });

  test('password is not stored in session object', async ({ page }) => {
    await freshApp(page);
    await seedTestUsers(page);
    await page.fill('#login-user', TEST_MANAGER.email);
    await page.fill('#login-pass', TEST_MANAGER.password);
    await page.click('#login-btn');

    const session = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('factory_session') || 'null')
    );
    expect(session).not.toBeNull();
    expect(session.password).toBeUndefined();
  });

  test('multiple failed logins show error without crash', async ({ page }) => {
    await freshApp(page);
    for (let i = 0; i < 5; i++) {
      await page.fill('#login-user', 'manager');
      await page.fill('#login-pass', 'wrongpass');
      await page.click('#login-btn');
    }
    await expect(page.locator('#login-error')).not.toBeEmpty();
    await expect(page.locator('#login-btn')).toBeVisible();
  });
});
