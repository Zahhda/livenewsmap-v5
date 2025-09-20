// src/routes/news.js
import express from 'express';
import Region from '../models/Region.js';
import { fetchFeed } from '../utils/rss.js';
import { classifyText, dominantCategory } from '../utils/classify.js';
import NodeCache from 'node-cache';

const router = express.Router();
const cache = new NodeCache({ stdTTL: 300, checkperiod: 120 }); // 5 minute cache

// Simple language detection for classification
function isEnglish(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return true;
  }
  return /^[a-zA-Z0-9\s.,!?;:'"()-]+$/.test(text.trim());
}

function dedupeKey(it) {
  const base = (it.link || '').trim().toLowerCase();
  if (base) return `l:${base}`;
  const t = (it.title || '').trim().toLowerCase();
  const d = it.isoDate ? new Date(it.isoDate).getTime() : 0;
  return `t:${t}|d:${d}`;
}

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const limitNum = Math.max(1, Math.min(100, parseInt(req.query.limit || '30', 10)));
    const forceRefresh = req.query.force === '1' || req.query.force === 'true';
    const cacheKey = `news:${id}:${limitNum}`;

    if (!forceRefresh) {
      const hit = cache.get(cacheKey);
      if (hit) return res.json(hit);
    }

    const region = await Region.findById(id).lean();
    if (!region) return res.status(404).json({ error: 'Region not found' });

    // Smart RSS fetching - only fetch if cache is stale or force refresh
    const feedPromises = (region.feeds || []).map(async (f) => {
      try {
        // Check if we have recent data for this feed
        const feedCacheKey = `feed:${f.url}`;
        const cachedFeed = cache.get(feedCacheKey);
        
        if (!forceRefresh && cachedFeed && Date.now() - cachedFeed.timestamp < 300000) {
          console.log(`Using cached feed data for ${f.url}`);
          return cachedFeed.data;
        }
        
        // Fetch fresh data
        const feedData = await fetchFeed(f.url);
        cache.set(feedCacheKey, { data: feedData, timestamp: Date.now() });
        return feedData;
      } catch (error) {
        console.warn(`Failed to fetch feed ${f.url}:`, error.message);
        return [];
      }
    });
    
    const feedResults = await Promise.allSettled(feedPromises);
    
    let items = [];
    feedResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        items.push(...result.value);
      }
    });

    const seen = new Set();
    items = items.filter(it => {
      const k = dedupeKey(it);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Process items for classification
    const processedItems = items.map(it => {
      const title = it.title || '';
      const summary = it.summary || '';
      
      // Classify using original text
      const category = classifyText(`${title} ${summary}`);
      
      return {
        ...it,
        category
      };
    });
    
    items = processedItems
      .sort((a,b) => (new Date(b.isoDate||0)) - (new Date(a.isoDate||0)))
      .slice(0, limitNum);

    const payload = { regionId: id, dominantCategory: dominantCategory(items), count: items.length, items };
    if (!forceRefresh) cache.set(cacheKey, payload);
    res.json(payload);
  } catch (e) {
    console.error('news error', e);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

export default router;
