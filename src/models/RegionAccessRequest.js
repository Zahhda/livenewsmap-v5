import mongoose from 'mongoose';

const RegionAccessRequestSchema = new mongoose.Schema(
  {
    userId: { 
      type: String, 
      required: true,
      index: true 
    },
    requestedCountries: { 
      type: [String], 
      required: true,
      validate: {
        validator: function(v) {
          return v.length <= 3; // Free trial limit: max 3 countries
        },
        message: 'Free trial allows maximum 3 countries'
      }
    },
    requestedRegions: { 
      type: [String], 
      default: [] 
    },
    status: { 
      type: String, 
      enum: ['pending', 'approved', 'denied'], 
      default: 'pending',
      index: true 
    },
    adminNotes: { 
      type: String, 
      default: '' 
    },
    processedAt: { 
      type: Date 
    },
    processedBy: { 
      type: String
    },
    // Track request frequency for cooldown
    lastRequestAt: { 
      type: Date, 
      default: Date.now 
    },
    requestCount: { 
      type: Number, 
      default: 1 
    }
  },
  { timestamps: true }
);

// Index for efficient queries
RegionAccessRequestSchema.index({ userId: 1, status: 1 });
RegionAccessRequestSchema.index({ status: 1, createdAt: -1 });

// Virtual for checking if user can make another request (48-hour cooldown)
RegionAccessRequestSchema.virtual('canMakeRequest').get(function() {
  const now = new Date();
  const lastRequest = new Date(this.lastRequestAt);
  const hoursSinceLastRequest = (now - lastRequest) / (1000 * 60 * 60);
  return hoursSinceLastRequest >= 48;
});

// Method to check if user has reached daily limit
RegionAccessRequestSchema.methods.hasReachedLimit = function() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const requestDate = new Date(this.createdAt);
  const requestDay = new Date(requestDate.getFullYear(), requestDate.getMonth(), requestDate.getDate());
  
  return requestDay.getTime() === today.getTime() && this.requestCount >= 1;
};

export default mongoose.model('RegionAccessRequest', RegionAccessRequestSchema);
