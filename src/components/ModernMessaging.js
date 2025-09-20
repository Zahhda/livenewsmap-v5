import { messagingService } from '../services/messaging.js'
import { Icons, renderIcon } from './Icons.js'

export class ModernMessaging {
  constructor() {
    this.currentConversation = null
    this.currentUserId = null
    this.subscriptions = new Map()
    this.typingTimeout = null
  }

  // Initialize messaging system
  async init(userId) {
    this.currentUserId = userId
    console.log('🚀 Modern messaging system initialized for user:', userId)
  }

  // Open messaging modal with modern UI
  async openMessagingModal(recipientId, recipientInfo) {
    try {
      // Get or create conversation
      const conversation = await messagingService.getOrCreateConversation(
        this.currentUserId, 
        recipientId
      )

      this.currentConversation = conversation.id
      
      // Create modern modal
      this.createModernModal(conversation, recipientInfo)
      
      // Load messages
      await this.loadMessages()
      
      // Setup real-time subscriptions
      this.setupRealtimeSubscriptions()
      
    } catch (error) {
      console.error('Error opening messaging modal:', error)
      this.showNotification('Failed to open conversation', 'error')
    }
  }

  // Create modern messaging modal
  createModernModal(conversation, recipientInfo) {
    // Remove existing modal
    const existingModal = document.getElementById('modernMessagingModal')
    if (existingModal) existingModal.remove()

    const modal = document.createElement('div')
    modal.id = 'modernMessagingModal'
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(10px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease-out;
    `

    modal.innerHTML = `
      <div style="
        width: 90%;
        max-width: 800px;
        height: 80%;
        max-height: 600px;
        background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
        border-radius: 20px;
        border: 1px solid #333;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: slideUp 0.3s ease-out;
      ">
        <!-- Header -->
        <div style="
          padding: 20px;
          border-bottom: 1px solid #333;
          background: linear-gradient(135deg, #2a2a2a, #1a1a1a);
          display: flex;
          align-items: center;
          justify-content: space-between;
        ">
          <div style="display: flex; align-items: center; gap: 12px">
            <div style="
              width: 40px;
              height: 40px;
              background: linear-gradient(135deg, #4d79ff, #6b8cff);
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: 600;
            ">
              ${(recipientInfo.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style="color: #fff; font-weight: 600; font-size: 16px">
                ${recipientInfo.name || 'Unknown User'}
              </div>
              <div style="color: #888; font-size: 12px">
                ${recipientInfo.email || ''}
              </div>
            </div>
          </div>
          <button id="closeMessagingModal" style="
            background: none;
            border: none;
            color: #888;
            cursor: pointer;
            padding: 8px;
            border-radius: 8px;
            transition: all 0.2s;
          " onmouseover="this.style.background='#333';this.style.color='#fff'" onmouseout="this.style.background='none';this.style.color='#888'">
            ${renderIcon('close', 20)}
          </button>
        </div>

        <!-- Messages Container -->
        <div id="messagesContainer" style="
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #0f0f0f;
        ">
          <!-- Messages will be loaded here -->
        </div>

        <!-- Typing Indicator -->
        <div id="typingIndicator" style="
          display: none;
          padding: 0 20px 10px;
          color: #888;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        ">
          <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span>typing...</span>
        </div>

        <!-- Message Input -->
        <div style="
          padding: 20px;
          border-top: 1px solid #333;
          background: #1a1a1a;
        ">
          <div style="display: flex; gap: 12px; align-items: flex-end">
            <div style="flex: 1">
              <textarea 
                id="messageInput" 
                placeholder="Type your message..." 
                style="
                  width: 100%;
                  min-height: 40px;
                  max-height: 120px;
                  padding: 12px 16px;
                  background: #222;
                  border: 1px solid #444;
                  border-radius: 20px;
                  color: #fff;
                  resize: none;
                  font-family: inherit;
                  font-size: 14px;
                  outline: none;
                  transition: border-color 0.2s;
                "
                rows="1"
              ></textarea>
            </div>
            <button 
              id="sendMessageBtn" 
              style="
                width: 44px;
                height: 44px;
                background: linear-gradient(135deg, #00d4aa, #00b894);
                border: none;
                border-radius: 50%;
                color: #fff;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                box-shadow: 0 4px 12px rgba(0, 212, 170, 0.3);
              "
              onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,212,170,0.4)'"
              onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 12px rgba(0,212,170,0.3)'"
            >
              ${renderIcon('send', 20)}
            </button>
          </div>
        </div>
      </div>
    `

    document.body.appendChild(modal)

    // Add animations
    const style = document.createElement('style')
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUp {
        from { transform: translateY(30px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .typing-dots span {
        display: inline-block;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background-color: #888;
        margin: 0 1px;
        animation: typing 1.4s infinite ease-in-out;
      }
      .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
      .typing-dots span:nth-child(2) { animation-delay: -0.16s; }
      @keyframes typing {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
        30% { transform: translateY(-10px); opacity: 1; }
      }
    `
    document.head.appendChild(style)

    // Setup event listeners
    this.setupModalEventListeners()
  }

  // Setup modal event listeners
  setupModalEventListeners() {
    const closeBtn = document.getElementById('closeMessagingModal')
    const messageInput = document.getElementById('messageInput')
    const sendBtn = document.getElementById('sendMessageBtn')

    // Close modal
    closeBtn?.addEventListener('click', () => {
      this.closeModal()
    })

    // Send message
    sendBtn?.addEventListener('click', () => {
      this.sendMessage()
    })

    // Enter to send
    messageInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.sendMessage()
      }
    })

    // Auto-resize textarea
    messageInput?.addEventListener('input', (e) => {
      e.target.style.height = 'auto'
      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
      
      // Typing indicator
      this.sendTypingIndicator(true)
    })

    // Focus input
    messageInput?.focus()
  }

  // Load messages
  async loadMessages() {
    try {
      const messages = await messagingService.getMessages(this.currentConversation)
      const container = document.getElementById('messagesContainer')
      
      if (!container) return

      container.innerHTML = messages.map(message => this.renderMessage(message)).join('')
      this.scrollToBottom()
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  // Render individual message
  renderMessage(message) {
    const isOwn = message.sender_id === this.currentUserId
    const time = new Date(message.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })

    return `
      <div style="
        display: flex;
        justify-content: ${isOwn ? 'flex-end' : 'flex-start'};
        animation: slideIn 0.3s ease-out;
      ">
        <div style="
          max-width: 70%;
          padding: 12px 16px;
          border-radius: 18px;
          background: ${isOwn ? 'linear-gradient(135deg, #00d4aa, #00b894)' : '#333'};
          color: #fff;
          position: relative;
          word-wrap: break-word;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        ">
          ${!isOwn ? `
            <div style="font-size: 11px; color: #888; margin-bottom: 4px; font-weight: 500">
              ${message.sender?.role === 'admin' ? renderIcon('admin', 12) : renderIcon('user', 12)} 
              ${message.sender?.name || 'Unknown'}
            </div>
          ` : ''}
          <div style="font-size: 14px; line-height: 1.4; margin-bottom: 4px">
            ${message.content}
          </div>
          <div style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: ${isOwn ? 'rgba(255,255,255,0.7)' : '#888'};
          ">
            <span>${time}</span>
            ${isOwn ? `
              <div style="display: flex; align-items: center; gap: 4px">
                ${message.read_at ? renderIcon('read', 12, 'color: #4CAF50') : renderIcon('unread', 12, 'color: #FFC107')}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `
  }

  // Send message
  async sendMessage() {
    const input = document.getElementById('messageInput')
    const content = input?.value.trim()
    
    if (!content || !this.currentConversation) return

    try {
      const message = await messagingService.sendMessage(
        this.currentConversation,
        this.currentUserId,
        content
      )

      // Add message to UI
      const container = document.getElementById('messagesContainer')
      if (container) {
        container.insertAdjacentHTML('beforeend', this.renderMessage(message))
        this.scrollToBottom()
      }

      // Clear input
      input.value = ''
      input.style.height = 'auto'

      // Stop typing indicator
      this.sendTypingIndicator(false)

    } catch (error) {
      console.error('Error sending message:', error)
      this.showNotification('Failed to send message', 'error')
    }
  }

  // Setup real-time subscriptions
  setupRealtimeSubscriptions() {
    if (!this.currentConversation) return

    // Subscribe to new messages
    const messageSubscription = messagingService.subscribeToMessages(
      this.currentConversation,
      (message) => {
        this.addMessageToUI(message)
        this.scrollToBottom()
      }
    )

    // Subscribe to typing indicators
    const typingSubscription = messagingService.subscribeToTyping(
      this.currentConversation,
      (presence) => {
        this.handleTypingIndicator(presence)
      }
    )

    this.subscriptions.set('messages', messageSubscription)
    this.subscriptions.set('typing', typingSubscription)
  }

  // Add message to UI
  addMessageToUI(message) {
    const container = document.getElementById('messagesContainer')
    if (!container) return

    const messageEl = document.createElement('div')
    messageEl.innerHTML = this.renderMessage(message)
    container.appendChild(messageEl)
  }

  // Handle typing indicator
  handleTypingIndicator(presence) {
    const indicator = document.getElementById('typingIndicator')
    if (!indicator) return

    const typingUsers = Object.values(presence.presences || {})
      .filter(p => p.is_typing && p.user_id !== this.currentUserId)

    if (typingUsers.length > 0) {
      indicator.style.display = 'flex'
    } else {
      indicator.style.display = 'none'
    }
  }

  // Send typing indicator
  sendTypingIndicator(isTyping) {
    if (!this.currentConversation) return

    clearTimeout(this.typingTimeout)
    
    messagingService.sendTypingIndicator(this.currentConversation, this.currentUserId, isTyping)
    
    if (isTyping) {
      this.typingTimeout = setTimeout(() => {
        messagingService.sendTypingIndicator(this.currentConversation, this.currentUserId, false)
      }, 1000)
    }
  }

  // Scroll to bottom
  scrollToBottom() {
    const container = document.getElementById('messagesContainer')
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }

  // Close modal
  closeModal() {
    const modal = document.getElementById('modernMessagingModal')
    if (modal) {
      modal.style.animation = 'fadeOut 0.3s ease-out'
      setTimeout(() => modal.remove(), 300)
    }

    // Cleanup subscriptions
    this.cleanup()
  }

  // Cleanup subscriptions
  cleanup() {
    this.subscriptions.forEach(subscription => {
      messagingService.unsubscribe(this.currentConversation)
    })
    this.subscriptions.clear()
  }

  // Show notification
  showNotification(message, type = 'info') {
    // Implementation for notifications
    console.log(`${type.toUpperCase()}: ${message}`)
  }
}

// Global instance
export const modernMessaging = new ModernMessaging()
