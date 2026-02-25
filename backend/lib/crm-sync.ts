import { adminDb } from './firebase-admin';

/**
 * Mapping from factory drink types to CRM product catalog IDs.
 * CRM products (from seed.ts):
 *   1 = ערק,  2 = ליקריץ,  3 = ADV,  4 = ג'ין,  5 = ברנדי,  6 = שונות
 *
 * Multiple factory types map to the same CRM product (brandies → 5).
 */
const DRINK_TO_CRM_PRODUCT: Record<string, string> = {
  drink_arak:       '1',
  drink_licorice:   '2',
  drink_edv:        '3',
  drink_gin:        '4',
  drink_brandyVS:   '5',
  drink_brandyVSOP: '5',
  drink_brandyMed:  '5',
};

/**
 * Sync factory bottle counts to the CRM's stockLevels Firestore collection.
 * The CRM subscribes to this collection via onSnapshot for real-time updates.
 *
 * Uses set({ merge: true }) so CRM-managed fields (e.g. minimumStock) are
 * preserved — only factory-owned fields are overwritten.
 */
export async function syncToCrmStockLevels(
  bottles: Record<string, number>,
  updatedBy: string,
): Promise<void> {
  // Aggregate by CRM product ID (e.g. 3 brandy types sum into product 5)
  const aggregated = new Map<string, number>();

  for (const [drinkType, count] of Object.entries(bottles)) {
    const productId = DRINK_TO_CRM_PRODUCT[drinkType];
    if (!productId) continue;
    aggregated.set(productId, (aggregated.get(productId) || 0) + count);
  }

  const now = new Date().toISOString();
  const batch = adminDb.batch();

  for (const [productId, currentStock] of aggregated) {
    const ref = adminDb.collection('stockLevels').doc(productId);
    batch.set(ref, {
      productId,
      currentStock,
      unit: 'בקבוק',
      lastUpdated: now,
      factoryLastSync: now,
    }, { merge: true });
  }

  await batch.commit();
}
