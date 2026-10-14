// Telefon nömrələrini yaddaşda operator kodusuz 9 rəqəm formata keçirir.
require('dotenv').config();
const mongoose = require('mongoose');
const Store = require('./models/Store');

function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('994')) d = d.slice(3);
  else if (d.length === 10 && d.startsWith('0')) d = d.slice(1);
  return d;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const stores = await Store.find({ 'contacts.0': { $exists: true } });
  let changed = 0;
  for (const s of stores) {
    let touched = false;
    s.contacts = (s.contacts || []).map((c) => {
      const n = normalizePhone(c.phone);
      if (n !== c.phone) touched = true;
      return { ...c, phone: n };
    });
    if (touched) {
      await s.save();
      changed++;
    }
  }
  console.log(`${changed} mağazanın nömrələri normalize edildi`);
  await mongoose.disconnect();
})();