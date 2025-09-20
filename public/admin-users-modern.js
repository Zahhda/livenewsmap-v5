// Modern Admin Users Page with Supabase Integration
import { modernMessaging } from '/src/components/ModernMessaging.js'
import { Icons, renderIcon } from '/src/components/Icons.js'

// Global variables
let currentUserId = null
let allUsers = []
let filteredUsers = []
let allCountries = []
let allRegions = []
let userVisibilitySettings = {}

// Utility functions
const qs = (selector) => document.querySelector(selector)
const qsa = (selector) => document.querySelectorAll(selector)

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initializing modern admin users page...')
  
  try {
    // Initialize messaging system
    await modernMessaging.init(currentUserId)
    
    // Load page data
    await Promise.all([
      loadUsers(),
      loadPendingRequests(),
      loadLocations(),
      initTabs()
    ])
    
    // Setup search functionality
    setupSearchFunctionality()
    
    console.log('✅ Modern admin users page initialized successfully')
  } catch (error) {
    console.error('❌ Error initializing page:', error)
  }
})

// Load users with modern UI
async function loadUsers() {
  try {
    console.log('📋 Loading users...')
    const res = await fetch('/api/admin/users', { credentials: 'same-origin' })
    
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        openAuthModalSafely()
        return
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }

    const { users } = await res.json()
    console.log('Users loaded:', users?.length || 0)
    
    // Store users for search functionality
    allUsers = users || []
    filteredUsers = [...allUsers]
    
    renderUsersTable()
    
  } catch (error) {
    console.error('Error loading users:', error)
    showNotification('Failed to load users: ' + error.message, 'error')
  }
}

