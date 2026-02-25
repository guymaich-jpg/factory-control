// ============================================================
// Inventory Unit Tests — Node.js (no browser needed)
// Tests: bottle counting, gap calculation, history, base import, sync/export
// Run: node tests/inventory.test.js
// ============================================================
const assert = require('assert');

// ---- Mock localStorage ----
const _store = {};
global.localStorage = {
  getItem(key) { return _store[key] || null; },
  setItem(key, val) { _store[key] = String(val); },
  removeItem(key) { delete _store[key]; },
  clear() { Object.keys(_store).forEach(k => delete _store[k]); },
};

// ---- Mock session ----
global.getSession = () => ({ username: 'testuser', role: 'manager', name: 'Test User' });

// ---- Mock crypto.randomUUID ----
let _uuidCounter = 0;
global.crypto = { randomUUID: () => 'test-uuid-' + (++_uuidCounter) };

// ---- Mock fbAdd (fire-and-forget) ----
global.fbAdd = () => Promise.resolve(null);

// ---- Load data.js into global scope (browser-style file) ----
const fs = require('fs');
const vm = require('vm');
const dataSource = fs.readFileSync(require('path').join(__dirname, '..', 'data.js'), 'utf8');
vm.runInThisContext(dataSource, { filename: 'data.js' });

// data.js declares STORE_KEYS, DRINK_TYPES, getData, setData, addRecord,
// exportAllData, etc. as globals via vm.runInThisContext

// ---- Helpers to replicate the inventory calculation logic from script.js ----

/**
 * Count approved bottles per drink type from bottling records.
 */
function countApprovedBottles(bottlingRecords) {
  const bottleInv = {};
  DRINK_TYPES.forEach(dt => { bottleInv[dt] = 0; });
  bottlingRecords.forEach(r => {
    if (r.drinkType && r.decision === 'approved') {
      const count = parseInt(r.bottleCount) || 0;
      bottleInv[r.drinkType] = (bottleInv[r.drinkType] || 0) + count;
    }
  });
  return bottleInv;
}

/**
 * Get latest base inventory per drink type.
 */
function getBaseInventory() {
  const baseRecords = getData(STORE_KEYS.inventoryBase);
  const baseInv = {};
  if (baseRecords.length > 0) {
    const latest = baseRecords[0];
    DRINK_TYPES.forEach(dt => {
      baseInv[dt] = parseInt(latest[dt]) || 0;
    });
  } else {
    DRINK_TYPES.forEach(dt => { baseInv[dt] = 0; });
  }
  return baseInv;
}

/**
 * Calculate gap: (factory created + base) - real count
 * Returns null if real count is null (no signed count yet).
 */
function calculateGap(created, base, real) {
  if (real === null || real === undefined) return null;
  return (created + base) - real;
}

/**
 * Get latest signed real count per drink type.
 */
function getLatestRealCount() {
  const countRecords = getData(STORE_KEYS.inventoryCounts);
  const latestCount = {};
  if (countRecords.length > 0) {
    const latest = countRecords[0];
    DRINK_TYPES.forEach(dt => {
      latestCount[dt] = parseInt(latest[dt]) || 0;
    });
    return latestCount;
  }
  return null; // No signed counts yet
}

// ---- Helper: clear all app data ----
function clearAll() {
  localStorage.clear();
  _uuidCounter = 0;
}

// ---- Helper: create bottling record ----
function makeBottlingRecord(drinkType, bottleCount, decision = 'approved') {
  return { drinkType, bottleCount: String(bottleCount), decision };
}

// ---- Test runner ----
let passed = 0;
let failed = 0;
const failures = [];

