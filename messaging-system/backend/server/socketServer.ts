import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import jwt from 'jsonwebtoken';
import { Server as HTTPServer } from 'http';
import { Message } from '../models/Message';
import { Conversation } from '../models/Conversation';
import { Participant } from '../models/Participant';
import { ReadReceipt } from '../models/ReadReceipt';
import { User } from '../models/User';

interface AuthenticatedSocket extends Socket {
  userId: string;
  username: string;
}

interface MessagePayload {
  conversationId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'reply' | 'thread';
  clientMessageId: string;
  replyTo?: string;
  threadId?: string;
  attachments?: any[];
}

export class MessagingSocketServer {
  private io: SocketIOServer;
  private redisClient: any;
  private redisAdapter: any;

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.initializeRedis();
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private async initializeRedis() {
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    const redisAdapter = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    await this.redisClient.connect();
    await redisAdapter.connect();

    this.redisAdapter = createAdapter(this.redisClient, redisAdapter);
    this.io.adapter(this.redisAdapter);
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('AUTH_REQUIRED'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        const user = await User.findById(decoded.userId).select('username displayName status');
        
        if (!user) {
          return next(new Error('AUTH_REQUIRED'));
        }

        socket.userId = user._id.toString();
        socket.username = user.username;
        next();
      } catch (error) {
        next(new Error('AUTH_REQUIRED'));
      }
    });

    // Rate limiting middleware
    this.io.use((socket: AuthenticatedSocket, next) => {
      // Implement rate limiting logic here
      next();
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`User ${socket.username} connected`);

      // Send connection confirmation
      socket.emit('connected', {
        userId: socket.userId,
        serverTime: new Date().toISOString(),
        features: ['typing', 'reactions', 'threads', 'attachments']
      });

      // Join conversation
      socket.on('join_conversation', async (data) => {
        try {
          const { conversationId, cursor } = data;
          
          // Verify user is participant
          const participant = await Participant.findOne({
            conversationId,
            userId: socket.userId,
            isActive: true
          });

          if (!participant) {
            socket.emit('error', {
              code: 'CONVERSATION_NOT_FOUND',
              message: 'Conversation not found or access denied'
            });
            return;
          }

          // Join socket room
          socket.join(conversationId);

          // Send sync data if cursor provided
          if (cursor) {
            await this.syncMessages(socket, conversationId, cursor);
          }
        } catch (error) {
          socket.emit('error', {
            code: 'SERVER_ERROR',
            message: 'Failed to join conversation'
          });
        }
      });

      // Leave conversation
      socket.on('leave_conversation', (data) => {
        socket.leave(data.conversationId);
      });

      // Send message
      socket.on('send_message', async (data: MessagePayload) => {
        try {
          const message = await this.handleSendMessage(socket, data);
          if (message) {
            // Broadcast to conversation participants
            socket.to(data.conversationId).emit('message_received', {
              message,
              participants: await this.getConversationParticipants(data.conversationId)
            });

            // Send acknowledgment to sender
            socket.emit('message_ack', {
              clientMessageId: data.clientMessageId,
              serverMessageId: message._id,
              sequenceNumber: message.sequenceNumber,
              status: 'delivered'
            });
          }
        } catch (error) {
          socket.emit('message_ack', {
            clientMessageId: data.clientMessageId,
            status: 'failed',
            error: error.message
          });
        }
      });

      // Typing indicators
      socket.on('typing_start', (data) => {
        socket.to(data.conversationId).emit('typing_start', {
          conversationId: data.conversationId,
          userId: socket.userId,
          username: socket.username,
          timestamp: new Date().toISOString()
        });
      });

      socket.on('typing_stop', (data) => {
        socket.to(data.conversationId).emit('typing_stop', {
          conversationId: data.conversationId,
          userId: socket.userId,
          timestamp: new Date().toISOString()
        });
      });

      // Mark message as read
      socket.on('mark_read', async (data) => {
        try {
          await this.handleMarkRead(socket, data);
        } catch (error) {
          socket.emit('error', {
            code: 'SERVER_ERROR',
            message: 'Failed to mark message as read'
          });
        }
      });

      // Add reaction
      socket.on('add_reaction', async (data) => {
        try {
          await this.handleAddReaction(socket, data);
        } catch (error) {
          socket.emit('error', {
            code: 'SERVER_ERROR',
            message: 'Failed to add reaction'
          });
        }
      });

      // Disconnect
      socket.on('disconnect', () => {
        console.log(`User ${socket.username} disconnected`);
      });
    });
  }

  private async handleSendMessage(socket: AuthenticatedSocket, data: MessagePayload) {
    // Verify user is participant
    const participant = await Participant.findOne({
      conversationId: data.conversationId,
      userId: socket.userId,
      isActive: true
    });

    if (!participant) {
      throw new Error('CONVERSATION_NOT_FOUND');
    }

    // Check permissions
    if (!participant.permissions.canSendMessages) {
      throw new Error('PERMISSION_DENIED');
    }

    // Get next sequence number
    const lastMessage = await Message.findOne(
      { conversationId: data.conversationId },
      { sequenceNumber: 1 }
    ).sort({ sequenceNumber: -1 });

    const sequenceNumber = (lastMessage?.sequenceNumber || 0) + 1;

    // Create message
    const message = new Message({
      conversationId: data.conversationId,
      senderId: socket.userId,
      content: data.content,
      type: data.type,
      clientMessageId: data.clientMessageId,
      sequenceNumber,
      replyTo: data.replyTo,
      threadId: data.threadId,
      attachments: data.attachments || []
    });

    await message.save();

    // Update conversation last message
    await Conversation.findByIdAndUpdate(data.conversationId, {
      lastMessageAt: new Date(),
      lastMessageId: message._id
    });

    return message;
  }

  private async handleMarkRead(socket: AuthenticatedSocket, data: any) {
    const { conversationId, messageId, readAt } = data;

    // Verify user is participant
    const participant = await Participant.findOne({
      conversationId,
      userId: socket.userId,
      isActive: true
    });

    if (!participant) {
      throw new Error('CONVERSATION_NOT_FOUND');
    }

    // Create or update read receipt
    await ReadReceipt.findOneAndUpdate(
      { messageId, userId: socket.userId },
      { readAt: new Date(readAt) },
      { upsert: true }
    );

    // Update participant last read
    await Participant.findByIdAndUpdate(participant._id, {
      lastReadAt: new Date(readAt),
      lastReadMessageId: messageId
    });

    // Broadcast read receipt
    socket.to(conversationId).emit('read_receipt', {
      messageId,
      userId: socket.userId,
      readAt
    });
  }

  private async handleAddReaction(socket: AuthenticatedSocket, data: any) {
    const { messageId, emoji } = data;

    // Verify message exists and user has access
    const message = await Message.findById(messageId);
    if (!message) {
      throw new Error('MESSAGE_NOT_FOUND');
    }

    // Check if user is participant
    const participant = await Participant.findOne({
      conversationId: message.conversationId,
      userId: socket.userId,
      isActive: true
    });

    if (!participant) {
      throw new Error('CONVERSATION_NOT_FOUND');
    }

    // Add reaction
    const reaction = {
      userId: socket.userId,
      emoji,
      createdAt: new Date()
    };

    await Message.findByIdAndUpdate(messageId, {
      $addToSet: { reactions: reaction }
    });

    // Broadcast reaction
    this.io.to(message.conversationId.toString()).emit('reaction_added', {
      messageId,
      userId: socket.userId,
      emoji,
      timestamp: reaction.createdAt.toISOString()
    });
  }

  private async syncMessages(socket: AuthenticatedSocket, conversationId: string, cursor?: string) {
    const limit = 50;
    const query: any = { conversationId, isDeleted: false };
    
    if (cursor) {
      query.sequenceNumber = { $gt: parseInt(cursor) };
    }

    const messages = await Message.find(query)
      .sort({ sequenceNumber: 1 })
      .limit(limit + 1)
      .populate('senderId', 'username displayName avatar')
      .lean();

    const hasMore = messages.length > limit;
    const syncMessages = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? syncMessages[syncMessages.length - 1].sequenceNumber.toString() : undefined;

    const participants = await this.getConversationParticipants(conversationId);

    socket.emit('sync_response', {
      conversationId,
      messages: syncMessages,
      hasMore,
      nextCursor,
      participants
    });
  }

  private async getConversationParticipants(conversationId: string) {
    const participants = await Participant.find({
      conversationId,
      isActive: true
    }).populate('userId', 'username displayName avatar status').lean();

    return participants.map(p => ({
      userId: p.userId._id,
      username: p.userId.username,
      displayName: p.userId.displayName,
      avatar: p.userId.avatar,
      status: p.userId.status,
      role: p.role,
      lastReadAt: p.lastReadAt
    }));
  }

  public getIO() {
    return this.io;
  }
}
