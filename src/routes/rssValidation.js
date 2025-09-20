// src/routes/rssValidation.js
import express from 'express';
import { validateRSSFeed, validateMultipleRSSFeeds } from '../utils/rssValidator.js';

const router = express.Router();

// Validate a single RSS feed
router.post('/validate', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const validation = await validateRSSFeed(url);
    res.json(validation);
  } catch (error) {
    console.error('RSS validation error:', error);
    res.status(500).json({ 
      error: 'Failed to validate RSS feed',
      details: error.message 
    });
  }
});

// Validate multiple RSS feeds
router.post('/validate-multiple', async (req, res) => {
  try {
    const { urls } = req.body;
    
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    if (urls.length > 20) {
      return res.status(400).json({ error: 'Too many URLs (max 20)' });
    }

    const validations = await validateMultipleRSSFeeds(urls);
    res.json({ validations });
  } catch (error) {
    console.error('Multiple RSS validation error:', error);
    res.status(500).json({ 
      error: 'Failed to validate RSS feeds',
      details: error.message 
    });
  }
});

export default router;