// Render users table with modern design
function renderUsersTable() {
  const tbody = qs('#usersBody')
  if (!tbody) return
  
  if (filteredUsers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding:40px;text-align:center;color:#888;font-style:italic">
          No users found
        </td>
      </tr>
    `
    return
  }
  
  tbody.innerHTML = filteredUsers.map(user => `
    <tr class="user-row" data-id="${user.id || user._id}" style="
      transition: all 0.2s ease;
      cursor: pointer;
    " onmouseover="this.style.backgroundColor='#1a1a1a';this.style.transform='translateY(-1px)'" 
       onmouseout="this.style.backgroundColor='transparent';this.style.transform='translateY(0)'">
      <td style="padding:16px;border-top:1px solid #222">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="
            width:40px;
            height:40px;
            background:linear-gradient(135deg, #4d79ff, #6b8cff);
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:16px;
            font-weight:700;
            color:#fff;
            box-shadow: 0 4px 12px rgba(77, 121, 255, 0.3);
          ">
            ${(user.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="color:#fff;font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px">
              ${user.role === 'admin' ? renderIcon('admin', 16, 'color: #ff6b6b') : renderIcon('user', 16, 'color: #4d79ff')}
              ${user.name || '—'}
            </div>
            <div style="color:#888;font-size:12px;margin-top:2px">${user.email || '—'}</div>
          </div>
        </div>
      </td>
      <td style="padding:16px;border-top:1px solid #222;color:#ccc;font-size:14px">${user.email || '—'}</td>
      <td style="padding:16px;border-top:1px solid #222;color:#ccc;font-size:14px">${user.phone || '—'}</td>
      <td style="padding:16px;border-top:1px solid #222">
        <span style="
          padding:6px 12px;
          background:${user.role === 'admin' ? 'linear-gradient(135deg, #ff4d4d, #ff6b6b)' : 'linear-gradient(135deg, #4d79ff, #6b8cff)'};
          color:#fff;
          border-radius:20px;
          font-size:11px;
          font-weight:600;
          text-transform:uppercase;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        ">
          ${user.role || '—'}
        </span>
      </td>
      <td style="padding:16px;border-top:1px solid #222;color:#888;font-size:14px">${formatDate(user.createdAt) || '—'}</td>
      <td style="padding:16px;border-top:1px solid #222">
      </td>
      <td style="padding:16px;border-top:1px solid #222">
        <button class="manage-btn" data-user-id="${user.id || user._id}" data-user-name="${user.name || ''}" data-user-email="${user.email || ''}" style="
          padding:8px 16px;
          border:none;
          border-radius:8px;
          font-size:12px;
          font-weight:600;
          background:linear-gradient(135deg, #ff4d4d, #ff6b6b);
          color:#fff;
          cursor:pointer;
          display:flex;
          align-items:center;
          gap:6px;
          transition:all 0.2s;
          box-shadow: 0 4px 12px rgba(255,77,77,0.3);
        " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(255,77,77,0.4)'" 
           onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 12px rgba(255,77,77,0.3)'">
          ${renderIcon('settings', 14)}
          Manage
        </button>
      </td>
    </tr>
  `).join('')
  
  // Add event listeners
  setupTableEventListeners()
}

// Setup table event listeners
function setupTableEventListeners() {
  const tbody = qs('#usersBody')
  if (!tbody) return
  
  // Row click handlers
  tbody.querySelectorAll('.user-row').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.manage-btn') || e.target.closest('button')) return
      // Toggle details or other row actions
    })
  })

  // Manage button handlers
  tbody.querySelectorAll('.manage-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const userId = btn.getAttribute('data-user-id')
      const userName = btn.getAttribute('data-user-name')
      const userEmail = btn.getAttribute('data-user-email')
      openVisibilityModal(userId, userName, userEmail)
    })
  })
}

// Setup search functionality
function setupSearchFunctionality() {
  const searchInput = qs('#userSearch')
  const clearBtn = qs('#clearSearch')
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim()
      filteredUsers = allUsers.filter(user => 
        (user.name && user.name.toLowerCase().includes(query)) ||
        (user.email && user.email.toLowerCase().includes(query)) ||
        (user.phone && user.phone.toLowerCase().includes(query)) ||
        (user.role && user.role.toLowerCase().includes(query))
      )
      renderUsersTable()
    })
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = ''
        filteredUsers = [...allUsers]
        renderUsersTable()
      }
    })
  }
}

// Open messaging modal with modern UI
async function openMessagingModal(recipientId, recipientInfo) {
  try {
    await modernMessaging.openMessagingModal(recipientId, recipientInfo)
  } catch (error) {
    console.error('Error opening messaging modal:', error)
    showNotification('Failed to open conversation', 'error')
  }
}

// Load pending requests
async function loadPendingRequests() {
  try {
    console.log('📋 Loading pending requests...')
    const res = await fetch('/api/admin/region-requests', { credentials: 'same-origin' })
    
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        openAuthModalSafely()
        return
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }

    const { requests } = await res.json()
    console.log('Pending requests loaded:', requests?.length || 0)
    
    // Render pending requests
    renderPendingRequests(requests || [])
    
  } catch (error) {
    console.error('Error loading pending requests:', error)
  }
}

// Render pending requests
function renderPendingRequests(requests) {
  const container = qs('#pendingRequestsBody')
  if (!container) return
  
  if (requests.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="4" style="padding:40px;text-align:center;color:#888;font-style:italic">
          No pending requests
        </td>
      </tr>
    `
    return
  }
  
  container.innerHTML = requests.map(request => `
    <tr style="transition:background-color 0.2s" onmouseover="this.style.backgroundColor='#1a1a1a'" onmouseout="this.style.backgroundColor='transparent'">
      <td style="padding:16px;border-top:1px solid #222;color:#fff;font-weight:500">
        ${request.user?.name || 'Unknown User'}
      </td>
      <td style="padding:16px;border-top:1px solid #222;color:#ccc">
        ${request.region?.name || 'Unknown Region'}
      </td>
      <td style="padding:16px;border-top:1px solid #222;color:#888">
        ${formatDate(request.createdAt)}
      </td>
      <td style="padding:16px;border-top:1px solid #222">
        <div style="display:flex;gap:8px">
          <button onclick="approveRequest('${request._id}')" style="
            padding:6px 12px;
            background:linear-gradient(135deg, #00d4aa, #00b894);
            border:none;
            border-radius:6px;
            color:#fff;
            cursor:pointer;
            font-size:11px;
            font-weight:600;
            transition:all 0.2s;
          " onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='translateY(0)'">
            Approve
          </button>
          <button onclick="rejectRequest('${request._id}')" style="
            padding:6px 12px;
            background:linear-gradient(135deg, #ff4d4d, #ff6b6b);
            border:none;
            border-radius:6px;
            color:#fff;
            cursor:pointer;
            font-size:11px;
            font-weight:600;
            transition:all 0.2s;
          " onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='translateY(0)'">
            Reject
          </button>
        </div>
      </td>
    </tr>
  `).join('')
}

// Load locations
async function loadLocations() {
  try {
    console.log('📋 Loading locations...')
    const res = await fetch('/api/regions', { credentials: 'same-origin' })
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }

    const { regions } = await res.json()
    console.log('Locations loaded:', regions?.length || 0)
    
    allRegions = regions || []
    
  } catch (error) {
    console.error('Error loading locations:', error)
  }
}

// Initialize tabs
function initTabs() {
  console.log('📋 Initializing tabs...')
  
  const tabButtons = qsa('.tab-button')
  const tabContents = qsa('.tab-content')
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab')
      
      // Update button states
      tabButtons.forEach(btn => {
        btn.style.background = 'transparent'
        btn.style.color = '#888'
      })
      button.style.background = 'linear-gradient(135deg, #4d79ff, #6b8cff)'
      button.style.color = '#fff'
      
      // Update content visibility
      tabContents.forEach(content => {
        content.style.display = 'none'
      })
      
      const targetContent = qs(`#${targetTab}Content`)
      if (targetContent) {
        targetContent.style.display = 'block'
      }
    })
  })
  
  // Set default active tab
  if (tabButtons.length > 0) {
    tabButtons[0].click()
  }
}

