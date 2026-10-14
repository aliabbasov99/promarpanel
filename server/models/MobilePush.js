const mongoose = require('mongoose');

// Mobil (Expo) push tokeni
const mobilePushSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true }, // ExponentPushToken[...]
    platform: { type: String, enum: ['ios', 'android'], default: 'android' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MobilePush', mobilePushSchema);