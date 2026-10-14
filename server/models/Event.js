const mongoose = require('mongoose');

const { Schema } = mongoose;

// Bildiriş hadisələrinin qeydi (serverless rejimdə polling üçün).
// Yalnız son 2 gün saxlanılır.
const EventSchema = new Schema(
  {
    event: { type: String, required: true }, // 'issue:new' | 'issue:resolved' | 'payment:update' ...
    title: String,
    message: String,
    pushTitle: String,
    pushBody: String,
    data: Schema.Types.Mixed,
    actorRole: String, // ADMIN | HELPDESK
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

EventSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 48 });

module.exports = mongoose.model('Event', EventSchema);