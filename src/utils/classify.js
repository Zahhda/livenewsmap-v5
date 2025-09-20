// src/utils/classify.js
export const CATEGORIES = ['war','politics','economy','society','culture','climate','peace','demise','others'];

// Enhanced classification with weighted keywords and context patterns
const SIGNALS = {
  war: {
    keywords: [
      'war', 'attack', 'missile', 'shelling', 'airstrike', 'drone', 'bomb', 'frontline', 'troop', 'ceasefire', 
      'fighter jet', 'invasion', 'artillery', 'clash', 'strike', 'battle', 'combat', 'military', 'soldier', 
      'weapon', 'gunfire', 'explosion', 'casualty', 'wounded', 'killed', 'death', 'violence', 'conflict', 
      'hostile', 'enemy', 'defense', 'offensive', 'raid', 'ambush', 'siege', 'bombardment', 'retaliation',
      'terrorist', 'terrorism', 'bombing', 'shooting', 'massacre', 'genocide', 'ethnic cleansing', 'refugee',
      'displaced', 'evacuation', 'shelter', 'humanitarian', 'crisis', 'emergency', 'disaster', 'catastrophe'
    ],
    patterns: [
      /\b(?:armed|military|combat|warfare|battlefield)\b/i,
      /\b(?:casualties|wounded|killed|deaths?)\b/i,
      /\b(?:explosion|blast|bomb|grenade|rocket)\b/i,
      /\b(?:troops|soldiers|militants|fighters)\b/i
    ],
    weight: 1.0
  },
  politics: {
    keywords: [
      'election', 'parliament', 'senate', 'cabinet', 'minister', 'policy', 'vote', 'campaign', 'coalition', 
      'bill', 'mp', 'mla', 'president', 'pm', 'governor', 'assembly', 'government', 'administration', 'office',
      'democracy', 'republic', 'monarchy', 'dictatorship', 'authoritarian', 'regime', 'leadership', 'candidate',
      'polling', 'ballot', 'referendum', 'constitution', 'law', 'legislation', 'congress', 'senate', 'house',
      'party', 'political', 'politician', 'statesman', 'diplomat', 'ambassador', 'summit', 'meeting', 'conference',
      'treaty', 'agreement', 'negotiation', 'deal', 'accord', 'pact', 'alliance', 'partnership', 'cooperation'
    ],
    patterns: [
      /\b(?:government|parliament|congress|senate|assembly)\b/i,
      /\b(?:election|vote|ballot|campaign|candidate)\b/i,
      /\b(?:president|minister|governor|mayor)\b/i,
      /\b(?:policy|legislation|bill|law|regulation)\b/i
    ],
    weight: 1.0
  },
  economy: {
    keywords: [
      'inflation', 'gdp', 'market', 'stocks', 'unemployment', 'trade', 'imports', 'exports', 'budget', 'deficit',
      'currency', 'interest rate', 'economy', 'economic', 'financial', 'banking', 'investment', 'business',
      'corporate', 'company', 'industry', 'manufacturing', 'production', 'revenue', 'profit', 'loss', 'debt',
      'credit', 'loan', 'mortgage', 'tax', 'taxation', 'fiscal', 'monetary', 'policy', 'recession', 'depression',
      'boom', 'growth', 'development', 'infrastructure', 'construction', 'real estate', 'property', 'housing',
      'employment', 'job', 'workforce', 'labor', 'wage', 'salary', 'income', 'wealth', 'poverty', 'inequality'
    ],
    patterns: [
      /\b(?:economy|economic|financial|market|trading)\b/i,
      /\b(?:inflation|deflation|recession|depression|boom)\b/i,
      /\b(?:unemployment|employment|job|workforce|labor)\b/i,
      /\b(?:stock|bond|investment|banking|currency)\b/i
    ],
    weight: 1.0
  },
  society: {
    keywords: [
      'protest', 'education', 'healthcare', 'crime', 'community', 'social', 'welfare', 'migration', 'school',
      'university', 'hospital', 'poverty', 'homeless', 'unemployment', 'discrimination', 'racism', 'sexism',
      'equality', 'rights', 'freedom', 'justice', 'law', 'police', 'court', 'trial', 'prison', 'jail',
      'reform', 'change', 'movement', 'activism', 'activist', 'demonstration', 'rally', 'march', 'strike',
      'union', 'labor', 'worker', 'employee', 'employer', 'retirement', 'pension', 'benefit', 'insurance',
      'health', 'medical', 'doctor', 'nurse', 'patient', 'treatment', 'disease', 'illness', 'epidemic'
    ],
    patterns: [
      /\b(?:protest|demonstration|rally|march|strike)\b/i,
      /\b(?:education|school|university|student|teacher)\b/i,
      /\b(?:healthcare|medical|hospital|doctor|patient)\b/i,
      /\b(?:crime|criminal|police|court|justice)\b/i
    ],
    weight: 1.0
  },
  culture: {
    keywords: [
      'festival', 'music', 'film', 'art', 'literature', 'heritage', 'museum', 'theatre', 'sport', 'celebration',
      'cultural', 'tradition', 'custom', 'religion', 'faith', 'church', 'temple', 'mosque', 'synagogue',
      'spiritual', 'belief', 'worship', 'ceremony', 'ritual', 'holiday', 'festival', 'carnival', 'parade',
      'entertainment', 'show', 'performance', 'concert', 'exhibition', 'gallery', 'theater', 'cinema',
      'book', 'novel', 'poetry', 'writing', 'author', 'artist', 'musician', 'actor', 'actress', 'director',
      'sports', 'athlete', 'competition', 'tournament', 'championship', 'olympics', 'world cup', 'team'
    ],
    patterns: [
      /\b(?:festival|celebration|cultural|tradition|heritage)\b/i,
      /\b(?:music|film|art|literature|entertainment)\b/i,
      /\b(?:religion|faith|church|temple|worship)\b/i,
      /\b(?:sport|athlete|competition|tournament|olympics)\b/i
    ],
    weight: 1.0
  },
  climate: {
    keywords: [
      'climate', 'flood', 'heatwave', 'drought', 'cyclone', 'hurricane', 'storm', 'wildfire', 'rainfall',
      'monsoon', 'earthquake', 'tsunami', 'weather', 'temperature', 'global warming', 'greenhouse', 'emission',
      'carbon', 'pollution', 'environment', 'environmental', 'ecosystem', 'biodiversity', 'conservation',
      'renewable', 'solar', 'wind', 'energy', 'fossil fuel', 'oil', 'gas', 'coal', 'nuclear', 'sustainable',
      'green', 'eco-friendly', 'recycling', 'waste', 'garbage', 'trash', 'plastic', 'ocean', 'sea', 'river',
      'forest', 'deforestation', 'extinction', 'endangered', 'species', 'wildlife', 'animal', 'plant', 'tree'
    ],
    patterns: [
      /\b(?:climate|weather|environment|environmental)\b/i,
      /\b(?:flood|drought|storm|hurricane|earthquake)\b/i,
      /\b(?:global warming|greenhouse|emission|carbon)\b/i,
      /\b(?:renewable|solar|wind|energy|sustainable)\b/i
    ],
    weight: 1.0
  },
  peace: {
    keywords: [
      'ceasefire', 'peace talk', 'agreement', 'truce', 'deal', 'accord', 'peace', 'peaceful', 'harmony',
      'reconciliation', 'mediation', 'negotiation', 'diplomacy', 'dialogue', 'cooperation', 'collaboration',
      'unity', 'solidarity', 'brotherhood', 'sisterhood', 'friendship', 'love', 'compassion', 'forgiveness',
      'healing', 'recovery', 'reconstruction', 'rebuilding', 'development', 'progress', 'hope', 'optimism',
      'celebration', 'victory', 'success', 'achievement', 'accomplishment', 'milestone', 'breakthrough'
    ],
    patterns: [
      /\b(?:peace|peaceful|harmony|reconciliation|mediation)\b/i,
      /\b(?:agreement|truce|deal|accord|treaty)\b/i,
      /\b(?:cooperation|collaboration|unity|solidarity)\b/i,
      /\b(?:success|achievement|victory|breakthrough)\b/i
    ],
    weight: 1.0
  },
  demise: {
    keywords: [
      'dies', 'death', 'passed away', 'obituary', 'killed', 'dead', 'fatal', 'mourns', 'condolence',
      'funeral', 'burial', 'memorial', 'tribute', 'legacy', 'remember', 'memory', 'grief', 'sorrow', 'sadness',
      'tragedy', 'accident', 'disaster', 'catastrophe', 'crisis', 'emergency', 'urgent', 'critical', 'serious',
      'injury', 'wounded', 'hurt', 'pain', 'suffering', 'agony', 'distress', 'anguish', 'despair', 'hopeless'
    ],
    patterns: [
      /\b(?:death|died|killed|fatal|obituary)\b/i,
      /\b(?:tragedy|accident|disaster|catastrophe)\b/i,
      /\b(?:mourning|grief|sorrow|condolence|funeral)\b/i,
      /\b(?:injury|wounded|hurt|pain|suffering)\b/i
    ],
    weight: 1.0
  }
};

function score(text) {
  const t = (text || '').toLowerCase();
  const scores = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  
  for (const [cat, data] of Object.entries(SIGNALS)) {
    let score = 0;
    
    // Count keyword matches
    for (const keyword of data.keywords) {
      if (t.includes(keyword)) {
        score += 1;
      }
    }
    
    // Count pattern matches (weighted higher)
    for (const pattern of data.patterns) {
      const matches = t.match(pattern);
      if (matches) {
        score += matches.length * 2; // Patterns are weighted higher
      }
    }
    
    // Apply category weight
    scores[cat] = score * data.weight;
  }
  
  return scores;
}

export function classifyText(text) {
  const s = score(text);
  let best = 'others', bestVal = -1;
  
  // Find the category with the highest score
  for (const [k, v] of Object.entries(s)) {
    if (v > bestVal) {
      best = k;
      bestVal = v;
    }
  }
  
  // If no strong signal, return 'others'
  return bestVal > 0 ? best : 'others';
}

export function dominantCategory(items = []) {
  const counts = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  for (const it of items) counts[classifyText(`${it.title} ${it.summary}`)]++;
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'others';
}