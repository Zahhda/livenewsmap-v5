import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  conversationType: {
    type: String,
    enum: ['direct', 'group'],
    default: 'direct'
  },
  groupName: {
    type: String,
    trim: true
  },
  groupDescription: {
    type: String,
    trim: true
  },
  groupAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date
  },
  isMuted: {
    type: Boolean,
    default: false
  },
  mutedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

// Index for better query performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ isActive: 1 });

// Ensure participants array has exactly 2 users for direct messages
conversationSchema.pre('save', function(next) {
  if (this.conversationType === 'direct' && this.participants.length !== 2) {
    return next(new Error('Direct conversations must have exactly 2 participants'));
  }
  next();
});

// Virtual for unread message count
conversationSchema.virtual('unreadCount', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'conversationId',
  count: true,
  match: { isRead: false, isDeleted: false }
});

// Method to add participant
conversationSchema.methods.addParticipant = function(userId) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
  }
  return this.save();
};

// Method to remove participant
conversationSchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(id => !id.equals(userId));
  return this.save();
};

// Method to archive conversation
conversationSchema.methods.archive = function() {
  this.isArchived = true;
  this.archivedAt = new Date();
  return this.save();
};

// Method to unarchive conversation
conversationSchema.methods.unarchive = function() {
  this.isArchived = false;
  this.archivedAt = undefined;
  return this.save();
};

// Method to mute conversation
conversationSchema.methods.mute = function(userId) {
  if (!this.mutedBy.includes(userId)) {
    this.mutedBy.push(userId);
  }
  this.isMuted = true;
  return this.save();
};

// Method to unmute conversation
conversationSchema.methods.unmute = function(userId) {
  this.mutedBy = this.mutedBy.filter(id => !id.equals(userId));
  if (this.mutedBy.length === 0) {
    this.isMuted = false;
  }
  return this.save();
};

// Static method to find or create direct conversation
conversationSchema.statics.findOrCreateDirectConversation = async function(user1Id, user2Id) {
  // Check if conversation already exists
  let conversation = await this.findOne({
    participants: { $all: [user1Id, user2Id] },
    conversationType: 'direct'
  });

  if (!conversation) {
    // Create new conversation
    conversation = new this({
      participants: [user1Id, user2Id],
      conversationType: 'direct'
    });
    await conversation.save();
  }

  return conversation;
};

// Static method to get user conversations
conversationSchema.statics.getUserConversations = async function(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  return await this.find({
    participants: userId,
    isActive: true
  })
  .populate('participants', 'name email profilePicture')
  .populate('lastMessage')
  .populate('lastMessage.senderId', 'name profilePicture')
  .sort({ lastMessageAt: -1 })
  .skip(skip)
  .limit(limit);
};

// Static method to search conversations
conversationSchema.statics.searchConversations = async function(userId, searchTerm) {
  const regex = new RegExp(searchTerm, 'i');
  
  return await this.find({
    participants: userId,
    isActive: true,
    $or: [
      { groupName: { $regex: regex } },
      { groupDescription: { $regex: regex } }
    ]
  })
  .populate('participants', 'name email profilePicture')
  .populate('lastMessage')
  .populate('lastMessage.senderId', 'name profilePicture')
  .sort({ lastMessageAt: -1 });
};

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
