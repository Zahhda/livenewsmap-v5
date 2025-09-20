// src/routes/admin.js
import express from 'express';
import { adminRequired } from '../middleware/auth.js';

const router = express.Router();

router.get('/health', adminRequired, (req, res) => {
  res.json({ ok: true, admin: req.user.id });
});

export default router;
