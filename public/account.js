// public/account.js
function qs(s){ return document.querySelector(s); }
function qsa(s){ return document.querySelectorAll(s); }
function fmtDate(s){ try{ return new Date(s).toLocaleString(); }catch{ return s; } }

// User data
let currentUserId = null;
let currentUser = null;

// Validation functions
function validateEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

function validatePhone(phone) {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Check if it's a valid phone number (10-15 digits)
  if (cleaned.length < 10 || cleaned.length > 15) {
    return false;
  }
  
  // Check for common phone number patterns
  const patterns = [
    /^\+?1?[2-9]\d{2}[2-9]\d{2}\d{4}$/, // US format
    /^\+?[1-9]\d{1,14}$/, // International format
    /^\(\d{3}\)\s?\d{3}-\d{4}$/, // (123) 456-7890
    /^\d{3}-\d{3}-\d{4}$/, // 123-456-7890
    /^\d{3}\.\d{3}\.\d{4}$/ // 123.456.7890
  ];
  
  return patterns.some(pattern => pattern.test(phone)) || cleaned.length >= 10;
}

function validateName(name) {
  return name && name.trim().length >= 2;
}

function showError(fieldId, message) {
  const errorElement = document.getElementById(fieldId + 'Error');
  const inputElement = document.getElementById(fieldId);
  
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
  
  if (inputElement) {
    inputElement.style.borderColor = '#ff6b6b';
  }
}

function clearError(fieldId) {
  const errorElement = document.getElementById(fieldId + 'Error');
  const inputElement = document.getElementById(fieldId);
  
  if (errorElement) {
    errorElement.style.display = 'none';
  }
  
  if (inputElement) {
    inputElement.style.borderColor = '#333';
  }
}

function updateStatusIndicator(fieldId, isValid) {
  const statusElement = document.getElementById(fieldId + 'Status');
  if (statusElement) {
    statusElement.style.background = isValid ? '#00b37e' : '#ff6b6b';
  }
}

function checkProfileCompletion() {
  const hasName = validateName(currentUser?.name);
  const hasEmail = validateEmail(currentUser?.email);
  const hasPhone = validatePhone(currentUser?.phone);
  
  const isComplete = hasName && hasEmail && hasPhone;
  
  // Update status indicators
  updateStatusIndicator('name', hasName);
  updateStatusIndicator('email', hasEmail);
  updateStatusIndicator('phone', hasPhone);
  
  // Show notification if incomplete
  const notification = document.getElementById('profileNotification');
  const notificationText = document.getElementById('profileNotificationText');
  
  if (!isComplete) {
    const missingFields = [];
    if (!hasName) missingFields.push('name');
    if (!hasEmail) missingFields.push('email');
    if (!hasPhone) missingFields.push('phone number');
    
    notificationText.textContent = `Please complete your ${missingFields.join(', ')} for better account security.`;
    notification.style.display = 'block';
  } else {
    notification.style.display = 'none';
  }
  
  return isComplete;
}

async function me() {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Not logged in');
  return res.json();
}

async function updateProfile(profileData) {
  const res = await fetch('/api/auth/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(profileData)
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to update profile');
  }
  
  return res.json();
}

// --- Read later API ---
async function fetchSaved() {
  const r = await fetch('/api/account/readlater', { credentials: 'same-origin' });
  if (!r.ok) throw new Error('Failed to load saved');
  const j = await r.json();
  return j.items || [];
}

async function removeSaved(key) {
  const r = await fetch('/api/account/readlater/'+encodeURIComponent(key), {
    method:'DELETE', credentials:'same-origin'
  });
  if (!r.ok) throw new Error('Failed to remove');
}

