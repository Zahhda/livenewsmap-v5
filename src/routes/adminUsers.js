// src/routes/adminUsers.js
import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { adminRequired } from '../middleware/auth.js';

const router = express.Router();

router.get('/', adminRequired, async (req, res) => {
  const users = await User.find({}).sort({ createdAt: -1 }).lean();
  res.json({ users: users.map(u => ({ ...u, id: u._id })) });
});

router.post('/', adminRequired, async (req, res) => {
  try {
    const { name, email, phone = '', password, role = 'user' } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'Email already exists' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), phone, passwordHash, role: role === 'admin' ? 'admin' : 'user' });
    res.json({ user: user.toJSON() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.patch('/:id', adminRequired, async (req, res) => {
  try {
    const { role, isActive } = req.body || {};
    const updates = {};
    if (role) updates.role = role === 'admin' ? 'admin' : 'user';
    if (typeof isActive === 'boolean') updates.isActive = isActive;
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ user: user.toJSON() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', adminRequired, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get user visibility settings
router.get('/:id/visibility', adminRequired, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('visibleRegions visibleCountries hasVisibilityRestrictions');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      visibleRegions: user.visibleRegions || [],
      visibleCountries: user.visibleCountries || [],
      hasVisibilityRestrictions: user.hasVisibilityRestrictions || false
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get user visibility settings' });
  }
});

// Update user visibility settings
router.put('/:id/visibility', adminRequired, async (req, res) => {
  try {
    const { visibleRegions = [], visibleCountries = [], hasVisibilityRestrictions = false } = req.body || {};
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        visibleRegions,
        visibleCountries,
        hasVisibilityRestrictions
      },
      { new: true }
    );
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      visibleRegions: user.visibleRegions,
      visibleCountries: user.visibleCountries,
      hasVisibilityRestrictions: user.hasVisibilityRestrictions
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update user visibility settings' });
  }
});

export default router;
