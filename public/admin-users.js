// public/admin-users.js
function qs(s){ return document.querySelector(s); }
function qsa(s){ return document.querySelectorAll(s); }
function fmtDate(s){ try { return new Date(s).toLocaleString(); } catch { return s; } }

// Socket.IO connection for admin messaging
let socket = null;
let currentUserId = null;

// Better user ID detection
async function detectCurrentUserId() {
  // Try to get from cookie first
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'token') {
      try {
        const payload = JSON.parse(atob(value.split('.')[1]));
        currentUserId = payload.userId || payload.id;
        console.log('Current user ID from token:', currentUserId);
        return currentUserId;
      } catch (e) {
        console.error('Error parsing token:', e);
      }
    }
  }
  
  // Fallback to API call
  try {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      const user = await response.json();
      currentUserId = user._id || user.id;
      console.log('Current user ID from API:', currentUserId);
      return currentUserId;
    }
  } catch (error) {
    console.error('Error fetching current user:', error);
  }
  
  return null;
}
let currentConversation = null;
let typingTimeout = null;

// Initialize currentUserId from token
function initCurrentUserId() {
  try {
    const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
    if (token) {
      // Decode JWT token to get user ID
      const payload = JSON.parse(atob(token.split('.')[1]));
      currentUserId = payload.id;
    }
  } catch (error) {
    console.error('Failed to get current user ID:', error);
  }
}

// Lazy opener for the auth modal from auth.js (if present on page)
function openAuthModalSafely() {
  try { 
    if (typeof openModal === 'function') openModal(); 
  } catch (error) {
    console.error('Failed to open auth modal:', error);
  }
}

