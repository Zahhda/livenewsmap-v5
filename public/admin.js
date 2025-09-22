// public/admin.js
const tokenKey = "lnm_admin_token";
let regionsCache = []; // keep full list for filtering
let isVerified = false; // gate state

// ---------- Toast ----------
function showToast(message, type = "info") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  const border = { success: "#00b37e", error: "#e10600", info: "#3ea6ff" }[type] || "#3ea6ff";
  el.style.borderLeftColor = border;
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";
  el.style.pointerEvents = "auto";
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    el.style.pointerEvents = "none";
  }, 1800);
}

// ---------- Gate UI helpers ----------
function gateUI() {
  const layout = document.getElementById("adminLayout");
  const gate = document.getElementById("gateNotice");
  if (!layout || !gate) return;
  if (isVerified) {
    layout.style.display = "flex";
    gate.style.display = "none";
  } else {
    layout.style.display = "none";
    gate.style.display = "block";
  }
}

function disableForm(disabled) {
  const form = document.getElementById("regionForm");
  if (!form) return;
  Array.from(form.elements).forEach(el => el.disabled = !!disabled);
}

// ---------- Token helpers ----------
function getToken() { return (localStorage.getItem(tokenKey) || "").trim(); }
function setToken(t) {
  const v = (t || "").trim();
  localStorage.setItem(tokenKey, v);
  // Any change to the token invalidates current verification
  isVerified = false;
  renderTokenStatus();
  gateUI();
  // Clear regions UI until verified again
  const list = document.getElementById("regionsList");
  if (list) list.innerHTML = "";
  disableForm(true);
}

