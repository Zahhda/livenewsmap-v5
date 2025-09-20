import express from 'express';
import Region from '../models/Region.js';

const router = express.Router();

// List regions (optionally by country)
router.get('/', async (req, res) => {
  const { country } = req.query;
  const q = country ? { country } : {};
  const regions = await Region.find(q).sort({ country:1, name:1 }).lean();
  res.json(regions);
});

export default router;
