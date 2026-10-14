const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    month: { type: String, required: true }, // "YYYY-MM"

    // Ödəniş anındakı qiymət — sonradan mağazanın qiyməti dəyişsə belə dəyişmir
    amount: { type: Number, required: true, min: 0 },
    paidAt: { type: Date, default: Date.now },
    note: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

paymentSchema.index({ store: 1, month: 1 }, { unique: true });

// Ödəniş statusu hesablanır
// paid    -> ödənilib
// pending -> ödəniş gözlənilir (ayın 10-na qədər)
// overdue -> gecikdirilmiş (10 keçib, ödəniş yoxdur)
function computeStatus(month, hasPayment, today = new Date()) {
  if (hasPayment) return 'paid';
  const [y, m] = month.split('-').map(Number);
  const dueDate = new Date(y, m - 1, 10, 23, 59, 59);
  if (today > dueDate) return 'overdue';
  return 'pending';
}

module.exports = mongoose.model('Payment', paymentSchema);
module.exports.computeStatus = computeStatus;