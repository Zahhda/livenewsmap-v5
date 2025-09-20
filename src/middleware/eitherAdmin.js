// src/middleware/eitherAdmin.js
import { adminRequired } from './auth.js';

export function adminTokenOrJwt(req, res, next) {
  const supplied = req.headers['x-admin-token'] || '';
  const expected = process.env.ADMIN_TOKEN || process.env.ADMIN_PANEL_TOKEN || '';

  if (expected && supplied && supplied === expected) {
    // Header token OK → allow immediately
    return next();
  }
  // Otherwise, fall back to JWT admin check
  return adminRequired(req, res, next);
}
