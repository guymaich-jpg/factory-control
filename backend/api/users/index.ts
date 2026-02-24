import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../../lib/cors';
import { verifyRequest, hasManagementAccess } from '../../lib/auth';
import { adminAuth, adminDb } from '../../lib/firebase-admin';
import { isOwner, validateOwnerOperation } from '../../lib/owners';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  // Authenticate caller
  const decoded = await verifyRequest(req.headers.authorization);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing token' });
  }

  // Check caller has admin/manager role
  if (!hasManagementAccess(decoded)) {
    return res.status(403).json({ error: 'Forbidden — requires admin or manager role' });
  }

  if (req.method === 'GET') {
    return handleList(req, res);
  }

  if (req.method === 'POST') {
    return handleCreate(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * GET /api/users?app=factory|crm
 * List users from the appropriate Firestore collection.
 */
async function handleList(req: VercelRequest, res: VercelResponse) {
  const app = (req.query.app as string) || 'factory';
  const collection = app === 'crm' ? 'users' : 'factory_users';

  try {
    const snap = await adminDb.collection(collection).get();
    const users = snap.docs.map(doc => {
      const data = doc.data();
      // Never return passwords
      delete data.password;
      return { ...data, _fbId: doc.id };
    });
    return res.status(200).json({ users });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to list users: ' + e.message });
  }
}

/**
 * POST /api/users
 * Create a new user: Firebase Auth account + Firestore profile + custom claims.
 *
 * Body: { username, email, password, name, nameHe?, nameTh?, role, status?, app? }
 */
async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const { username, email, password, name, nameHe, nameTh, role, status, app } = req.body || {};

  if (!username || !email || !password || !name) {
    return res.status(400).json({ error: 'Missing required fields: username, email, password, name' });
  }

  // Validate role
  const validRoles = ['admin', 'manager', 'worker'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be: admin, manager, or worker' });
  }

  const userRole = role || 'worker';
  const userStatus = status || 'active';
  const collection = app === 'crm' ? 'users' : 'factory_users';

  // Check if username already exists in Firestore
  const existing = await adminDb.collection(collection)
    .where('username', '==', username).limit(1).get();
  if (!existing.empty) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  try {
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
        // User exists in Auth but not in Firestore — get their UID
        firebaseUser = await adminAuth.getUserByEmail(email);
      } else {
        throw e;
      }
    }

    // Set custom claims (role)
    await adminAuth.setCustomUserClaims(firebaseUser.uid, { role: userRole });

    // Save profile to Firestore (no password)
    const profile = {
      username,
      email: email.toLowerCase(),
      name,
      ...(nameHe && { nameHe }),
      ...(nameTh && { nameTh }),
      role: userRole,
      status: userStatus,
      createdAt: new Date().toISOString(),
      firebaseUid: firebaseUser.uid,
    };

    await adminDb.collection(collection).add(profile);

    return res.status(201).json({ success: true, user: profile });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to create user: ' + e.message });
  }
}
