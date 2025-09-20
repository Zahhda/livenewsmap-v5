// src/routes/adminRegions.js
import express from 'express';
import Region from '../models/Region.js';
import { adminTokenRequired } from '../middleware/adminToken.js';

const router = express.Router();

// Require correct admin token for ALL region admin ops
router.use(adminTokenRequired);

// GET -> plain array so admin.js can do regions.slice()
router.get('/', async (req, res) => {
  const regions = await Region.find({}).sort({ country: 1, name: 1 }).lean();
  res.json(regions);
});

router.post('/', async (req, res) => {
  const { name, country, lat, lng, feeds = [] } = req.body || {};
  if (!name || !country || lat == null || lng == null) {
    return res.status(400).json({ error: 'name, country, lat, lng required' });
  }
  const region = await Region.create({
    name,
    country,
    lat: Number(lat),
    lng: Number(lng),
    feeds: (Array.isArray(feeds) ? feeds : []).map(f => ({
      url: (f?.url || f)?.toString().trim(),
      category: (f?.category || 'others').trim() || 'others'
    }))
  });
  res.json(region.toObject());
});

router.put('/:id', async (req, res) => {
  const { name, country, lat, lng, feeds } = req.body || {};
  const updates = {};
  if (name != null) updates.name = name;
  if (country != null) updates.country = country;
  if (lat != null) updates.lat = Number(lat);
  if (lng != null) updates.lng = Number(lng);
  if (feeds != null) {
    updates.feeds = (Array.isArray(feeds) ? feeds : []).map(f => ({
      url: (f?.url || f)?.toString().trim(),
      category: (f?.category || 'others').trim() || 'others'
    }));
  }
  const region = await Region.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!region) return res.status(404).json({ error: 'Region not found' });
  res.json(region.toObject());
});

router.delete('/:id', async (req, res) => {
  await Region.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

export default router;
