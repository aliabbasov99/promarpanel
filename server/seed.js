require('dotenv').config();
const mongoose = require('mongoose');
const Store = require('./models/Store');
const Payment = require('./models/Payment');
const Issue = require('./models/Issue');

const stores = [
  {
    name: 'Bakı',
    mapUrl: 'https://maps.google.com/?q=Nizami+kuc+42+Baki',
    contacts: [
      { contactName: 'Elvin Məmmədov', phone: '+994 50 111 22 33' },
      { contactName: 'Aysel Qasımlı', phone: '+994 51 444 88 21' },
    ],
    amount: 120,
  },
  {
    name: 'Gəncə',
    mapUrl: 'https://maps.google.com/?q=Nizami+kuc+15+gence',
    contacts: [
      { contactName: 'Kamran Hüseynov', phone: '+994 50 222 33 44' },
      { contactName: 'Rəvan Səfərov', phone: '+994 55 900 11 22' },
      { contactName: 'Nigar Əliyeva', phone: '+994 70 300 55 66' },
    ],
    amount: 120,
  },
  { name: 'Sumqayıt', mapUrl: 'https://maps.google.com/?q=Istiglaliyyet+pr+7+Sumqayit', contacts: [{ contactName: 'Sevinc Əliyeva', phone: '+994 50 333 44 55' }], amount: 100 },
  { name: 'Mingəçevir', mapUrl: 'https://maps.google.com/?q=Heydar+Aliyev+kuc+3+Mingecevir', contacts: [{ contactName: 'Rəşad İsmayılov', phone: '+994 50 444 55 66' }], amount: 90 },
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([Store.deleteMany({}), Payment.deleteMany({}), Issue.deleteMany({})]);
  const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  for (const s of stores) {
    await Store.create({ ...s, prices: [{ amount: s.amount, effectiveFrom: month }] });
  }
  console.log(`${stores.length} mağaza əlavə edildi`);
  await mongoose.disconnect();
})();