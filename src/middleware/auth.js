// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const COOKIE_NAME = 'token';

// read token from cookie or Authorization Bearer
function readToken(req) {
  const bearer = (req.headers.authorization || '').trim();
  if (bearer.toLowerCase().startsWith('bearer ')) {
    return bearer.slice(7).trim();
  }
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return String(req.cookies[COOKIE_NAME]);
  }
  return '';
}

export async function authRequired(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Ensure user still exists
    const user = await User.findById(decoded.id).select('_id role');
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    req.user = { id: String(user._id), role: user.role };
    return next();
  } catch (e) {
    console.error('authRequired error', e);
    return res.status(500).json({ error: 'Auth failed' });
  }
}

export async function adminRequired(req, res, next) {
  // First ensure authenticated
  await authRequired(req, res, async () => {
    // Then ensure admin role
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  });
}
