import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../../lib/cors';
import { verifyRequest, hasManagementAccess } from '../../lib/auth';
import { adminDb } from '../../lib/firebase-admin';
import { randomUUID } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  const decoded = await verifyRequest(req.headers.authorization);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing token' });
  }

  if (!hasManagementAccess(decoded)) {
    return res.status(403).json({ error: 'Forbidden — requires admin or manager role' });
  }

  if (req.method === 'GET') {
    return handleList(req, res);
  }

  if (req.method === 'POST') {
    return handleCreate(req, res, decoded.email || '');
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * GET /api/invitations?app=factory|crm
 * List all invitations.
 */
async function handleList(req: VercelRequest, res: VercelResponse) {
  const app = (req.query.app as string) || 'factory';
  const collection = app === 'crm' ? 'invitations' : 'factory_invitations';

  try {
    const snap = await adminDb.collection(collection)
      .orderBy('createdAt', 'desc')
      .get();
    const invitations = snap.docs.map(doc => ({ ...doc.data(), _fbId: doc.id }));
    return res.status(200).json({ invitations });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to list invitations: ' + e.message });
  }
}

/**
 * POST /api/invitations
 * Create a new invitation.
 *
 * Body: { email, role?, app? }
 */
async function handleCreate(
  req: VercelRequest,
  res: VercelResponse,
  createdBy: string
) {
  const { email, role, app } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const inviteRole = role || 'worker';
  const collection = app === 'crm' ? 'invitations' : 'factory_invitations';

  // Check for existing pending invitation
  const existing = await adminDb.collection(collection)
    .where('email', '==', email.toLowerCase())
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  if (!existing.empty) {
    return res.status(409).json({ error: 'Invitation already pending for this email' });
  }

  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invitation = {
    token,
    email: email.toLowerCase(),
    role: inviteRole,
    status: 'pending',
    createdAt: now.toISOString(),
    createdBy,
    expiresAt: expiresAt.toISOString(),
  };

  try {
    await adminDb.collection(collection).doc(token).set(invitation);
    return res.status(201).json({ success: true, invitation });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to create invitation: ' + e.message });
  }
}
