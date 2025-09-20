// src/middleware/adminToken.js
export function adminTokenRequired(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return res.status(500).json({ error: 'ADMIN_TOKEN not configured on server' });

  const supplied = req.headers['x-admin-token'] || '';
  if (supplied !== expected) {
    return res.status(403).json({ error: 'Invalid admin token' });
  }
  next();
}
