import { createClient } from '@supabase/supabase-js'

// Replace these with your actual Supabase project credentials
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database schema for messaging
export const MESSAGES_TABLE = 'messages'
export const CONVERSATIONS_TABLE = 'conversations'
export const USERS_TABLE = 'users'

// Real-time subscriptions
export const subscribeToMessages = (conversationId, callback) => {
  return supabase
    .channel(`messages:${conversationId}`)
    .on('postgres_changes', 
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: MESSAGES_TABLE,
        filter: `conversation_id=eq.${conversationId}`
      }, 
      callback
    )
    .subscribe()
}

export const subscribeToTyping = (conversationId, callback) => {
  return supabase
    .channel(`typing:${conversationId}`)
    .on('presence', { event: 'sync' }, callback)
    .on('presence', { event: 'join' }, callback)
    .on('presence', { event: 'leave' }, callback)
    .subscribe()
}
