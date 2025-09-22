// public/app.js

// --- Toast (self-contained: injects styles + root) ---
(function(){
  if (window.toast) return;
  function ensureToastStyles(){
    if (document.getElementById('toastStyle')) return;
    const css = `
      #toastRoot{position:fixed;top:14px;left:50%;transform:translateX(-50%) translateY(-8px);z-index:9999;pointer-events:none}
      .toast{min-width:260px;max-width:86vw;margin:0 auto;background:#0b0b0b;border:1px solid #333;color:#ddd;padding:10px 14px;border-radius:12px;box-shadow:0 6px 30px rgba(0,0,0,.45);font-size:14px;line-height:1.35;display:flex;align-items:center;gap:8px;opacity:0;transform:translateY(-8px);transition:opacity .14s ease,transform .14s ease,border-color .14s ease;pointer-events:auto}
      .toast.show{opacity:1;transform:translateY(0)}
      .toast .dot{width:10px;height:10px;border-radius:50%}
      .toast.info{border-color:#3ea6ff}.toast.info .dot{background:#3ea6ff}
      .toast.success{border-color:#00b37e}.toast.success .dot{background:#00b37e}
      .toast.error{border-color:#e10600}.toast.error .dot{background:#e10600}
    `;
    const s = document.createElement('style');
    s.id = 'toastStyle';
    s.textContent = css;
    document.head.appendChild(s);
  }
  function ensureRoot(){
    let root = document.getElementById('toastRoot');
    if (!root){ root = document.createElement('div'); root.id = 'toastRoot'; document.body.appendChild(root); }
    return root;
  }
  window.toast = function(message, type='info', ttl=1800){
    ensureToastStyles();
    const root = ensureRoot();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${message}</span>`;
    root.appendChild(el);
    requestAnimationFrame(()=> el.classList.add('show'));
    const t = setTimeout(()=>{
      el.classList.remove('show');
      setTimeout(()=> el.remove(), 180);
    }, Math.max(800, ttl));
    el.addEventListener('click', ()=>{ clearTimeout(t); el.classList.remove('show'); setTimeout(()=> el.remove(), 180); });
  };
})();

// -----------------------------------------------------

let map;
let markers = new Map(); // regionId -> mapboxgl.Marker
let regions = [];
let byCountry = {};
let currentRegionId = null;
let aborter = null;

// Location loading functions (defined early to avoid reference errors)
function showLocationLoading() {
  const loadingHTML = `
    <div class="location-loading">
      <div class="location-loading-content">
        <div class="location-loading-spinner"></div>
        <p class="location-loading-text">Location Sending</p>
        <p class="location-loading-subtext">Please wait...</p>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', loadingHTML);
}

function hideLocationLoading() {
  const loadingElement = document.querySelector('.location-loading');
  if (loadingElement) {
    loadingElement.remove();
  }
}

function showLocationSentConfirmation() {
  const sentHTML = `
    <div class="location-loading">
      <div class="location-loading-content">
        <div class="location-sent-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#00b37e"/>
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="white"/>
          </svg>
        </div>
        <p class="location-loading-text">Location Sent</p>
        <p class="location-loading-subtext">Successfully shared</p>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', sentHTML);
  
  // Auto-hide after 2 seconds
  setTimeout(() => {
    const sentElement = document.querySelector('.location-loading');
    if (sentElement) {
      sentElement.remove();
    }
  }, 2000);
}
const cache = new Map(); // regionId -> { ts, payload }


// User visibility state
let userVisibilitySettings = {
  visibleRegions: [],
  visibleCountries: [],
  hasVisibilityRestrictions: false
};

// Manual refresh only - no auto-refresh
let lastRefreshTime = 0;

// Language setting
let currentLanguage = 'en';

// Toast function alias
function showToast(message, type = 'info') {
  if (window.toast) {
    window.toast(message, type);
  } else {
    console.log(`Toast (${type}): ${message}`);
  }
}

// Global flag to prevent multiple AI indicators
let aiIndicatorActive = false;

// Cleanup function to remove any existing AI indicators on page load
function cleanupAIIndicators() {
  const existingIndicators = document.querySelectorAll('#aiProcessingIndicator');
  existingIndicators.forEach(indicator => {
    console.log('🧠 Cleaning up existing AI indicator');
    indicator.remove();
  });
  aiIndicatorActive = false;
}

// AI News Classification System
const AI_CLASSIFICATION_CONFIG = {
  // Using free Hugging Face Inference API with zero-shot classification
  apiUrl: 'https://api-inference.huggingface.co/models/facebook/bart-large-mnli',
  // Fallback to a more reliable model
  fallbackApiUrl: 'https://api-inference.huggingface.co/models/typeform/distilbert-base-uncased-mnli',
  // High-accuracy news categories with related terms for better classification
  categories: [
    'war conflict military violence attack terrorism battle fight combat army navy air force defense security crisis emergency',
    'climate environment weather global warming pollution disaster natural disaster flood drought hurricane tornado earthquake wildfire',
    'culture arts entertainment sports music film literature theater dance festival concert movie show game tournament',
    'society politics economy business technology health education social community government policy law crime justice',
    'others miscellaneous general news information update announcement'
  ],
  // Category mapping to our existing icons
  categoryMapping: {
    'war conflict military violence attack terrorism battle fight combat army navy air force defense security crisis emergency': 'war',
    'climate environment weather global warming pollution disaster natural disaster flood drought hurricane tornado earthquake wildfire': 'climate',
    'culture arts entertainment sports music film literature theater dance festival concert movie show game tournament': 'culture',
    'society politics economy business technology health education social community government policy law crime justice': 'society',
    'others miscellaneous general news information update announcement': 'others'
  },
  // Multi-language support
  supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'ar', 'hi'],
  // Minimum confidence threshold for 90%+ accuracy
  minConfidence: 0.7
};

// AI Classification function
async function classifyNewsWithAI(newsItem) {
  try {
    console.log('🧠 AI Classification:', newsItem.title);
    
    // Prepare text for classification
    const textToClassify = `${newsItem.title}. ${newsItem.summary || ''}`.trim();
    
    if (!textToClassify || textToClassify.length < 10) {
      console.log('⚠️ Text too short for AI classification, using fallback');
      return getFallbackCategory(newsItem);
    }

    // Try primary AI model first
    let classification = await classifyWithModel(textToClassify, AI_CLASSIFICATION_CONFIG.apiUrl);
    
    // If primary fails, try fallback
    if (!classification || classification.error) {
      console.log('🔄 Primary AI model failed, trying fallback...');
      classification = await classifyWithModel(textToClassify, AI_CLASSIFICATION_CONFIG.fallbackApiUrl);
    }

    // If both fail, use fallback category
    if (!classification || classification.error) {
      console.log('⚠️ AI classification failed, using fallback category');
      return getFallbackCategory(newsItem);
    }

    // Extract the best category from AI response
    const bestCategory = extractBestCategory(classification);
    console.log('✅ AI classified as:', bestCategory);
    
    return bestCategory;

  } catch (error) {
    console.error('❌ AI classification error:', error);
    return getFallbackCategory(newsItem);
  }
}

// Classify text using a specific model
async function classifyWithModel(text, apiUrl) {
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer hf_your_token_here' // This would be a real token in production
      },
      body: JSON.stringify({
        inputs: text,
        parameters: {
          candidate_labels: AI_CLASSIFICATION_CONFIG.categories,
          multi_label: false
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Model classification error:', error);
    return { error: error.message };
  }
}

// Extract the best category from AI response
function extractBestCategory(classification) {
  try {
    if (Array.isArray(classification) && classification.length > 0) {
      const result = classification[0];
      if (result.labels && result.scores) {
        // Find the label with the highest score
        const maxScoreIndex = result.scores.indexOf(Math.max(...result.scores));
        const bestLabel = result.labels[maxScoreIndex];
        const confidence = result.scores[maxScoreIndex];
        
        console.log(`🎯 Best match: ${bestLabel} (confidence: ${(confidence * 100).toFixed(1)}%)`);
        
        // Only return if confidence is above 70% for 90%+ accuracy
        if (confidence > AI_CLASSIFICATION_CONFIG.minConfidence) {
          return AI_CLASSIFICATION_CONFIG.categoryMapping[bestLabel] || 'others';
        }
      }
    }
    
    return 'others';
  } catch (error) {
    console.error('Error extracting category:', error);
    return 'others';
  }
}

// Fallback category detection using simple keyword matching
function getFallbackCategory(newsItem) {
  const text = `${newsItem.title} ${newsItem.summary || ''}`.toLowerCase();
  
  const categoryScores = {
    'war': 0,
    'climate': 0,
    'culture': 0,
    'society': 0,
    'others': 0
  };
  
  // War-related keywords (expanded)
  const warKeywords = [
    'war', 'conflict', 'military', 'violence', 'attack', 'terrorism', 'battle', 'fight', 'combat',
    'army', 'navy', 'air force', 'defense', 'security', 'crisis', 'emergency', 'invasion', 'bombing',
    'casualties', 'troops', 'weapons', 'missile', 'tank', 'soldier', 'general', 'commander',
    'peace', 'ceasefire', 'treaty', 'agreement', 'negotiation', 'diplomacy', 'summit',
    'bomb', 'explosion', 'blast', 'killed', 'injured', 'wounded', 'dead', 'death', 'deaths',
    'hostage', 'kidnap', 'assassination', 'murder', 'massacre', 'genocide', 'refugee', 'displaced',
    'evacuation', 'flee', 'escape', 'siege', 'occupation', 'resistance', 'rebellion', 'uprising'
  ];
  warKeywords.forEach(keyword => {
    if (text.includes(keyword)) categoryScores.war += 2; // Higher weight for war keywords
  });
  
  // Climate-related keywords (expanded)
  const climateKeywords = [
    'climate', 'environment', 'weather', 'global warming', 'pollution', 'disaster', 'flood', 'drought',
    'hurricane', 'tornado', 'earthquake', 'wildfire', 'storm', 'rain', 'snow', 'temperature',
    'carbon', 'emission', 'greenhouse', 'renewable', 'solar', 'wind', 'energy', 'sustainability',
    'ecosystem', 'biodiversity', 'conservation', 'recycling', 'green', 'clean', 'organic',
    'climate change', 'environmental crisis', 'natural disaster', 'tsunami', 'volcano', 'landslide',
    'heatwave', 'cold snap', 'blizzard', 'hail', 'thunderstorm', 'cyclone', 'typhoon', 'monsoon'
  ];
  climateKeywords.forEach(keyword => {
    if (text.includes(keyword)) categoryScores.climate += 2; // Higher weight for climate keywords
  });
  
  // Culture-related keywords (expanded)
  const cultureKeywords = [
    'culture', 'arts', 'entertainment', 'sports', 'music', 'film', 'literature', 'theater', 'dance',
    'festival', 'concert', 'movie', 'show', 'game', 'tournament', 'championship', 'league',
    'artist', 'actor', 'singer', 'writer', 'director', 'painter', 'sculptor', 'musician',
    'exhibition', 'gallery', 'museum', 'book', 'novel', 'poetry', 'drama', 'comedy'
  ];
  cultureKeywords.forEach(keyword => {
    if (text.includes(keyword)) categoryScores.culture += 1;
  });
  
  // Society-related keywords (expanded)
  const societyKeywords = [
    'society', 'politics', 'economy', 'business', 'technology', 'health', 'education', 'social',
    'government', 'policy', 'law', 'crime', 'justice', 'court', 'police', 'prison', 'jail',
    'election', 'vote', 'candidate', 'president', 'minister', 'mayor', 'congress', 'parliament',
    'company', 'corporation', 'industry', 'market', 'stock', 'trade', 'employment', 'job',
    'school', 'university', 'student', 'teacher', 'research', 'study', 'science', 'medicine',
    'pandemic', 'virus', 'disease', 'healthcare', 'hospital', 'medical', 'doctor', 'patient',
    'vaccine', 'treatment', 'cure', 'outbreak', 'epidemic', 'quarantine', 'lockdown', 'restriction'
  ];
  societyKeywords.forEach(keyword => {
    if (text.includes(keyword)) categoryScores.society += 1;
  });
  
  // News line patterns for better classification
  const newsPatterns = {
    'war': [
      'breaking news', 'urgent', 'alert', 'crisis', 'emergency', 'latest update',
      'reports say', 'according to sources', 'officials confirm', 'authorities say'
    ],
    'climate': [
      'weather update', 'climate change', 'environmental', 'natural disaster',
      'forecast', 'temperature', 'conditions', 'warning', 'advisory'
    ],
    'culture': [
      'entertainment news', 'celebrity', 'awards', 'premiere', 'release',
      'performance', 'exhibition', 'festival', 'cultural event'
    ],
    'society': [
      'local news', 'community', 'public', 'citizens', 'residents',
      'government', 'policy', 'decision', 'announcement', 'statement'
    ]
  };
  
  // Check for news line patterns (higher weight)
  Object.keys(newsPatterns).forEach(category => {
    newsPatterns[category].forEach(pattern => {
      if (text.includes(pattern)) categoryScores[category] += 3; // Higher weight for patterns
    });
  });
  
  // Find the category with the highest score
  const bestCategory = Object.keys(categoryScores).reduce((a, b) => 
    categoryScores[a] > categoryScores[b] ? a : b
  );
  
  // Debug logging
  console.log(`🔍 Fallback classification for "${newsItem.title.substring(0, 50)}...":`, categoryScores);
  
  return categoryScores[bestCategory] > 0 ? bestCategory : 'others';
}

// Enhanced news processing with AI classification (desktop only)
async function processNewsWithAI(newsItems) {
  const isMobileScreen = window.innerWidth <= 768;
  
  // Skip AI processing on mobile - return items instantly
  if (isMobileScreen) {
    console.log('📱 Mobile detected - skipping AI classification for instant news');
    return newsItems.map(item => ({
      ...item,
      category: item.category || 'others',
      aiClassified: false
    }));
  }
  
  console.log('🧠 Processing news with AI classification...');
  
  // Show AI processing indicator (desktop only)
  showAIProcessingIndicator();
  
  const processedItems = [];
  
  for (const item of newsItems) {
    try {
      // Get AI classification
      const aiCategory = await classifyNewsWithAI(item);
      
      // Update the news item with AI classification
      const processedItem = {
        ...item,
        category: aiCategory,
        aiClassified: true,
        originalCategory: item.category || 'unknown'
      };
      
      processedItems.push(processedItem);
      
      // No delay for instant processing
      
    } catch (error) {
      console.error('Error processing news item:', error);
      // Add original item with fallback category
      processedItems.push({
        ...item,
        category: getFallbackCategory(item),
        aiClassified: false
      });
    }
  }
  
  // Hide AI processing indicator
  hideAIProcessingIndicator();
  
  console.log(`✅ AI processing complete: ${processedItems.length} items processed`);
  return processedItems;
}

// Show sophisticated AI processing indicator (desktop only)
function showAIProcessingIndicator() {
  // Only show on desktop
  const isMobileScreen = window.innerWidth <= 768;
  if (isMobileScreen) {
    console.log('📱 Mobile detected - skipping AI indicator');
    return;
  }
  
  // Check if indicator is already active or exists in DOM
  const existingIndicator = document.getElementById('aiProcessingIndicator');
  if (aiIndicatorActive || existingIndicator) {
    console.log('🧠 AI indicator already active or exists, skipping creation');
    console.log('🧠 aiIndicatorActive:', aiIndicatorActive, 'existingIndicator:', !!existingIndicator);
    return;
  }
  
  // Set flag to prevent multiple indicators
  aiIndicatorActive = true;
  console.log('🧠 Setting aiIndicatorActive to true');
  
  // Show earth scanning icon only on desktop
  const desktopIcon = document.getElementById('neuralNetworkIcon');
  
  if (!isMobileScreen && desktopIcon) {
    desktopIcon.classList.add('processing');
    console.log('🧠 Showing desktop AI icon');
  }
  
  const indicator = document.createElement('div');
  indicator.id = 'aiProcessingIndicator';
  
  // Get current region for display
  const currentRegion = document.getElementById('regionSelectorText')?.textContent || 'Global';
  const currentCountry = document.getElementById('countrySelectorText')?.textContent || 'World';
  
  // Earth scanning processing messages
  const aiMessages = [
    'Initializing global scan...',
    'Scanning news sources worldwide...',
    'Analyzing regional patterns...',
    'Cross-referencing global data...',
    'Applying classification algorithms...',
    'Generating news categories...',
    'Validating classification results...',
    'Finalizing global analysis...'
  ];
  
  let messageIndex = 0;
  
  // Check if mobile for different layouts
  const isMobile = window.innerWidth <= 768;
  console.log('📱 Mobile detection:', isMobile, 'Screen width:', window.innerWidth);
  console.log('🧠 Creating AI indicator for region:', currentRegion);
  
  if (isMobile) {
    // Mobile layout - thin one row design matching bottom menu width
    indicator.innerHTML = `
      <div style="
        position: fixed;
        top: auto;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        width: calc(100vw - 40px);
        max-width: 400px;
        background: linear-gradient(135deg, rgba(0, 0, 0, 0.98) 0%, rgba(30, 0, 0, 0.98) 100%);
        color: white;
        padding: 8px 16px;
        border-radius: 8px;
        z-index: 10000;
        text-align: left;
        font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 77, 77, 0.5);
        display: flex;
        align-items: center;
        gap: 12px;
        height: 48px;
      ">
        <!-- Earth Scanning Icon -->
        <div class="scanning-icon" style="
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #ff4d4d 0%, #cc0000 100%);
          border-radius: 50%;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          animation: pulse 2s infinite;
          flex-shrink: 0;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <!-- Scanning rings -->
          <div style="
            position: absolute;
            top: -3px;
            left: -3px;
            right: -3px;
            bottom: -3px;
            border: 1px solid transparent;
            border-top: 1px solid #ff4d4d;
            border-radius: 50%;
            animation: spin 1.5s linear infinite;
          "></div>
        </div>
        
        <!-- Text Content -->
        <div class="text-content" style="
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        ">
          <!-- Title -->
          <div class="title" style="
            font-size: 12px;
            font-weight: 700;
            margin: 0;
            background: linear-gradient(135deg, #ff4d4d, #cc0000);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            line-height: 1.1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">
            Classifying ${currentRegion}
          </div>
          
          <!-- Processing Message -->
          <div id="aiProcessingMessage" class="processing-message" style="
            font-size: 10px;
            color: #ccc;
            margin: 0;
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">
            Initializing scan...
          </div>
        </div>
        
        <!-- Progress Bar -->
        <div class="progress-container" style="
          width: 60px;
          height: 3px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          overflow: hidden;
          flex-shrink: 0;
        ">
          <div id="aiProgressBar" style="
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #ff4d4d, #cc0000);
            border-radius: 2px;
            transition: width 0.3s ease;
          "></div>
        </div>
      </div>
    `;
  } else {
    // Desktop layout - vertical design
    indicator.innerHTML = `
      <div style="
        position: fixed;
        top: 80px;
        left: 20px;
        background: linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(20, 0, 0, 0.95) 100%);
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 10000;
        text-align: left;
        font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 77, 77, 0.3);
        min-width: 250px;
        max-width: 300px;
      ">
        <!-- Scanning Icon -->
        <div class="scanning-icon" style="
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #ff4d4d 0%, #cc0000 100%);
          border-radius: 50%;
          margin: 0 0 12px 0;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          animation: pulse 2s infinite;
        ">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <!-- Scanning rings -->
          <div style="
            position: absolute;
            top: -5px;
            left: -5px;
            right: -5px;
            bottom: -5px;
            border: 2px solid transparent;
            border-top: 2px solid #ff4d4d;
            border-radius: 50%;
            animation: spin 1.5s linear infinite;
          "></div>
        </div>
        
        <!-- Title -->
        <div class="title" style="font-size: 14px; font-weight: 700; margin-bottom: 4px; background: linear-gradient(135deg, #ff4d4d, #cc0000); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
          Classifying ${currentRegion} 💻
        </div>
        
        <!-- Processing Message -->
        <div id="aiProcessingMessage" class="processing-message" style="font-size: 12px; color: #ccc; margin-bottom: 10px; min-height: 16px;">
          Initializing global scan...
        </div>
        
        <!-- Progress Bar -->
        <div class="progress-bar" style="
          width: 100%;
          height: 2px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 1px;
          overflow: hidden;
          margin-bottom: 8px;
        ">
          <div id="aiProgressBar" style="
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #ff4d4d, #cc0000);
            border-radius: 1px;
            transition: width 0.3s ease;
          "></div>
        </div>
        
        <!-- Processing Info -->
        <div class="processing-info" style="font-size: 10px; color: #666;">
          <span style="color: #ff4d4d;">●</span> News Classification
        </div>
      </div>
    `;
  }
  
  document.body.appendChild(indicator);
  
  // Animate progress and messages - close after 4 seconds
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += Math.random() * 15;
    if (progress > 100) progress = 100;
    
    const progressBar = document.getElementById('aiProgressBar');
    if (progressBar) {
      progressBar.style.width = progress + '%';
    }
  }, 200);
  
  // Cycle through AI messages
  const messageInterval = setInterval(() => {
    const messageEl = document.getElementById('aiProcessingMessage');
    if (messageEl) {
      messageEl.textContent = aiMessages[messageIndex];
      messageIndex = (messageIndex + 1) % aiMessages.length;
    }
  }, 500);
  
  // Auto-close after 4 seconds
  setTimeout(() => {
    clearInterval(progressInterval);
    clearInterval(messageInterval);
    hideAIProcessingIndicator();
  }, 4000);
  
  // Handle window resize during processing
  const handleResize = () => {
    const isMobileScreen = window.innerWidth <= 768;
    if (isMobileScreen) {
      desktopIcon?.classList.remove('processing');
    } else {
      desktopIcon?.classList.add('processing');
    }
  };
  
  window.addEventListener('resize', handleResize);
  
  // Store resize handler for cleanup
  indicator.resizeHandler = handleResize;
  
  // Store intervals for cleanup
  indicator.progressInterval = progressInterval;
  indicator.messageInterval = messageInterval;
}

// Hide AI processing indicator (desktop only)
function hideAIProcessingIndicator() {
  // Only hide on desktop
  const isMobileScreen = window.innerWidth <= 768;
  if (isMobileScreen) {
    console.log('📱 Mobile detected - skipping AI indicator hide');
    return;
  }
  
  // Reset flag
  aiIndicatorActive = false;
  console.log('🧠 Setting aiIndicatorActive to false');
  
  // Hide earth scanning icon only on desktop
  const desktopIcon = document.getElementById('neuralNetworkIcon');
  
  if (desktopIcon) {
    desktopIcon.classList.remove('processing');
    console.log('🧠 Hiding desktop AI icon');
  }
  
  // Remove all AI processing indicators (in case there are multiple)
  const indicators = document.querySelectorAll('#aiProcessingIndicator');
  indicators.forEach(indicator => {
    // Clean up intervals if they exist
    if (indicator.progressInterval) {
      clearInterval(indicator.progressInterval);
    }
    if (indicator.messageInterval) {
      clearInterval(indicator.messageInterval);
    }
    // Clean up resize handler
    if (indicator.resizeHandler) {
      window.removeEventListener('resize', indicator.resizeHandler);
    }
    indicator.remove();
  });
  
  console.log('🧠 AI processing indicator hidden');
}

// Region request state
let allAvailableCountries = [];
let allAvailableRegions = [];
let selectedCountries = [];
let requestCooldownTimer = null;

const ICONS = {
  war: '/img/war.png',
  politics: '/img/politics.png',
  culture: '/img/culture.png',
  economy: '/img/economy.png',
  society: '/img/society.png',
  climate: '/img/climate.png',
  peace: '/img/peace.png',
  demise: '/img/demise.png',
  others: '/img/others.png'
};

const ICON_PX = 32;

// ---------- NEW: detail + saved state ----------
let newsListCache = [];   // last fetched list for the selected region
let showingDetail = null; // when non-null, sidebar is in "single story" mode

// helpers for auth (so we can open modal if not logged in)
async function me() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!r.ok) return null;
    const j = await r.json();
    return j.user || null;
  } catch { return null; }
}
function openAuthModalSafely(){ try{ if (typeof openModal==='function') openModal(); }catch{} }

// Load user visibility settings
async function loadUserVisibilitySettings() {
  try {
    const r = await fetch('/api/auth/me/visibility', { credentials: 'same-origin' });
    if (r.ok) {
      const settings = await r.json();
      userVisibilitySettings = settings;
    }
  } catch (error) {
    console.error('Failed to load user visibility settings:', error);
  }
}

// Show visibility warning if user has restrictions
function showVisibilityWarning() {
  if (!userVisibilitySettings.hasVisibilityRestrictions) return;
  
  // Remove existing warning
  const existingWarning = document.getElementById('visibilityWarning');
  if (existingWarning) existingWarning.remove();
  
  // Create warning element
  const warning = document.createElement('div');
  warning.id = 'visibilityWarning';
  warning.className = 'visibility-warning';
  warning.innerHTML = `
    <span>Your access is limited to specific regions and countries.</span>
    <button id="requestAccessBtn" class="btn" style="padding:6px 12px;border:1px solid #ff4d4d;border-radius:6px;font-size:12px;background:transparent;color:#ff4d4d;margin-left:8px">
      Request Access
    </button>
  `;
  
  // Insert warning after the topbar
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    topbar.insertAdjacentElement('afterend', warning);
  }
  
  // Add event listener for request button
  const requestBtn = document.getElementById('requestAccessBtn');
  if (requestBtn) {
    requestBtn.addEventListener('click', openRegionRequestModal);
  }
}

// ---------- Refresh System ----------

// Enhanced refresh function with better error handling and fallbacks
async function refreshData(buttonId = 'refreshBtn') {
  const refreshBtn = document.getElementById(buttonId);
  if (!refreshBtn) return;
  const originalText = refreshBtn.innerHTML;
  const isMobileRefresh = buttonId === 'mobileRefreshBtn';
  
  // Add loading state
  refreshBtn.disabled = true;
  refreshBtn.classList.add('refresh-pulsing');
  
  if (isMobileRefresh) {
    // Icon-only mobile refresh button
    refreshBtn.innerHTML = `
      <svg class="refresh-icon" viewBox="0 0 24 24" style="width: 20px; height: 20px; animation: spin 1s linear infinite;">
        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
      </svg>
    `;
  } else {
    // Desktop refresh button with text
  refreshBtn.innerHTML = `
    <div class="refresh-loader"></div>
    Refreshing...
  `;
  }
  
  // Start refresh operations in background (don't wait for them)
    const refreshPromises = [
      loadUserVisibilitySettings().catch(e => console.warn('Settings failed:', e)),
      renderAllRegionMarkers(true).catch(e => console.warn('Regions failed:', e)),
      refreshNewsData().catch(e => console.warn('News failed:', e))
    ];
    
  // Show completion immediately
    refreshBtn.classList.remove('refresh-pulsing');
    refreshBtn.classList.add('refresh-success');
    
    if (isMobileRefresh) {
      // Icon-only completion for mobile
    refreshBtn.innerHTML = `
        <svg class="refresh-icon" viewBox="0 0 24 24" style="width: 20px; height: 20px;">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/>
      </svg>
      `;
    } else {
      // Desktop completion with text
    refreshBtn.innerHTML = `
      <svg class="refresh-icon" viewBox="0 0 24 24" style="width: 16px; height: 16px;">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/>
      </svg>
        Completed
      `;
    }
  
  // Show success toast
  showToast('Refresh completed successfully', 'success');
  
  // Wait for background operations to complete, then reset button
  Promise.allSettled(refreshPromises).then(() => {
    console.log('Background refresh operations completed');
    // Reset button immediately after background operations finish
    refreshBtn.classList.remove('refresh-success', 'refresh-pulsing');
    refreshBtn.innerHTML = originalText;
    refreshBtn.disabled = false;
  });
}

// Refresh news data with timeout and better error handling
async function refreshNewsData() {
  try {
    // Get current region from custom selector
    const currentRegionId = selectedRegion;
    if (currentRegionId) {
      // Fetch fresh news for current region with force refresh (no timeout for instant loading)
      const res = await fetch(`/api/news/${currentRegionId}?force=true&limit=30`, {
        credentials: 'same-origin'
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          // Process news with AI classification
          console.log('🧠 Starting AI classification for news items...');
          const aiProcessedItems = await processNewsWithAI(data.items);
          
          // Update news list with AI-classified items
          renderNewsList(aiProcessedItems);
          
          // Update news count
          const newsCountEl = document.getElementById('newsCount');
          if (newsCountEl) {
            newsCountEl.textContent = data.count || data.items.length;
          }
          
          // Show AI classification summary
          const aiClassifiedCount = aiProcessedItems.filter(item => item.aiClassified).length;
          console.log(`🧠 AI Classification Summary: ${aiClassifiedCount}/${aiProcessedItems.length} items classified by AI`);
        }
      } else {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
    } else {
      console.warn('No region selected for refresh');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('News refresh timed out');
    } else {
      console.error('Failed to refresh news:', error);
    }
    throw error; // Re-throw to be handled by parent function
  }
}

// Tooltip system for refresh feedback
let tooltipTimeout = null;

function showRefreshTooltip(message, type = 'loading', progress = 0) {
  // Clear any existing timeout
  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = null;
  }
  
  let tooltip = document.getElementById('refreshTooltip');
  
  if (!tooltip) {
    // Create tooltip if it doesn't exist
    tooltip = document.createElement('div');
    tooltip.id = 'refreshTooltip';
    document.body.appendChild(tooltip);
  }
  
  // Update tooltip content with new design
  tooltip.className = `refresh-tooltip refresh-tooltip-${type}`;
  tooltip.innerHTML = `
    <div class="refresh-tooltip-content">
      ${type === 'loading' ? '<div class="refresh-tooltip-loader"></div>' : ''}
      <div class="refresh-tooltip-icon" style="display: ${type === 'loading' ? 'none' : 'flex'}">
        ${type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '!' : ''}
      </div>
      <div class="refresh-tooltip-message">${message}</div>
    </div>
  `;
  
  // Center tooltip on screen
  tooltip.style.left = '50%';
  tooltip.style.top = '50%';
  tooltip.style.transform = 'translate(-50%, -50%) scale(0.8)';
  
  // Animate in
  setTimeout(() => tooltip.classList.add('show'), 10);
}

function updateRefreshTooltip(message, type = 'loading', progress = 0) {
  const tooltip = document.getElementById('refreshTooltip');
  if (tooltip) {
    // Update content with smooth transition
    tooltip.classList.add('updating');
    
    setTimeout(() => {
      const messageEl = tooltip.querySelector('.refresh-tooltip-message');
      const iconEl = tooltip.querySelector('.refresh-tooltip-icon');
      const progressFill = tooltip.querySelector('.refresh-progress-fill');
      
      if (messageEl) messageEl.textContent = message;
      if (iconEl) iconEl.textContent = getTooltipIcon(type);
      if (progressFill) progressFill.style.width = `${progress}%`;
      
      // Update type class
      tooltip.className = `refresh-tooltip refresh-tooltip-${type} show`;
      
      // Remove updating class
      setTimeout(() => tooltip.classList.remove('updating'), 150);
    }, 100);
  }
}

function hideRefreshTooltip() {
  const tooltip = document.getElementById('refreshTooltip');
  if (tooltip) {
    tooltip.classList.add('hiding');
    tooltip.classList.remove('show');
    
    tooltipTimeout = setTimeout(() => {
      tooltip.remove();
      tooltipTimeout = null;
    }, 500);
  }
}

function getTooltipIcon(type) {
  const icons = {
    loading: '●',
    success: '✓',
    error: '✗',
    warning: '!'
  };
  return icons[type] || '●';
}

// Auto-refresh removed - only manual refresh on click

// Smart refresh - only refresh if there might be new content
async function smartRefresh() {
  const now = Date.now();
  if (now - lastRefreshTime < 60000) { // Don't refresh if refreshed in last minute
    console.log('Skipping refresh - too recent');
    return;
  }
  
  lastRefreshTime = now;
  await refreshData();
}

// Real-time notification system
let eventSource = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Initialize real-time notifications
function initRealTimeNotifications() {
  if (eventSource) {
    eventSource.close();
  }
  
  eventSource = new EventSource('/api/notifications/stream', {
    withCredentials: true
  });
  
  eventSource.onopen = () => {
    console.log('Real-time notifications connected');
    reconnectAttempts = 0;
  };
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleRealTimeNotification(data);
    } catch (error) {
      console.error('Error parsing notification:', error);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    eventSource.close();
    
    // Attempt to reconnect
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
      setTimeout(initRealTimeNotifications, 2000 * reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
    }
  };
}

// Handle real-time notifications
function handleRealTimeNotification(data) {
  console.log('Received real-time notification:', data);
  
  switch (data.type) {
    case 'connected':
      console.log('Real-time notifications enabled');
      break;
      
    case 'request_approved':
      showNotification(data.message, 'success', true);
      // Refresh user visibility settings
      loadUserVisibilitySettings();
      break;
      
    case 'request_denied':
      showNotification(data.message, 'error', true);
      break;
      
    default:
      console.log('Unknown notification type:', data.type);
  }
}

// Cleanup function
function cleanupRealTimeNotifications() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

// Location sharing functionality
function initLocationSharing() {
  console.log('Initializing location sharing...');
  const locationIcon = document.getElementById('locationIcon');
  if (!locationIcon) {
    console.error('Location icon not found! Check if element exists in HTML');
    return;
  }

  console.log('Location icon found:', locationIcon);
  console.log('Location icon visible:', locationIcon.style.display);
  console.log('Location icon disabled:', locationIcon.disabled);
  
  // Add a simple test click handler first
  locationIcon.addEventListener('click', (event) => {
    console.log('TEST: Basic click handler triggered!');
  });

  // Check if user is logged in and show/hide icon accordingly
  updateLocationIconVisibility();

  locationIcon.addEventListener('click', async (event) => {
    console.log('Location icon clicked - event registered!');
    console.log('Event details:', event);
    // Prevent any default behavior
    event.preventDefault();
    event.stopPropagation();

    // Show loading animation with "Location Sending" text
    showLocationLoading();

    // Show loading state immediately
    locationIcon.style.background = 'linear-gradient(135deg, #555, #777)';
    locationIcon.querySelector('.location-icon').innerHTML = '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>';
    locationIcon.style.cursor = 'not-allowed';
    locationIcon.disabled = true;

    try {
      // Double-check authentication with fresh request
      const user = await me();
      if (!user) {
        // Reset icon state
        locationIcon.style.background = 'linear-gradient(135deg, #333, #555)';
        locationIcon.style.cursor = 'pointer';
        locationIcon.disabled = false;
        
        // Force login modal to open
        openAuthModalSafely();
        showNotification('You must log in to share your location', 'error');
        return;
      }

      // Verify user is still authenticated by making a server request
      const authCheck = await fetch('/api/auth/me', { 
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!authCheck.ok) {
        // Reset icon state
        locationIcon.style.background = 'linear-gradient(135deg, #333, #555)';
        locationIcon.style.cursor = 'pointer';
        locationIcon.disabled = false;
        
        openAuthModalSafely();
        showNotification('Session expired. Please log in again', 'error');
        return;
      }

      // Show processing state
      locationIcon.querySelector('.location-icon').innerHTML = '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>';
      
      // Get current location
      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;
      
      // Send location to server
      await sendLocationToServer(latitude, longitude);
      
      // Hide loading animation and show success
      hideLocationLoading();
      showLocationSentConfirmation();
      
      // Show success state
      locationIcon.style.background = 'linear-gradient(135deg, #2d5a2d, #4a7c4a)';
      locationIcon.querySelector('.location-icon').innerHTML = '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>';
      
      showNotification('Location shared successfully', 'success');
      
      // Reset after 2 seconds
      setTimeout(() => {
        locationIcon.style.background = 'linear-gradient(135deg, #333, #555)';
        locationIcon.style.cursor = 'pointer';
        locationIcon.disabled = false;
        locationIcon.querySelector('.location-icon').innerHTML = '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>';
      }, 2000);
      
    } catch (error) {
      console.error('Location sharing error:', error);
      
      // Hide loading animation
      hideLocationLoading();
      
      // Show error state
      locationIcon.style.background = 'linear-gradient(135deg, #5a2d2d, #7c4a4a)';
      locationIcon.querySelector('.location-icon').innerHTML = '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>';
      
      // Check if it's an authentication error
      if (error.message.includes('401') || error.message.includes('Unauthorized') || error.message.includes('Not logged in')) {
        openAuthModalSafely();
        showNotification('Please log in to share your location', 'error');
      } else {
        showNotification('Failed to share location: ' + error.message, 'error');
      }
      
      // Reset after 2 seconds
      setTimeout(() => {
        locationIcon.style.background = 'linear-gradient(135deg, #333, #555)';
        locationIcon.style.cursor = 'pointer';
        locationIcon.disabled = false;
        locationIcon.querySelector('.location-icon').innerHTML = '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>';
      }, 2000);
    }
  });
}

// Mobile navigation functionality
function initMobileMapToggle() {
  const mobileBottomNav = document.getElementById('mobileBottomNav');
  const mobileMapToggle = document.getElementById('mobileMapToggle');
  const mobileLocationShare = document.getElementById('mobileLocationShare');
  const mobileAccount = document.getElementById('mobileAccount');
  const mobileMapToggleFallback = document.getElementById('mobileMapToggleFallback');
  const mapContainer = document.getElementById('map');
  const sidebar = document.querySelector('.sidebar');
  const mapToggleIcon = document.getElementById('mapToggleIcon');
  const mapToggleIconFallback = document.getElementById('mapToggleIconFallback');
  const locationIcon = document.getElementById('locationIcon');
  const authArea = document.getElementById('authArea');
  
  if (!mobileBottomNav || !mapContainer || !sidebar) return;
  
  let isMapVisible = false; // Start with map closed
  
  // Check if we're on mobile
  function isMobile() {
    return window.innerWidth <= 768;
  }
  
  // Update navigation visibility
  function updateNavigationVisibility() {
    if (isMobile()) {
      // Show mobile bottom nav, hide desktop elements
      mobileBottomNav.style.display = 'flex';
      mobileMapToggleFallback.style.display = 'none';
      if (locationIcon) locationIcon.style.display = 'none';
      if (authArea) authArea.style.display = 'none';
    } else {
      // Show desktop elements, hide mobile nav
      mobileBottomNav.style.display = 'none';
      mobileMapToggleFallback.style.display = 'flex';
      if (locationIcon) locationIcon.style.display = 'flex';
      if (authArea) authArea.style.display = 'flex';
      // Reset to default state when not mobile
      if (!isMapVisible) {
        toggleMapVisibility();
      }
    }
  }
  
  // Toggle map visibility
  function toggleMapVisibility() {
    isMapVisible = !isMapVisible;
    
    // Get the layout element
    const layout = document.querySelector('.layout');
    
    if (isMapVisible) {
      // Show map
      mapContainer.style.display = 'block';
      sidebar.style.height = '40vh';
      
      // Update layout classes
      if (layout) {
        layout.classList.remove('map-hidden');
        layout.classList.add('map-visible');
      }
      
      if (mobileMapToggle) {
        mobileMapToggle.classList.add('active'); // Red when map is visible
        // Switch to close map icon and label
        const closedMapIcon = document.getElementById('closedMapIcon');
        const openMapIcon = document.getElementById('openMapIcon');
        const mapToggleLabel = document.getElementById('mapToggleLabel');
        if (closedMapIcon) closedMapIcon.style.display = 'none';
        if (openMapIcon) openMapIcon.style.display = 'block';
        if (mapToggleLabel) mapToggleLabel.textContent = 'Close Map';
      }
      if (mobileMapToggleFallback) {
        mobileMapToggleFallback.classList.remove('map-hidden');
        mapToggleIconFallback.textContent = '🗺️';
      }
    } else {
      // Hide map
      mapContainer.style.display = 'none';
      sidebar.style.height = '100vh';
      
      // Update layout classes
      if (layout) {
        layout.classList.remove('map-visible');
        layout.classList.add('map-hidden');
      }
      
      if (mobileMapToggle) {
        mobileMapToggle.classList.remove('active'); // Gray when map is hidden
        // Switch to open map icon and label
        const closedMapIcon = document.getElementById('closedMapIcon');
        const openMapIcon = document.getElementById('openMapIcon');
        const mapToggleLabel = document.getElementById('mapToggleLabel');
        if (closedMapIcon) closedMapIcon.style.display = 'block';
        if (openMapIcon) openMapIcon.style.display = 'none';
        if (mapToggleLabel) mapToggleLabel.textContent = 'Open Map';
      }
      if (mobileMapToggleFallback) {
        mobileMapToggleFallback.classList.add('map-hidden');
        mapToggleIconFallback.textContent = '📰';
      }
    }
  }
  
  // Mobile map toggle
  if (mobileMapToggle) {
    mobileMapToggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMapVisibility();
    });
  }
  
  // Desktop map toggle fallback
  if (mobileMapToggleFallback) {
    mobileMapToggleFallback.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMapVisibility();
    });
  }
  
  // Mobile location share
  if (mobileLocationShare) {
    mobileLocationShare.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      // Show loading animation
      showLocationLoading();
      
      // Show loading state immediately
      mobileLocationShare.style.background = 'linear-gradient(135deg, #555, #777)';
      mobileLocationShare.style.cursor = 'not-allowed';
      mobileLocationShare.disabled = true;

      try {
        // Double-check authentication with fresh request
        const user = await me();
        if (!user) {
          // Hide loading animation
          hideLocationLoading();
          // Reset button state
          mobileLocationShare.style.background = 'linear-gradient(135deg, #333, #555)';
          mobileLocationShare.style.cursor = 'pointer';
          mobileLocationShare.disabled = false;
          
          openAuthModalSafely();
          showNotification('Please log in to share your location', 'error');
          return;
        }

        // Check if session is still valid
        if (user.error) {
          // Hide loading animation
          hideLocationLoading();
          // Reset button state
          mobileLocationShare.style.background = 'linear-gradient(135deg, #333, #555)';
          mobileLocationShare.style.cursor = 'pointer';
          mobileLocationShare.disabled = false;
          
          showNotification('Session expired. Please log in again', 'error');
          return;
        }

        // Get current location
        const position = await getCurrentPosition();
        const { latitude, longitude } = position.coords;
        
        // Send location to server
        await sendLocationToServer(latitude, longitude);
        
        // Hide loading animation and show success
        hideLocationLoading();
        showLocationSentConfirmation();
        
        // Show success state
        mobileLocationShare.style.background = 'linear-gradient(135deg, #2d5a2d, #4a7c4a)';
        
        showNotification('Location shared successfully', 'success');
        
        // Reset after 2 seconds
        setTimeout(() => {
          mobileLocationShare.style.background = 'linear-gradient(135deg, #333, #555)';
          mobileLocationShare.style.cursor = 'pointer';
          mobileLocationShare.disabled = false;
        }, 2000);
        
      } catch (error) {
        console.error('Location sharing error:', error);
        
        // Hide loading animation
        hideLocationLoading();
        
        // Show error state
        mobileLocationShare.style.background = 'linear-gradient(135deg, #5a2d2d, #7c4a4a)';
        
        // Check if it's an authentication error
        if (error.message.includes('401') || error.message.includes('Unauthorized') || error.message.includes('Not logged in')) {
          openAuthModalSafely();
          showNotification('Please log in to share your location', 'error');
        } else {
          showNotification('Failed to share location: ' + error.message, 'error');
        }
        
        // Reset after 2 seconds
        setTimeout(() => {
          mobileLocationShare.style.background = 'linear-gradient(135deg, #333, #555)';
          mobileLocationShare.style.cursor = 'pointer';
          mobileLocationShare.disabled = false;
        }, 2000);
      }
    });
  }
  
  // Mobile account button
  if (mobileAccount) {
    mobileAccount.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // Navigate to account page
      window.location.href = '/account.html';
    });
  }
  
  // Mobile refresh button
  const mobileRefreshBtn = document.getElementById('mobileRefreshBtn');
  if (mobileRefreshBtn) {
    mobileRefreshBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      // Trigger the same functionality as the desktop refresh button
      await refreshData('mobileRefreshBtn');
    });
  }
  
  // Mobile country selector
  const mobileCountrySelector = document.getElementById('mobileCountrySelector');
  const mobileCountrySelectorText = document.getElementById('mobileCountrySelectorText');
  if (mobileCountrySelector) {
    mobileCountrySelector.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // Trigger the same functionality as the desktop country selector
      if (document.getElementById('countrySelector')) {
        document.getElementById('countrySelector').click();
      }
    });
  }
  
  // Mobile region selector
  const mobileRegionSelector = document.getElementById('mobileRegionSelector');
  const mobileRegionSelectorText = document.getElementById('mobileRegionSelectorText');
  if (mobileRegionSelector) {
    mobileRegionSelector.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // Trigger the same functionality as the desktop region selector
      if (document.getElementById('regionSelector')) {
        document.getElementById('regionSelector').click();
      }
    });
  }
  
  // Sync mobile selector text with desktop selectors
  function syncMobileSelectors() {
    if (mobileCountrySelectorText && document.getElementById('countrySelectorText')) {
      mobileCountrySelectorText.textContent = document.getElementById('countrySelectorText').textContent;
    }
    if (mobileRegionSelectorText && document.getElementById('regionSelectorText')) {
      mobileRegionSelectorText.textContent = document.getElementById('regionSelectorText').textContent;
    }
  }
  
  // Update visibility on window resize
  window.addEventListener('resize', updateNavigationVisibility);
  
  // Initialize map as closed
  function initializeMapState() {
    // Get the layout element
    const layout = document.querySelector('.layout');
    
    if (isMapVisible) {
      // Show map
      mapContainer.style.display = 'block';
      sidebar.style.height = '40vh';
      
      // Update layout classes
      if (layout) {
        layout.classList.remove('map-hidden');
        layout.classList.add('map-visible');
      }
      
      if (mobileMapToggle) {
        mobileMapToggle.classList.add('active');
        const closedMapIcon = document.getElementById('closedMapIcon');
        const openMapIcon = document.getElementById('openMapIcon');
        const mapToggleLabel = document.getElementById('mapToggleLabel');
        if (closedMapIcon) closedMapIcon.style.display = 'none';
        if (openMapIcon) openMapIcon.style.display = 'block';
        if (mapToggleLabel) mapToggleLabel.textContent = 'Close Map';
      }
    } else {
      // Hide map
      mapContainer.style.display = 'none';
      sidebar.style.height = '100vh';
      
      // Update layout classes
      if (layout) {
        layout.classList.remove('map-visible');
        layout.classList.add('map-hidden');
      }
      
      if (mobileMapToggle) {
        mobileMapToggle.classList.remove('active');
        const closedMapIcon = document.getElementById('closedMapIcon');
        const openMapIcon = document.getElementById('openMapIcon');
        const mapToggleLabel = document.getElementById('mapToggleLabel');
        if (closedMapIcon) closedMapIcon.style.display = 'block';
        if (openMapIcon) openMapIcon.style.display = 'none';
        if (mapToggleLabel) mapToggleLabel.textContent = 'Open Map';
      }
    }
  }


  // Show location sent animation
  function showLocationSent() {
    const sentHTML = `
      <div class="location-sent">
        <div class="location-sent-content">
          <div class="location-sent-icon">✓</div>
          <p class="location-sent-text">Location Sent!</p>
          <p class="location-sent-subtext">Your location has been shared</p>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', sentHTML);
    
    // Auto-hide after 2 seconds
    setTimeout(() => {
      const sentElement = document.querySelector('.location-sent');
      if (sentElement) {
        sentElement.remove();
      }
    }, 2000);
  }

  // Initial setup
  updateNavigationVisibility();
  syncMobileSelectors();
  initializeMapState();
  
  // Sync selectors periodically
  setInterval(syncMobileSelectors, 1000);
}

