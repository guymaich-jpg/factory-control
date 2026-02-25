import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { verifyRequest } from '../lib/auth';
import { adminDb } from '../lib/firebase-admin';
import { syncToCrmStockLevels } from '../lib/crm-sync';

const DRINK_TYPES = [
  'drink_arak', 'drink_gin', 'drink_edv', 'drink_licorice',
  'drink_brandyVS', 'drink_brandyVSOP', 'drink_brandyMed',
];

/**
 * GET /api/inventory
 * Returns the current bottle inventory from the factory_inventory/current doc.
 * Falls back to computing from factory_bottling if the doc doesn't exist.
 *
 * POST /api/inventory
 * Receives an inventory snapshot from Factory Control and writes it to
 * factory_inventory/current in Firestore. The CRM reads this doc.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  // Authenticate caller
  const decoded = await verifyRequest(req.headers.authorization);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing token' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    return handlePost(req, res, decoded.email || decoded.uid);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ---- GET: return current inventory ----
async function handleGet(_req: VercelRequest, res: VercelResponse) {
  try {
    // Read pre-computed inventory doc (written by POST or frontend fallback)
    const doc = await adminDb.collection('factory_inventory').doc('current').get();
    if (doc.exists) {
      const data = doc.data()!;
      return res.status(200).json({
        bottles: data.bottles || {},
        total: data.total || 0,
        updatedAt: data.updatedAt || null,
        updatedBy: data.updatedBy || null,
      });
    }

    // Fallback: compute from factory_bottling if doc doesn't exist yet
    const snap = await adminDb.collection('factory_bottling').get();
    const bottles: Record<string, number> = {};
    DRINK_TYPES.forEach(dt => { bottles[dt] = 0; });

    snap.docs.forEach(doc => {
      const r = doc.data();
      if (r.drinkType && r.decision === 'approved') {
        const count = parseInt(r.bottleCount, 10) || 0;
        bottles[r.drinkType] = (bottles[r.drinkType] || 0) + count;
      }
    });

    const total = Object.values(bottles).reduce((sum, n) => sum + n, 0);

    return res.status(200).json({
      bottles,
      total,
      updatedAt: new Date().toISOString(),
      updatedBy: null,
    });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to read inventory: ' + e.message });
  }
}

// ---- POST: receive inventory update from Factory Control ----
async function handlePost(req: VercelRequest, res: VercelResponse, callerEmail: string) {
  try {
    const { bottles, trigger } = req.body || {};

    if (!bottles || typeof bottles !== 'object') {
      return res.status(400).json({ error: 'Missing or invalid "bottles" object' });
    }

    // Validate: only allow known drink types, values must be non-negative integers
    const cleanBottles: Record<string, number> = {};
    for (const dt of DRINK_TYPES) {
      const val = parseInt(bottles[dt], 10);
      cleanBottles[dt] = isNaN(val) || val < 0 ? 0 : val;
    }

    const total = Object.values(cleanBottles).reduce((sum, n) => sum + n, 0);

    const inventoryDoc = {
      bottles: cleanBottles,
      total,
      updatedAt: new Date().toISOString(),
      updatedBy: callerEmail || 'system',
      trigger: trigger || 'api',
    };

    await adminDb.collection('factory_inventory').doc('current').set(inventoryDoc);

    // Sync to CRM stockLevels collection (real-time listener picks this up)
    try {
      await syncToCrmStockLevels(cleanBottles, callerEmail);
    } catch {
      // CRM sync is best-effort — don't fail the factory write
    }

    return res.status(200).json({ success: true, ...inventoryDoc });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to update inventory: ' + e.message });
  }
}