// Open visibility modal
async function openVisibilityModal(userId, userName, userEmail) {
  currentUserId = userId
  // Implementation for visibility management
  console.log('Opening visibility modal for:', userName)
}

// Utility functions
function formatDate(dateString) {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString()
}

function showNotification(message, type = 'info') {
  const container = qs('#notificationContainer')
  if (!container) return
  
  const notification = document.createElement('div')
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
    margin-bottom: 10px;
  `
  
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px">
      <div style="
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #4d79ff, #6b8cff);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
      ">
        ${renderIcon('notification', 16)}
      </div>
      <div style="flex: 1">
        <div style="font-weight: 600; font-size: 14px; color: #fff">
          ${type.toUpperCase()}
        </div>
        <div style="font-size: 13px; color: #ccc; margin-top: 2px">
          ${message}
        </div>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">×</button>
    </div>
  `
  
  container.appendChild(notification)
  
  // Animate in
  setTimeout(() => {
    notification.style.transform = 'translateX(0)'
  }, 10)
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.transform = 'translateX(100%)'
      setTimeout(() => notification.remove(), 300)
    }
  }, 5000)
}

function openAuthModalSafely() {
  console.log('Opening auth modal...')
  // Implementation for auth modal
}

// Request management functions
async function approveRequest(requestId) {
  try {
    const res = await fetch(`/api/admin/region-requests/${requestId}/approve`, {
      method: 'POST',
      credentials: 'same-origin'
    })
    
    if (res.ok) {
      showNotification('Request approved successfully', 'success')
      loadPendingRequests()
    } else {
      throw new Error('Failed to approve request')
    }
  } catch (error) {
    console.error('Error approving request:', error)
    showNotification('Failed to approve request', 'error')
  }
}

async function rejectRequest(requestId) {
  try {
    const res = await fetch(`/api/admin/region-requests/${requestId}/reject`, {
      method: 'POST',
      credentials: 'same-origin'
    })
    
    if (res.ok) {
      showNotification('Request rejected', 'info')
      loadPendingRequests()
    } else {
      throw new Error('Failed to reject request')
    }
  } catch (error) {
    console.error('Error rejecting request:', error)
    showNotification('Failed to reject request', 'error')
  }
}

// Make functions globally available
window.openMessagingModal = openMessagingModal
window.approveRequest = approveRequest
window.rejectRequest = rejectRequest