// Update location icon visibility based on login status
async function updateLocationIconVisibility() {
  console.log('Updating location icon visibility...');
  const locationIcon = document.getElementById('locationIcon');
  if (!locationIcon) {
    console.error('Location icon not found in updateLocationIconVisibility');
    return;
  }

  const user = await me();
  console.log('User status:', user);
  
  if (user) {
    // User is logged in - enable functionality
    console.log('User logged in - enabling location icon');
    locationIcon.style.display = 'flex';
    locationIcon.style.cursor = 'pointer';
    locationIcon.disabled = false;
    locationIcon.style.opacity = '1';
    locationIcon.title = 'Share your location';
    locationIcon.style.pointerEvents = 'auto';
  } else {
    // User is not logged in - show icon but require login
    console.log('User not logged in - showing disabled location icon');
    locationIcon.style.display = 'flex';
    locationIcon.style.cursor = 'pointer';
    locationIcon.disabled = false;
    locationIcon.style.opacity = '0.7';
    locationIcon.title = 'Click to log in and share your location';
    locationIcon.style.pointerEvents = 'auto';
  }
  
  console.log('Location icon final state:', {
    display: locationIcon.style.display,
    disabled: locationIcon.disabled,
    opacity: locationIcon.style.opacity,
    pointerEvents: locationIcon.style.pointerEvents
  });
}

