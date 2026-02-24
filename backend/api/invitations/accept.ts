import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../../lib/cors';
import { adminAuth, adminDb } from '../../lib/firebase-admin';

/**
 * POST /api/invitations/accept
 * Accept an invitation and register a new user.
 * Public endpoint — the invitation token acts as authorization.
 *
 * Body: { token, password, name, nameHe?, nameTh?, app? }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, password, name, nameHe, nameTh, app } = req.body || {};

  if (!token || !password || !name) {
    return res.status(400).json({ error: 'Missing required fields: token, password, name' });
  }

  // Validate password
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!/[a-zA-Z]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least 1 letter' });
  }
  if (!/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least 1 digit' });
  }

  const invCollection = app === 'crm' ? 'invitations' : 'factory_invitations';
  const userCollection = app === 'crm' ? 'users' : 'factory_users';

  try {
    // Validate invitation
    const invDoc = await adminDb.collection(invCollection).doc(token).get();
    if (!invDoc.exists) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    const invitation = invDoc.data()!;

    if (invitation.status === 'accepted') {
      return res.status(400).json({ error: 'Invitation already used' });
    }

    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'Invitation expired' });
    }

    const email = invitation.email;
    const role = invitation.role || 'worker';
    const username = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');

    // Create Firebase Auth account
    let firebaseUser;
    try {
      firebaseUser = await adminAuth.createUser({
        email,
        password,
        displayName: name,
      });
    } catch (e: any) {
      if (e.code === 'auth/email-already-exists') {
        firebaseUser = await adminAuth.getUserByEmail(email);
      } else {
        throw e;
      }
    }

    // Set custom claims
    await adminAuth.setCustomUserClaims(firebaseUser.uid, { role });

    // Save user profile to Firestore
    const profile = {
      username,
      email: email.toLowerCase(),
      name,
      ...(nameHe && { nameHe }),
      ...(nameTh && { nameTh }),
      role,
      status: 'active',
      createdAt: new Date().toISOString(),
      firebaseUid: firebaseUser.uid,
    };

    await adminDb.collection(userCollection).add(profile);

    // Mark invitation as accepted
    await invDoc.ref.update({
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      username,
    });

    return res.status(201).json({ success: true, user: profile });
  } catch (e: any) {
    return res.status(500).json({ error: 'Registration failed: ' + e.message });
  }
}
