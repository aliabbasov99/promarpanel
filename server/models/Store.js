const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    _id: false,
    contactName: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const storeSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Mağaza adı tələb olunur'], trim: true },

    // 5 simvollu unikal servis kodu (hərf + rəqəm qarışığı), avtomatik yaradılır
    serviceCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9]{5}$/, 'Servis kodu 5 simvol olmalıdır'],
    },

    // Ünvan yerini Google Maps xəritə linki
    mapUrl: { type: String, trim: true, default: '' },

    // Birdən çox əlaqə nömrəsi + məsul şəxs
    contacts: { type: [contactSchema], default: [] },

    // Qiymət tarixçəsi: əlavə olunan hər qiymət yalnız özündən sonrakı aylara aiddir.
    // Köhnə ödənişlərin qiyməti heç vaxt dəyişmir.
    prices: [
      {
        _id: false,
        amount: { type: Number, required: true, min: 0 },
        effectiveFrom: { type: String, required: true }, // "YYYY-MM"
        createdAt: { type: Date, default: Date.now },
      },
    ],

    active: { type: Boolean, default: true },
    note: { type: String, trim: true, default: '' },

    // Əl ilə "gecikdi" işarələnən ilk ay ("YYYY-MM").
    // Bu ay və ondan sonrakı bütün ödənişlərsiz aylar gecikdirilmiş sayılır.
    lateFrom: { type: String, default: null },
  },
  { timestamps: true }
);

// "YYYY-MM" ayı üçün aktiv qiyməti tapır (ən son uyğun qiymət)
storeSchema.methods.priceForMonth = function (month) {
  if (!this.prices || this.prices.length === 0) return null;
  const valid = this.prices
    .filter((p) => p.effectiveFrom <= month)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return valid.length ? valid[0].amount : null;
};

module.exports = mongoose.model('Store', storeSchema);