function renderTokenStatus() {
  const badge = document.getElementById("tokenStatus");
  if (!badge) return;
  if (!isVerified) {
    badge.textContent = "Not verified";
    badge.style.background = "#111";
    badge.style.border = "1px solid var(--border)";
    badge.style.color = "var(--muted)";
  } else {
    badge.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#00b37e;"></span>
      Verified admin
    </span>`;
    badge.style.background = "rgba(0,179,126,0.12)";
    badge.style.border = "1px solid rgba(0,179,126,0.35)";
    badge.style.color = "#9AF0D3";
  }
}

// ---------- API wrapper (adds token header, strict 403 handling) ----------
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", "Accept": "application/json", ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers["x-admin-token"] = token;
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    // Treat 403 from server as hard invalid token
    if (res.status === 403) throw new Error("INVALID_ADMIN_TOKEN");
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || res.statusText);
  }
  // If endpoint returns no body (e.g., DELETE), return {}
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// ---------- Gate logic ----------
async function verifyTokenAndUnlock() {
  const token = getToken();
  if (!token) {
    isVerified = false;
    renderTokenStatus();
    gateUI();
    showToast("Enter a token first", "info");
    return;
  }

  try {
    // Call a protected GET to validate token
    await api("/api/admin/regions");
    isVerified = true;
    renderTokenStatus();
    gateUI();
    disableForm(false);
    showToast("Token verified", "success");
    await loadRegions();
  } catch (e) {
    isVerified = false;
    renderTokenStatus();
    gateUI();
    disableForm(true);
    showToast(e.message === "INVALID_ADMIN_TOKEN" ? "Invalid admin token" : (e.message || "Verification failed"), "error");
  }
}

// ---------- Feeds UI ----------
function feedRow(url = "", category = "others", validationState = null) {
  const wrap = document.createElement("div");
  wrap.className = "feed-row";
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "1fr 120px 32px 80px";
  wrap.style.gap = "8px";
  wrap.style.marginBottom = "8px";
  wrap.style.alignItems = "center";
  wrap.style.padding = "8px";
  wrap.style.border = "1px solid #333";
  wrap.style.borderRadius = "6px";
  wrap.style.transition = "all 0.2s ease";
  
  // Create validation status indicator
  const validationIndicator = createValidationIndicator(validationState);
  
  wrap.innerHTML = `
    <input class="feed-url input" placeholder="Feed URL" value="${url}" />
    <select class="feed-cat input">
      <option value="war" ${category === "war" ? "selected" : ""}>war</option>
      <option value="politics" ${category === "politics" ? "selected" : ""}>politics</option>
      <option value="culture" ${category === "culture" ? "selected" : ""}>culture</option>
      <option value="economy" ${category === "economy" ? "selected" : ""}>economy</option>
      <option value="society" ${category === "society" ? "selected" : ""}>society</option>
      <option value="climate" ${category === "climate" ? "selected" : ""}>climate</option>
      <option value="peace" ${category === "peace" ? "selected" : ""}>peace</option>
      <option value="demise" ${category === "demise" ? "selected" : ""}>demise</option>
      <option value="others" ${category === "others" ? "selected" : ""}>others</option>
    </select>
    <div class="validation-indicator">${validationIndicator}</div>
    <button type="button" class="remove btn" style="padding: 6px 12px; font-size: 12px;">Remove</button>
  `;
  
  // Add validation button
  const validateBtn = wrap.querySelector(".validation-indicator");
  validateBtn.addEventListener("click", () => validateFeedUrl(wrap));
  
  // Add delete button
  wrap.querySelector(".remove").addEventListener("click", () => {
    wrap.remove();
    updateValidationSummary();
    checkRSSAlert();
  });
  
  // Auto-validate on URL change
  const urlInput = wrap.querySelector(".feed-url");
  urlInput.addEventListener("blur", () => {
    if (urlInput.value.trim()) {
      validateFeedUrl(wrap);
    }
  });
  
  // Auto-validate on input change (with debounce)
  let validationTimeout;
  urlInput.addEventListener("input", () => {
    clearTimeout(validationTimeout);
    validationTimeout = setTimeout(() => {
      if (urlInput.value.trim()) {
        validateFeedUrl(wrap);
      }
    }, 1000);
  });
  
  return wrap;
}

// Create validation indicator
function createValidationIndicator(validationState) {
  if (!validationState) {
    return '<button class="validate-btn" title="Validate RSS">✓</button>';
  }
  
  if (validationState.isValidating) {
    return '<div class="loading-spinner" title="Validating...">⟳</div>';
  }
  
  if (validationState.isValid) {
    return '<div class="valid-indicator" title="Valid RSS Feed">✓</div>';
  }
  
  return '<div class="invalid-indicator" title="Invalid RSS Feed">✗</div>';
}

// Validate RSS feed URL
async function validateFeedUrl(feedRow) {
  const urlInput = feedRow.querySelector(".feed-url");
  const validationDiv = feedRow.querySelector(".validation-indicator");
  const url = urlInput.value.trim();
  
  if (!url) {
    validationDiv.innerHTML = '<button class="validate-btn" title="Validate RSS">✓</button>';
    feedRow.dataset.validationState = '';
    checkRSSAlert();
    return;
  }
  
  // Show loading state
  validationDiv.innerHTML = '<div class="loading-spinner" title="Validating...">⟳</div>';
  feedRow.dataset.validationState = 'validating';
  checkRSSAlert();
  
  try {
    const response = await fetch('/api/rss-validation/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url })
    });
    
    const validation = await response.json();
    
    if (validation.isValid) {
      validationDiv.innerHTML = '<div class="valid-indicator" title="Valid RSS Feed">✓</div>';
      feedRow.dataset.validationState = 'valid';
      showToast(`✓ RSS feed validated: ${validation.feedTitle} (${validation.itemCount} items)`, 'success');
    } else {
      validationDiv.innerHTML = '<div class="invalid-indicator" title="Invalid RSS Feed">✗</div>';
      feedRow.dataset.validationState = 'invalid';
      showToast(`✗ Invalid RSS feed: ${validation.error}`, 'error');
    }
    
    updateValidationSummary();
    checkRSSAlert();
  } catch (error) {
    validationDiv.innerHTML = '<div class="invalid-indicator" title="Validation failed">✗</div>';
    feedRow.dataset.validationState = 'invalid';
    showToast('✗ Failed to validate RSS feed', 'error');
    checkRSSAlert();
  }
}

// Validate all RSS feeds
async function validateAllFeeds() {
  const feedRows = document.querySelectorAll('#feedsWrap > div');
  const urls = Array.from(feedRows)
    .map(row => row.querySelector('.feed-url').value.trim())
    .filter(url => url);
  
  if (urls.length === 0) {
    showToast('No RSS feeds to validate', 'info');
    return;
  }
  
  showToast(`Validating ${urls.length} RSS feeds...`, 'info');
  
  try {
    const response = await fetch('/api/rss-validation/validate-multiple', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls })
    });
    
    const { validations } = await response.json();
    
    // Update UI with validation results
    feedRows.forEach((row, index) => {
      const url = row.querySelector('.feed-url').value.trim();
      const validation = validations.find(v => v.url === url);
      
      if (validation) {
        const validationDiv = row.querySelector('.validation-indicator');
        if (validation.isValid) {
          validationDiv.innerHTML = '<div class="valid-indicator" title="Valid RSS Feed">✓</div>';
          row.dataset.validationState = 'valid';
        } else {
          validationDiv.innerHTML = '<div class="invalid-indicator" title="Invalid RSS Feed">✗</div>';
          row.dataset.validationState = 'invalid';
        }
      }
    });
    
    updateValidationSummary();
    
    const validCount = validations.filter(v => v.isValid).length;
    const invalidCount = validations.length - validCount;
    
    showToast(`Validation complete: ${validCount} valid, ${invalidCount} invalid`, 'info');
  } catch (error) {
    showToast('Failed to validate RSS feeds', 'error');
  }
}

// Check RSS alert visibility
function checkRSSAlert() {
  const feedRows = document.querySelectorAll('#feedsWrap > div');
  const invalidCount = Array.from(feedRows).filter(row => row.dataset.validationState === 'invalid').length;
  const validatingCount = Array.from(feedRows).filter(row => row.dataset.validationState === 'validating').length;
  const totalCount = feedRows.length;
  
  const alert = document.getElementById('rssAlert');
  const alertText = document.getElementById('rssAlertText');
  
  if (!alert || !alertText) return;
  
  if (totalCount === 0) {
    alert.style.display = 'none';
    return;
  }
  
  if (invalidCount > 0) {
    alert.style.display = 'block';
    alertText.innerHTML = `
      <strong>${invalidCount} invalid RSS feed${invalidCount > 1 ? 's' : ''} detected!</strong><br>
      Please fix the highlighted feeds before saving. Click the ✗ button next to each invalid feed to see details.
    `;
  } else if (validatingCount > 0) {
    alert.style.display = 'block';
    alertText.innerHTML = `
      <strong>Validating RSS feeds...</strong><br>
      Please wait while we check all feed URLs for validity.
    `;
  } else {
    alert.style.display = 'none';
  }
}

// Update validation summary
function updateValidationSummary() {
  const feedRows = document.querySelectorAll('#feedsWrap > div');
  const validCount = Array.from(feedRows).filter(row => row.dataset.validationState === 'valid').length;
  const invalidCount = Array.from(feedRows).filter(row => row.dataset.validationState === 'invalid').length;
  const totalCount = feedRows.length;
  
  let summaryDiv = document.getElementById('rssValidationSummary');
  if (!summaryDiv) {
    summaryDiv = document.createElement('div');
    summaryDiv.id = 'rssValidationSummary';
    summaryDiv.className = 'rss-validation-summary';
    document.getElementById('feedsWrap').parentNode.insertBefore(summaryDiv, document.getElementById('feedsWrap'));
  }
  
  if (totalCount === 0) {
    summaryDiv.style.display = 'none';
    return;
  }
  
  const invalidLinks = Array.from(feedRows)
    .filter(row => row.dataset.validationState === 'invalid')
    .map(row => ({
      url: row.querySelector('.feed-url').value.trim(),
      error: row.querySelector('.invalid-indicator')?.title || 'Invalid RSS Feed'
    }));
  
  summaryDiv.innerHTML = `
    <div class="validation-stats">
      <div class="stat-item stat-total">
        <span>Total:</span>
        <span>${totalCount}</span>
      </div>
      <div class="stat-item stat-valid">
        <span>✓</span>
        <span>Valid: ${validCount}</span>
      </div>
      <div class="stat-item stat-invalid">
        <span>✗</span>
        <span>Invalid: ${invalidCount}</span>
      </div>
    </div>
    ${invalidLinks.length > 0 ? `
      <div class="invalid-links-list">
        <div style="font-weight: 600; margin-bottom: 4px; color: #e10600;">Invalid RSS Links:</div>
        ${invalidLinks.map(link => `
          <div class="invalid-link-item">
            <span>✗</span>
            <a href="${link.url}" target="_blank" title="${link.error}">${link.url}</a>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
  
  summaryDiv.classList.add('show');
}

// Auto-validate all feeds on page load
async function autoValidateAllFeeds() {
  const feedRows = document.querySelectorAll('#feedsWrap > div');
  const urls = Array.from(feedRows)
    .map(row => row.querySelector('.feed-url').value.trim())
    .filter(url => url);
  
  if (urls.length === 0) return;
  
  try {
    const response = await fetch('/api/rss-validation/validate-multiple', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls })
    });
    
    const { validations } = await response.json();
    
    // Update UI with validation results
    feedRows.forEach((row) => {
      const url = row.querySelector('.feed-url').value.trim();
      const validation = validations.find(v => v.url === url);
      
      if (validation) {
        const validationDiv = row.querySelector('.validation-indicator');
        if (validation.isValid) {
          validationDiv.innerHTML = '<div class="valid-indicator" title="Valid RSS Feed">✓</div>';
          row.dataset.validationState = 'valid';
        } else {
          validationDiv.innerHTML = '<div class="invalid-indicator" title="Invalid RSS Feed">✗</div>';
          row.dataset.validationState = 'invalid';
        }
      }
    });
    
    updateValidationSummary();
  } catch (error) {
    console.error('Auto-validation failed:', error);
  }
}