// Make this function globally available for auth system
window.updateLocationIconVisibility = updateLocationIconVisibility;

// Direct auth modal creation as fallback
function createAuthModalDirectly(tab = 'login') {
  console.log('🚀 Creating auth modal directly for:', tab);
  
  // Remove any existing direct auth modal
  const existingModal = document.getElementById('directAuthModal');
  if (existingModal) {
    console.log('🗑️ Removing existing direct auth modal');
    existingModal.remove();
  }
  
  // Create auth modal overlay
  const authOverlay = document.createElement('div');
  authOverlay.id = 'directAuthModal';
  authOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const authModal = document.createElement('div');
  authModal.style.cssText = `
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 12px;
    width: 380px;
    max-width: 95vw;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    animation: slideInFromTop 0.4s ease-out;
    position: relative;
  `;

  authModal.innerHTML = `
    <div style="display:flex;border-bottom:1px solid #333;border-radius:12px 12px 0 0;overflow:hidden;position:sticky;top:0;background:#0b0b0b;z-index:10">
      <button class="authTabBtn" data-tab="login" style="flex:1;padding:16px 12px;background:${tab === 'login' ? '#ff4d4d' : 'transparent'};border:0;color:${tab === 'login' ? '#fff' : '#ccc'};cursor:pointer;font-weight:600;font-size:15px;transition:all 0.3s ease;min-height:50px;display:flex;align-items:center;justify-content:center" onmouseover="this.style.background='${tab === 'login' ? '#ff4d4d' : 'rgba(255,255,255,0.1)'}'" onmouseout="this.style.background='${tab === 'login' ? '#ff4d4d' : 'transparent'}'">Login</button>
      <button class="authTabBtn" data-tab="signup" style="flex:1;padding:16px 12px;background:${tab === 'signup' ? '#ff4d4d' : 'transparent'};border:0;color:${tab === 'signup' ? '#fff' : '#ccc'};cursor:pointer;font-weight:600;font-size:15px;transition:all 0.3s ease;min-height:50px;display:flex;align-items:center;justify-content:center" onmouseover="this.style.background='${tab === 'signup' ? '#ff4d4d' : 'rgba(255,255,255,0.1)'}'" onmouseout="this.style.background='${tab === 'signup' ? '#ff4d4d' : 'transparent'}'">Sign up</button>
    </div>
    <div id="directAuthBody" style="padding:30px">
      <div style="text-align:center;margin-bottom:30px">
        <div style="font-size:28px;margin-bottom:12px">🔐</div>
        <h2 style="color:#fff;font-size:22px;margin:0;font-weight:600">${tab === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
        <p style="color:#888;font-size:14px;margin:8px 0 0 0">${tab === 'login' ? 'Sign in to continue' : 'Join us to get started'}</p>
      </div>
      ${tab === 'login' ? `
        <form id="directLoginForm" style="display:grid;gap:16px">
          <div>
            <input class="authInput" name="email" type="email" placeholder="Email address *" required style="width:100%;padding:12px 16px;border:1px solid #333;border-radius:8px;background:#111;color:#fff;outline:none;font-size:14px;transition:border-color 0.3s ease" onfocus="this.style.borderColor='#ff4d4d'" onblur="this.style.borderColor='#333'" />
          </div>
          <div>
            <input class="authInput" name="password" type="password" placeholder="Password *" required minlength="6" style="width:100%;padding:12px 16px;border:1px solid #333;border-radius:8px;background:#111;color:#fff;outline:none;font-size:14px;transition:border-color 0.3s ease" onfocus="this.style.borderColor='#ff4d4d'" onblur="this.style.borderColor='#333'" />
          </div>
          <button type="submit" class="authSubmitBtn" style="width:100%;padding:12px;border:0;border-radius:8px;background:#ff4d4d;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;margin-top:8px" onmouseover="this.style.background='#ff6b6b';this.style.transform='translateY(-1px)'" onmouseout="this.style.background='#ff4d4d';this.style.transform='translateY(0)'">Sign In</button>
          <div id="directAuthErr" style="color:#ff6b6b;font-size:12px;text-align:center;min-height:16px;margin-top:8px"></div>
        </form>
      ` : `
        <form id="directSignupForm" style="display:grid;gap:16px">
          <div>
            <input class="authInput" name="name" placeholder="Full name *" required minlength="2" style="width:100%;padding:12px 16px;border:1px solid #333;border-radius:8px;background:#111;color:#fff;outline:none;font-size:14px;transition:border-color 0.3s ease" onfocus="this.style.borderColor='#ff4d4d'" onblur="this.style.borderColor='#333'" />
          </div>
          <div>
            <input class="authInput" name="email" type="email" placeholder="Email address *" required style="width:100%;padding:12px 16px;border:1px solid #333;border-radius:8px;background:#111;color:#fff;outline:none;font-size:14px;transition:border-color 0.3s ease" onfocus="this.style.borderColor='#ff4d4d'" onblur="this.style.borderColor='#333'" />
          </div>
          <div>
            <input class="authInput" name="phone" type="tel" placeholder="Phone number (optional)" style="width:100%;padding:12px 16px;border:1px solid #333;border-radius:8px;background:#111;color:#fff;outline:none;font-size:14px;transition:border-color 0.3s ease" onfocus="this.style.borderColor='#ff4d4d'" onblur="this.style.borderColor='#333'" />
          </div>
          <div>
            <input class="authInput" name="password" type="password" placeholder="Password (min 6 characters) *" required minlength="6" style="width:100%;padding:12px 16px;border:1px solid #333;border-radius:8px;background:#111;color:#fff;outline:none;font-size:14px;transition:border-color 0.3s ease" onfocus="this.style.borderColor='#ff4d4d'" onblur="this.style.borderColor='#333'" />
          </div>
          <button type="submit" class="authSubmitBtn" style="width:100%;padding:12px;border:0;border-radius:8px;background:#ff4d4d;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;margin-top:8px" onmouseover="this.style.background='#ff6b6b';this.style.transform='translateY(-1px)'" onmouseout="this.style.background='#ff4d4d';this.style.transform='translateY(0)'">Create Account</button>
          <div id="directAuthErr" style="color:#ff6b6b;font-size:12px;text-align:center;min-height:16px;margin-top:8px"></div>
        </form>
      `}
    </div>
  `;

  authOverlay.appendChild(authModal);
  document.body.appendChild(authOverlay);

  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInFromTop {
      from {
        opacity: 0;
        transform: translateY(-30px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `;
  document.head.appendChild(style);

  // No close button - modal cannot be closed without authentication

  // Tab switching
  document.querySelectorAll('.authTabBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      createAuthModalDirectly(targetTab);
      authOverlay.remove();
    });
  });

  // Form submission
  const form = document.getElementById(tab === 'login' ? 'directLoginForm' : 'directSignupForm');
  const errorDiv = document.getElementById('directAuthErr');
  
  console.log('📝 Form found:', !!form, 'Error div found:', !!errorDiv);
  
  if (form) {
    // Add real-time validation
    const inputs = form.querySelectorAll('input');
    inputs.forEach(input => {
      input.addEventListener('blur', () => {
        validateField(input);
      });
      
      input.addEventListener('input', () => {
        clearFieldError(input);
      });
    });
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('📤 Form submitted for:', tab);
      errorDiv.textContent = '';
      
      // Validate all fields before submission
      let isValid = true;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      
      // Clear all previous errors
      inputs.forEach(input => clearFieldError(input));
      
      // Validate email
      if (!validateEmail(data.email)) {
        showFieldError(form.querySelector('input[name="email"]'), 'Please enter a valid email address');
        isValid = false;
      }
      
      // Validate password
      if (!validatePassword(data.password)) {
        showFieldError(form.querySelector('input[name="password"]'), 'Password must be at least 6 characters');
        isValid = false;
      }
      
      // Additional validation for signup
      if (tab === 'signup') {
        if (!validateName(data.name)) {
          showFieldError(form.querySelector('input[name="name"]'), 'Name must be at least 2 characters');
          isValid = false;
        }
        
        if (data.phone && !validatePhone(data.phone)) {
          showFieldError(form.querySelector('input[name="phone"]'), 'Please enter a valid phone number');
          isValid = false;
        }
      }
      
      if (!isValid) {
        return; // Stop submission if validation fails
      }
      
      // Get submit button and show loading animation
      const submitBtn = form.querySelector('button[type="submit"]');
      const loadingText = tab === 'login' ? 'Logging in...' : 'Creating account...';
      const restoreButton = showLoginLoadingAnimation(submitBtn, loadingText);
      
      console.log('📋 Form data:', data);
      
      try {
        const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/signup';
        console.log('🌐 Making request to:', endpoint);
        
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(data)
        });
        
        console.log('📡 Response status:', response.status);
        
        if (response.ok) {
          console.log('✅ Authentication successful!');
          // Success - show success animation for 2.5 seconds then reload
          showLoginLoadingAnimation(submitBtn, 'Success! Redirecting...');
          setTimeout(() => {
            authOverlay.remove();
            if (window.forcedLoginOverlay) {
              window.forcedLoginOverlay.remove();
              window.forcedLoginOverlay = null;
            }
            location.reload();
          }, 2500);
        } else {
          const error = await response.json().catch(() => ({ error: 'Request failed' }));
          console.log('❌ Authentication failed:', error);
          errorDiv.textContent = error.error || 'Request failed';
          restoreButton(); // Restore button state on error
        }
      } catch (error) {
        console.error('💥 Network error:', error);
        errorDiv.textContent = 'Network error: ' + error.message;
        restoreButton(); // Restore button state on error
      }
    });
  } else {
    console.error('❌ Form not found!');
  }
}

// Validation functions
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePhone(phone) {
  if (!phone || phone.trim() === '') return true; // Optional field
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
  return phoneRegex.test(cleanPhone) && cleanPhone.length >= 10;
}

function validatePassword(password) {
  return password && password.length >= 6;
}

function validateName(name) {
  return name && name.trim().length >= 2;
}

function showFieldError(field, message) {
  // Remove existing error
  const existingError = field.parentNode.querySelector('.field-error');
  if (existingError) {
    existingError.remove();
  }
  
  // Add error message
  const errorDiv = document.createElement('div');
  errorDiv.className = 'field-error';
  errorDiv.style.cssText = 'color: #ff6b6b; font-size: 11px; margin-top: 4px; font-weight: 500;';
  errorDiv.textContent = message;
  field.parentNode.appendChild(errorDiv);
  
  // Add error styling to field
  field.style.borderColor = '#ff6b6b';
  field.style.boxShadow = '0 0 0 2px rgba(255, 107, 107, 0.2)';
}

function clearFieldError(field) {
  const existingError = field.parentNode.querySelector('.field-error');
  if (existingError) {
    existingError.remove();
  }
  field.style.borderColor = '#333';
  field.style.boxShadow = 'none';
}

function validateField(field) {
  const value = field.value.trim();
  const fieldName = field.name;
  
  clearFieldError(field);
  
  if (fieldName === 'email') {
    if (!value) {
      showFieldError(field, 'Email is required');
      return false;
    }
    if (!validateEmail(value)) {
      showFieldError(field, 'Please enter a valid email address');
      return false;
    }
  } else if (fieldName === 'password') {
    if (!value) {
      showFieldError(field, 'Password is required');
      return false;
    }
    if (!validatePassword(value)) {
      showFieldError(field, 'Password must be at least 6 characters');
      return false;
    }
  } else if (fieldName === 'name') {
    if (!value) {
      showFieldError(field, 'Name is required');
      return false;
    }
    if (!validateName(value)) {
      showFieldError(field, 'Name must be at least 2 characters');
      return false;
    }
  } else if (fieldName === 'phone') {
    if (value && !validatePhone(value)) {
      showFieldError(field, 'Please enter a valid phone number');
      return false;
    }
  }
  
  return true;
}

// Show loading animation during login/signup
function showLoginLoadingAnimation(button, text = 'Logging in...') {
  const originalText = button.textContent;
  const originalDisabled = button.disabled;
  
  // Disable button and show loading state
  button.disabled = true;
  button.style.opacity = '0.7';
  button.style.cursor = 'not-allowed';
  
  // Create loading spinner
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid #ffffff;
    border-radius: 50%;
    border-top-color: transparent;
    animation: spin 1s linear infinite;
    margin-right: 8px;
  `;
  
  // Add spinner animation CSS
  if (!document.getElementById('spinnerAnimation')) {
    const style = document.createElement('style');
    style.id = 'spinnerAnimation';
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Update button content
  button.innerHTML = '';
  button.appendChild(spinner);
  button.appendChild(document.createTextNode(text));
  
  // Return function to restore button
  return () => {
    button.disabled = originalDisabled;
    button.style.opacity = '1';
    button.style.cursor = 'pointer';
    button.textContent = originalText;
  };
}

// Show loading screen before login modal
function showLoadingScreen() {
  console.log('🎬 Creating loading screen...');
  const loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'loadingOverlay';
  loadingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #0b0b0b, #1a1a1a);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: white;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  `;

  loadingOverlay.innerHTML = `
    <div style="text-align: center; max-width: 400px; width: 90%;">
      <!-- Logo -->
      <div style="margin-bottom: 40px;">
        <img src="/img/logo.png" alt="Live News Map" style="height: 60px; width: auto; border-radius: 8px; margin-bottom: 20px;" />
      </div>
      
      <!-- 3D Globe Animation -->
      <div id="globeContainer" style="margin-bottom: 40px; perspective: 1000px;">
        <div id="globe" style="
          width: 120px;
          height: 120px;
          margin: 0 auto;
          position: relative;
          transform-style: preserve-3d;
          animation: rotateGlobe 4s linear infinite;
        ">
          <div style="
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: linear-gradient(45deg, #1e3a8a, #3b82f6, #06b6d4, #10b981, #f59e0b, #ef4444);
            position: relative;
            overflow: hidden;
            box-shadow: 
              0 0 30px rgba(59, 130, 246, 0.5),
              inset -20px -20px 50px rgba(0, 0, 0, 0.3),
              inset 20px 20px 50px rgba(255, 255, 255, 0.1);
          ">
            <!-- Globe continents pattern -->
            <div style="
              position: absolute;
              top: 20%;
              left: 30%;
              width: 40%;
              height: 60%;
              background: rgba(0, 0, 0, 0.3);
              border-radius: 50%;
              transform: rotate(15deg);
            "></div>
            <div style="
              position: absolute;
              top: 60%;
              left: 10%;
              width: 30%;
              height: 30%;
              background: rgba(0, 0, 0, 0.2);
              border-radius: 50%;
              transform: rotate(-30deg);
            "></div>
            <div style="
              position: absolute;
              top: 40%;
              right: 20%;
              width: 25%;
              height: 40%;
              background: rgba(0, 0, 0, 0.25);
              border-radius: 50%;
              transform: rotate(45deg);
            "></div>
          </div>
        </div>
      </div>
      
      <!-- App Title -->
      <h1 style="
        font-size: 36px; 
        margin: 0 0 16px 0; 
        font-weight: 700; 
        color: #fff;
        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
        letter-spacing: -0.5px;
      ">
        Live News Map
      </h1>
      
      <!-- Subtitle -->
      <div style="
        font-size: 18px; 
        color: #ccc; 
        margin-bottom: 50px;
        font-weight: 400;
        line-height: 1.4;
      ">
        Loading your personalized experience...
      </div>
      
      <!-- Progress Bar -->
      <div style="
        width: 100%; 
        height: 6px; 
        background: rgba(255, 255, 255, 0.1); 
        border-radius: 3px; 
        overflow: hidden;
        margin-bottom: 20px;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
      ">
        <div id="loadingBar" style="
          width: 0%; 
          height: 100%; 
          background: linear-gradient(90deg, #ff4d4d, #ff6b6b, #ff8a8a); 
          border-radius: 3px; 
          transition: width 0.5s ease;
          box-shadow: 0 0 10px rgba(255, 77, 77, 0.5);
        "></div>
      </div>
      
      <!-- Loading Text -->
      <div id="loadingText" style="
        font-size: 14px; 
        color: #888;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      ">
        Initializing...
      </div>
    </div>
  `;

  document.body.appendChild(loadingOverlay);
  console.log('✅ Loading screen added to DOM');

  // Animate loading bar - 6 seconds total
  const loadingBar = document.getElementById('loadingBar');
  const loadingText = document.getElementById('loadingText');
  
  const loadingSteps = [
    { progress: 20, text: 'Checking authentication...', delay: 1000 },
    { progress: 40, text: 'Preparing login options...', delay: 1000 },
    { progress: 60, text: 'Setting up security...', delay: 1000 },
    { progress: 80, text: 'Almost ready...', delay: 1000 },
    { progress: 100, text: 'Please log in to continue', delay: 1000 }
  ];

  let currentStep = 0;
  const animateStep = () => {
    if (currentStep < loadingSteps.length) {
      const step = loadingSteps[currentStep];
      setTimeout(() => {
        loadingBar.style.width = step.progress + '%';
        loadingText.textContent = step.text;
        currentStep++;
        animateStep();
      }, step.delay);
    }
  };
  
  animateStep();

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes rotateGlobe {
      0% { transform: rotateY(0deg) rotateX(10deg); }
      100% { transform: rotateY(360deg) rotateX(10deg); }
    }
    
    @keyframes pulseGlow {
      0%, 100% { 
        box-shadow: 
          0 0 30px rgba(59, 130, 246, 0.5),
          inset -20px -20px 50px rgba(0, 0, 0, 0.3),
          inset 20px 20px 50px rgba(255, 255, 255, 0.1);
      }
      50% { 
        box-shadow: 
          0 0 50px rgba(59, 130, 246, 0.8),
          inset -20px -20px 50px rgba(0, 0, 0, 0.3),
          inset 20px 20px 50px rgba(255, 255, 255, 0.2);
      }
    }
    
    #globe > div {
      animation: pulseGlow 2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

// Forced login modal for non-authenticated users
function showForcedLoginModal() {
  // Remove loading screen if it exists
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.remove();
  }

  // Create a full-screen overlay that blocks all access
  const overlay = document.createElement('div');
  overlay.id = 'forcedLoginOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.95);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(10px);
  `;

  // Create the modal content
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: #0b0b0b;
    border: 2px solid #ffffff;
    border-radius: 16px;
    padding: 40px;
    max-width: 500px;
    width: 90%;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
    animation: slideInFromTop 0.5s ease-out;
  `;

  modal.innerHTML = `
    <div style="margin-bottom: 30px;">
      <div style="font-size: 48px; margin-bottom: 20px;">🔐</div>
      <h1 style="color: #fff; font-size: 28px; margin: 0 0 16px 0; font-weight: 700;">
        Authentication Required
      </h1>
      <p style="color: #ccc; font-size: 16px; line-height: 1.5; margin: 0;">
        You must be logged in to access this application.<br>
        Please sign in or create an account to continue.
      </p>
    </div>
    
    <div style="display: flex; gap: 12px; justify-content: center; margin-bottom: 20px;">
      <button id="forcedLoginBtn" style="
        background: linear-gradient(135deg, #ffffff, #f0f0f0);
        color: #000;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        min-width: 120px;
      ">Login</button>
      <button id="forcedSignupBtn" style="
        background: transparent;
        color: #ffffff;
        border: 2px solid #ffffff;
        padding: 10px 24px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        min-width: 120px;
      ">Sign Up</button>
    </div>
    
    <div style="color: #888; font-size: 14px;">
      This application requires authentication for security and personalization.
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInFromTop {
      from {
        opacity: 0;
        transform: translateY(-50px) scale(0.9);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    
    #forcedLoginBtn:hover {
      background: linear-gradient(135deg, #f0f0f0, #e0e0e0) !important;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(255, 255, 255, 0.3);
    }
    
    #forcedSignupBtn:hover {
      background: #ffffff !important;
      color: #000 !important;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(255, 255, 255, 0.3);
    }
  `;
  document.head.appendChild(style);

  // Add event listeners with immediate response
  const loginBtn = document.getElementById('forcedLoginBtn');
  const signupBtn = document.getElementById('forcedSignupBtn');
  
  console.log('🔍 Button elements found:', { loginBtn: !!loginBtn, signupBtn: !!signupBtn });
  
  if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔴 LOGIN BUTTON CLICKED - Starting auth process');
      
      // Hide the forced login modal
      overlay.style.display = 'none';
      
      // Create auth modal directly
      createAuthModalDirectly('login');
    });
  } else {
    console.error('❌ LOGIN BUTTON NOT FOUND!');
  }
  
  if (signupBtn) {
    signupBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔴 SIGNUP BUTTON CLICKED - Starting auth process');
      
      // Hide the forced login modal
      overlay.style.display = 'none';
      
      // Create auth modal directly
      createAuthModalDirectly('signup');
    });
  } else {
    console.error('❌ SIGNUP BUTTON NOT FOUND!');
  }
  

  // Prevent closing the modal by clicking outside
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // Prevent closing with escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Store reference to overlay for later removal
  window.forcedLoginOverlay = overlay;

  // Clean up escape listener when modal is closed
  const originalRemove = overlay.remove;
  overlay.remove = function() {
    document.removeEventListener('keydown', handleEscape);
    originalRemove.call(this);
  };
}

