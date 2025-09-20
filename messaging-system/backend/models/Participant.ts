import mongoose, { Document, Schema } from 'mongoose';

export interface IParticipant extends Document {
  _id: string;
  conversationId: string;
  userId: string;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: Date;
  leftAt?: Date;
  isActive: boolean;
  permissions: {
    canSendMessages: boolean;
    canInviteUsers: boolean;
    canEditConversation: boolean;
    canDeleteMessages: boolean;
  };
  lastReadAt: Date;
  lastReadMessageId?: string;
  notificationSettings: {
    muteUntil?: Date;
    mentionsOnly: boolean;
    pushEnabled: boolean;
    emailEnabled: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ParticipantSchema = new Schema<IParticipant>({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ['admin', 'moderator', 'member'],
    default: 'member',
    index: true
  },
  joinedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  leftAt: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  permissions: {
    canSendMessages: {
      type: Boolean,
      default: true
    },
    canInviteUsers: {
      type: Boolean,
      default: false
    },
    canEditConversation: {
      type: Boolean,
      default: false
    },
    canDeleteMessages: {
      type: Boolean,
      default: false
    }
  },
  lastReadAt: {
    type: Date,
    default: Date.now
  },
  lastReadMessageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  notificationSettings: {
    muteUntil: {
      type: Date,
      default: null
    },
    mentionsOnly: {
      type: Boolean,
      default: false
    },
    pushEnabled: {
      type: Boolean,
      default: true
    },
    emailEnabled: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true,
  collection: 'participants'
});

// Compound indexes for performance
ParticipantSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
ParticipantSchema.index({ conversationId: 1, isActive: 1, role: 1 });
ParticipantSchema.index({ userId: 1, isActive: 1 });
ParticipantSchema.index({ lastReadAt: -1 });

export const Participant = mongoose.model<IParticipant>('Participant', ParticipantSchema);