// ---------- Regions (list, filter, CRUD) ----------
async function loadRegions() {
  if (!isVerified) return;
  const list = document.getElementById("regionsList");
  list.innerHTML = "Loading...";
  try {
    const regions = await api("/api/admin/regions");
    // Must be an array; otherwise backend is wrong
    if (!Array.isArray(regions)) throw new Error("Regions API must return an array");
    regionsCache = regions.slice();
    renderCountryFilter(regionsCache);
    renderRegionsList(regionsCache);
    await renderRegionsOverview(regionsCache);
  } catch (e) {
    list.textContent = "Error: " + (e.message || "Failed to load regions");
  }
}

// Refresh regions with loader animation
async function refreshRegionsWithLoader() {
  const refreshBtn = document.getElementById("refreshRegionsBtn");
  const content = document.getElementById("regionsOverviewContent");
  const refreshContent = refreshBtn.querySelector(".regions-refresh-content");
  const refreshLoader = refreshBtn.querySelector(".regions-refresh-loader");
  
  // Show loading state
  refreshBtn.disabled = true;
  refreshBtn.classList.add("loading");
  refreshContent.classList.add("hidden");
  refreshLoader.classList.remove("hidden");
  
  // Show progress in content area
  content.innerHTML = '<div style="color:#ff6b35; font-style:italic; display:flex; align-items:center; gap:8px;"><div class="regions-spinner"></div>Validating regions...</div>';
  
  try {
    // Validate regions with progress tracking
    await renderRegionsOverviewWithProgress(regionsCache);
    
    // Success state
    refreshBtn.classList.remove("loading");
    refreshBtn.classList.add("success");
    refreshLoader.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/>
      </svg>
      <span class="regions-refresh-text">Complete</span>
    `;
    
    // Reset after 2 seconds
    setTimeout(() => {
      refreshBtn.classList.remove("success");
      refreshContent.classList.remove("hidden");
      refreshLoader.classList.add("hidden");
      refreshBtn.disabled = false;
    }, 2000);
    
  } catch (error) {
    console.error('Failed to refresh regions:', error);
    
    // Error state
    refreshBtn.classList.remove("loading");
    refreshBtn.classList.add("error");
    refreshLoader.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
      </svg>
      <span class="regions-refresh-text">Failed</span>
    `;
    
    content.innerHTML = '<div style="color:#e10600;">Failed to validate regions</div>';
    
    // Reset after 2 seconds
    setTimeout(() => {
      refreshBtn.classList.remove("error");
      refreshContent.classList.remove("hidden");
      refreshLoader.classList.add("hidden");
      refreshBtn.disabled = false;
    }, 2000);
  }
}

