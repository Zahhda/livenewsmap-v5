import { supabase, MESSAGES_TABLE, CONVERSATIONS_TABLE, USERS_TABLE } from '../config/supabase.js'

export class MessagingService {
  constructor() {
    this.subscriptions = new Map()
  }

  // Get all conversations for a user
  async getConversations(userId) {
    try {
      const { data, error } = await supabase
        .from(CONVERSATIONS_TABLE)
        .select(`
          *,
          participants:conversation_participants(
            user:users(id, name, email, avatar_url, role)
          )
        `)
        .eq('participants.user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching conversations:', error)
      return []
    }
  }

  // Get messages for a conversation
  async getMessages(conversationId, limit = 50, offset = 0) {
    try {
      const { data, error } = await supabase
        .from(MESSAGES_TABLE)
        .select(`
          *,
          sender:users(id, name, email, avatar_url, role)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error
      return (data || []).reverse() // Reverse to show oldest first
    } catch (error) {
      console.error('Error fetching messages:', error)
      return []
    }
  }

  // Send a message
  async sendMessage(conversationId, senderId, content, messageType = 'text') {
    try {
      const { data, error } = await supabase
        .from(MESSAGES_TABLE)
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          content,
          message_type: messageType,
          created_at: new Date().toISOString()
        })
        .select(`
          *,
          sender:users(id, name, email, avatar_url, role)
        `)
        .single()

      if (error) throw error

      // Update conversation timestamp
      await supabase
        .from(CONVERSATIONS_TABLE)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)

      return data
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  }

  // Create or get conversation between two users
  async getOrCreateConversation(user1Id, user2Id) {
    try {
      // First, try to find existing conversation
      const { data: existing, error: findError } = await supabase
        .from(CONVERSATIONS_TABLE)
        .select(`
          *,
          participants:conversation_participants(
            user:users(id, name, email, avatar_url, role)
          )
        `)
        .eq('participants.user_id', user1Id)
        .eq('participants.user_id', user2Id)
        .single()

      if (existing && !findError) {
        return existing
      }

      // Create new conversation
      const { data: conversation, error: createError } = await supabase
        .from(CONVERSATIONS_TABLE)
        .insert({
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (createError) throw createError

      // Add participants
      await supabase
        .from('conversation_participants')
        .insert([
          { conversation_id: conversation.id, user_id: user1Id },
          { conversation_id: conversation.id, user_id: user2Id }
        ])

      // Fetch the complete conversation
      const { data: completeConversation, error: fetchError } = await supabase
        .from(CONVERSATIONS_TABLE)
        .select(`
          *,
          participants:conversation_participants(
            user:users(id, name, email, avatar_url, role)
          )
        `)
        .eq('id', conversation.id)
        .single()

      if (fetchError) throw fetchError
      return completeConversation

    } catch (error) {
      console.error('Error creating conversation:', error)
      throw error
    }
  }

  // Subscribe to new messages
  subscribeToMessages(conversationId, callback) {
    const subscription = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: MESSAGES_TABLE,
          filter: `conversation_id=eq.${conversationId}`
        }, 
        async (payload) => {
          // Fetch the complete message with sender info
          const { data: message } = await supabase
            .from(MESSAGES_TABLE)
            .select(`
              *,
              sender:users(id, name, email, avatar_url, role)
            `)
            .eq('id', payload.new.id)
            .single()
          
          if (message) callback(message)
        }
      )
      .subscribe()

    this.subscriptions.set(`messages:${conversationId}`, subscription)
    return subscription
  }

  // Subscribe to typing indicators
  subscribeToTyping(conversationId, callback) {
    const subscription = supabase
      .channel(`typing:${conversationId}`)
      .on('presence', { event: 'sync' }, callback)
      .on('presence', { event: 'join' }, callback)
      .on('presence', { event: 'leave' }, callback)
      .subscribe()

    this.subscriptions.set(`typing:${conversationId}`, subscription)
    return subscription
  }

  // Send typing indicator
  async sendTypingIndicator(conversationId, userId, isTyping) {
    const channel = supabase.channel(`typing:${conversationId}`)
    
    if (isTyping) {
      await channel.track({
        user_id: userId,
        is_typing: true,
        timestamp: new Date().toISOString()
      })
    } else {
      await channel.untrack()
    }
  }

  // Mark message as read
  async markAsRead(messageId, userId) {
    try {
      const { error } = await supabase
        .from(MESSAGES_TABLE)
        .update({ 
          read_at: new Date().toISOString(),
          read_by: userId
        })
        .eq('id', messageId)

      if (error) throw error
    } catch (error) {
      console.error('Error marking message as read:', error)
    }
  }

  // Get unread count
  async getUnreadCount(userId) {
    try {
      const { count, error } = await supabase
        .from(MESSAGES_TABLE)
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .is('read_at', null)

      if (error) throw error
      return count || 0
    } catch (error) {
      console.error('Error getting unread count:', error)
      return 0
    }
  }

  // Cleanup subscriptions
  unsubscribe(conversationId) {
    const subscription = this.subscriptions.get(`messages:${conversationId}`)
    if (subscription) {
      supabase.removeChannel(subscription)
      this.subscriptions.delete(`messages:${conversationId}`)
    }

    const typingSubscription = this.subscriptions.get(`typing:${conversationId}`)
    if (typingSubscription) {
      supabase.removeChannel(typingSubscription)
      this.subscriptions.delete(`typing:${conversationId}`)
    }
  }

  // Cleanup all subscriptions
  cleanup() {
    this.subscriptions.forEach(subscription => {
      supabase.removeChannel(subscription)
    })
    this.subscriptions.clear()
  }
}

export const messagingService = new MessagingService()
