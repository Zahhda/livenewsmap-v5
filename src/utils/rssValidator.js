// src/utils/rssValidator.js
import Parser from 'rss-parser';

const parser = new Parser({ 
  timeout: 10000, 
  requestOptions: { 
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  } 
});

// Validate RSS URL format
export function isValidRSSUrl(url) {
  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
}

// Validate RSS feed content
export async function validateRSSFeed(url) {
  const result = {
    isValid: false,
    hasContent: false,
    itemCount: 0,
    error: null,
    feedTitle: null,
    lastItemDate: null,
    sampleItems: [],
    feedDescription: null,
    feedLink: null,
    validationDetails: {
      urlFormat: false,
      feedStructure: false,
      hasItems: false,
      hasRecentContent: false,
      feedTitle: false
    }
  };

  try {
    // Check URL format first
    if (!isValidRSSUrl(url)) {
      result.error = 'Invalid URL format - must be http:// or https://';
      return result;
    }
    result.validationDetails.urlFormat = true;

    // Try to parse the RSS feed
    const feed = await parser.parseURL(url);
    
    if (!feed) {
      result.error = 'Failed to parse RSS feed';
      return result;
    }

    // Check basic feed structure
    if (!feed.items || !Array.isArray(feed.items)) {
      result.error = 'Invalid RSS structure - no items array';
      return result;
    }
    result.validationDetails.feedStructure = true;

    // Check if feed has content
    result.hasContent = feed.items.length > 0;
    result.itemCount = feed.items.length;
    result.feedTitle = feed.title || 'Unknown Feed';
    result.feedDescription = feed.description || null;
    result.feedLink = feed.link || null;
    
    if (result.hasContent) {
      result.validationDetails.hasItems = true;
    }
    
    if (result.feedTitle && result.feedTitle !== 'Unknown Feed') {
      result.validationDetails.feedTitle = true;
    }
    
    // Get sample items (first 3)
    result.sampleItems = feed.items.slice(0, 3).map(item => ({
      title: item.title || 'No title',
      link: item.link || '',
      pubDate: item.pubDate || item.isoDate || null
    }));

    // Check for recent content (within last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentItems = feed.items.filter(item => {
      const itemDate = new Date(item.pubDate || item.isoDate || 0);
      return itemDate > thirtyDaysAgo;
    });

    if (recentItems.length === 0) {
      result.error = 'No recent content (last 30 days) - feed may be inactive';
    } else {
      result.lastItemDate = recentItems[0].pubDate || recentItems[0].isoDate;
      result.validationDetails.hasRecentContent = true;
    }

    // Feed is valid if it has content and recent items
    result.isValid = result.hasContent && recentItems.length > 0;

    // Provide detailed error messages
    if (!result.isValid && !result.error) {
      const issues = [];
      if (!result.validationDetails.urlFormat) issues.push('Invalid URL format');
      if (!result.validationDetails.feedStructure) issues.push('Invalid RSS structure');
      if (!result.validationDetails.hasItems) issues.push('No RSS items found');
      if (!result.validationDetails.hasRecentContent) issues.push('No recent content');
      if (!result.validationDetails.feedTitle) issues.push('Missing feed title');
      
      result.error = issues.join(', ');
    }

  } catch (error) {
    console.error('RSS validation error:', error);
    
    if (error.code === 'ENOTFOUND') {
      result.error = 'URL not found (404) - check if the feed URL is correct';
    } else if (error.code === 'ECONNREFUSED') {
      result.error = 'Connection refused - server may be down';
    } else if (error.code === 'ETIMEDOUT') {
      result.error = 'Request timed out - server is too slow';
    } else if (error.message.includes('Invalid XML')) {
      result.error = 'Invalid RSS/XML format - not a valid RSS feed';
    } else if (error.message.includes('Feed not recognized')) {
      result.error = 'Not a valid RSS feed - check URL format';
    } else if (error.message.includes('CORS')) {
      result.error = 'CORS error - feed blocks cross-origin requests';
    } else if (error.message.includes('SSL')) {
      result.error = 'SSL/TLS error - certificate issue';
    } else {
      result.error = error.message || 'Unknown error occurred';
    }
  }

  return result;
}

// Validate multiple RSS feeds in parallel
export async function validateMultipleRSSFeeds(urls) {
  const validationPromises = urls.map(async (url) => {
    const validation = await validateRSSFeed(url);
    return { url, ...validation };
  });

  return Promise.all(validationPromises);
}
