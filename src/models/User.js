// src/models/User.js
import mongoose from 'mongoose';

const SavedNewsSchema = new mongoose.Schema({
  key:   { type: String, required: true, index: true },
  title: String,
  summary: String,
  link:  String,
  isoDate: String,
  image: String,
  source: String,
  category: { type: String, default: 'others' }
}, { _id: false });

const UserSchema = new mongoose.Schema(
  {
    name:  { type: String, default: '' },
    email: { type: String, required: true, unique: true, index: true },
    phone: { type: String, default: '' },
    // keep the hash ONLY; never store the raw password
    passwordHash: { type: String, required: true },
    role:  { type: String, enum: ['user','admin'], default: 'user', index: true },
    savedNews: { type: [SavedNewsSchema], default: [] },
    // Region and country visibility settings
    visibleRegions: { type: [String], default: [] }, // Array of region IDs
    visibleCountries: { type: [String], default: [] }, // Array of country names
    hasVisibilityRestrictions: { type: Boolean, default: false }, // Flag to indicate if user has restrictions
    // Additional fields for messaging system
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    avatar: { type: String, default: '' },
    lastLogin: { type: Date, default: null }
  },
  { timestamps: true }
);

// Normalize email
UserSchema.pre('save', function(next) {
  if (this.email) this.email = String(this.email).toLowerCase().trim();
  next();
});

// Hide internals client-side
UserSchema.set('toJSON', {
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  }
});

export default mongoose.model('User', UserSchema);
