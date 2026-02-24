import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_ORIGINS = [
  'https://guymaich-jpg.github.io', // both apps on GitHub Pages
  'http://localhost:8080',           // Factory Control local dev
  'http://localhost:5173',           // CRM local dev (Vite)
  'http://localhost:3000',           // alternative local dev
];

/**
 * Set CORS headers on the response.
 * Returns true if this was a preflight OPTIONS request (caller should return early).
 */
export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin as string | undefined;
  const allowed = ALLOWED_ORIGINS.includes(origin || '') ? origin : undefined;

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}
