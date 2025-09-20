import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
  _id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'system' | 'reply' | 'thread';
  clientMessageId?: string; // For deduplication
  sequenceNumber: number;
  replyTo?: string;
  threadId?: string;
  attachments: IAttachment[];
  reactions: IReaction[];
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  metadata: {
    mentions: string[];
    hashtags: string[];
    links: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IAttachment {
  _id: string;
  type: 'image' | 'file' | 'video' | 'audio';
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number; // for video/audio
  uploadedAt: Date;
}

export interface IReaction {
  userId: string;
  emoji: string;
  createdAt: Date;
}

const AttachmentSchema = new Schema<IAttachment>({
  type: {
    type: String,
    enum: ['image', 'file', 'video', 'audio'],
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String,
    default: null
  },
  width: {
    type: Number,
    default: null
  },
  height: {
    type: Number,
    default: null
  },
  duration: {
    type: Number,
    default: null
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const ReactionSchema = new Schema<IReaction>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  emoji: {
    type: String,
    required: true,
    maxlength: 10
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const MessageSchema = new Schema<IMessage>({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 4000
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'system', 'reply', 'thread'],
    default: 'text',
    index: true
  },
  clientMessageId: {
    type: String,
    index: true,
    sparse: true
  },
  sequenceNumber: {
    type: Number,
    required: true,
    index: true
  },
  replyTo: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  threadId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  attachments: [AttachmentSchema],
  reactions: [ReactionSchema],
  isEdited: {
    type: Boolean,
    default: false,
    index: true
  },
  editedAt: {
    type: Date,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  metadata: {
    mentions: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    hashtags: [String],
    links: [String]
  }
}, {
  timestamps: true,
  collection: 'messages'
});

// Compound indexes for performance
MessageSchema.index({ conversationId: 1, sequenceNumber: 1 });
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, isDeleted: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });
MessageSchema.index({ clientMessageId: 1 }, { unique: true, sparse: true });
MessageSchema.index({ threadId: 1, createdAt: 1 });
MessageSchema.index({ 'metadata.mentions': 1, createdAt: -1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
