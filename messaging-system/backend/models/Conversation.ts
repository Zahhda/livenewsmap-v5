import mongoose, { Document, Schema } from 'mongoose';

export interface IConversation extends Document {
  _id: string;
  type: 'direct' | 'group';
  name?: string;
  description?: string;
  avatar?: string;
  createdBy: string;
  isActive: boolean;
  lastMessageAt: Date;
  lastMessageId?: string;
  settings: {
    allowInvites: boolean;
    allowFileUploads: boolean;
    allowReactions: boolean;
    allowThreads: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>({
  type: {
    type: String,
    enum: ['direct', 'group'],
    required: true,
    index: true
  },
  name: {
    type: String,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  avatar: {
    type: String,
    default: null
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastMessageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  settings: {
    allowInvites: {
      type: Boolean,
      default: true
    },
    allowFileUploads: {
      type: Boolean,
      default: true
    },
    allowReactions: {
      type: Boolean,
      default: true
    },
    allowThreads: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true,
  collection: 'conversations'
});

// Compound indexes for performance
ConversationSchema.index({ type: 1, isActive: 1, lastMessageAt: -1 });
ConversationSchema.index({ createdBy: 1, isActive: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);