function runTest(name, fn) {
  try {
    clearAll();
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ============================================================
// A. BOTTLE COUNTING TESTS
// ============================================================
console.log('\n\x1b[1mA. Bottle Counting Tests\x1b[0m');

runTest('A1. Empty state — no bottling records → all drink types = 0', () => {
  const bottleInv = countApprovedBottles([]);
  DRINK_TYPES.forEach(dt => {
    assert.strictEqual(bottleInv[dt], 0, `Expected ${dt} = 0`);
  });
});

runTest('A2. Single approved bottling — arak 50', () => {
  const records = [makeBottlingRecord('drink_arak', 50)];
  const bottleInv = countApprovedBottles(records);
  assert.strictEqual(bottleInv.drink_arak, 50);
  assert.strictEqual(bottleInv.drink_gin, 0);
  assert.strictEqual(bottleInv.drink_edv, 0);
});

runTest('A3. Multiple approved bottlings same type — arak 50+30+20 = 100', () => {
  const records = [
    makeBottlingRecord('drink_arak', 50),
    makeBottlingRecord('drink_arak', 30),
    makeBottlingRecord('drink_arak', 20),
  ];
  const bottleInv = countApprovedBottles(records);
  assert.strictEqual(bottleInv.drink_arak, 100);
});

runTest('A4. Mixed approved/pending — only approved counted', () => {
  const records = [
    makeBottlingRecord('drink_arak', 50, 'approved'),
    makeBottlingRecord('drink_arak', 30, 'pending'),
    makeBottlingRecord('drink_arak', 20, 'rejected'),
    makeBottlingRecord('drink_gin', 10, 'approved'),
    makeBottlingRecord('drink_gin', 40, 'pending'),
  ];
  const bottleInv = countApprovedBottles(records);
  assert.strictEqual(bottleInv.drink_arak, 50, 'Only approved arak counted');
  assert.strictEqual(bottleInv.drink_gin, 10, 'Only approved gin counted');
});

runTest('A5. All drink types — one approved each', () => {
  const records = DRINK_TYPES.map((dt, i) => makeBottlingRecord(dt, (i + 1) * 10));
  const bottleInv = countApprovedBottles(records);
  DRINK_TYPES.forEach((dt, i) => {
    assert.strictEqual(bottleInv[dt], (i + 1) * 10, `${dt} should be ${(i + 1) * 10}`);
  });
});

runTest('A6. Base inventory added to totals — factory 50 + base 100 = 150', () => {
  // Add a base inventory record
  addRecord(STORE_KEYS.inventoryBase, { drink_arak: 100, drink_gin: 50 });

  const bottleInv = countApprovedBottles([makeBottlingRecord('drink_arak', 50)]);
  const baseInv = getBaseInventory();

  const totalArak = (bottleInv.drink_arak || 0) + (baseInv.drink_arak || 0);
  const totalGin = (bottleInv.drink_gin || 0) + (baseInv.drink_gin || 0);

  assert.strictEqual(totalArak, 150, 'arak: 50 factory + 100 base = 150');
  assert.strictEqual(totalGin, 50, 'gin: 0 factory + 50 base = 50');
});

// ============================================================
// B. GAP CALCULATION TESTS
// ============================================================
console.log('\n\x1b[1mB. Gap Calculation Tests\x1b[0m');

runTest('B7. Gap = (created + base) − real: 100+50-120 = +30', () => {
  const gap = calculateGap(100, 50, 120);
  assert.strictEqual(gap, 30);
});

runTest('B8. No gap when counts match: 100+0-100 = 0', () => {
  const gap = calculateGap(100, 0, 100);
  assert.strictEqual(gap, 0);
});

runTest('B9. Negative gap (surplus): 80+0-100 = -20', () => {
  const gap = calculateGap(80, 0, 100);
  assert.strictEqual(gap, -20);
});

runTest('B10. No signed count yet → gap is null', () => {
  const gap = calculateGap(100, 50, null);
  assert.strictEqual(gap, null);
});

runTest('B11. With base inventory: 50+30-60 = +20', () => {
  const gap = calculateGap(50, 30, 60);
  assert.strictEqual(gap, 20);
});

runTest('B12. Zero production, zero base, zero real → gap = 0', () => {
  const gap = calculateGap(0, 0, 0);
  assert.strictEqual(gap, 0);
});

// ============================================================
// C. INVENTORY COUNT HISTORY / DATABASE TESTS
// ============================================================
console.log('\n\x1b[1mC. Inventory Count History Tests\x1b[0m');

runTest('C13. Sign inventory stores record with correct data', () => {
  const record = { drink_arak: 50, drink_gin: 30, signedBy: 'Test User' };
  addRecord(STORE_KEYS.inventoryCounts, record);

  const counts = getData(STORE_KEYS.inventoryCounts);
  assert.strictEqual(counts.length, 1);
  assert.strictEqual(counts[0].drink_arak, 50);
  assert.strictEqual(counts[0].drink_gin, 30);
  assert.strictEqual(counts[0].signedBy, 'Test User');
  assert.ok(counts[0].createdAt, 'Should have createdAt timestamp');
});

runTest('C14. Multiple signings maintain order — newest first', () => {
  addRecord(STORE_KEYS.inventoryCounts, { drink_arak: 10, signedBy: 'User A' });
  addRecord(STORE_KEYS.inventoryCounts, { drink_arak: 20, signedBy: 'User B' });
  addRecord(STORE_KEYS.inventoryCounts, { drink_arak: 30, signedBy: 'User C' });

  const counts = getData(STORE_KEYS.inventoryCounts);
  assert.strictEqual(counts.length, 3);
  // addRecord uses unshift → newest first
  assert.strictEqual(counts[0].drink_arak, 30, 'Newest (30) should be first');
  assert.strictEqual(counts[0].signedBy, 'User C');
  assert.strictEqual(counts[2].drink_arak, 10, 'Oldest (10) should be last');
});

runTest('C15. Latest count used for real count column', () => {
  addRecord(STORE_KEYS.inventoryCounts, { drink_arak: 50, signedBy: 'User A' });
  addRecord(STORE_KEYS.inventoryCounts, { drink_arak: 70, signedBy: 'User B' });

  const latestCount = getLatestRealCount();
  assert.strictEqual(latestCount.drink_arak, 70, 'Latest real count should be 70');
});

runTest('C16. Count record has correct structure', () => {
  addRecord(STORE_KEYS.inventoryCounts, {
    drink_arak: 50, drink_gin: 20, drink_edv: 10,
    drink_licorice: 0, drink_brandyVS: 5, drink_brandyVSOP: 3, drink_brandyMed: 0,
    signedBy: 'John Doe',
  });

  const counts = getData(STORE_KEYS.inventoryCounts);
  const record = counts[0];

  // All DRINK_TYPE keys present
  DRINK_TYPES.forEach(dt => {
    assert.ok(dt in record, `Record should have key "${dt}"`);
  });

  // Required metadata
  assert.ok(typeof record.signedBy === 'string', 'signedBy should be string');
  assert.ok(typeof record.createdAt === 'string', 'createdAt should be ISO string');
  assert.ok(typeof record.createdBy === 'string', 'createdBy should be string');
  assert.ok(typeof record.id === 'string', 'id should be string');

  // createdAt is valid ISO
  assert.ok(!isNaN(Date.parse(record.createdAt)), 'createdAt should be valid ISO date');
});

runTest('C17. History preserves all past signings — 5 signings', () => {
  for (let i = 1; i <= 5; i++) {
    addRecord(STORE_KEYS.inventoryCounts, { drink_arak: i * 10, signedBy: `User ${i}` });
  }

  const counts = getData(STORE_KEYS.inventoryCounts);
  assert.strictEqual(counts.length, 5, 'All 5 signings preserved');
  // Newest first
  assert.strictEqual(counts[0].drink_arak, 50);
  assert.strictEqual(counts[4].drink_arak, 10);
});

// ============================================================
// D. BASE INVENTORY IMPORT TESTS
// ============================================================
console.log('\n\x1b[1mD. Base Inventory Import Tests\x1b[0m');

runTest('D18. Import base sets initial stock', () => {
  addRecord(STORE_KEYS.inventoryBase, { drink_arak: 200, drink_gin: 100 });

  const base = getData(STORE_KEYS.inventoryBase);
  assert.strictEqual(base.length, 1);
  assert.strictEqual(base[0].drink_arak, 200);
  assert.strictEqual(base[0].drink_gin, 100);
});

runTest('D19. Re-import — newer record is [0] (latest)', () => {
  addRecord(STORE_KEYS.inventoryBase, { drink_arak: 200 });
  addRecord(STORE_KEYS.inventoryBase, { drink_arak: 300 });

  const base = getData(STORE_KEYS.inventoryBase);
  assert.strictEqual(base.length, 2);
  assert.strictEqual(base[0].drink_arak, 300, 'Latest import (300) is [0]');
  assert.strictEqual(base[1].drink_arak, 200, 'Previous import (200) is [1]');
});

runTest('D20. Base inventory included in factory-created total', () => {
  // 50 factory-bottled + 200 base = 250
  addRecord(STORE_KEYS.inventoryBase, { drink_arak: 200 });

  const bottleInv = countApprovedBottles([makeBottlingRecord('drink_arak', 50)]);
  const baseInv = getBaseInventory();

  const total = (bottleInv.drink_arak || 0) + (baseInv.drink_arak || 0);
  assert.strictEqual(total, 250);
});

// ============================================================
// E. SYNC / EXPORT TESTS
// ============================================================
console.log('\n\x1b[1mE. Sync / Export Tests\x1b[0m');

runTest('E21. syncInventorySnapshot includes base in totals', () => {
  // Simulate: base 100 arak, bottling 50 arak approved
  addRecord(STORE_KEYS.inventoryBase, { drink_arak: 100 });
  addRecord(STORE_KEYS.bottling, {
    drinkType: 'drink_arak',
    bottleCount: '50',
    decision: 'approved',
  });

  // Replicate the sync logic from script.js
  const bottlingRecords = getData(STORE_KEYS.bottling);
  const bottleInv = {};
  DRINK_TYPES.forEach(dt => { bottleInv[dt] = 0; });
  bottlingRecords.forEach(r => {
    if (r.drinkType && r.decision === 'approved') {
      bottleInv[r.drinkType] = (bottleInv[r.drinkType] || 0) + (parseInt(r.bottleCount) || 0);
    }
  });

  // Include base inventory (as syncInventorySnapshot now does)
  const baseRecords = getData(STORE_KEYS.inventoryBase);
  if (baseRecords.length > 0) {
    const latestBase = baseRecords[0];
    DRINK_TYPES.forEach(dt => {
      bottleInv[dt] = (bottleInv[dt] || 0) + (parseInt(latestBase[dt]) || 0);
    });
  }

  assert.strictEqual(bottleInv.drink_arak, 150, 'Sync total: 50 bottled + 100 base = 150');
  assert.strictEqual(bottleInv.drink_gin, 0, 'Gin should still be 0');
});

runTest('E22. Export includes new collections in keys list', () => {
  // Read the exportAllData function's internal keys list
  // We verify by checking STORE_KEYS has the expected entries
  assert.ok(STORE_KEYS.inventoryCounts, 'STORE_KEYS should have inventoryCounts');
  assert.ok(STORE_KEYS.inventoryBase, 'STORE_KEYS should have inventoryBase');
  assert.strictEqual(STORE_KEYS.inventoryCounts, 'factory_inventoryCounts');
  assert.strictEqual(STORE_KEYS.inventoryBase, 'factory_inventoryBase');

  // Verify the exportAllData function source includes both keys
  const fnSource = exportAllData.toString();
  assert.ok(fnSource.includes('factory_inventoryCounts'), 'exportAllData should include inventoryCounts');
  assert.ok(fnSource.includes('factory_inventoryBase'), 'exportAllData should include inventoryBase');
});

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n\x1b[1m${'═'.repeat(50)}\x1b[0m`);
console.log(`\x1b[1mResults: ${passed} passed, ${failed} failed\x1b[0m`);
if (failures.length > 0) {
  console.log('\n\x1b[31mFailed tests:\x1b[0m');
  failures.forEach(f => {
    console.log(`  - ${f.name}`);
    console.log(`    ${f.error.message}`);
  });
}
console.log('');

process.exit(failed > 0 ? 1 : 0);
