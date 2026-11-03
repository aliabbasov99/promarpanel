const mongoose = require('mongoose');

const { Schema } = mongoose;

// Tənzimləmə açar=qiymət (telegram chat id, və s.)
const SettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: Schema.Types.Mixed,
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.model('Setting', SettingSchema);