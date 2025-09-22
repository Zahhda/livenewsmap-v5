import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'location'],
    default: 'text'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for better query performance
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, recipientId: 1 });
messageSchema.index({ isRead: 1 });

// Virtual for message status
messageSchema.virtual('status').get(function() {
  if (this.isDeleted) return 'deleted';
  if (this.isEdited) return 'edited';
  return 'sent';
});

// Method to mark as read
messageSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Method to mark as edited
messageSchema.methods.markAsEdited = function() {
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

// Method to soft delete
messageSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

// Static method to get conversation messages
messageSchema.statics.getConversationMessages = async function(conversationId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  
  return await this.find({
    conversationId,
    isDeleted: false
  })
  .populate('senderId', 'name email profilePicture')
  .populate('recipientId', 'name email profilePicture')
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);
};

// Static method to get unread message count
messageSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({
    recipientId: userId,
    isRead: false,
    isDeleted: false
  });
};

// Static method to mark conversation as read
messageSchema.statics.markConversationAsRead = async function(conversationId, userId) {
  return await this.updateMany(
    {
      conversationId,
      recipientId: userId,
      isRead: false
    },
    {
      $set: {
        isRead: true,
        readAt: new Date()
      }
    }
  );
};

const Message = mongoose.model('Message', messageSchema);

export default Message;