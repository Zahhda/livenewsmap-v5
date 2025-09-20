// src/routes/readLater.js
import express from 'express';
import crypto from 'crypto';
import { authRequired } from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();
const keyFor = (link) => crypto.createHash('sha1').update(String(link||'')).digest('hex');

// Get saved list
router.get('/', authRequired, async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  res.json({ items: user?.savedNews || [] });
});

// Save an item
router.post('/', authRequired, async (req, res) => {
  const { title='', summary='', link='', isoDate=null, image='', source='', category='others' } = req.body || {};
  if (!link) return res.status(400).json({ error: 'link required' });
  const key = keyFor(link);

  const user = await User.findById(req.user.id);
  const exists = user.savedNews.find(n => n.key === key);
  if (!exists) {
    user.savedNews.unshift({ key, title, summary, link, isoDate, image, source, category });
    user.savedNews = user.savedNews.slice(0, 500); // cap
    await user.save();
  }
  res.json({ ok: true });
});

// Remove an item
router.delete('/:key', authRequired, async (req, res) => {
  const { key } = req.params;
  const user = await User.findById(req.user.id);
  user.savedNews = user.savedNews.filter(n => n.key !== key);
  await user.save();
  res.json({ ok: true });
});

export default router;
