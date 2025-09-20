import mongoose from 'mongoose';

const UserLocationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      ref: 'User',
      required: true,
      index: true
    },
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180
    },
    accuracy: {
      type: Number,
      default: null
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  { timestamps: true }
);

// Index for efficient queries
UserLocationSchema.index({ userId: 1, timestamp: -1 });
UserLocationSchema.index({ isActive: 1, timestamp: -1 });

export default mongoose.model('UserLocation', UserLocationSchema);
