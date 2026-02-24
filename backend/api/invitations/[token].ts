import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../../lib/cors';
import { adminDb } from '../../lib/firebase-admin';

/**
 * GET /api/invitations/:token?app=factory|crm
 * Validate an invitation token. Public endpoint (no auth required).
 *
 * Returns: { valid, invitation? } or { valid: false, reason }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.query.token as string;
  if (!token) {
    return res.status(400).json({ valid: false, reason: 'Token is required' });
  }

  const app = (req.query.app as string) || 'factory';
  const collection = app === 'crm' ? 'invitations' : 'factory_invitations';

  try {
    const doc = await adminDb.collection(collection).doc(token).get();

    if (!doc.exists) {
      return res.status(404).json({ valid: false, reason: 'Invitation not found' });
    }

    const data = doc.data()!;

    // Check if already used
    if (data.status === 'accepted') {
      return res.status(200).json({ valid: false, reason: 'Invitation already used' });
    }

    // Check expiry
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      return res.status(200).json({ valid: false, reason: 'Invitation expired' });
    }

    return res.status(200).json({
      valid: true,
      invitation: {
        email: data.email,
        role: data.role,
        expiresAt: data.expiresAt,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ valid: false, reason: 'Server error: ' + e.message });
  }
}
