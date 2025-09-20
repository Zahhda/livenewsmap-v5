import mongoose, { Document, Schema } from 'mongoose';

export interface IReadReceipt extends Document {
  _id: string;
  messageId: string;
  userId: string;
  readAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReadReceiptSchema = new Schema<IReadReceipt>({
  messageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    required: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  readAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  collection: 'read_receipts'
});

// Compound index for performance
ReadReceiptSchema.index({ messageId: 1, userId: 1 }, { unique: true });
ReadReceiptSchema.index({ userId: 1, readAt: -1 });

export const ReadReceipt = mongoose.model<IReadReceipt>('ReadReceipt', ReadReceiptSchema);
