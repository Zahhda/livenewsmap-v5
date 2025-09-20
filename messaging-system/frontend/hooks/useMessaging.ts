import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'reply' | 'thread';
  sequenceNumber: number;
  replyTo?: string;
  threadId?: string;
  attachments: any[];
  reactions: any[];
  isEdited: boolean;
  editedAt?: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  participants: any[];
  lastMessage?: Message;
  unreadCount: number;
}

interface UseMessagingReturn {
  socket: Socket | null;
  isConnected: boolean;
  messages: Message[];
  conversations: Conversation[];
  currentConversation: string | null;
  sendMessage: (content: string, type?: string, replyTo?: string) => Promise<void>;
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  markAsRead: (messageId: string) => void;
  addReaction: (messageId: string, emoji: string) => void;
  removeReaction: (messageId: string, emoji: string) => void;
  startTyping: () => void;
  stopTyping: () => void;
  syncMessages: (cursor?: string) => void;
  error: string | null;
}

export const useMessaging = (token: string): UseMessagingReturn => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const messageCache = useRef<Map<string, Message>>(new Map());
  const pendingMessages = useRef<Map<string, Message>>(new Map());
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);

  // Initialize socket connection
  useEffect(() => {
    if (!token) return;

    const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8080', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Connection events
    newSocket.on('connect', () => {
      console.log('Connected to messaging server');
      setIsConnected(true);
      setError(null);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from messaging server');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError(err.message);
    });

    // Message events
    newSocket.on('message_received', (data) => {
      const { message } = data;
      
      // Add to cache
      messageCache.current.set(message.id, message);
      
      // Update messages state
      setMessages(prev => {
        const exists = prev.find(m => m.id === message.id);
        if (exists) return prev;
        
        return [...prev, message].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      });

      // Update conversations
      setConversations(prev => 
        prev.map(conv => 
          conv.id === message.conversationId
            ? { ...conv, lastMessage: message, unreadCount: conv.unreadCount + 1 }
            : conv
        )
      );
    });

    newSocket.on('message_ack', (data) => {
      const { clientMessageId, serverMessageId, status } = data;
      
      if (status === 'delivered') {
        // Remove from pending and add to cache
        const pendingMessage = pendingMessages.current.get(clientMessageId);
        if (pendingMessage) {
          pendingMessages.current.delete(clientMessageId);
          messageCache.current.set(serverMessageId, { ...pendingMessage, id: serverMessageId });
        }
      } else {
        // Handle failed message
        console.error('Message failed:', data.error);
        setError(data.error || 'Failed to send message');
      }
    });

    // Typing events
    newSocket.on('typing_start', (data) => {
      // Handle typing indicator UI
      console.log(`${data.username} is typing...`);
    });

    newSocket.on('typing_stop', (data) => {
      // Handle typing indicator UI
      console.log(`${data.username} stopped typing`);
    });

    // Read receipt events
    newSocket.on('read_receipt', (data) => {
      // Update message read status
      setMessages(prev => 
        prev.map(msg => 
          msg.id === data.messageId
            ? { ...msg, readBy: [...(msg.readBy || []), data.userId] }
            : msg
        )
      );
    });

    // Reaction events
    newSocket.on('reaction_added', (data) => {
      setMessages(prev => 
        prev.map(msg => 
          msg.id === data.messageId
            ? { 
                ...msg, 
                reactions: [...(msg.reactions || []), {
                  userId: data.userId,
                  emoji: data.emoji,
                  createdAt: data.timestamp
                }]
              }
            : msg
        )
      );
    });

    newSocket.on('reaction_removed', (data) => {
      setMessages(prev => 
        prev.map(msg => 
          msg.id === data.messageId
            ? { 
                ...msg, 
                reactions: (msg.reactions || []).filter(r => 
                  !(r.userId === data.userId && r.emoji === data.emoji)
                )
              }
            : msg
        )
      );
    });

    // Sync response
    newSocket.on('sync_response', (data) => {
      const { messages: syncMessages, participants } = data;
      
      // Add to cache
      syncMessages.forEach((msg: Message) => {
        messageCache.current.set(msg.id, msg);
      });

      // Update messages
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newMessages = syncMessages.filter((msg: Message) => !existingIds.has(msg.id));
        return [...prev, ...newMessages].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      });
    });

    // Error handling
    newSocket.on('error', (data) => {
      console.error('Socket error:', data);
      setError(data.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [token]);

  // Send message with optimistic UI
  const sendMessage = useCallback(async (
    content: string, 
    type: string = 'text', 
    replyTo?: string
  ) => {
    if (!socket || !currentConversation) return;

    const clientMessageId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create optimistic message
    const optimisticMessage: Message = {
      id: clientMessageId,
      conversationId: currentConversation,
      senderId: 'current_user', // This should be the actual user ID
      content,
      type: type as any,
      sequenceNumber: messages.length + 1,
      replyTo,
      attachments: [],
      reactions: [],
      isEdited: false,
      createdAt: new Date().toISOString()
    };

    // Add to pending messages
    pendingMessages.current.set(clientMessageId, optimisticMessage);
    
    // Update UI immediately
    setMessages(prev => [...prev, optimisticMessage]);

    // Send to server
    socket.emit('send_message', {
      conversationId: currentConversation,
      content,
      type,
      clientMessageId,
      replyTo
    });
  }, [socket, currentConversation, messages.length]);

  // Join conversation
  const joinConversation = useCallback((conversationId: string) => {
    if (!socket) return;

    // Leave current conversation
    if (currentConversation) {
      socket.emit('leave_conversation', { conversationId: currentConversation });
    }

    // Join new conversation
    socket.emit('join_conversation', { conversationId });
    setCurrentConversation(conversationId);
    
    // Clear messages for new conversation
    setMessages([]);
    
    // Sync messages
    syncMessages();
  }, [socket, currentConversation]);

  // Leave conversation
  const leaveConversation = useCallback((conversationId: string) => {
    if (!socket) return;
    
    socket.emit('leave_conversation', { conversationId });
    if (currentConversation === conversationId) {
      setCurrentConversation(null);
      setMessages([]);
    }
  }, [socket, currentConversation]);

  // Mark message as read
  const markAsRead = useCallback((messageId: string) => {
    if (!socket || !currentConversation) return;
    
    socket.emit('mark_read', {
      conversationId: currentConversation,
      messageId,
      readAt: new Date().toISOString()
    });
  }, [socket, currentConversation]);

  // Add reaction
  const addReaction = useCallback((messageId: string, emoji: string) => {
    if (!socket) return;
    
    socket.emit('add_reaction', { messageId, emoji });
  }, [socket]);

  // Remove reaction
  const removeReaction = useCallback((messageId: string, emoji: string) => {
    if (!socket) return;
    
    socket.emit('remove_reaction', { messageId, emoji });
  }, [socket]);

  // Typing indicators
  const startTyping = useCallback(() => {
    if (!socket || !currentConversation) return;
    
    socket.emit('typing_start', { conversationId: currentConversation });
    
    // Auto stop typing after 3 seconds
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }
    
    typingTimeout.current = setTimeout(() => {
      stopTyping();
    }, 3000);
  }, [socket, currentConversation]);

  const stopTyping = useCallback(() => {
    if (!socket || !currentConversation) return;
    
    socket.emit('typing_stop', { conversationId: currentConversation });
    
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
      typingTimeout.current = null;
    }
  }, [socket, currentConversation]);

  // Sync messages
  const syncMessages = useCallback((cursor?: string) => {
    if (!socket || !currentConversation) return;
    
    socket.emit('sync_messages', {
      conversationId: currentConversation,
      cursor
    });
  }, [socket, currentConversation]);

  return {
    socket,
    isConnected,
    messages,
    conversations,
    currentConversation,
    sendMessage,
    joinConversation,
    leaveConversation,
    markAsRead,
    addReaction,
    removeReaction,
    startTyping,
    stopTyping,
    syncMessages,
    error
  };
};
