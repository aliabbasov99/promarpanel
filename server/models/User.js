const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Parol heç vaxt açıq saxlanmır — bcrypt hash
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'helpdesk'], default: 'helpdesk' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.methods.verifyPassword = function (password) {
  const bcrypt = require('bcryptjs');
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.setPassword = function (password) {
  const bcrypt = require('bcryptjs');
  this.passwordHash = bcrypt.hashSync(password, 10);
};

module.exports = mongoose.model('User', userSchema);