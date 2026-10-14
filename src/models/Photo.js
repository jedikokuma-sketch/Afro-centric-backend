const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000 },
    imageUrl: { type: String, required: true },
    cloudinaryPublicId: { type: String, required: true },
    photographer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true, enum: ['Culture', 'People', 'Fashion', 'Nature', 'Architecture', 'Events', 'Traditional Life', 'Street Photography', 'Food', 'Wildlife'] },
    country: { type: String, required: true, trim: true, maxlength: 100 },
    location: { type: String, trim: true, maxlength: 200 },
    tags: [{ type: String, trim: true, maxlength: 50 }],
  },
  { timestamps: true }
);

const Photo = mongoose.models.Photo || mongoose.model('Photo', photoSchema);

module.exports = Photo;
