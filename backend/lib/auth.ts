import { adminAuth } from './firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';

/**
 * Verify a Firebase ID token from the Authorization header.
 * Returns the decoded token (with uid, email, custom claims) or null if invalid.
 */
export async function verifyRequest(
  authHeader: string | undefined
): Promise<DecodedIdToken | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    return null;
  }
}

/**
 * Check if the caller has admin or manager role (from custom claims or Firestore).
 * Custom claims are set on the Firebase Auth user: { role: 'admin' | 'manager' | 'worker' }
 */
export function hasManagementAccess(decoded: DecodedIdToken): boolean {
  const role = decoded.role as string | undefined;
  return role === 'admin' || role === 'manager';
}