// --- UI: single row news item ---
function row(it) {
  const el = document.createElement('article');
  el.className = 'saved-news-item';

  // Calculate countdown timer
  const savedDate = new Date(it.savedAt || it.createdAt || Date.now());
  const expiryDate = new Date(savedDate.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days
  const now = new Date();
  const timeLeft = expiryDate.getTime() - now.getTime();
  
  const daysLeft = Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24)));
  const hoursLeft = Math.max(0, Math.ceil((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
  
  const isExpired = timeLeft <= 0;
  const timerText = isExpired ? 'Expired' : `${daysLeft}d ${hoursLeft}h`;

  // Create image or placeholder
  const imgHtml = it.image
    ? `<img class="news-image" src="${it.image}" alt="${it.title || 'News image'}" />`
    : `<div class="news-placeholder" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </svg>
      </div>`;

  // Create source link
  const sourceLink = it.link ? `<a href="${it.link}" target="_blank" rel="noopener noreferrer" class="news-source">${it.source || 'Source'}</a>` : (it.source || 'Unknown Source');

  el.innerHTML = `
    <div class="countdown-timer ${isExpired ? 'expired' : ''}" data-expiry="${expiryDate.getTime()}">
      ${timerText}
    </div>
    ${imgHtml}
    <div class="news-content">
      <h3 class="news-title">${it.title || 'Untitled'}</h3>
      <div class="news-meta">
        ${sourceLink}
        <span class="news-date">${it.isoDate ? fmtDate(it.isoDate) : 'Unknown date'}</span>
      </div>
    </div>
    <div class="news-actions">
      <button class="btn btn-read open" title="Read article">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
        </svg>
        Read
      </button>
      <button class="btn btn-remove remove" title="Remove from Read Later">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3,6 5,6 21,6"></polyline>
          <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
        Remove
      </button>
    </div>
  `;

  // Open source page of the news article
  el.querySelector('.open').addEventListener('click', () => {
    if (it.link) {
      window.open(it.link, '_blank', 'noopener,noreferrer');
    } else {
      alert('No source link available for this article');
    }
  });

  // Remove from saved
  el.querySelector('.remove').addEventListener('click', async () => {
    if (!confirm('Remove from Read later?')) return;
    try {
      await removeSaved(it.key);
      loadSaved();
    } catch (e) {
      alert(e.message || 'Failed');
    }
  });

  // Start countdown timer if not expired
  if (!isExpired) {
    startCountdownTimer(el.querySelector('.countdown-timer'), expiryDate);
  }

  return el;
}

// Countdown timer function
function startCountdownTimer(timerElement, expiryDate) {
  const updateTimer = () => {
    const now = new Date();
    const timeLeft = expiryDate.getTime() - now.getTime();
    
    if (timeLeft <= 0) {
      timerElement.textContent = 'Expired';
      timerElement.classList.add('expired');
      return;
    }
    
    const daysLeft = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hoursLeft = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    if (daysLeft > 0) {
      timerElement.textContent = `${daysLeft}d ${hoursLeft}h`;
    } else if (hoursLeft > 0) {
      timerElement.textContent = `${hoursLeft}h ${minutesLeft}m`;
    } else {
      timerElement.textContent = `${minutesLeft}m`;
    }
  };
  
  // Update immediately
  updateTimer();
  
  // Update every minute
  const interval = setInterval(updateTimer, 60000);
  
  // Store interval ID for cleanup if needed
  timerElement.dataset.intervalId = interval;
}

async function loadSaved() {
  const box = qs('#savedNewsBox');
  if (!box) return;

  try {
    const items = await fetchSaved();
    if (items.length === 0) {
      box.innerHTML = `
        <div style="text-align:center;color:#888;padding:40px;background:#111;border-radius:12px;border:1px solid #333">
          <div style="margin-bottom:16px">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:#4d79ff">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </div>
          <div style="font-size:16px;margin-bottom:8px;color:#fff">No saved articles yet</div>
          <div style="font-size:14px">Save articles from the main page to read them later</div>
        </div>
      `;
      return;
    }
    
    box.innerHTML = '';
    items.forEach(it => {
      box.appendChild(row(it));
    });

  } catch (e) {
    box.innerHTML = `
      <div style="text-align:center;color:#ff6b6b;padding:20px;background:#111;border-radius:12px;border:1px solid #ff6b6b">
        <div style="margin-bottom:8px">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <div>Error: ${e.message}</div>
      </div>
    `;
  }
}

// Modal handling
function openEditModal() {
  const modal = document.getElementById('editModal');
  const editName = document.getElementById('editName');
  const editEmail = document.getElementById('editEmail');
  const editPhone = document.getElementById('editPhone');
  
  // Populate form with current data
  editName.value = currentUser?.name || '';
  editEmail.value = currentUser?.email || '';
  editPhone.value = currentUser?.phone || '';
  
  // Clear any existing errors
  clearError('editName');
  clearError('editEmail');
  clearError('editPhone');
  
  modal.style.display = 'flex';
  editName.focus();
}

function closeEditModal() {
  const modal = document.getElementById('editModal');
  modal.style.display = 'none';
}

// Form validation and submission
function validateForm() {
  let isValid = true;
  
  const name = document.getElementById('editName').value.trim();
  const email = document.getElementById('editEmail').value.trim();
  const phone = document.getElementById('editPhone').value.trim();
  
  // Clear previous errors
  clearError('editName');
  clearError('editEmail');
  clearError('editPhone');
  
  // Validate name
  if (!validateName(name)) {
    showError('editName', 'Please enter a valid name (at least 2 characters)');
    isValid = false;
  }
  
  // Validate email
  if (!email) {
    showError('editEmail', 'Email is required');
    isValid = false;
  } else if (!validateEmail(email)) {
    showError('editEmail', 'Please enter a valid email address');
    isValid = false;
  }
  
  // Validate phone
  if (!phone) {
    showError('editPhone', 'Phone number is required');
    isValid = false;
  } else if (!validatePhone(phone)) {
    showError('editPhone', 'Please enter a valid phone number');
    isValid = false;
  }
  
  return isValid;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  
  if (!validateForm()) {
    return;
  }
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  
  try {
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;
    
    const profileData = {
      name: document.getElementById('editName').value.trim(),
      email: document.getElementById('editEmail').value.trim(),
      phone: document.getElementById('editPhone').value.trim()
    };
    
    const { user } = await updateProfile(profileData);
    currentUser = user;
    
    // Update display
    updateUserDisplay();
    checkProfileCompletion();
    
    closeEditModal();
    
    // Show success message
    showSuccessMessage('Profile updated successfully!');
    
  } catch (error) {
    console.error('Update failed:', error);
    showError('editEmail', error.message || 'Failed to update profile');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

function updateUserDisplay() {
  if (!currentUser) return;
  
  // Update main display
  document.getElementById('name').textContent = currentUser.name || '—';
  document.getElementById('email').textContent = currentUser.email || '—';
  document.getElementById('phone').textContent = currentUser.phone || '—';
  
  // Update header
  const userInitial = document.getElementById('userInitial');
  const userName = document.getElementById('userName');
  const userEmail = document.getElementById('userEmail');
  
  if (currentUser.name) {
    userInitial.textContent = currentUser.name.charAt(0).toUpperCase();
    userName.textContent = currentUser.name;
  }
  if (currentUser.email) {
    userEmail.textContent = currentUser.email;
  }
}

function showSuccessMessage(message) {
  // Create temporary success message
  const successDiv = document.createElement('div');
  successDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #00b37e, #00d4aa);
    color: #fff;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 179, 126, 0.3);
    z-index: 10001;
    font-weight: 500;
    animation: slideIn 0.3s ease;
  `;
  successDiv.textContent = message;
  
  document.body.appendChild(successDiv);
  
  setTimeout(() => {
    successDiv.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => successDiv.remove(), 300);
  }, 3000);
}

// --- Boot ---
(async () => {
  const status = document.getElementById('status');
  try {
    const { user } = await me();
    currentUserId = user.id;
    currentUser = user;
    
    // Hide loading status
    status.style.display = 'none';
    
    // Update user info
    updateUserDisplay();
    document.getElementById('joined').textContent = fmtDate(user.createdAt) || '—';
    
    // Update role with badge
    const roleBadge = document.getElementById('roleBadge');
    roleBadge.textContent = user.role || '—';
    if (user.role === 'admin') {
      roleBadge.style.background = 'linear-gradient(135deg, #ff4d4d, #ff6b6b)';
    } else {
      roleBadge.style.background = 'linear-gradient(135deg, #4d79ff, #6b8cff)';
    }

    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) adminBtn.style.display = user.role === 'admin' ? 'inline-block' : 'none';

    // Check profile completion
    checkProfileCompletion();

    await loadSaved();
  } catch (e) {
    status.style.display = 'block';
    status.querySelector('span').textContent = 'You are not logged in.';
  }
})();

// Event listeners
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    location.href = '/';
  } catch (e) {
    console.error('Logout failed:', e);
  }
});

// Edit button listeners
document.getElementById('editBtn').addEventListener('click', openEditModal);
document.getElementById('editProfileBtn').addEventListener('click', openEditModal);

// Modal close listeners
document.getElementById('closeModal').addEventListener('click', closeEditModal);
document.getElementById('cancelEdit').addEventListener('click', closeEditModal);

// Close modal on backdrop click
document.getElementById('editModal').addEventListener('click', (e) => {
  if (e.target.id === 'editModal') {
    closeEditModal();
  }
});

// Form submission
document.getElementById('editForm').addEventListener('submit', handleFormSubmit);

// Real-time validation
document.getElementById('editName').addEventListener('input', (e) => {
  clearError('editName');
  if (e.target.value.trim() && !validateName(e.target.value)) {
    showError('editName', 'Name must be at least 2 characters');
  }
});

document.getElementById('editEmail').addEventListener('input', (e) => {
  clearError('editEmail');
  if (e.target.value.trim() && !validateEmail(e.target.value)) {
    showError('editEmail', 'Please enter a valid email address');
  }
});

document.getElementById('editPhone').addEventListener('input', (e) => {
  clearError('editPhone');
  if (e.target.value.trim() && !validatePhone(e.target.value)) {
    showError('editPhone', 'Please enter a valid phone number');
  }
});