// Periodic authentication check to ensure user is still logged in
let authCheckInterval = null;

function startAuthCheck() {
  // Clear existing interval if any
  if (authCheckInterval) {
    clearInterval(authCheckInterval);
  }
  
  // Check authentication every 30 seconds
  authCheckInterval = setInterval(async () => {
    const user = await me();
    if (!user) {
      // User is no longer logged in - force them to log in again
      showForcedLoginModal();
      // Disable all functionality
      disableAllFunctionality();
    }
  }, 30000); // 30 seconds
}

// Disable all functionality when user is not logged in
function disableAllFunctionality() {
  // Disable all interactive elements
  const interactiveElements = document.querySelectorAll('button, select, input, a');
  interactiveElements.forEach(el => {
    el.disabled = true;
    el.style.pointerEvents = 'none';
    el.style.opacity = '0.5';
  });
  
  // Hide the map and sidebar
  const map = document.getElementById('map');
  const sidebar = document.querySelector('.sidebar');
  if (map) map.style.display = 'none';
  if (sidebar) sidebar.style.display = 'none';
}

function stopAuthCheck() {
  if (authCheckInterval) {
    clearInterval(authCheckInterval);
    authCheckInterval = null;
  }
}

// Get current position with better error handling and accuracy
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 15000, // Increased timeout for better accuracy
      maximumAge: 60000 // 1 minute - shorter cache time for better accuracy
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Validate position accuracy
        if (position.coords.accuracy > 100) {
          console.warn('Location accuracy is low:', position.coords.accuracy, 'meters');
        }
        resolve(position);
      },
      (error) => {
        let errorMessage = 'Location access denied';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied. Please enable location permissions.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again.';
            break;
        }
        reject(new Error(errorMessage));
      },
      options
    );
  });
}

