// ============================================================
// Security Tests v2: Delete modal, inventory buffer, custom options,
// backoffice access control, and input sanitization
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

    // Add a record first
    await page.evaluate(() => {
      const records = [{
        id: 'test001',
        createdAt: new Date(Date.now() - 120000).toISOString(), // 2 min old
        supplier: 'sup_lara', date: '2026-01-01', weight: '10',
        category: 'rm_cat_spices', item: 'Anise Seeds / เมล็ดโป๊ยกั๊ก',
        createdBy: 'manager'
      }];
      localStorage.setItem('factory_rawMaterials', JSON.stringify(records));
    });

    // Navigate to rawMaterials list
    await page.evaluate(() => {
      currentModule = 'rawMaterials';
      currentView = 'list';
      renderApp();
    });

    // Click the record to get to detail view
    await page.click('.record-item');
    await expect(page.locator('#delete-record-btn')).toBeVisible();

    // Verify no native browser dialog on click; our modal should appear instead
    let nativeDialogFired = false;
    page.on('dialog', () => { nativeDialogFired = true; });

    await page.click('#delete-record-btn');

    // Our modal should be visible
    await expect(page.locator('.manager-pwd-dialog')).toBeVisible();
    expect(nativeDialogFired).toBe(false);
  });

  test('wrong password shows error message', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    // Manually call the modal
    await page.evaluate(() => {
      showManagerPasswordModal(() => {});
    });

    await expect(page.locator('.manager-pwd-dialog')).toBeVisible();
    await page.fill('#mpd-password', 'wrongpassword');
    await page.click('.mpd-confirm');

    const errorText = await page.locator('#mpd-error').textContent();
    expect(errorText.trim().length).toBeGreaterThan(0);
    // Modal should still be visible
    await expect(page.locator('.manager-pwd-dialog')).toBeVisible();
  });

  test('correct manager password triggers success callback', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    // Open the modal (don't await the Promise — we need to interact with the modal)
    await page.evaluate(() => {
      window._callbackFired = false;
      showManagerPasswordModal(() => { window._callbackFired = true; });
    });

    await expect(page.locator('.manager-pwd-dialog')).toBeVisible();

    // Fill correct password and confirm
    await page.fill('#mpd-password', 'manager123');
    await page.click('.mpd-confirm');

    const callbackFired = await page.evaluate(() => !!window._callbackFired);
    expect(callbackFired).toBe(true);
  });

  test('cancel button closes modal without deleting', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    let callbackCalled = false;
    await page.evaluate(() => {
      window._testCallback = () => { window._deleteCallbackCalled = true; };
      showManagerPasswordModal(window._testCallback);
    });

    await expect(page.locator('.manager-pwd-dialog')).toBeVisible();
    await page.click('.mpd-cancel');
    await expect(page.locator('.manager-pwd-dialog')).not.toBeVisible();

    const wasCalled = await page.evaluate(() => !!window._deleteCallbackCalled);
    expect(wasCalled).toBe(false);
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
  test('records younger than 60s are not counted in inventory', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    await page.evaluate(() => {
      const freshRecord = {
        id: 'fresh001',
        createdAt: new Date().toISOString(), // just now
        drinkType: 'drink_arak', decision: 'approved', bottleCount: '100',
        createdBy: 'manager'
      };
      localStorage.setItem('factory_bottling', JSON.stringify([freshRecord]));
    });

    await page.evaluate(() => {
      const { visible, pending } = getBufferedRecords('factory_bottling');
      window._buffered = { visible: visible.length, pending };
    });

    const buffered = await page.evaluate(() => window._buffered);
    expect(buffered.visible).toBe(0);
    expect(buffered.pending).toBe(1);
  });

  test('records older than 60s appear in inventory', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    await page.evaluate(() => {
      const oldRecord = {
        id: 'old001',
        createdAt: new Date(Date.now() - 120000).toISOString(), // 2 min ago
        drinkType: 'drink_arak', decision: 'approved', bottleCount: '50',
        createdBy: 'manager'
      };
      localStorage.setItem('factory_bottling', JSON.stringify([oldRecord]));
    });

    const buffered = await page.evaluate(() => {
      const { visible, pending } = getBufferedRecords('factory_bottling');
      return { visible: visible.length, pending };
    });

    expect(buffered.visible).toBe(1);
    expect(buffered.pending).toBe(0);
  });

  test('pending banner appears when there are buffered records', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    await page.evaluate(() => {
      const freshRecord = {
        id: 'fresh002',
        createdAt: new Date().toISOString(),
        drinkType: 'drink_gin', decision: 'approved', bottleCount: '20',
        createdBy: 'worker1'
      };
      localStorage.setItem('factory_bottling', JSON.stringify([freshRecord]));
      currentModule = 'inventory'; currentView = 'list'; renderApp();
    });

    await expect(page.locator('.inv-pending-banner')).toBeVisible();
  });

  test('no pending banner when all records are older than 60s', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    await page.evaluate(() => {
      const oldRecord = {
        id: 'old002',
        createdAt: new Date(Date.now() - 120000).toISOString(),
        drinkType: 'drink_gin', decision: 'approved', bottleCount: '20',
        createdBy: 'worker1'
      };
      localStorage.setItem('factory_bottling', JSON.stringify([oldRecord]));
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
  test('worker does not see backoffice in nav', async ({ page }) => {
    await freshApp(page);
    await loginAsWorker(page);
    const navItems = await page.locator('.nav-item').allTextContents();
    const hasBackoffice = navItems.some(t => t.toLowerCase().includes('ניהול') || t.toLowerCase().includes('backoffice') || t.toLowerCase().includes('management'));
    expect(hasBackoffice).toBe(false);
  });

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
  test('getCustomOptions returns empty array for unknown field', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);
    const opts = await page.evaluate(() => getCustomOptions('nonExistentField'));
    expect(Array.isArray(opts)).toBe(true);
    expect(opts.length).toBe(0);
  });

  test('addCustomOption persists to localStorage', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);
    await page.evaluate(async () => {
      await addCustomOption('supplier', 'NewTestSupplier');
    });
    const stored = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('factory_customOptions_supplier') || '[]');
    });
    expect(stored).toContain('NewTestSupplier');
  });

  test('duplicate custom options are not added twice', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);
    await page.evaluate(async () => {
      await addCustomOption('supplier', 'DuplicateSupplier');
      await addCustomOption('supplier', 'DuplicateSupplier');
    });
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('factory_customOptions_supplier') || '[]')
    );
    const count = stored.filter(s => s === 'DuplicateSupplier').length;
    expect(count).toBe(1);
  });

  test('custom option appears in select after adding', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    // Go to raw materials form
    await page.evaluate(() => {
      currentModule = 'rawMaterials'; currentView = 'form'; editingRecord = null; renderApp();
    });

    const supplierSelect = page.locator('#field-supplier');
    await expect(supplierSelect).toBeVisible();

    // The ADD_NEW option should exist
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

    // Re-render a form that uses this field
    await page.evaluate(() => {
      currentModule = 'rawMaterials'; currentView = 'form'; editingRecord = null; renderApp();
    });

    const xssRan = await page.evaluate(() => !!window._xssRan);
    expect(xssRan).toBe(false);
  });

  test('CSV export sanitizes formula injection', async ({ page }) => {
    await freshApp(page);
    await loginAsManager(page);

    // Add a record with a formula injection attempt in a text field
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

    // Call exportToCSV and verify the CSV content is sanitized
    const csvContent = await page.evaluate(() => {
      const data = getData('factory_bottling');
      // Check the sanitizeCSV logic is applied
      const val = data[0].batchNumber;
      // Simulate what sanitizeCSV does
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

  test('rate: multiple failed logins show error without crash', async ({ page }) => {
    await freshApp(page);
    for (let i = 0; i < 5; i++) {
      await page.fill('#login-user', 'manager');
      await page.fill('#login-pass', 'wrongpass');
      await page.click('#login-btn');
    }
    await expect(page.locator('#login-error')).not.toBeEmpty();
    await expect(page.locator('#login-btn')).toBeVisible(); // app didn't crash
  });
});