async function list() {
  console.log('Loading users...');
  
  const res = await fetch('/api/admin/users', {
    // IMPORTANT: ensure cookies (JWT) go with the request
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json' }
  });

  console.log('Users API response status:', res.status);

  if (!res.ok) {
    // Try to parse structured error, else text
    let errMsg = '';
    try { errMsg = (await res.json()).error || ''; } catch { errMsg = await res.text(); }
    const msg = `Failed to load users. HTTP ${res.status}. ${errMsg}`;
    console.error('Users API error:', msg);

    if (res.status === 401 || res.status === 403) {
      // Not logged in / not admin. Show a friendly prompt + open login modal if available.
      document.body.innerHTML =
        '<div style="padding:24px;color:#e66">Admin access required. Please login as an admin user.</div>';
      openAuthModalSafely();
      throw new Error('Admin auth required: ' + msg);
    }

    throw new Error(msg); // true 5xx shows here
  }

  const { users } = await res.json();
  console.log('Users loaded:', users?.length || 0);
  
  // Store users for search functionality
  allUsers = users || [];
  filteredUsers = [...allUsers];
  
  const tbody = qs('#usersBody');
  if (!tbody) {
    console.error('❌ Users table body not found - element #usersBody missing');
    return; // avoid NPE if table not on page
  }
  
  if (!users || users.length === 0) {
    console.log('⚠️ No users found');
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding:40px;text-align:center;color:#888;font-style:italic">
          No users found
        </td>
      </tr>
    `;
    return;
  }
  
  renderUsersTable();
  setupSearchFunctionality();
}

// Render users table
function renderUsersTable() {
  const tbody = qs('#usersBody');
  if (!tbody) return;
  
  if (filteredUsers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding:40px;text-align:center;color:#888;font-style:italic">
          No users found
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = filteredUsers.map(u => `
    <tr class="user-row" data-id="${u.id || u._id}" style="transition:all 0.2s ease;cursor:pointer" onmouseover="this.style.backgroundColor='#1a1a1a';this.style.transform='translateY(-1px)'" onmouseout="this.style.backgroundColor='transparent';this.style.transform='translateY(0)'">
      <td style="padding:16px;border-top:1px solid #222">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:40px;height:40px;background:linear-gradient(135deg, #4d79ff, #6b8cff);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;box-shadow: 0 4px 12px rgba(77, 121, 255, 0.3)">
            ${(u.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="color:#fff;font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px">
              ${u.role === 'admin' ? renderIcon('admin', 16, 'color: #ff6b6b') : renderIcon('user', 16, 'color: #4d79ff')}
              ${u.name || '—'}
            </div>
            <div style="color:#888;font-size:12px;margin-top:2px">${u.email || '—'}</div>
          </div>
        </div>
      </td>
      <td style="padding:16px;border-top:1px solid #222;color:#ccc;font-size:14px">${u.email || '—'}</td>
      <td style="padding:16px;border-top:1px solid #222;color:#ccc;font-size:14px">${u.phone || '—'}</td>
      <td style="padding:16px;border-top:1px solid #222">
        <span style="padding:6px 12px;background:${u.role === 'admin' ? 'linear-gradient(135deg, #ff4d4d, #ff6b6b)' : 'linear-gradient(135deg, #4d79ff, #6b8cff)'};color:#fff;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;box-shadow: 0 2px 8px rgba(0,0,0,0.2)">
          ${u.role || '—'}
        </span>
      </td>
      <td style="padding:16px;border-top:1px solid #222;color:#888;font-size:14px">${fmtDate(u.createdAt) || '—'}</td>
      <td style="padding:16px;border-top:1px solid #222">
        <button class="btn manage-btn" data-user-id="${u.id || u._id}" data-user-name="${u.name || ''}" data-user-email="${u.email || ''}" style="padding:8px 16px;border:none;border-radius:8px;font-size:12px;font-weight:600;background:linear-gradient(135deg, #ff4d4d, #ff6b6b);color:#fff;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all 0.2s;box-shadow: 0 4px 12px rgba(255,77,77,0.3)" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(255,77,77,0.4)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 12px rgba(255,77,77,0.3)'">
          ${renderIcon('settings', 14)}
          Manage
        </button>
      </td>
    </tr>
    <tr class="user-details" style="display:none;background:#0f0f0f">
      <td colspan="6" style="padding:10px;border-top:1px solid #222">
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
          <div><div style="color:#888;font-size:12px">ID</div><div>${u.id || u._id || ''}</div></div>
          <div><div style="color:#888;font-size:12px">Updated</div><div>${fmtDate(u.updatedAt)}</div></div>
        </div>
      </td>
    </tr>`).join('');

  // Add event listeners
  setupTableEventListeners();
}

// Setup table event listeners
function setupTableEventListeners() {
  const tbody = qs('#usersBody');
  if (!tbody) return;
  
  // Toggle details on row click (but not on manage button)
  tbody.querySelectorAll('.user-row').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.manage-btn')) return; // Don't toggle details when clicking manage button
      const next = tr.nextElementSibling;
      if (!next || !next.classList.contains('user-details')) return;
      next.style.display = next.style.display === 'none' ? '' : 'none';
    });
  });

  // Add manage button event listeners
  tbody.querySelectorAll('.manage-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const userId = btn.getAttribute('data-user-id');
      const userName = btn.getAttribute('data-user-name');
      const userEmail = btn.getAttribute('data-user-email');
      openVisibilityModal(userId, userName, userEmail);
    });
  });
}

// Setup search functionality
function setupSearchFunctionality() {
  const searchInput = qs('#userSearch');
  const clearBtn = qs('#clearSearch');
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      filteredUsers = allUsers.filter(user => 
        (user.name && user.name.toLowerCase().includes(query)) ||
        (user.email && user.email.toLowerCase().includes(query)) ||
        (user.phone && user.phone.toLowerCase().includes(query)) ||
        (user.role && user.role.toLowerCase().includes(query))
      );
      renderUsersTable();
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        filteredUsers = [...allUsers];
        renderUsersTable();
      }
    });
  }
}

// Hook up modal open/close if elements exist
qs('#addUserBtn')?.addEventListener('click', () => { const m = qs('#modal'); if (m) m.style.display = 'flex'; });
qs('#closeModal')?.addEventListener('click', () => { const m = qs('#modal'); if (m) m.style.display = 'none'; });

// Create user
qs('#addForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());

  const res = await fetch('/api/admin/users', {
    method: 'POST',
    credentials: 'same-origin', // send cookie
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(data),
  });

  if (res.ok) {
    const m = qs('#modal'); if (m) m.style.display = 'none';
    form.reset();
    await list();
  } else {
    const j = await res.json().catch(()=>({error:'Failed'}));
    const errEl = qs('#err'); if (errEl) errEl.textContent = j.error || 'Failed';
    if (res.status === 401 || res.status === 403) openAuthModalSafely();
  }
});

// Visibility management variables
let allCountries = [];
let allRegions = [];
let userVisibilitySettings = {};

// Search functionality
let allUsers = [];
let filteredUsers = [];

// Professional Icons System - Industry Level
const Icons = {
  user: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
  admin: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>`,
  message: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
  send: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22,2 15,22 11,13 2,9 22,2"></polygon></svg>`,
  search: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>`,
  close: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  settings: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
  read: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><polyline points="20,6 9,17 4,12"></polyline></svg>`,
  unread: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="12" cy="12" r="10"></circle></svg>`,
  notification: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`,
  online: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`,
  offline: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path></circle></svg>`,
  typing: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M8 9h.01"></path><path d="M12 9h.01"></path><path d="M16 9h.01"></path></svg>`,
  attachment: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.64 16.2a2 2 0 0 1-2.83-2.83l8.49-8.49"></path></svg>`,
  edit: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
  delete: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><polyline points="3,6 5,6 21,6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  reply: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><polyline points="9,17 4,12 9,7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>`,
  more: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>`,
  check: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><polyline points="20,6 9,17 4,12"></polyline></svg>`,
  clock: (size = 20, className = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="12" cy="12" r="10"></circle><polyline points="12,6 12,12 16,14"></polyline></svg>`
};

// Helper function to render icons
function renderIcon(iconName, size = 20, className = '') {
  const icon = Icons[iconName];
  if (!icon) {
    console.warn(`Icon "${iconName}" not found`);
    return '';
  }
  return icon(size);
}

// Open visibility management modal
async function openVisibilityModal(userId, userName, userEmail) {
  currentUserId = userId;
  
  // Update modal header
  qs('#userName').textContent = userName;
  qs('#userEmail').textContent = userEmail;
  
  // Load user visibility settings
  await loadUserVisibilitySettings(userId);
  
  // Load all countries and regions
  await loadAllCountriesAndRegions();
  
  // Populate the modal
  populateVisibilityModal();
  
  // Show modal
  qs('#visibilityModal').style.display = 'flex';
}

// Load user's current visibility settings
async function loadUserVisibilitySettings(userId) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/visibility`, {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });
    
    if (res.ok) {
      const data = await res.json();
      userVisibilitySettings = {
        visibleCountries: data.visibleCountries || [],
        visibleRegions: data.visibleRegions || [],
        hasVisibilityRestrictions: data.hasVisibilityRestrictions || false
      };
    } else {
      userVisibilitySettings = {
        visibleCountries: [],
        visibleRegions: [],
        hasVisibilityRestrictions: false
      };
    }
  } catch (error) {
    console.error('Failed to load user visibility settings:', error);
    userVisibilitySettings = {
      visibleCountries: [],
      visibleRegions: [],
      hasVisibilityRestrictions: false
    };
  }
}

// Load all countries and regions
async function loadAllCountriesAndRegions() {
  try {
    const [countriesRes, regionsRes] = await Promise.all([
      fetch('/api/regions', { credentials: 'same-origin' }),
      fetch('/api/regions', { credentials: 'same-origin' })
    ]);
    
    if (countriesRes.ok && regionsRes.ok) {
      const regions = await regionsRes.json();
      allRegions = regions;
      
      // Extract unique countries
      const countrySet = new Set();
      regions.forEach(region => {
        if (region.country) countrySet.add(region.country);
      });
      allCountries = Array.from(countrySet).sort();
    }
  } catch (error) {
    console.error('Failed to load countries and regions:', error);
    allCountries = [];
    allRegions = [];
  }
}

// Populate the visibility modal
function populateVisibilityModal() {
  // Populate countries
  const countriesList = qs('#countriesList');
  countriesList.innerHTML = allCountries.map(country => {
    const isVisible = userVisibilitySettings.visibleCountries.includes(country);
    return `
      <label style="display:flex;align-items:center;gap:8px;padding:6px;cursor:pointer;border-radius:4px;transition:background 0.2s" 
             onmouseover="this.style.background='#222'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" ${isVisible ? 'checked' : ''} 
               data-country="${country}" 
               style="margin:0" />
        <span style="color:#fff;font-size:14px">${country}</span>
      </label>
    `;
  }).join('');

  // Populate regions
  const regionsList = qs('#regionsList');
  regionsList.innerHTML = allRegions.map(region => {
    const isVisible = userVisibilitySettings.visibleRegions.includes(region._id);
    return `
      <label style="display:flex;align-items:center;gap:8px;padding:6px;cursor:pointer;border-radius:4px;transition:background 0.2s" 
             onmouseover="this.style.background='#222'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" ${isVisible ? 'checked' : ''} 
               data-region-id="${region._id}" 
               style="margin:0" />
        <span style="color:#fff;font-size:14px">${region.name} (${region.country})</span>
      </label>
    `;
  }).join('');
}

// Save visibility settings
async function saveVisibilitySettings() {
  if (!currentUserId) return;

  // Collect selected countries and regions
  const selectedCountries = Array.from(qs('#countriesList').querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => cb.getAttribute('data-country'));
  
  const selectedRegions = Array.from(qs('#regionsList').querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => cb.getAttribute('data-region-id'));

  try {
    const res = await fetch(`/api/admin/users/${currentUserId}/visibility`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json' 
      },
      body: JSON.stringify({
        visibleCountries: selectedCountries,
        visibleRegions: selectedRegions,
        hasVisibilityRestrictions: selectedCountries.length > 0 || selectedRegions.length > 0
      })
    });

    if (res.ok) {
      qs('#visibilityModal').style.display = 'none';
      await list(); // Refresh the user list
    } else {
      const error = await res.json().catch(() => ({ error: 'Failed to save settings' }));
      qs('#visibilityErr').textContent = error.error || 'Failed to save settings';
    }
  } catch (error) {
    console.error('Failed to save visibility settings:', error);
    qs('#visibilityErr').textContent = 'Failed to save settings';
  }
}

// Hook up visibility modal events
qs('#closeVisibilityModal')?.addEventListener('click', () => { 
  qs('#visibilityModal').style.display = 'none'; 
});

qs('#cancelVisibility')?.addEventListener('click', () => { 
  qs('#visibilityModal').style.display = 'none'; 
});

qs('#saveVisibility')?.addEventListener('click', saveVisibilitySettings);

// Load pending requests
async function loadPendingRequests() {
  try {
    const res = await fetch('/api/region-requests/admin/pending', {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });
    
    if (res.ok) {
      const { requests } = await res.json();
      displayPendingRequests(requests || []);
    } else {
      console.error('Failed to load pending requests:', res.status);
    }
  } catch (error) {
    console.error('Failed to load pending requests:', error);
  }
}

// Display pending requests
function displayPendingRequests(requests) {
  const section = document.getElementById('pendingRequestsSection');
  const body = document.getElementById('pendingRequestsBody');
  
  if (!requests.length) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  body.innerHTML = requests.map(req => `
    <div class="request-item" style="background:#111;border:1px solid #333;border-radius:8px;padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
        <div>
          <div style="font-weight:600;color:#fff">${req.userId?.name || 'Unknown User'}</div>
          <div style="color:#888;font-size:12px">${req.userId?.email || ''}</div>
        </div>
        <div style="color:#888;font-size:12px">${fmtDate(req.createdAt)}</div>
      </div>
      
      <div style="margin-bottom:8px">
        <div style="color:#ff9999;font-size:13px;margin-bottom:4px">Requested Countries:</div>
        <div style="color:#ddd;font-size:14px">${req.requestedCountries.join(', ')}</div>
      </div>
      
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn approve-request" data-request-id="${req._id}" 
                style="padding:6px 12px;border:1px solid #00b37e;border-radius:6px;font-size:12px;background:transparent;color:#00b37e">
          ✓ Approve
        </button>
        <button class="btn deny-request" data-request-id="${req._id}" 
                style="padding:6px 12px;border:1px solid #e10600;border-radius:6px;font-size:12px;background:transparent;color:#e10600">
          ✗ Deny
        </button>
      </div>
    </div>
  `).join('');
  
  // Add event listeners for approve/deny buttons
  body.querySelectorAll('.approve-request').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const requestId = e.target.getAttribute('data-request-id');
      approveRequest(requestId);
    });
  });
  
  body.querySelectorAll('.deny-request').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const requestId = e.target.getAttribute('data-request-id');
      denyRequest(requestId);
    });
  });
}

// Approve request
async function approveRequest(requestId) {
  if (!confirm('Are you sure you want to approve this request?')) return;
  
  try {
    const res = await fetch(`/api/region-requests/admin/${requestId}/approve`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminNotes: 'Approved by admin' })
    });
    
    if (res.ok) {
      showNotification('Request approved successfully! User will be notified.', 'success');
      await loadPendingRequests();
      await list(); // Refresh user list
      
      // Show success animation on the request item
      const requestItem = document.querySelector(`[data-request-id="${requestId}"]`).closest('.request-item');
      if (requestItem) {
        requestItem.style.background = 'rgba(0, 179, 126, 0.1)';
        requestItem.style.borderColor = '#00b37e';
        requestItem.style.animation = 'bounce 0.6s ease-in-out';
      }
    } else {
      const error = await res.json().catch(() => ({ error: 'Failed to approve request' }));
      showNotification(error.error || 'Failed to approve request', 'error');
    }
  } catch (error) {
    console.error('Error approving request:', error);
    showNotification('Failed to approve request', 'error');
  }
}

// Deny request
async function denyRequest(requestId) {
  const reason = prompt('Please provide a reason for denial (optional):');
  if (reason === null) return; // User cancelled
  
  try {
    const res = await fetch(`/api/region-requests/admin/${requestId}/deny`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminNotes: reason || 'Denied by admin' })
    });
    
    if (res.ok) {
      showNotification('Request denied. User will be notified with reason.', 'error');
      await loadPendingRequests();
      
      // Show error animation on the request item
      const requestItem = document.querySelector(`[data-request-id="${requestId}"]`).closest('.request-item');
      if (requestItem) {
        requestItem.style.background = 'rgba(225, 6, 0, 0.1)';
        requestItem.style.borderColor = '#e10600';
        requestItem.style.animation = 'bounce 0.6s ease-in-out';
      }
    } else {
      const error = await res.json().catch(() => ({ error: 'Failed to deny request' }));
      showNotification(error.error || 'Failed to deny request', 'error');
    }
  } catch (error) {
    console.error('Error denying request:', error);
    showNotification('Failed to deny request', 'error');
  }
}

// Show notification
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  
  const colors = {
    success: '#00b37e',
    error: '#e10600',
    info: '#3ea6ff'
  };
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #0b0b0b;
    border: 2px solid ${colors[type] || colors.info};
    color: #ddd;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    z-index: 9999;
    max-width: 400px;
    animation: slideInFromRight 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  `;
  
  // Add glow effect for important notifications
  if (type === 'success' || type === 'error') {
    notification.style.boxShadow = `0 8px 24px rgba(0,0,0,0.4), 0 0 20px ${colors[type]}40`;
  }
  
  notification.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:12px">
      <div style="width:8px;height:8px;border-radius:50%;background:${colors[type] || colors.info};margin-top:6px;flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-weight:600;margin-bottom:4px;color:#fff">${type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Notification'}</div>
        <div style="font-size:14px;line-height:1.4">${message}</div>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:#999;cursor:pointer;font-size:16px;padding:4px;border-radius:4px;transition:background 0.2s;width:24px;height:24px;display:flex;align-items:center;justify-content:center" onmouseover="this.style.background='#333'" onmouseout="this.style.background='transparent'">×</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Auto remove after 8 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.animation = 'slideOutToRight 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }
  }, 8000);
}

// Tab functionality
function initTabs() {
  console.log('Initializing tabs...');
  
  const usersTab = document.getElementById('usersTab');
  const locationsTab = document.getElementById('locationsTab');
  const usersTabContent = document.getElementById('usersTabContent');
  const locationsTabContent = document.getElementById('locationsTabContent');

  console.log('Tab elements found:', {
    usersTab: !!usersTab,
    locationsTab: !!locationsTab,
    usersTabContent: !!usersTabContent,
    locationsTabContent: !!locationsTabContent
  });

  if (!usersTab || !locationsTab || !usersTabContent || !locationsTabContent) {
    console.error('Some tab elements not found');
    return;
  }

  usersTab.addEventListener('click', () => {
    // Update tab buttons
    usersTab.classList.add('active');
    usersTab.style.background = '#111';
    usersTab.style.borderBottom = '2px solid #ff4d4d';
    usersTab.style.color = '#fff';
    
    locationsTab.classList.remove('active');
    locationsTab.style.background = 'transparent';
    locationsTab.style.borderBottom = '2px solid transparent';
    locationsTab.style.color = '#888';

    // Update tab content
    usersTabContent.style.display = 'block';
    locationsTabContent.style.display = 'none';
  });

  locationsTab.addEventListener('click', () => {
    // Update tab buttons
    locationsTab.classList.add('active');
    locationsTab.style.background = '#111';
    locationsTab.style.borderBottom = '2px solid #ff4d4d';
    locationsTab.style.color = '#fff';
    
    usersTab.classList.remove('active');
    usersTab.style.background = 'transparent';
    usersTab.style.borderBottom = '2px solid transparent';
    usersTab.style.color = '#888';

    // Update tab content
    locationsTabContent.style.display = 'block';
    usersTabContent.style.display = 'none';
  });
}

// Load user locations
async function loadLocations() {
  try {
    const res = await fetch('/api/location/admin/all', {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      throw new Error(`Failed to load locations: ${res.status}`);
    }

    const { locations } = await res.json();
    displayLocations(locations);

  } catch (error) {
    console.error('Error loading locations:', error);
    showNotification('Failed to load locations: ' + error.message, 'error');
  }
}

// Display locations in table
function displayLocations(locations) {
  const tbody = document.getElementById('locationsBody');
  if (!tbody) return;

  if (!locations || locations.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="padding:40px;text-align:center;color:#888;font-style:italic">
          No location data available
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = locations.map(location => `
    <tr style="transition:background-color 0.2s" onmouseover="this.style.backgroundColor='#1a1a1a'" onmouseout="this.style.backgroundColor='transparent'">
      <td style="padding:16px;border-top:1px solid #222">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;background:linear-gradient(135deg, #ff4d4d, #ff6b6b);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff">
            📍
          </div>
          <div>
            <div style="color:#fff;font-weight:500;font-size:14px">${location.userName || '—'}</div>
          </div>
        </div>
      </td>
      <td style="padding:16px;border-top:1px solid #222;color:#ccc;font-size:14px">${location.userEmail || '—'}</td>
      <td style="padding:16px;border-top:1px solid #222;color:#ccc;font-size:14px">
        <div style="font-family:monospace;background:#1a1a1a;padding:4px 8px;border-radius:4px;border:1px solid #333">
          ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
        </div>
      </td>
      <td style="padding:16px;border-top:1px solid #222;color:#888;font-size:14px">${formatDate(location.timestamp)}</td>
      <td style="padding:16px;border-top:1px solid #222">
        <div style="display:flex;gap:8px">
          <button onclick="openMapbox(${location.latitude}, ${location.longitude})" style="padding:6px 12px;background:linear-gradient(135deg, #4d79ff, #6b8cff);border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(77,121,255,0.3)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none'">
            View Map
          </button>
          <button onclick="deleteLocation('${location._id}')" style="padding:6px 12px;background:linear-gradient(135deg, #ff4d4d, #ff6b6b);border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(255,77,77,0.3)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none'">
            Delete
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Open Mapbox with coordinates
function openMapbox(latitude, longitude) {
  const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-s+ff0000(${longitude},${latitude})/${longitude},${latitude},10,0/600x400@2x?access_token=pk.eyJ1IjoiemFhaWQ5ODF5Z2UiLCJhIjoiY21mcGF6ZjhkMGJmMTJsc2Z4MGFiOWxnNyJ9.3esbBjOS7_q2kHPfUDO9zA`;
  window.open(url, '_blank');
}

// Delete location
async function deleteLocation(locationId) {
  if (!confirm('Are you sure you want to delete this location?')) return;

  try {
    const res = await fetch(`/api/location/admin/${locationId}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      throw new Error(`Failed to delete location: ${res.status}`);
    }

    showNotification('Location deleted successfully', 'success');
    loadLocations(); // Refresh the list

  } catch (error) {
    console.error('Error deleting location:', error);
    showNotification('Failed to delete location: ' + error.message, 'error');
  }
}

// Format date for display
function formatDate(dateString) {
  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return dateString;
  }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Admin users page initializing...');
  
  try {
    // Initialize current user ID with better detection
    await detectCurrentUserId();
    console.log('Current user ID:', currentUserId);

// Initial load
    console.log('📋 Loading users...');
list().catch(err => {
      console.error('❌ Error loading users:', err);
      // Show error message to user
      const tbody = qs('#usersBody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="padding:40px;text-align:center;color:#ff6b6b;font-style:italic">
              Failed to load users. Please check console for details.
            </td>
          </tr>
        `;
      }
});

// Load pending requests
    console.log('📋 Loading pending requests...');
loadPendingRequests();

// Initialize tab functionality
    console.log('📋 Initializing tabs...');
initTabs();

// Load locations on page load
    console.log('📋 Loading locations...');
loadLocations();

// Add refresh button event listener
document.getElementById('refreshLocationsBtn')?.addEventListener('click', () => {
  loadLocations();
    });

    // Initialize messaging
    console.log('📋 Initializing messaging...');
    initMessaging();
    
    console.log('✅ Admin users page initialization complete');
  } catch (error) {
    console.error('❌ Fatal error during initialization:', error);
  }
});

// --- Admin Functions ---
async function initAdminSocket() {
  try {
    const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
    if (!token) {
      console.warn('No authentication token found for Socket.IO');
      return;
    }
    
    // Check if io is available
    if (typeof io === 'undefined') {
      console.error('Socket.IO client not loaded. Make sure socket.io.js is included in the page.');
      return;
    }
    
    socket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000
    });
    
    socket.on('connect', () => {
      console.log('✅ Admin connected to messaging server with ID:', socket.id);
      // Join admin room for real-time updates
      socket.emit('joinAdminRoom');
    });
    
    socket.on('disconnect', (reason) => {
      console.log('❌ Admin disconnected:', reason);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
    });
    
    socket.on('reconnect', (attemptNumber) => {
      console.log('✅ Socket reconnected after', attemptNumber, 'attempts');
    });
    
    socket.on('newMessage', (message) => {
      console.log('New message received:', message);
      
      // Always add message to chat if it's for current conversation
      if (currentConversation && (message.sender._id === currentConversation || message.sender.id === currentConversation)) {
        addMessageToChat(message, true); // true = animate
        markMessageAsRead(message._id);
      } else if (currentConversation && message.conversationId === currentConversation) {
        // Handle conversation-based messaging
        addMessageToChat(message, true);
        markMessageAsRead(message._id);
      } else {
        // Show notification for messages from other users
        showMessageNotification(message);
      }
    });
    
    // Handle real-time message updates
    socket.on('messageUpdate', (data) => {
      console.log('📝 Message updated:', data);
      const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
      if (messageEl) {
        const contentEl = messageEl.querySelector('.message-content');
        if (contentEl) {
          contentEl.textContent = data.content;
        }
      }
    });
    
    // Handle message deletion
    socket.on('messageDeleted', (data) => {
      console.log('Message deleted:', data);
      const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
      if (messageEl) {
        messageEl.remove();
      }
    });
    
    // Handle message sent confirmation
    socket.on('messageSent', (message) => {
      console.log('Message sent confirmation:', message);
      // Remove temp message and add real message
      const tempEl = document.querySelector(`[data-message-id="temp-${message._id}"]`);
      if (tempEl) tempEl.remove();
      
      addMessageToChat(message, false);
    });
    
    // Handle message error
    socket.on('messageError', (data) => {
      console.error('Message error:', data);
      alert('Failed to send message: ' + data.error);
    });
    
    socket.on('messageEdited', (data) => {
      const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
      if (messageEl) {
        const contentEl = messageEl.querySelector('.message-content');
        if (contentEl) {
          contentEl.textContent = data.content;
          if (data.editedAt) {
            contentEl.innerHTML += ' <span style="color:#888;font-size:11px">(edited)</span>';
          }
        }
      }
    });
    
    socket.on('messageDeleted', (data) => {
      const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
      if (messageEl) {
        messageEl.remove();
      }
    });
    
    socket.on('userTyping', (data) => {
      const typingIndicator = qs('#typingIndicator');
      if (typingIndicator && data.userId === currentConversation) {
        if (data.isTyping) {
          typingIndicator.style.display = 'block';
          typingIndicator.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;color:#888;font-size:12px">
              ${renderIcon('typing', 16, 'color: #888')}
              <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span>typing...</span>
            </div>
          `;
        } else {
          typingIndicator.style.display = 'none';
        }
      }
    });
    
    socket.on('messageRead', (data) => {
      const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
      if (messageEl) {
        const readIndicator = messageEl.querySelector('.read-indicator');
        if (readIndicator) {
          readIndicator.style.display = 'inline';
        }
      }
    });
    
  } catch (error) {
    console.error('Failed to initialize admin socket:', error);
  }
}

async function openMessagingModal(userId, userInfo) {
  try {
  currentConversation = userId;
  
  // Update chat header
  const displayName = userInfo.name || userInfo.username || userInfo.email || 'User';
    const chatNameEl = qs('#chatName');
    const chatAvatarEl = qs('#chatAvatar');
    
    if (chatNameEl) chatNameEl.textContent = displayName;
    if (chatAvatarEl) chatAvatarEl.textContent = displayName.charAt(0).toUpperCase();
  
  // Show modal
    const modal = qs('#messagingModal');
    if (modal) {
      modal.style.display = 'flex';
    } else {
      console.error('Messaging modal not found');
      return;
    }
  
  // Load messages
  await loadMessages(userId);
  
  // Setup message input
  setupAdminMessageInput();
  } catch (error) {
    console.error('Error opening messaging modal:', error);
    showNotification('Failed to open messaging modal', 'error');
  }
}

async function loadMessages(userId) {
  try {
    const response = await fetch(`/api/messages/conversation/${userId}`, { credentials: 'same-origin' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to load messages' }));
      throw new Error(errorData.error || 'Failed to load messages');
    }
    
    const data = await response.json();
    renderMessages(data.messages || []);
  } catch (error) {
    console.error('Error loading messages:', error);
    showNotification('Failed to load messages: ' + error.message, 'error');
  }
}

function renderMessages(messages) {
  const container = qs('#messagesList');
  if (!container) return;
  
  container.innerHTML = '';
  
  messages.forEach(message => {
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    messageEl.setAttribute('data-message-id', message._id);
    
    const isOwn = message.sender._id === currentUserId || message.sender.id === currentUserId;
    const time = new Date(message.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    messageEl.style.cssText = `
      margin-bottom:12px;
      display:flex;
      ${isOwn ? 'justify-content:flex-end' : 'justify-content:flex-start'}
    `;
    
    messageEl.innerHTML = `
      <div style="
        max-width:70%;
        padding:8px 12px;
        border-radius:18px;
        background:${isOwn ? 'linear-gradient(135deg, #00d4aa, #00b894)' : '#333'};
        color:#fff;
        position:relative;
        word-wrap:break-word;
      ">
        <div class="message-content" style="font-size:14px;line-height:1.4">${message.content}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;font-size:11px;color:${isOwn ? 'rgba(255,255,255,0.7)' : '#888'}">
          <span>${time}</span>
          ${isOwn ? `<span class="read-indicator" style="display:${message.isRead ? 'inline' : 'none'}">✓</span>` : ''}
        </div>
        ${message.isEdited ? '<span style="color:rgba(255,255,255,0.7);font-size:11px">(edited)</span>' : ''}
      </div>
    `;
    
    container.appendChild(messageEl);
  });
  
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

// Prevent duplicate message sending
let isSendingMessage = false;
let messageInputInitialized = false;

async function sendMessage() {
  if (isSendingMessage) {
    console.log('Message already being sent, ignoring duplicate request');
    return;
  }
  
  const input = qs('#messageText');
  const content = input.value.trim();
  
  if (!content || !currentConversation) return;
  
  isSendingMessage = true;
  
  // Disable input while sending
  input.disabled = true;
  const sendBtn = qs('#sendMessageBtn');
  if (sendBtn) sendBtn.disabled = true;
  
  try {
    // Send via Socket.IO for real-time delivery
    if (socket && socket.connected) {
      // Show sending indicator
      const tempMessage = {
        _id: 'temp-' + Date.now(),
        content: content,
        sender: { _id: currentUserId, name: 'You' },
        createdAt: new Date(),
        isRead: false,
        isTemp: true
      };
      
      addMessageToChat(tempMessage, true);
      
      // Send via Socket.IO
      socket.emit('sendMessage', {
        recipientId: currentConversation,
        content: content,
        timestamp: new Date().toISOString()
      });
      
      console.log('Message sent via Socket.IO');
      
      // Clear input immediately
      input.value = '';
      input.style.height = 'auto';
      
    } else {
      // Fallback to HTTP API
    const response = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        recipientId: currentConversation,
        content: content
      })
    });
    
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to send message' }));
        throw new Error(errorData.error || 'Failed to send message');
      }
    
    const data = await response.json();
      
      // Remove temp message
      const tempEl = document.querySelector(`[data-message-id="temp-${tempMessage._id}"]`);
      if (tempEl) tempEl.remove();
      
      // Add real message with animation
      addMessageToChat(data.message, true);
      
      // Add sent animation
      setTimeout(() => {
        const messageEl = document.querySelector(`[data-message-id="${data.message._id}"]`);
        if (messageEl) {
          messageEl.classList.add('message-sent');
        }
      }, 100);
      
    input.value = '';
    input.style.height = 'auto';
    
    // Stop typing indicator
    if (socket) {
      socket.emit('typing', { recipientId: currentConversation, isTyping: false });
      }
    }
    
  } catch (error) {
    console.error('Error sending message:', error);
    showNotification('Failed to send message: ' + error.message, 'error');
    
    // Remove temp message on error
    const tempEl = document.querySelector(`[data-message-id="temp-${tempMessage._id}"]`);
    if (tempEl) tempEl.remove();
    
  } finally {
    // Re-enable input
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
    isSendingMessage = false;
  }
}

function addMessageToChat(message, animate = false) {
  const container = qs('#messagesList');
  if (!container) return;
  
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.setAttribute('data-message-id', message._id);
  
  // Better sender identification - check both sender ID and current user context
  const senderId = message.sender?._id || message.sender?.id || message.senderId;
  const isOwn = senderId === currentUserId || 
                (message.sender && (message.sender._id === currentUserId || message.sender.id === currentUserId)) ||
                (message.senderId === currentUserId);
  
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });
  
  // Add animation class if needed
  if (animate) {
    messageEl.classList.add('message-enter');
  }
  
  messageEl.style.cssText = `
    margin-bottom:12px;
    display:flex;
    ${isOwn ? 'justify-content:flex-end' : 'justify-content:flex-start'};
    opacity: ${animate ? '0' : '1'};
    transform: ${animate ? 'translateY(20px)' : 'translateY(0)'};
    transition: all 0.3s ease-out;
  `;
  
  const senderName = message.sender?.name || message.sender?.email || 'Unknown';
  const isAdmin = message.sender?.role === 'admin';
  
  messageEl.innerHTML = `
    <div style="
      max-width:70%;
      padding:12px 16px;
      border-radius:18px;
      background:${isOwn ? 'linear-gradient(135deg, #4d79ff, #6b8cff)' : '#2a2a2a'};
      color:#fff;
      position:relative;
      word-wrap:break-word;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      border: 1px solid ${isOwn ? 'rgba(77,121,255,0.3)' : 'rgba(255,255,255,0.1)'};
    ">
      ${!isOwn ? `
        <div style="font-size:11px;color:#aaa;margin-bottom:4px;font-weight:500;display:flex;align-items:center;gap:4px">
          ${isAdmin ? renderIcon('admin', 12, 'color: #ff6b6b') : renderIcon('user', 12, 'color: #4d79ff')}
          ${senderName}
        </div>
      ` : ''}
      <div class="message-content" style="font-size:14px;line-height:1.4;margin-bottom:4px">${message.content}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:${isOwn ? 'rgba(255,255,255,0.7)' : '#aaa'}">
        <span class="message-time" style="display:flex;align-items:center;gap:4px">
          ${renderIcon('clock', 10, 'color: ' + (isOwn ? 'rgba(255,255,255,0.7)' : '#aaa'))}
          ${time}
        </span>
        <div style="display:flex;align-items:center;gap:4px">
          ${isOwn ? `
            <span class="read-indicator" style="display:${message.isRead ? 'inline' : 'none'};color:#4CAF50">${renderIcon('check', 12, 'color: #4CAF50')}</span>
            <span class="unread-indicator" style="display:${message.isRead ? 'none' : 'inline'};color:#FFC107">${renderIcon('unread', 12, 'color: #FFC107')}</span>
          ` : ''}
        </div>
      </div>
    </div>
  `;
  
  container.appendChild(messageEl);
  
  // Animate in
  if (animate) {
    setTimeout(() => {
      messageEl.style.opacity = '1';
      messageEl.style.transform = 'translateY(0)';
    }, 10);
  }
  
  // Auto scroll with smooth animation
  container.scrollTo({
    top: container.scrollHeight,
    behavior: 'smooth'
  });
}

function setupAdminMessageInput() {
  const input = qs('#messageText');
  const sendBtn = qs('#sendMessageBtn');
  
  if (!input || !sendBtn) {
    console.error('Message input elements not found');
    return;
  }
  
  // Only initialize once
  if (messageInputInitialized) {
    return;
  }
  
  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    
    const hasContent = input.value.trim().length > 0;
    sendBtn.disabled = !hasContent;
    
    // Typing indicator
    if (socket && currentConversation) {
      clearTimeout(typingTimeout);
      socket.emit('typing', { recipientId: currentConversation, isTyping: true });
      
      typingTimeout = setTimeout(() => {
        socket.emit('typing', { recipientId: currentConversation, isTyping: false });
      }, 1000);
    }
  });
  
  // Send on Enter (but allow Shift+Enter for new lines)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // Send button - prevent multiple clicks
  let isSending = false;
  sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!isSending) {
      isSending = true;
      sendMessage().finally(() => {
        isSending = false;
      });
    }
  });
  
  // Focus the input when modal opens
  input.focus();
  
  messageInputInitialized = true;
}

// Mark message as read
async function markMessageAsRead(messageId) {
  try {
    await fetch(`/api/messages/${messageId}/read`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Update UI immediately
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      const readIndicator = messageEl.querySelector('.read-indicator');
      const unreadIndicator = messageEl.querySelector('.unread-indicator');
      if (readIndicator) readIndicator.style.display = 'inline';
      if (unreadIndicator) unreadIndicator.style.display = 'none';
    }
  } catch (error) {
    console.error('Failed to mark message as read:', error);
  }
}

// Show message notification
function showMessageNotification(message) {
  const senderName = message.sender?.name || message.sender?.email || 'Unknown User';
  const isAdmin = message.sender?.role === 'admin';
  
  const notification = document.createElement('div');
  notification.style.cssText = `
    background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
    border: 1px solid #333;
    border-radius: 12px;
    padding: 16px;
    color: #fff;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    max-width: 350px;
    cursor: pointer;
    transform: translateX(100%);
    transition: all 0.3s ease-out;
    position: relative;
    overflow: hidden;
  `;
  
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px">
      <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #4d79ff, #6b8cff); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700">
        ${(senderName || 'U').charAt(0).toUpperCase()}
      </div>
      <div style="flex: 1">
        <div style="font-weight: 600; font-size: 14px; color: #fff; display: flex; align-items: center; gap: 6px">
          ${isAdmin ? renderIcon('admin', 14, 'color: #ff6b6b') : renderIcon('user', 14, 'color: #4d79ff')}
          ${senderName}
        </div>
        <div style="font-size: 12px; color: #888; display: flex; align-items: center; gap: 4px">
          ${renderIcon('message', 12, 'color: #888')}
          New message
        </div>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #888; cursor: pointer; font-size: 18px; padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center">${renderIcon('close', 16)}</button>
    </div>
    <div style="font-size: 13px; color: #ccc; line-height: 1.4; margin-bottom: 8px">
      ${message.content.length > 100 ? message.content.substring(0, 100) + '...' : message.content}
    </div>
    <div style="font-size: 11px; color: #666; display: flex; align-items: center; gap: 4px">
      ${renderIcon('clock', 12, 'color: #666')}
      ${new Date(message.createdAt).toLocaleTimeString()}
    </div>
  `;
  
  // Add click handler to open conversation
  notification.addEventListener('click', () => {
    const userId = message.sender._id || message.sender.id;
    const userName = message.sender.name || message.sender.email;
    openMessagingModal(userId, { name: userName, email: message.sender.email });
    notification.remove();
  });
  
  const container = qs('#notificationContainer');
  if (container) {
    container.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 10);
    
    // Auto remove after 10 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
      }
    }, 10000);
  }
}

// Initialize admin messaging when DOM is ready
function initMessaging() {
  initCurrentUserId();
  
  // Wait for Socket.IO to load before initializing
  const initSocketWhenReady = () => {
    if (typeof io !== 'undefined') {
  initAdminSocket();
    } else {
      // Retry after a short delay
      setTimeout(initSocketWhenReady, 100);
    }
  };
  
  initSocketWhenReady();
  
  // Close messaging modal
  qs('#closeMessagingModal')?.addEventListener('click', () => {
    qs('#messagingModal').style.display = 'none';
    currentConversation = null;
  });
}
