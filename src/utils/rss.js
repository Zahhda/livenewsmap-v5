// src/utils/rss.js
import Parser from 'rss-parser';

const parser = new Parser({ 
  timeout: 3000, 
  requestOptions: { 
    timeout: 3000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  },
  customFields: {
    feed: ['title', 'description', 'link'],
    item: ['title', 'link', 'pubDate', 'content', 'contentSnippet', 'summary', 'enclosure', 'media:content']
  }
});

function cleanText(input = '') {
  return String(input).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toIsoDate(d) {
  if (!d) return null;
  try {
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : t.toISOString();
  } catch { return null; }
}

function extractImage(it) {
  if (it?.enclosure?.url) return it.enclosure.url;
  if (it?.['media:content']?.url) return it['media:content'].url;
  const html = it?.content || it?.['content:encoded'] || '';
  const m = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : '';
}

// Common RSS feed URL fixes and problematic feeds
const FEED_FIXES = {
  'https://www.reuters.com/rssFeed/middleeastNews': 'https://feeds.reuters.com/reuters/MideastCrisis',
  'https://www.themoscowtimes.com/feeds/news': 'https://www.themoscowtimes.com/rss/news',
  'https://feeds.reuters.com/reuters/MideastCrisis': 'https://feeds.reuters.com/reuters/MideastCrisis',
  'https://rss.app/feeds/NTSIMYzhcauGVNzd.xml': 'https://feeds.bbci.co.uk/news/world/rss.xml', // Replace broken RSS.app feed
  'https://www.rt.com/rss/news/': 'https://feeds.bbci.co.uk/news/world/rss.xml', // RT often blocked, use BBC
  'https://feeds.bbci.co.uk/news/world/rss.xml': 'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://www.aljazeera.com/xml/rss/all.xml': 'https://www.aljazeera.com/xml/rss/all.xml'
};

// Known problematic feeds that should be skipped
const PROBLEMATIC_FEEDS = [
  'https://rss.app/feeds/NTSIMYzhcauGVNzd.xml', // Often returns invalid XML
  'https://www.rt.com/rss/news/' // Often blocked or returns non-XML content
];

// Validate XML content before parsing
function validateXmlContent(content) {
  if (!content || typeof content !== 'string') return false;
  
  // Check if content starts with XML declaration or RSS/Atom tags
  const trimmed = content.trim();
  if (trimmed.startsWith('<?xml') || 
      trimmed.startsWith('<rss') || 
      trimmed.startsWith('<feed') || 
      trimmed.startsWith('<channel')) {
    return true;
  }
  
  // Check for common non-XML responses
  if (trimmed.includes('<!DOCTYPE html') || 
      trimmed.includes('<html') || 
      trimmed.includes('404') || 
      trimmed.includes('Not Found') ||
      trimmed.includes('Access Denied')) {
    return false;
  }
  
  return true;
}

// Retry mechanism with exponential backoff and content validation
async function fetchWithRetry(url, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = 1000; // Reduced delay: 1s only
        console.log(`Retrying ${url} in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // First, try to fetch raw content to validate
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 3000 // Reduced timeout to 3 seconds
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const content = await response.text();
      
      // Validate content before parsing
      if (!validateXmlContent(content)) {
        throw new Error('Invalid XML content - not a valid RSS/Atom feed');
      }
      
      // Parse the validated content
      const feed = await parser.parseString(content);
      return feed;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error; // Re-throw on final attempt
      }
      console.warn(`Attempt ${attempt + 1} failed for ${url}:`, error?.message || error);
    }
  }
}

export async function fetchFeed(url) {
  try {
    // Skip known problematic feeds
    if (PROBLEMATIC_FEEDS.includes(url)) {
      console.warn(`Skipping known problematic feed: ${url}`);
      return [];
    }
    
    console.log(`Fetching RSS feed: ${url}`);
    const feed = await fetchWithRetry(url);
    
    if (!feed || !feed.items) {
      console.warn(`No items found in feed: ${url}`);
      return [];
    }
    
    const items = (feed.items || [])
      .map(it => {
        const title = cleanText(it.title || '');
        const summary = cleanText(it.contentSnippet || it.content || it.summary || '');
        const link = it.link || '';
        const isoDate = toIsoDate(it.isoDate || it.pubDate || null);
        const image = extractImage(it);
        const source = (feed && feed.title) || '';
        return { title, summary, link, isoDate, image, source };
      })
      .filter(it => it.title || it.link);
    
    console.log(`Successfully fetched ${items.length} items from: ${url}`);
    return items;
  } catch (e) {
    // Handle specific error types
    if (e.code === 'ENOTFOUND') {
      console.error(`Feed not found (404): ${url}`);
    } else if (e.code === 'ECONNREFUSED') {
      console.error(`Connection refused: ${url}`);
    } else if (e.code === 'ETIMEDOUT') {
      console.error(`Request timeout: ${url}`);
    } else if (e.statusCode === 401) {
      console.error(`Unauthorized (401): ${url} - Feed may require authentication`);
    } else if (e.statusCode === 403) {
      console.error(`Forbidden (403): ${url} - Access denied`);
    } else if (e.statusCode === 404) {
      console.error(`Not found (404): ${url} - Feed URL may be incorrect`);
    } else if (e.message && e.message.includes('Invalid XML content')) {
      console.error(`Invalid XML content from: ${url} - Feed may be returning HTML or other non-XML content`);
    } else {
      console.error(`Feed error ${url}:`, e?.message || e);
    }
    
    // Try alternative URL if available
    const alternativeUrl = FEED_FIXES[url];
    if (alternativeUrl && alternativeUrl !== url) {
      console.log(`Trying alternative URL: ${alternativeUrl}`);
      try {
        const feed = await fetchWithRetry(alternativeUrl);
        if (feed && feed.items) {
          const items = (feed.items || [])
            .map(it => {
              const title = cleanText(it.title || '');
              const summary = cleanText(it.contentSnippet || it.content || it.summary || '');
              const link = it.link || '';
              const isoDate = toIsoDate(it.isoDate || it.pubDate || null);
              const image = extractImage(it);
              const source = (feed && feed.title) || '';
              return { title, summary, link, isoDate, image, source };
            })
            .filter(it => it.title || it.link);
          
          console.log(`Successfully fetched ${items.length} items from alternative URL: ${alternativeUrl}`);
          return items;
        }
      } catch (altError) {
        console.error(`Alternative URL also failed: ${alternativeUrl}`, altError?.message || altError);
      }
    }
    
    return [];
  }
}
