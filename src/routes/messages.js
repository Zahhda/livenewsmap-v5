// src/routes/messages.js
import express from 'express';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'public/uploads/messages';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|mp4|mp3|wav/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, documents, and media files are allowed.'));
    }
  }
});

// Get all conversations for the current user
router.get('/conversations', authRequired, async (req, res) => {
  try {
    const conversations = await Message.getUserConversations(req.user.id);
    res.json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get conversation between current user and another user
router.get('/conversation/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }
    
    // Verify the other user exists
    const otherUser = await User.findById(userId).select('name email username firstName lastName avatar');
    if (!otherUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const messages = await Message.getConversation(req.user.id, userId, page, limit);
    
    // Mark messages as read
    await Message.updateMany(
      { 
        sender: userId, 
        recipient: req.user.id, 
        isRead: false 
      },
      { 
        isRead: true, 
        readAt: new Date() 
      }
    );
    
    res.json({ 
      messages: messages.reverse(), // Reverse to show oldest first
      otherUser,
      pagination: {
        page,
        limit,
        hasMore: messages.length === limit
      }
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Send a message
router.post('/send', authRequired, upload.single('attachment'), async (req, res) => {
  try {
    const { recipientId, content, replyTo } = req.body;
    
    if (!recipientId || !content) {
      return res.status(400).json({ error: 'Recipient ID and content are required' });
    }
    
    // Validate recipientId format
    if (!mongoose.Types.ObjectId.isValid(recipientId)) {
      return res.status(400).json({ error: 'Invalid recipient ID format' });
    }
    
    // Verify recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    
    // Check if user is trying to message themselves
    if (recipientId === req.user.id) {
      return res.status(400).json({ error: 'Cannot send message to yourself' });
    }
    
    // Validate content length
    if (content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content cannot be empty' });
    }
    
    if (content.length > 2000) {
      return res.status(400).json({ error: 'Message content is too long (max 2000 characters)' });
    }
    
    // Prepare message data
    const messageData = {
      sender: req.user.id,
      recipient: recipientId,
      content: content.trim(),
      replyTo: replyTo || null
    };
    
    // Handle file attachment
    if (req.file) {
      messageData.messageType = req.file.mimetype.startsWith('image/') ? 'image' : 'file';
      messageData.attachments = [{
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/messages/${req.file.filename}`
      }];
    }
    
    const message = new Message(messageData);
    await message.save();
    
    // Populate sender and recipient for response
    await message.populate([
      { path: 'sender', select: 'name email username firstName lastName avatar' },
      { path: 'recipient', select: 'name email username firstName lastName avatar' },
      { path: 'replyTo', select: 'content sender' }
    ]);
    
    // Emit real-time message to recipient
    req.app.get('io')?.to(recipientId).emit('newMessage', message);
    
    res.status(201).json({ message });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Edit a message
router.put('/:messageId', authRequired, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user is the sender
    if (!message.sender.equals(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized to edit this message' });
    }
    
    // Check if message is too old to edit (24 hours)
    const hoursSinceCreated = (Date.now() - message.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreated > 24) {
      return res.status(400).json({ error: 'Message is too old to edit' });
    }
    
    await message.editMessage(content.trim());
    
    // Emit real-time update
    req.app.get('io')?.to(message.recipient.toString()).emit('messageEdited', {
      messageId: message._id,
      content: message.content,
      editedAt: message.editedAt
    });
    
    res.json({ message });
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// Delete a message
router.delete('/:messageId', authRequired, async (req, res) => {
  try {
    const { messageId } = req.params;
    
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user is the sender
    if (!message.sender.equals(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }
    
    await message.softDelete();
    
    // Emit real-time update
    req.app.get('io')?.to(message.recipient.toString()).emit('messageDeleted', {
      messageId: message._id
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Add reaction to a message
router.post('/:messageId/reaction', authRequired, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }
    
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    await message.addReaction(req.user.id, emoji);
    
    // Emit real-time update
    req.app.get('io')?.to(message.recipient.toString()).emit('messageReaction', {
      messageId: message._id,
      reactions: message.reactions
    });
    
    res.json({ reactions: message.reactions });
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// Remove reaction from a message
router.delete('/:messageId/reaction', authRequired, async (req, res) => {
  try {
    const { messageId } = req.params;
    
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    await message.removeReaction(req.user.id);
    
    // Emit real-time update
    req.app.get('io')?.to(message.recipient.toString()).emit('messageReaction', {
      messageId: message._id,
      reactions: message.reactions
    });
    
    res.json({ reactions: message.reactions });
  } catch (error) {
    console.error('Error removing reaction:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// Mark conversation as read
router.post('/conversation/:userId/read', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    
    await Message.updateMany(
      { 
        sender: userId, 
        recipient: req.user.id, 
        isRead: false 
      },
      { 
        isRead: true, 
        readAt: new Date() 
      }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking conversation as read:', error);
    res.status(500).json({ error: 'Failed to mark conversation as read' });
  }
});

// Get unread message count
router.get('/unread-count', authRequired, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      recipient: req.user.id,
      isRead: false,
      isDeleted: false
    });
    
    res.json({ count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// Mark a specific message as read
router.post('/:messageId/read', authRequired, async (req, res) => {
  try {
    const { messageId } = req.params;
    
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user is the recipient
    if (!message.recipient.equals(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized to mark this message as read' });
    }
    
    await message.markAsRead();
    
    // Emit real-time update to sender
    req.app.get('io')?.to(message.sender.toString()).emit('messageRead', {
      messageId: message._id,
      readAt: message.readAt
    });
    
    res.json({ success: true, readAt: message.readAt });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// Admin route to get all users for messaging
router.get('/admin/users', adminRequired, async (req, res) => {
  try {
    const users = await User.find({ 
      _id: { $ne: req.user.id } // Exclude current admin
    }).select('name email username firstName lastName avatar lastLogin createdAt');
    
    res.json({ users });
  } catch (error) {
    console.error('Error fetching users for admin:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

export default router;
