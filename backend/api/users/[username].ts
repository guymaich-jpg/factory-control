import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../../lib/cors';
import { verifyRequest, hasManagementAccess } from '../../lib/auth';
import { adminAuth, adminDb } from '../../lib/firebase-admin';
import { validateOwnerOperation } from '../../lib/owners';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  const decoded = await verifyRequest(req.headers.authorization);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing token' });
  }

  if (!hasManagementAccess(decoded)) {
    return res.status(403).json({ error: 'Forbidden — requires admin or manager role' });
  }

  const username = req.query.username as string;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  if (req.method === 'PUT') {
    return handleUpdate(req, res, username);
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res, username);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * PUT /api/users/:username
 * Update user profile, role, status, or password.
 *
 * Body: { name?, nameHe?, nameTh?, role?, status?, password?, app? }
 */
async function handleUpdate(req: VercelRequest, res: VercelResponse, username: string) {
  const { name, nameHe, nameTh, role, status, password, app } = req.body || {};
  const collection = app === 'crm' ? 'users' : 'factory_users';

  // Find user in Firestore
  const snap = await adminDb.collection(collection)
    .where('username', '==', username).limit(1).get();

  if (snap.empty) {
    return res.status(404).json({ error: 'User not found' });
  }

  const doc = snap.docs[0];
  const userData = doc.data();

  // Owner protection — check if operation is allowed
  if (userData.email) {
    const ownerError = validateOwnerOperation(userData.email, 'update', { role, status });
    if (ownerError) {
      return res.status(403).json({ error: ownerError });
    }
  }

  try {
    // Build Firestore update
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (nameHe !== undefined) updates.nameHe = nameHe;
    if (nameTh !== undefined) updates.nameTh = nameTh;
    if (role !== undefined) updates.role = role;
    if (status !== undefined) updates.status = status;

    // Update Firestore
    await doc.ref.update(updates);

    // Update Firebase Auth if needed
    if (userData.email) {
      try {
        const authUser = await adminAuth.getUserByEmail(userData.email);

        // Update password in Firebase Auth
        if (password) {
          await adminAuth.updateUser(authUser.uid, { password });
        }

        // Update custom claims if role changed
        if (role) {
          await adminAuth.setCustomUserClaims(authUser.uid, { role });
        }

        // Disable/enable account based on status
        if (status) {
          await adminAuth.updateUser(authUser.uid, {
            disabled: status === 'inactive',
          });
        }
      } catch (e: any) {
        // Auth user may not exist yet — that's okay, skip Auth updates
        if (e.code !== 'auth/user-not-found') {
          console.warn('[API] Firebase Auth update warning:', e.message);
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to update user: ' + e.message });
  }
}

/**
 * DELETE /api/users/:username?app=factory|crm
 * Delete user from Firebase Auth + Firestore.
 */
async function handleDelete(req: VercelRequest, res: VercelResponse, username: string) {
  const app = (req.query.app as string) || 'factory';
  const collection = app === 'crm' ? 'users' : 'factory_users';

  // Find user in Firestore
  const snap = await adminDb.collection(collection)
    .where('username', '==', username).limit(1).get();

  if (snap.empty) {
    return res.status(404).json({ error: 'User not found' });
  }

  const doc = snap.docs[0];
  const userData = doc.data();

  // Owner protection
  if (userData.email) {
    const ownerError = validateOwnerOperation(userData.email, 'delete');
    if (ownerError) {
      return res.status(403).json({ error: ownerError });
    }
  }

  try {
    // Delete from Firebase Auth
    if (userData.email) {
      try {
        const authUser = await adminAuth.getUserByEmail(userData.email);
        await adminAuth.deleteUser(authUser.uid);
      } catch (e: any) {
        if (e.code !== 'auth/user-not-found') {
          console.warn('[API] Firebase Auth delete warning:', e.message);
        }
      }
    }

    // Delete from Firestore
    await doc.ref.delete();

    return res.status(200).json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to delete user: ' + e.message });
  }
}