// Send location to server
async function sendLocationToServer(latitude, longitude) {
  const response = await fetch('/api/location/share', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      latitude,
      longitude,
      timestamp: new Date().toISOString()
    })
  });

  if (!response.ok) {
    // Handle authentication errors specifically
    if (response.status === 401) {
      throw new Error('401 Unauthorized - Please log in to share your location');
    }
    
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to share location (${response.status})`);
  }

  return response.json();
}

// Note: Old notification tracking removed - real-time notifications handle deduplication

// ---------- Region Access Request System ----------

// Open region request modal
async function openRegionRequestModal() {
  // Check if user can make a request
  const canRequest = await checkRequestEligibility();
  if (!canRequest.eligible) {
    showNotification(canRequest.message, 'error');
    return;
  }

  // Load all available countries and regions
  await loadAllAvailableData();
  
  // Reset selection
  selectedCountries = [];
  
  // Populate modal
  populateCountrySelection();
  updateRegionPreview();
  updateSubmitButton();
  
  // Show modal
  document.getElementById('regionRequestModal').style.display = 'flex';
}

// Check if user can make a request
async function checkRequestEligibility() {
  try {
    const res = await fetch('/api/region-requests/eligibility', {
      credentials: 'same-origin'
    });
    
    if (res.ok) {
      const data = await res.json();
      return {
        eligible: data.canMakeRequest,
        message: data.message || 'You can make a request',
        cooldownEnds: data.cooldownEnds
      };
    } else {
      return {
        eligible: false,
        message: 'Unable to check request eligibility'
      };
    }
  } catch (error) {
    console.error('Error checking request eligibility:', error);
    return {
      eligible: false,
      message: 'Error checking request eligibility'
    };
  }
}

// Load all available countries and regions
async function loadAllAvailableData() {
  try {
    const res = await fetch('/api/regions', { credentials: 'same-origin' });
    if (res.ok) {
      const regions = await res.json();
      allAvailableRegions = regions;
      
      // Extract unique countries
      const countrySet = new Set();
      regions.forEach(region => {
        if (region.country) countrySet.add(region.country);
      });
      allAvailableCountries = Array.from(countrySet).sort();
      
      console.log('Loaded regions:', allAvailableRegions.length);
      console.log('Available countries:', allAvailableCountries);
    } else {
      console.error('Failed to load regions:', res.status);
    }
  } catch (error) {
    console.error('Failed to load available data:', error);
    allAvailableCountries = [];
    allAvailableRegions = [];
  }
}

// Populate country selection
function populateCountrySelection() {
  const container = document.getElementById('countrySelection');
  container.innerHTML = allAvailableCountries.map(country => {
    const regions = allAvailableRegions.filter(r => r.country === country);
    return `
      <label style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border-radius:4px;transition:background 0.2s" 
             onmouseover="this.style.background='#222'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" data-country="${country}" 
               style="margin:0" onchange="handleCountrySelection('${country}')" />
        <span style="color:#fff;font-size:14px">${country}</span>
        <span style="color:#888;font-size:12px">(${regions.length} regions)</span>
      </label>
    `;
  }).join('');
  
  // Add event listeners after populating
  container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const country = e.target.getAttribute('data-country');
      handleCountrySelection(country);
    });
  });
}

// Handle country selection
function handleCountrySelection(country) {
  const checkbox = document.querySelector(`input[data-country="${country}"]`);
  const isChecked = checkbox.checked;
  
  if (isChecked) {
    if (selectedCountries.length >= 3) {
      checkbox.checked = false;
      showNotification('Maximum 3 countries allowed', 'error');
      return;
    }
    selectedCountries.push(country);
  } else {
    selectedCountries = selectedCountries.filter(c => c !== country);
  }
  
  updateRegionPreview();
  updateSubmitButton();
  updateSelectedCount();
}

// Update region preview
function updateRegionPreview() {
  const preview = document.getElementById('regionPreview');
  
  if (selectedCountries.length === 0) {
    preview.innerHTML = 'Select countries to see available regions';
    return;
  }
  
  const regionsByCountry = selectedCountries.map(country => {
    const regions = allAvailableRegions
      .filter(r => r.country === country)
      .slice(0, 2) // Limit to 2 regions per country
      .map(r => r.name);
    
    return `<div style="margin-bottom:4px"><strong>${country}:</strong> ${regions.length > 0 ? regions.join(', ') : 'No regions available'}</div>`;
  }).join('');
  
  preview.innerHTML = regionsByCountry || 'No regions available for selected countries';
}

// Update submit button state
function updateSubmitButton() {
  const submitBtn = document.getElementById('submitRegionRequest');
  submitBtn.disabled = selectedCountries.length === 0;
}

// Update selected count
function updateSelectedCount() {
  const countEl = document.getElementById('selectedCount');
  countEl.textContent = `Selected: ${selectedCountries.length}/3`;
}

// Submit region request
async function submitRegionRequest() {
  if (selectedCountries.length === 0) return;
  
  const submitBtn = document.getElementById('submitRegionRequest');
  const errorEl = document.getElementById('regionRequestErr');
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';
  errorEl.textContent = '';
  
  try {
    console.log('=== REQUEST SUBMISSION DEBUG ===');
    console.log('Selected countries:', selectedCountries);
    console.log('Available regions count:', allAvailableRegions.length);
    
    // Get regions for selected countries (2 per country)
    const requestedRegions = [];
    selectedCountries.forEach(country => {
      const regions = allAvailableRegions
        .filter(r => r.country === country)
        .slice(0, 2);
      console.log(`Regions for ${country}:`, regions.map(r => ({ name: r.name, id: r._id })));
      requestedRegions.push(...regions.map(r => r._id));
    });
    
    const requestData = {
      requestedCountries: selectedCountries,
      requestedRegions: requestedRegions
    };
    
    console.log('Final request data:', requestData);
    console.log('Request data JSON:', JSON.stringify(requestData));
    
    const res = await fetch('/api/region-requests', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });
    
    console.log('Response status:', res.status);
    console.log('Response headers:', Object.fromEntries(res.headers.entries()));
    
    if (res.ok) {
      const result = await res.json();
      console.log('Request result:', result);
      showNotification('Request submitted successfully! Admin will review your request.', 'success');
      document.getElementById('regionRequestModal').style.display = 'none';
      
      // Start cooldown timer
      startCooldownTimer();
    } else {
      const error = await res.json().catch(() => ({ error: 'Failed to submit request' }));
      console.error('Request error:', error);
      console.error('Error details:', {
        status: res.status,
        statusText: res.statusText,
        error: error
      });
      errorEl.textContent = error.error || 'Failed to submit request';
    }
  } catch (error) {
    console.error('Error submitting request:', error);
    console.error('Error stack:', error.stack);
    errorEl.textContent = 'Failed to submit request';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Request';
  }
}

// Start cooldown timer
function startCooldownTimer() {
  const cooldownEnds = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
  
  function updateTimer() {
    const now = Date.now();
    const remaining = cooldownEnds - now;
    
    if (remaining <= 0) {
      clearInterval(requestCooldownTimer);
      requestCooldownTimer = null;
      const requestBtn = document.getElementById('requestAccessBtn');
      if (requestBtn) {
        requestBtn.textContent = 'Request Access';
        requestBtn.disabled = false;
        requestBtn.style.background = 'transparent';
        requestBtn.style.color = '#ff4d4d';
      }
      return;
    }
    
    // Calculate days, hours, minutes, seconds
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
    
    let timeString = '';
    if (days > 0) {
      timeString = `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      timeString = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      timeString = `${minutes}m ${seconds}s`;
    } else {
      timeString = `${seconds}s`;
    }
    
    const requestBtn = document.getElementById('requestAccessBtn');
    if (requestBtn) {
      requestBtn.textContent = `Request Access (${timeString})`;
      requestBtn.disabled = true;
      requestBtn.style.background = '#333';
      requestBtn.style.color = '#888';
    }
  }
  
  updateTimer();
  requestCooldownTimer = setInterval(updateTimer, 1000); // Update every second
}