// Render regions overview with RSS validation status and progress
async function renderRegionsOverview(regions) {
  const overview = document.getElementById("regionsOverview");
  const content = document.getElementById("regionsOverviewContent");
  
  if (!overview || !content || regions.length === 0) {
    if (overview) overview.style.display = 'none';
    return;
  }
  
  overview.style.display = 'block';
  content.innerHTML = '<div style="color:#888; font-style:italic;">Validating regions...</div>';
  
  try {
    await renderRegionsOverviewWithProgress(regions);
  } catch (error) {
    console.error('Failed to validate regions:', error);
    content.innerHTML = '<div style="color:#e10600;">Failed to validate regions</div>';
  }
}

// Render regions overview with progress tracking
async function renderRegionsOverviewWithProgress(regions) {
  const content = document.getElementById("regionsOverviewContent");
  
  // Show initial progress
  content.innerHTML = `
    <div style="color:#ff6b35; font-style:italic; display:flex; align-items:center; gap:8px;">
      <div class="regions-spinner"></div>
      Validating regions... 0% (0/${regions.length})
    </div>
  `;
  
  // Validate all regions' RSS feeds in parallel with progress updates
  const validationPromises = regions.map(async (region, index) => {
    const feeds = region.feeds || [];
    if (feeds.length === 0) {
      return {
        region,
        status: 'no-feeds',
        validFeeds: 0,
        invalidFeeds: 0,
        totalFeeds: 0,
        errors: ['No RSS feeds configured']
      };
    }
    
    let validFeeds = 0;
    let invalidFeeds = 0;
    const errors = [];
    
    // Validate all feeds in parallel for this region
    const feedValidationPromises = feeds.map(async (feed) => {
      try {
        const response = await fetch('/api/rss-validation/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: feed.url })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const validation = await response.json();
        if (validation.isValid) {
          validFeeds++;
          return { url: feed.url, valid: true, error: null };
        } else {
          invalidFeeds++;
          const error = validation.error || 'Invalid RSS feed';
          errors.push(`${feed.url}: ${error}`);
          return { url: feed.url, valid: false, error };
        }
      } catch (error) {
        invalidFeeds++;
        const errorMsg = `Validation failed: ${error.message || error}`;
        errors.push(`${feed.url}: ${errorMsg}`);
        return { url: feed.url, valid: false, error: errorMsg };
      }
    });
    
    // Wait for all feeds in this region to be validated
    await Promise.all(feedValidationPromises);
    
    // Determine status based on validation results
    let status = 'unknown';
    if (validFeeds > 0 && invalidFeeds === 0) {
      status = 'valid';
    } else if (validFeeds > 0 && invalidFeeds > 0) {
      status = 'partial';
    } else if (invalidFeeds > 0) {
      status = 'invalid';
    } else {
      status = 'unknown';
    }
    
    return {
      region,
      status,
      validFeeds,
      invalidFeeds,
      totalFeeds: feeds.length,
      errors
    };
  });
  
  // Track progress as validations complete
  let completedCount = 0;
  const results = [];
  
  // Process results as they complete
  for (let i = 0; i < validationPromises.length; i++) {
    try {
      const result = await validationPromises[i];
      results[i] = result;
      completedCount++;
      
      // Update progress
      const progress = Math.round((completedCount / regions.length) * 100);
      content.innerHTML = `
        <div style="color:#ff6b35; font-style:italic; display:flex; align-items:center; gap:8px;">
          <div class="regions-spinner"></div>
          Validating regions... ${progress}% (${completedCount}/${regions.length})
        </div>
      `;
    } catch (error) {
      console.error(`Validation failed for region ${i}:`, error);
      results[i] = {
        region: regions[i],
        status: 'error',
        validFeeds: 0,
        invalidFeeds: 0,
        totalFeeds: 0,
        errors: [`Validation failed: ${error.message}`]
      };
      completedCount++;
    }
  }
  
  // Render overview items with accurate status
  content.innerHTML = results.map(result => {
    const { region, status, validFeeds, invalidFeeds, totalFeeds, errors } = result;
    
    let statusText = '';
    let statusClass = status;
    
    if (status === 'valid') {
      statusText = `✓ ${validFeeds}/${totalFeeds} feeds valid`;
      statusClass = 'valid';
    } else if (status === 'partial') {
      statusText = `⚠ ${validFeeds}/${totalFeeds} feeds valid (${invalidFeeds} invalid)`;
      statusClass = 'partial';
    } else if (status === 'invalid') {
      statusText = `✗ ${invalidFeeds}/${totalFeeds} feeds invalid`;
      statusClass = 'invalid';
    } else if (status === 'no-feeds') {
      statusText = `? No RSS feeds configured`;
      statusClass = 'no-feeds';
    } else if (status === 'error') {
      statusText = `❌ Validation error`;
      statusClass = 'error';
    } else {
      statusText = `? ${totalFeeds} feeds (not validated)`;
      statusClass = 'unknown';
    }
    
    return `
      <div class="region-status-item ${statusClass}" 
           title="${errors.length > 0 ? errors.join('\n') : 'All feeds valid'}"
           onclick="fillForm(${JSON.stringify(region).replace(/"/g, '&quot;')})">
        <div class="region-status-indicator ${statusClass}"></div>
        <div class="region-name">${region.name}</div>
        <div class="region-stats">${statusText}</div>
      </div>
    `;
  }).join('');
}

function renderCountryFilter(regions) {
  const sel = document.getElementById("countryFilter");
  if (!sel) return;
  const countries = Array.from(new Set(regions.map((r) => r.country))).sort();
  const current = sel.value || "__ALL__";
  sel.innerHTML = `<option value="__ALL__">All countries</option>`;
  for (const c of countries) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }
  sel.value = countries.includes(current) ? current : "__ALL__";
  sel.onchange = () => filterRegions();
}

