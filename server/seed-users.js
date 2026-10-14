// İlk istifadəçiləri yaradır: admin/admin və helpdesk/helpdesk
// Parollar bcrypt ilə hash-lənir, açıq saxlanmır.
// Artıq varsa heç nə silmir, yeniləmir — təhlükəsizdir.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const DEFAULTS = [
  { username: 'admin', password: 'admin', role: 'admin' },
  { username: 'helpdesk', password: 'helpdesk', role: 'helpdesk' },
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  for (const d of DEFAULTS) {
    const exists = await User.findOne({ username: d.username });
    if (exists) {
      console.log(`${d.username} artıq var (parol dəyişdirilmədi)`);
      continue;
    }
    const user = new User({ username: d.username, role: d.role });
    user.setPassword(d.password);
    await user.save();
    console.log(`${d.username} yaradıldı (${d.role})`);
  }
  const count = await User.countDocuments();
  console.log(`Cəmi ${count} istifadəçi`);
  await mongoose.disconnect();
})();