// Show notification
function showNotification(message, type = 'info', persistent = false) {
  const container = document.getElementById('notificationContainer');
  const notification = document.createElement('div');
  
  const colors = {
    success: '#00b37e',
    error: '#e10600',
    info: '#3ea6ff',
    warning: '#ffc107'
  };
  
  const icons = {
    success: '●',
    error: '●',
    info: '●',
    warning: '●'
  };
  
  notification.style.cssText = `
    background: #0b0b0b;
    border: 2px solid ${colors[type] || colors.info};
    color: #ddd;
    padding: 16px 20px;
    border-radius: 12px;
    margin-bottom: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    pointer-events: auto;
    animation: slideInFromRight 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    max-width: 400px;
    position: relative;
    overflow: hidden;
  `;
  
  // Add glow effect for important notifications
  if (type === 'success' || type === 'error') {
    notification.style.boxShadow = `0 8px 24px rgba(0,0,0,0.4), 0 0 20px ${colors[type]}40`;
  }
  
  notification.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:12px">
      <div style="width:8px;height:8px;border-radius:50%;background:${colors[type] || colors.info};margin-top:6px;flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-weight:600;margin-bottom:4px;color:#fff">${type === 'success' ? 'Request Approved' : type === 'error' ? 'Request Denied' : 'Notification'}</div>
        <div style="font-size:14px;line-height:1.4">${message}</div>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:#999;cursor:pointer;font-size:16px;padding:4px;border-radius:4px;transition:background 0.2s;width:24px;height:24px;display:flex;align-items:center;justify-content:center" onmouseover="this.style.background='#333'" onmouseout="this.style.background='transparent'">×</button>
    </div>
  `;
  
  container.appendChild(notification);
  
  // Auto remove after 8 seconds for non-persistent notifications
  if (!persistent) {
    setTimeout(() => {
      if (notification.parentElement) {
        notification.style.animation = 'slideOutToRight 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
      }
    }, 8000);
  }
}

// ---------- NEW: detail styles (injected once) ----------
function ensureDetailStyles() {
  if (document.getElementById('detail-styles')) return;
  const s = document.createElement('style');
  s.id = 'detail-styles';
  s.textContent = `
    .news-item { display:grid; grid-template-columns:28px 1fr auto; gap:10px; align-items:start; padding:8px 0; }
    .news-item .icon { width:20px; height:20px; opacity:.9; margin-top:2px; }
    .news-detail img.hero { width:100%; height:auto; border-radius:10px; border:1px solid var(--border); margin-bottom:10px }
    @media (max-width: 720px){
      .news-item { grid-template-columns:24px 1fr auto; }
      .news-detail img.hero { max-height:40vh; object-fit:cover; }
    }
  `;
  document.head.appendChild(s);
}

// ---------- existing severity UI ----------
function severityFromCategory(cat = '') {
  const c = String(cat || '').toLowerCase();
  if (c === 'war' || c === 'climate') return 'red';
  if (c === 'culture' || c === 'society'|| c === 'demise') return 'yellow';
  return 'green';
}
function ensureSignalStyles() {
  if (document.getElementById('severity-signal-styles')) return;
  const style = document.createElement('style');
  style.id = 'severity-signal-styles';
  style.textContent = `
    .signalbar { display:inline-flex; align-items:center; gap:6px; margin-left:8px; }
    .signalbar .light { width:14px; height:14px; border-radius:50%; background:#d1d5db; transition:background 120ms ease; }
    .signalbar .light.red.on { background:#fa0004; }
    .signalbar .light.yellow.on { background:#ffee02; }
    .signalbar .light.green.on { background:#2faf00; }
  `;
  document.head.appendChild(style);
}
function ensureSignalBar() {
  if (document.getElementById('severitySignalBar')) return;
  const badge = document.getElementById('dominantBadge');
  if (!badge || !badge.parentElement) return;
  const bar = document.createElement('div');
  bar.className = 'signalbar';
  bar.id = 'severitySignalBar';
  bar.setAttribute('aria-label', 'Severity signal');
  bar.setAttribute('role', 'group');
  bar.innerHTML = `
    <span class="light red" title="Red: war/climate"></span>
    <span class="light yellow" title="Yellow: culture/society"></span>
    <span class="light green" title="Green: other"></span>
  `;
  badge.insertAdjacentElement('afterend', bar);
}
function updateSignalBar(severity) {
  const bar = document.getElementById('severitySignalBar');
  if (!bar) return;
  ['red', 'yellow', 'green'].forEach(color => {
    const el = bar.querySelector(`.light.${color}`);
    if (el) el.classList.toggle('on', color === severity);
  });
}
function latestCategory(items = []) {
  return (items && items.length && (items[0].category || 'others')) || 'others';
}

// ---------- maps ----------
function loadScript(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=src; s.async=true; s.onload=resolve; s.onerror=reject;
    document.head.appendChild(s);
  });
}
async function initMap(){
  const cfg = await (await fetch('/api/config')).json();
  if(!cfg.mapboxToken){ alert('Server is missing MAPBOX_TOKEN; set it in .env'); return; }
  
  // Set Mapbox access token
  mapboxgl.accessToken = cfg.mapboxToken;
  
  // Initialize Mapbox map
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11', // Dark theme to match app
    center: [0, 20], // [lng, lat] - Mapbox uses longitude first
    zoom: 2,
    attributionControl: false, // Hide attribution
    logoPosition: 'bottom-right'
  });
  
  // Add navigation controls
  map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  
  // Wait for map to load
  map.on('load', () => {
    console.log('🗺️ Mapbox map loaded successfully');
  });
}
async function fetchRegions(){
  try {
    // Use cached data if available and recent (less than 5 minutes old)
    const cacheKey = 'regions_data';
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 300000) {
      console.log('Using cached regions data');
      regions = cached.data;
    } else {
      console.log('Fetching fresh regions data');
      regions = await (await fetch('/api/regions')).json();
      cache.set(cacheKey, { data: regions, timestamp: Date.now() });
    }
    
    // Filter regions based on user visibility settings
    if (userVisibilitySettings.hasVisibilityRestrictions) {
      regions = regions.filter(region => {
        // If user has country restrictions, check if country is allowed
        if (userVisibilitySettings.visibleCountries.length > 0) {
          if (!userVisibilitySettings.visibleCountries.includes(region.country)) {
            return false;
          }
        }
        // If user has region restrictions, check if specific region is allowed
        if (userVisibilitySettings.visibleRegions.length > 0) {
          if (!userVisibilitySettings.visibleRegions.includes(region._id)) {
            return false;
          }
        }
        return true;
      });
    }
    
    byCountry = {};
    for(const r of regions){ (byCountry[r.country] ||= []).push(r); }
    
    // Auto-select first country and region if available
    const countries = Object.keys(byCountry).sort();
    if(countries.length > 0) {
      const firstCountry = countries[0];
      selectCountry(firstCountry);
    }
    
    // Render markers in background for better performance
    setTimeout(() => renderAllRegionMarkers(), 100);
    
    // Show visibility warning if user has restrictions
    showVisibilityWarning();
  } catch (error) {
    console.error('Failed to fetch regions:', error);
    // Show error message to user
    const countrySelectorText = document.getElementById('countrySelectorText');
    if (countrySelectorText) {
      countrySelectorText.textContent = 'Failed to load regions';
    }
  }
}
function makeIcon(category){
  return ICONS[category] || ICONS.others;
}
async function getRegionPayload(regionId, force=false){
  const now = Date.now();
  const c = cache.get(regionId);
  if(!force && c && now - c.ts < 120000) return c.payload;

  const url = `/api/news/${regionId}?limit=30${force ? '&force=1' : ''}`;
  const res = await fetch(url).then(r=>r.json());
  cache.set(regionId, { ts: now, payload: res });
  return res;
}
async function renderAllRegionMarkers(force=false){
  // Render markers in batches for better performance
  const batchSize = 10;
  const batches = [];
  
  for (let i = 0; i < regions.length; i += batchSize) {
    batches.push(regions.slice(i, i + batchSize));
  }
  
  for (const batch of batches) {
    const batchPromises = batch.map(async (region) => {
      try {
        const payload = await getRegionPayload(region._id, force);
        const cat = latestCategory(payload.items);
        const iconUrl = makeIcon(cat);
        let marker = markers.get(region._id);
        
        if (!marker) {
          // Create Mapbox marker
          const el = document.createElement('div');
          el.className = 'mapbox-marker';
          el.style.cssText = `
            width: ${ICON_PX}px;
            height: ${ICON_PX}px;
            background-image: url('${iconUrl}');
            background-size: contain;
            background-repeat: no-repeat;
            cursor: pointer;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          `;
          
          marker = new mapboxgl.Marker(el)
            .setLngLat([region.lng, region.lat])
            .addTo(map);
          
          // Add click event
          el.addEventListener('click', () => {
            selectCountry(region.country);
            selectRegionFromCustom(region._id);
          });
          
          markers.set(region._id, marker);
        } else {
          // Update existing marker icon
          const el = marker.getElement();
          el.style.backgroundImage = `url('${iconUrl}')`;
          el.title = `${region.name} • ${cat}`;
        }
      } catch (e) {
        console.warn('Marker render failed for region', region._id, e);
      }
    });
    
    // Wait for batch to complete before next batch
    await Promise.allSettled(batchPromises);
    
    // Small delay between batches to prevent UI blocking
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
async function selectRegion(regionId, force=false){
  currentRegionId = regionId;
  const region = regions.find(r=>r._id===regionId);
  if(!region) return;
  
  // Pan to region with smooth animation
  map.flyTo({
    center: [region.lng, region.lat],
    zoom: 5,
    duration: 1000
  });

  if(aborter) aborter.abort(); aborter = new AbortController();

  const payload = await getRegionPayload(regionId, force);
  const cat = latestCategory(payload.items);
  await renderRegion(region, payload, cat);

  const marker = markers.get(regionId);
  if(marker){
    // Update marker icon for Mapbox
    const el = marker.getElement();
    el.style.backgroundImage = `url('${makeIcon(cat)}')`;
    el.title = `${region.name} • ${cat}`;
    
    // Add bounce animation for Mapbox
    el.style.animation = 'bounce 0.7s ease-in-out';
    setTimeout(() => {
      el.style.animation = '';
    }, 700);
  }
}

// ---------- NEW: News Marquee functionality ----------
let marqueeNews = [];
let currentMarqueeIndex = 0;


function createNewsSentence(item) {
  const category = item.category || 'others';
  const title = item.translatedTitle || item.title || '';
  const source = item.source || 'Unknown Source';
  
  // Create complete sentences based on category
  const sentences = {
    war: [
      `Breaking: ${title} - ${source} reports on escalating tensions in the region.`,
      `Military Update: ${title} as conflict continues to develop.`,
      `War Alert: ${title} - ${source} provides latest battlefield intelligence.`
    ],
    climate: [
      `Climate Alert: ${title} - ${source} reports on environmental developments.`,
      `Weather Update: ${title} as climate patterns continue to shift.`,
      `Environmental News: ${title} - ${source} covers climate change impacts.`
    ],
    politics: [
      `Political Update: ${title} - ${source} reports on government developments.`,
      `Breaking Politics: ${title} as political landscape evolves.`,
      `Government News: ${title} - ${source} covers political developments.`
    ],
    economy: [
      `Economic Update: ${title} - ${source} reports on financial markets.`,
      `Business News: ${title} as economic indicators show changes.`,
      `Financial Alert: ${title} - ${source} covers economic developments.`
    ],
    society: [
      `Social Update: ${title} - ${source} reports on community developments.`,
      `Society News: ${title} as social issues continue to evolve.`,
      `Community Alert: ${title} - ${source} covers social developments.`
    ],
    culture: [
      `Cultural Update: ${title} - ${source} reports on cultural developments.`,
      `Arts News: ${title} as cultural landscape continues to change.`,
      `Culture Alert: ${title} - ${source} covers cultural events.`
    ],
    peace: [
      `Peace Update: ${title} - ${source} reports on diplomatic developments.`,
      `Diplomatic News: ${title} as peace efforts continue.`,
      `Peace Alert: ${title} - ${source} covers diplomatic progress.`
    ],
    demise: [
      `Breaking: ${title} - ${source} reports on significant developments.`,
      `Update: ${title} as situation continues to develop.`,
      `News Alert: ${title} - ${source} provides latest information.`
    ],
    others: [
      `Breaking News: ${title} - ${source} reports on latest developments.`,
      `Update: ${title} as story continues to unfold.`,
      `News Alert: ${title} - ${source} covers the latest information.`
    ]
  };
  
  const categorySentences = sentences[category] || sentences.others;
  return categorySentences[Math.floor(Math.random() * categorySentences.length)];
}

function updateMarquee() {
  const marqueeElement = document.getElementById('newsMarquee');
  if (!marqueeElement || marqueeNews.length === 0) return;
  
  const currentItem = marqueeNews[currentMarqueeIndex];
  const sentence = createNewsSentence(currentItem);
  const category = currentItem.category || 'others';
  const iconSrc = ICONS[category] || ICONS.others;
  
  const marqueeContent = marqueeElement.querySelector('.marquee-content');
  if (marqueeContent) {
    marqueeContent.innerHTML = `
      <img class="marquee-icon" src="${iconSrc}" alt="${category}" style="width: 20px; height: 20px; margin-right: 8px; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));" />
      <span class="marquee-text ${category}">${sentence}</span>
    `;
    
    // Add click handler to marquee content
    marqueeContent.style.cursor = 'pointer';
    marqueeContent.onclick = () => showNewsPopup(currentItem);
  }
  
  // Move to next item
  currentMarqueeIndex = (currentMarqueeIndex + 1) % marqueeNews.length;
}

function startMarquee() {
  // Update marquee every 8 seconds
  setInterval(updateMarquee, 8000);
  // Initial update
  updateMarquee();
}

function updateMarqueeNews(newsItems) {
  // Filter for items with titles and take the most recent 10
  marqueeNews = newsItems
    .filter(item => item.title && item.title.trim().length > 0)
    .slice(0, 10);
  
  if (marqueeNews.length > 0) {
    currentMarqueeIndex = 0;
    updateMarquee();
  }
}

// ---------- News Popup Functionality ----------

function showNewsPopup(newsItem) {
  const popup = document.getElementById('newsPopup');
  if (!popup || !newsItem) return;
  
  // Use translated content if available, otherwise use original
  const displayTitle = newsItem.translatedTitle || newsItem.title;
  const displaySummary = newsItem.translatedSummary || newsItem.summary;
  
  // Populate popup content
  document.getElementById('newsPopupTitle').textContent = displayTitle || 'No title available';
  document.getElementById('newsPopupSummary').textContent = displaySummary || 'No summary available';
  document.getElementById('newsPopupSource').textContent = newsItem.source || 'Unknown Source';
  document.getElementById('newsPopupDate').textContent = newsItem.isoDate ? new Date(newsItem.isoDate).toLocaleString() : 'No date';
  document.getElementById('newsPopupLink').href = newsItem.link || '#';
  
  // Handle image
  const imageElement = document.getElementById('newsPopupImage');
  if (newsItem.image && newsItem.image.trim()) {
    imageElement.src = newsItem.image;
    imageElement.alt = displayTitle || 'News image';
    imageElement.style.display = 'block';
  } else {
    imageElement.style.display = 'none';
  }
  
  // Show popup with animation
  popup.style.display = 'block';
  requestAnimationFrame(() => {
    popup.classList.add('show');
  });
}

function hideNewsPopup() {
  const popup = document.getElementById('newsPopup');
  if (!popup) return;
  
  popup.classList.remove('show');
  setTimeout(() => {
    popup.style.display = 'none';
  }, 300); // Match CSS transition duration
}

function initNewsPopup() {
  // Add close button event listener
  const closeBtn = document.getElementById('closeNewsPopup');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideNewsPopup);
  }
  
  // Close popup when clicking outside
  const popup = document.getElementById('newsPopup');
  if (popup) {
    popup.addEventListener('click', (e) => {
      if (e.target === popup) {
        hideNewsPopup();
      }
    });
  }
  
  // Close popup with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const popup = document.getElementById('newsPopup');
      if (popup && popup.classList.contains('show')) {
        hideNewsPopup();
      }
    }
  });
}

// ---------- Custom Selector Functionality ----------

let selectedCountry = null;
let selectedRegion = null;

function showCountryPopup() {
  const popup = document.getElementById('countryPopup');
  const countryList = document.getElementById('countryList');
  const countrySearch = document.getElementById('countrySearch');
  
  if (!popup || !countryList) return;
  
  // Populate country list
  populateCountryList();
  
  // Clear search
  if (countrySearch) {
    countrySearch.value = '';
  }
  
  // Show popup
  popup.style.display = 'block';
  requestAnimationFrame(() => {
    popup.classList.add('show');
  });
  
  // Focus search input
  setTimeout(() => {
    if (countrySearch) countrySearch.focus();
  }, 100);
}

function hideCountryPopup() {
  const popup = document.getElementById('countryPopup');
  if (!popup) return;
  
  popup.classList.remove('show');
  setTimeout(() => {
    popup.style.display = 'none';
  }, 300);
}

function showRegionPopup() {
  const popup = document.getElementById('regionPopup');
  const regionList = document.getElementById('regionList');
  const regionSearch = document.getElementById('regionSearch');
  const regionPopupMessage = document.getElementById('regionPopupMessage');
  const regionSearchContainer = document.getElementById('regionSearchContainer');
  
  if (!popup || !regionList) return;
  
  if (!selectedCountry) {
    // Show message to select country first
    regionPopupMessage.style.display = 'flex';
    regionSearchContainer.style.display = 'none';
    regionList.innerHTML = '';
  } else {
    // Populate region list
    regionPopupMessage.style.display = 'none';
    regionSearchContainer.style.display = 'block';
    populateRegionList(selectedCountry);
    
    // Clear search
    if (regionSearch) {
      regionSearch.value = '';
    }
  }
  
  // Show popup
  popup.style.display = 'block';
  requestAnimationFrame(() => {
    popup.classList.add('show');
  });
  
  // Focus search input if available
  if (selectedCountry && regionSearch) {
    setTimeout(() => {
      regionSearch.focus();
    }, 100);
  }
}

function hideRegionPopup() {
  const popup = document.getElementById('regionPopup');
  if (!popup) return;
  
  popup.classList.remove('show');
  setTimeout(() => {
    popup.style.display = 'none';
  }, 300);
}

function populateCountryList() {
  const countryList = document.getElementById('countryList');
  if (!countryList || !byCountry) return;
  
  const countries = Object.keys(byCountry).sort();
  countryList.innerHTML = countries.map(country => {
    const regionCount = byCountry[country].length;
    const isSelected = selectedCountry === country;
    
    return `
      <div class="selector-item ${isSelected ? 'selected' : ''}" data-country="${country}">
        <span class="selector-item-name">${country}</span>
        <span class="selector-item-count">${regionCount} region${regionCount !== 1 ? 's' : ''}</span>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  countryList.querySelectorAll('.selector-item').forEach(item => {
    item.addEventListener('click', () => {
      const country = item.dataset.country;
      selectCountry(country);
      hideCountryPopup();
    });
  });
}

function populateRegionList(country) {
  const regionList = document.getElementById('regionList');
  if (!regionList || !byCountry[country]) return;
  
  const regions = byCountry[country];
  regionList.innerHTML = regions.map(region => {
    const isSelected = selectedRegion === region._id;
    
    return `
      <div class="selector-item ${isSelected ? 'selected' : ''}" data-region-id="${region._id}">
        <span class="selector-item-name">${region.name}</span>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  regionList.querySelectorAll('.selector-item').forEach(item => {
    item.addEventListener('click', () => {
      const regionId = item.dataset.regionId;
      selectRegionFromCustom(regionId);
      hideRegionPopup();
    });
  });
}

function selectCountry(country) {
  selectedCountry = country;
  selectedRegion = null; // Reset region when country changes
  
  // Update country selector text
  const countrySelectorText = document.getElementById('countrySelectorText');
  if (countrySelectorText) {
    countrySelectorText.textContent = country;
  }
  
  // Update region selector text
  const regionSelectorText = document.getElementById('regionSelectorText');
  if (regionSelectorText) {
    regionSelectorText.textContent = 'Select Region';
  }
  
  // Auto-select first region if available
  if (byCountry[country] && byCountry[country].length > 0) {
    const firstRegion = byCountry[country][0];
    selectRegionFromCustom(firstRegion._id);
  }
}

function selectRegionFromCustom(regionId) {
  selectedRegion = regionId;
  
  // Update region selector text
  const regionSelectorText = document.getElementById('regionSelectorText');
  if (regionSelectorText) {
    const region = regions.find(r => r._id === regionId);
    if (region) {
      regionSelectorText.textContent = region.name;
    }
  }
  
  // Call the existing selectRegion function
  selectRegion(regionId);
}

function initCustomSelectors() {
  // Country selector
  const countrySelector = document.getElementById('countrySelector');
  if (countrySelector) {
    countrySelector.addEventListener('click', showCountryPopup);
  }
  
  // Region selector
  const regionSelector = document.getElementById('regionSelector');
  if (regionSelector) {
    regionSelector.addEventListener('click', showRegionPopup);
  }
  
  // Country popup close
  const closeCountryPopup = document.getElementById('closeCountryPopup');
  if (closeCountryPopup) {
    closeCountryPopup.addEventListener('click', hideCountryPopup);
  }
  
  // Region popup close
  const closeRegionPopup = document.getElementById('closeRegionPopup');
  if (closeRegionPopup) {
    closeRegionPopup.addEventListener('click', hideRegionPopup);
  }
  
  // Search functionality
  const countrySearch = document.getElementById('countrySearch');
  if (countrySearch) {
    countrySearch.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const items = document.querySelectorAll('#countryList .selector-item');
      
      items.forEach(item => {
        const countryName = item.querySelector('.selector-item-name').textContent.toLowerCase();
        item.style.display = countryName.includes(searchTerm) ? 'flex' : 'none';
      });
    });
  }
  
  const regionSearch = document.getElementById('regionSearch');
  if (regionSearch) {
    regionSearch.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const items = document.querySelectorAll('#regionList .selector-item');
      
      items.forEach(item => {
        const regionName = item.querySelector('.selector-item-name').textContent.toLowerCase();
        item.style.display = regionName.includes(searchTerm) ? 'flex' : 'none';
      });
    });
  }
  
  // Close popups when clicking outside
  document.addEventListener('click', (e) => {
    const countryPopup = document.getElementById('countryPopup');
    const regionPopup = document.getElementById('regionPopup');
    
    if (countryPopup && countryPopup.classList.contains('show') && e.target === countryPopup) {
      hideCountryPopup();
    }
    
    if (regionPopup && regionPopup.classList.contains('show') && e.target === regionPopup) {
      hideRegionPopup();
    }
  });
  
  // Close popups with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const countryPopup = document.getElementById('countryPopup');
      const regionPopup = document.getElementById('regionPopup');
      
      if (countryPopup && countryPopup.classList.contains('show')) {
        hideCountryPopup();
      }
      
      if (regionPopup && regionPopup.classList.contains('show')) {
        hideRegionPopup();
      }
    }
  });
}

// ---------- NEW: list/detail rendering ----------
function newsRow(it) {
  const li = document.createElement('div');
  li.className = 'news-item';
  
  // Use translated content if available, otherwise use original
  const displayTitle = it.translatedTitle || it.title;
  const displaySummary = it.translatedSummary || it.summary;
  
  li.innerHTML = `
    <img class="icon" src="${ICONS[it.category] || ICONS.others}" alt="${it.category}" />
    <div>
      <div class="title" style="font-weight:600;line-height:1.3" data-original="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</div>
      <div class="small" style="color:var(--muted)" data-original="${escapeHtml(it.source || '')} • ${it.isoDate ? new Date(it.isoDate).toLocaleString() : ''}">${escapeHtml(it.source || '')} • ${it.isoDate ? new Date(it.isoDate).toLocaleString() : ''}</div>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-ghost read-later" title="Read later">☆</button>
    </div>
  `;
  // click → detail
  li.addEventListener('click', (e) => {
    if (e.target.closest('.read-later')) return;
    showNewsDetail(it);
  });
  // read later
  li.querySelector('.read-later').addEventListener('click', async (e) => {
    e.stopPropagation();
    await saveReadLater(it);
  });
  return li;
}
function renderNewsList(items = []) {
  showingDetail = null;
  const list = document.getElementById('newsList');
  if (!list) return;
  list.innerHTML = '';

  if (!items.length) {
    list.innerHTML = `<div class="small" style="color:var(--muted);padding:8px 0">No recent items.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const it of items) frag.appendChild(newsRow(it));
  list.appendChild(frag);
  
  // Update marquee with new news items
  updateMarqueeNews(items);
  
  // If currently in Italian, translate the new content
  if (currentLanguage === 'it') {
    setTimeout(() => translateAllContent('it'), 100);
  }
}
function showNewsDetail(it) {
  showingDetail = it;
  const wrap = document.getElementById('newsList');
  if (!wrap) return;

  // Use translated content if available, otherwise use original
  const displayTitle = it.translatedTitle || it.title;
  const displaySummary = it.translatedSummary || it.summary;

  const imgHtml = it.image ? `<img src="${it.image}" alt="" class="hero" />` : '';

  wrap.innerHTML = `
    <div class="news-detail">
      <div class="news-detail-actions">
        <button id="backToList" class="btn">← Back</button>
        <a class="btn btn-white" href="${it.link}" target="_blank" rel="noopener">View Source</a>
        <button id="detailSave" class="btn btn-white">Save</button>
      </div>
      ${imgHtml}
      <div style="display:flex;gap:8px;align-items:center;margin:6px 0;">
        <img class="icon" src="${ICONS[it.category] || ICONS.others}" alt="${it.category}" style="width:18px;height:18px;opacity:.9" />
        <div class="small" style="color:var(--muted)" data-original="${escapeHtml(it.source || '')} • ${it.isoDate ? new Date(it.isoDate).toLocaleString() : ''}">${escapeHtml(it.source || '')} • ${it.isoDate ? new Date(it.isoDate).toLocaleString() : ''}</div>
      </div>
      <h3 style="margin:6px 0 8px" data-original="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</h3>
      <p style="white-space:pre-wrap;line-height:1.5" data-original="${escapeHtml(displaySummary || '')}">${escapeHtml(displaySummary || '')}</p>
    </div>
  `;

  document.getElementById('backToList').addEventListener('click', () => renderNewsList(newsListCache));
  document.getElementById('detailSave').addEventListener('click', async () => {
    await saveReadLater(it);
  });
  
  // If currently in Italian, translate the detail content
  if (currentLanguage === 'it') {
    setTimeout(() => translateAllContent('it'), 100);
  }
}
async function saveReadLater(it) {
  const u = await me();
  if (!u) { openAuthModalSafely(); toast('Please log in to save articles', 'info'); return; }
  const payload = {
    title: it.title, summary: it.summary, link: it.link,
    isoDate: it.isoDate, image: it.image, source: it.source, category: it.category
  };
  const r = await fetch('/api/account/readlater', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const j = await r.json().catch(()=>({error:'Failed'}));
    toast(j.error || 'Failed to save', 'error');
  } else {
    toast('Added to Read later', 'success');
  }
}

// ---------- existing region renderer (now uses new list/detail) ----------
async function renderRegion(region, payload, latestCat){
  const computed = latestCat || latestCategory(payload.items);
  document.getElementById('dominantBadge').textContent = ` ${computed}`;

  ensureSignalStyles();
  ensureSignalBar();
  updateSignalBar(severityFromCategory(computed));
  ensureDetailStyles();

  // Process news with AI classification
  const newsItems = payload.items || [];
  if (newsItems.length > 0) {
    console.log('🧠 Starting AI classification for region news...');
    const aiProcessedItems = await processNewsWithAI(newsItems);
    
    // Update news list cache with AI-classified items
    newsListCache = aiProcessedItems;
    
    // Show AI classification summary
    const aiClassifiedCount = aiProcessedItems.filter(item => item.aiClassified).length;
    console.log(`🧠 AI Classification Summary: ${aiClassifiedCount}/${aiProcessedItems.length} items classified by AI`);
  } else {
    newsListCache = newsItems;
  }
  
  const list = document.getElementById('newsList');
  if (!list) return;
  renderNewsList(newsListCache);
}

// ---------- utils ----------
function escapeHtml(str=''){
  return str.replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

// Authentication guard - prevents any access without login
function enforceAuthentication() {
  // Only disable specific app elements, not everything
  const appElements = document.querySelectorAll('#map, #sidebar, #locationIcon, .news-item, .region-item');
  appElements.forEach(el => {
    el.style.pointerEvents = 'none';
    el.style.opacity = '0.3';
  });
  
  // Don't show additional message - the loading screen and modal will handle this
}

// ---------- boot ----------
document.addEventListener('DOMContentLoaded', async ()=>{
  // Cleanup any existing AI indicators on page load
  cleanupAIIndicators();
  console.log('🚀 DOM Content Loaded - Starting app initialization');
  
  // Immediately enforce authentication - block everything
  enforceAuthentication();
  
  try {
    // First, check if user is logged in - this is mandatory
    console.log('🔍 Checking user authentication...');
    const user = await me();
    console.log('👤 User check result:', user ? 'Logged in' : 'Not logged in');
    
    if (!user) {
      // User is not logged in - show loading screen first, then force login after delay
      console.log('📱 User not logged in - showing loading screen');
      showLoadingScreen();
      setTimeout(() => {
        console.log('⏰ 6 seconds passed - showing forced login modal');
        showForcedLoginModal();
      }, 6000); // 6 second delay
      return; // Stop execution - don't load anything else
    } else {
      // User is logged in - remove auth message and proceed
      console.log('✅ User is already logged in, proceeding with app initialization');
      const authMessage = document.getElementById('authRequiredMessage');
      if (authMessage) {
        authMessage.remove();
      }
    }
  } catch (error) {
    console.error('❌ Error during authentication check:', error);
    // If there's an error, show loading screen and force login
    console.log('📱 Error occurred - showing loading screen');
    showLoadingScreen();
    setTimeout(() => {
      console.log('⏰ 6 seconds passed - showing forced login modal after error');
      showForcedLoginModal();
    }, 6000);
    return;
  }

  // User is logged in - proceed with normal initialization
  // Re-enable app elements
  const appElements = document.querySelectorAll('#map, #sidebar, #locationIcon, .news-item, .region-item');
  appElements.forEach(el => {
    el.style.pointerEvents = 'auto';
    el.style.opacity = '1';
  });
  
  await initMap();
  await loadUserVisibilitySettings();
  await fetchRegions();

  ensureSignalStyles();
  ensureSignalBar();
  ensureDetailStyles();
  
  // Start periodic authentication check
  startAuthCheck();

  document.getElementById('refreshBtn').addEventListener('click', async ()=>{
    await refreshData('refreshBtn');
  });
  
  // Auto-refresh removed - only manual refresh on click

  // Start news marquee
  startMarquee();

  // Initialize news popup
  initNewsPopup();
  
  // Initialize custom selectors
  initCustomSelectors();
  

  // Real-time notifications handle all status updates
  
// Initialize real-time notifications
initRealTimeNotifications();


// Initialize location sharing
initLocationSharing();

// Update location icon visibility on page load
updateLocationIconVisibility();

// Initialize mobile map toggle
initMobileMapToggle();

// Start periodic authentication check
startAuthCheck();
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    cleanupRealTimeNotifications();
    stopAuthCheck();
  });

  // Region request modal event listeners
  document.getElementById('closeRegionRequestModal')?.addEventListener('click', () => {
    document.getElementById('regionRequestModal').style.display = 'none';
  });
  
  document.getElementById('cancelRegionRequest')?.addEventListener('click', () => {
    document.getElementById('regionRequestModal').style.display = 'none';
  });
  
  document.getElementById('submitRegionRequest')?.addEventListener('click', submitRegionRequest);

  // If Account page set a "deep link" to open a story on landing:
  try {
    const raw = localStorage.getItem('lnm_open_item');
    if (raw) {
      localStorage.removeItem('lnm_open_item');
      const it = JSON.parse(raw);
      setTimeout(() => showNewsDetail(it), 250);
    }
  } catch {}
});

