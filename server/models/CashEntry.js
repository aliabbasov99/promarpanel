const mongoose = require('mongoose');

// Kassa hərəkətləri — əl ilə əlavə edilən gəlir/xərc yazıları.
// Mağaza ödənişləri burada saxlanmır: onlar Payment kolleksiyasından
// dinamik olaraq gəlir kimi hesablanır (təkrar yazı yaranmasın).
const cashEntrySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['in', 'out'], required: true },
    title: { type: String, required: [true, 'Ad tələb olunur'], trim: true },
    amount: {
      type: Number,
      required: [true, 'Məbləğ tələb olunur'],
      min: [0, 'Məbləğ mənfi ola bilməz'],
    },
    date: { type: Date, required: true, default: Date.now },
    // Tarixə uyğun ay ("YYYY-MM") — aylara görə filtrləmək üçün
    month: { type: String, required: true },
    note: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

cashEntrySchema.index({ month: 1, date: -1 });

module.exports = mongoose.model('CashEntry', cashEntrySchema);
