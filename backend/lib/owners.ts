// Owner emails — server-side single source of truth.
// These accounts can NEVER be deleted, downgraded, or deactivated.
export const OWNER_EMAILS = [
  'guymaich@gmail.com',
  'yonatangarini@gmail.com',
];

export function isOwner(email: string): boolean {
  return OWNER_EMAILS.includes(email.toLowerCase());
}

/**
 * Validate that an operation on an owner account is allowed.
 * Returns an error string if blocked, null if allowed.
 */
export function validateOwnerOperation(
  targetEmail: string,
  operation: 'delete' | 'update',
  updates?: { role?: string; status?: string }
): string | null {
  if (!isOwner(targetEmail)) return null;

  if (operation === 'delete') {
    return 'Cannot delete owner accounts';
  }

  if (updates?.role && updates.role !== 'admin') {
    return 'Cannot downgrade owner role from admin';
  }

  if (updates?.status === 'inactive') {
    return 'Cannot deactivate owner accounts';
  }

  return null;
}