function filterRegions() {
  const sel = document.getElementById("countryFilter");
  const val = sel.value;
  if (!val || val === "__ALL__") renderRegionsList(regionsCache);
  else renderRegionsList(regionsCache.filter((r) => r.country === val));
}

function renderRegionsList(regions) {
  const list = document.getElementById("regionsList");
  list.innerHTML = "";
  if (!regions.length) {
    list.innerHTML = `<div class="small" style="color:var(--muted);">No regions yet.</div>`;
    return;
  }
  for (const r of regions) {
    const row = document.createElement("div");
    row.style.border = "1px solid var(--border)";
    row.style.borderRadius = "10px";
    row.style.padding = "8px";
    row.style.marginBottom = "8px";
    
    // Determine RSS status for this region
    const feeds = r.feeds || [];
    let rssStatus = '';
    let rssStatusClass = '';
    
    if (feeds.length === 0) {
      rssStatus = 'No feeds';
      rssStatusClass = 'rss-unknown';
    } else {
      // Check if feeds have been validated
      const validatedFeeds = feeds.filter(feed => feed.validationState === 'valid').length;
      const invalidFeeds = feeds.filter(feed => feed.validationState === 'invalid').length;
      
      if (validatedFeeds > 0 && invalidFeeds === 0) {
        rssStatus = `✓ ${validatedFeeds}/${feeds.length} valid`;
        rssStatusClass = 'rss-valid';
      } else if (validatedFeeds > 0 && invalidFeeds > 0) {
        rssStatus = `⚠ ${validatedFeeds}/${feeds.length} valid (${invalidFeeds} invalid)`;
        rssStatusClass = 'rss-partial';
      } else if (invalidFeeds > 0) {
        rssStatus = `✗ ${invalidFeeds}/${feeds.length} invalid`;
        rssStatusClass = 'rss-invalid';
      } else {
        rssStatus = `${feeds.length} feed${feeds.length > 1 ? 's' : ''} (not validated)`;
        rssStatusClass = 'rss-info';
      }
    }
    
    row.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <div style="font-weight:600">${r.name}</div>
        <div class="small" style="color:var(--muted);">${r.country}</div>
        <div class="small" style="color:var(--muted);">(${r.lat}, ${r.lng})</div>
        <div class="small ${rssStatusClass}" style="color:var(--muted);">${rssStatus}</div>
        <div style="margin-left:auto;display:flex;gap:6px;">
          <button class="edit btn">Edit</button>
          <button class="del btn">Delete</button>
        </div>
      </div>
    `;
    row.querySelector(".edit").addEventListener("click", () => fillForm(r));
    row.querySelector(".del").addEventListener("click", async () => {
      if (!confirm("Delete region?")) return;
      try {
        await api("/api/admin/regions/" + r._id, { method: "DELETE" });
        showToast("Region deleted", "success");
        await loadRegions();
      } catch (err) {
        showToast(err.message || "Delete failed", "error");
      }
    });
    list.appendChild(row);
  }
}

// ---------- Form ----------
function fillForm(r) {
  document.getElementById("regionId").value = r._id || "";
  document.getElementById("name").value = r.name || "";
  document.getElementById("country").value = r.country || "";
  document.getElementById("lat").value = r.lat ?? "";
  document.getElementById("lng").value = r.lng ?? "";
  const wrap = document.getElementById("feedsWrap");
  wrap.innerHTML = "";
  for (const f of r.feeds || []) wrap.appendChild(feedRow(f.url, f.category || "others"));
  showToast("Loaded for edit: " + (r.name || "Region"), "info");
  
  // Auto-validate feeds after loading
  setTimeout(() => {
    autoValidateAllFeeds();
  }, 500);
}

function emptyForm() {
  fillForm({ name: "", country: "", lat: "", lng: "", feeds: [] });
}

// ---------- UI Normalization (match Account page styles) ----------
function unifyButtons() {
  // Primary actions use white button; others standard dark
  const addFeedBtn = document.getElementById("addFeedBtn");
  const resetBtn = document.getElementById("resetBtn");
  const saveTokenBtn = document.getElementById("saveTokenBtn");
  const verifyBtn = document.getElementById("verifyBtn"); // if present

  [addFeedBtn, resetBtn, verifyBtn].forEach(b => { if (b) b.classList.add("btn"); });
  if (saveTokenBtn) { saveTokenBtn.classList.add("btn", "btn-white"); }

  // Normalize top nav buttons if present
  const backHome = document.getElementById("backHomeBtn");
  const adminUsers = document.getElementById("adminUsersBtn");
  if (backHome) backHome.classList.add("btn");
  if (adminUsers) adminUsers.classList.add("btn", "btn-white");
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  renderTokenStatus();
  gateUI();
  disableForm(true);
  unifyButtons();

  // Auto-verify if a token was previously saved
  if (getToken()) verifyTokenAndUnlock();

  document.getElementById("saveTokenBtn")?.addEventListener("click", async () => {
    const t = document.getElementById("tokenInput").value.trim();
    setToken(t);
    showToast("Admin token saved", "info");
    await verifyTokenAndUnlock();
  });

  document.getElementById("addFeedBtn")?.addEventListener("click", () => {
    document.getElementById("feedsWrap").appendChild(feedRow());
    checkRSSAlert();
  });

  // Validate all feeds button (now in HTML)
  document.getElementById("validateAllBtn")?.addEventListener("click", validateAllFeeds);
  
  // Refresh regions overview button
  document.getElementById("refreshRegionsBtn")?.addEventListener("click", async () => {
    if (regionsCache.length > 0) {
      await refreshRegionsWithLoader();
    }
  });
  
  // Auto-validate feeds when form is loaded
  setTimeout(() => {
    autoValidateAllFeeds();
  }, 1000);

  document.getElementById("resetBtn")?.addEventListener("click", () => {
    emptyForm();
    showToast("Form reset", "info");
  });

  document.getElementById("regionForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isVerified) return;
    
    // Check for invalid RSS feeds before saving
    const feedRows = document.querySelectorAll('#feedsWrap > div');
    const invalidCount = Array.from(feedRows).filter(row => row.dataset.validationState === 'invalid').length;
    const validatingCount = Array.from(feedRows).filter(row => row.dataset.validationState === 'validating').length;
    
    if (validatingCount > 0) {
      showToast("Please wait for RSS validation to complete", "error");
      return;
    }
    
    if (invalidCount > 0) {
      showToast(`Cannot save: ${invalidCount} invalid RSS feed${invalidCount > 1 ? 's' : ''} detected. Please fix them first.`, "error");
      checkRSSAlert(); // Ensure alert is visible
      return;
    }
    
    const id = document.getElementById("regionId").value.trim();
    const payload = {
      name: document.getElementById("name").value.trim(),
      country: document.getElementById("country").value.trim(),
      lat: parseFloat(document.getElementById("lat").value),
      lng: parseFloat(document.getElementById("lng").value),
      feeds: Array.from(document.querySelectorAll("#feedsWrap > div"))
        .map((row) => ({
          url: row.querySelector(".feed-url").value.trim(),
          category: row.querySelector(".feed-cat").value,
        }))
        .filter((f) => f.url),
    };
    
    try {
      if (id) {
        await api("/api/admin/regions/" + id, { method: "PUT", body: JSON.stringify(payload) });
        showToast("✓ Region updated successfully", "success");
      } else {
        await api("/api/admin/regions", { method: "POST", body: JSON.stringify(payload) });
        showToast("✓ Region created successfully", "success");
      }
      emptyForm();
      await loadRegions();
    } catch (e2) {
      showToast("✗ " + (e2.message || "Save failed"), "error");
    }
  });
});
