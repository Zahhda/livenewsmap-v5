// src/utils/autoLearner.js
import { extendSignals } from './classify.js';

const counts = {}; // key: cat::phrase -> n

export function maybeLearn(cat, text) {
  // Extract 2-3 word phrases (rough, but effective)
  const tokens = (text.toLowerCase().replace(/[^a-z0-9\s-]/g,' ').match(/\b[a-z0-9-]{3,}\b/g) || []);
  for (let i = 0; i < tokens.length - 1; i++) {
    const phrase = `${tokens[i]} ${tokens[i+1]}`;
    // Skip very generic phrases
    if (/^(the|a|an|and|or|to|of|in|on|with|for)\b/.test(phrase)) continue;
    const key = `${cat}::${phrase}`;
    counts[key] = (counts[key] || 0) + 1;
    // If we’ve seen a phrase 6+ times linked to the same category, add it.
    if (counts[key] === 6) {
      extendSignals({ [cat]: { phrases: [phrase] } });
    }
  }
}
