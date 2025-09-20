import mongoose from 'mongoose';

const feedSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    category: { type: String, default: 'others' }, // optional seed hint
  },
  { _id: false }
);

const regionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    country: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    feeds: [feedSchema],
  },
  { timestamps: true }
);

const Region = mongoose.model('Region', regionSchema);
export default Region;
