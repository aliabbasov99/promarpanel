const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { Server } = require('socket.io');

dotenv.config();

const Store = require('./models/Store');
const Payment = require('./models/Payment');
const Issue = require('./models/Issue');
const User = require('./models/User');
const WebPush = require('./models/WebPush');
const MobilePush = require('./models/MobilePush');
const Setting = require('./models/Setting');
const Event = require('./models/Event');
const CashEntry = require('./models/CashEntry');

// Push modulları isteğe bağlıdır — yüklənməsə server yenə də işləyir
let push = { sendToEveryone: async () => {}, isConfigured: () => false, PUBLIC_KEY: null };
let mobilePush = { sendToEveryone: async () => {}, isConfigured: () => false };
try {
  push = require('./push');
} catch (e) {
  console.warn('Web push yüklənmədi:', e.message);
}
try {
  mobilePush = require('./mobilePush');
} catch (e) {
  console.warn('Mobil push yüklənmədi:', e.message);
}
// Telegram botu (chat id MongoDB-də saxlanılır)
let telegram = { sendToEveryone: async () => {}, getChats: async () => [], addChat: async () => [], removeChat: async () => [], sendToChats: async () => {}, isConfigured: () => false };
try {
  telegram = require('./telegram');
} catch (e) {
  console.warn('Telegram yüklənmədi:', e.message);
}

// OneSignal (web + mobil) — əsas kanal
let oneSignal = { sendToEveryone: async () => {}, upsertPlayer: async () => {}, isConfigured: () => false };
try {
  oneSignal = require('./onesignal');
} catch (e) {
  console.warn('OneSignal yüklənmədi:', e.message);
}
const { computeStatus } = require('./models/Payment');
const { auth, requireRole, sign } = require('./middleware/auth');

// Telefonu operator kodusuz 9 rəqəmə gətirir ("+994 50 111 22 33" / "0501112233" -> "501112233")
function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('994')) d = d.slice(3);
  else if (d.length === 10 && d.startsWith('0')) d = d.slice(1);
  return d;
}

// Əlaqə siyahısını təmizləyir (boş telefon + boş ad atılır)
function cleanContacts(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => ({ contactName: (c.contactName || '').trim(), phone: normalizePhone(c.phone) }))
    .filter((c) => c.contactName || c.phone);
}

// ---------- Servis kodu ----------
// 5 simvollu, hərf + rəqəm qarışığı. Oxşar simvollar (I, O, 0, 1) çıxarılıb.
const SERVICE_CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const SERVICE_CODE_DIGITS = '23456789';

function randomServiceCode() {
  const all = SERVICE_CODE_LETTERS + SERVICE_CODE_DIGITS;
  const chars = [
    SERVICE_CODE_LETTERS[crypto.randomInt(SERVICE_CODE_LETTERS.length)],
    SERVICE_CODE_DIGITS[crypto.randomInt(SERVICE_CODE_DIGITS.length)],
  ];
  for (let i = 0; i < 3; i++) chars.push(all[crypto.randomInt(all.length)]);
  // Qarışdır ki, hərf/rəqəm həmişə eyni yerdə olmasın
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function generateServiceCode() {
  for (let i = 0; i < 25; i++) {
    const code = randomServiceCode();
    const exists = await Store.exists({ serviceCode: code });
    if (!exists) return code;
  }
  throw new Error('Unikal servis kodu yaradıla bilmədi');
}

// Köhnə mağazalarda kod yoxdursa yaradıb yadda saxlayır
async function ensureServiceCode(store) {
  if (store.serviceCode) return store.serviceCode;
  store.serviceCode = await generateServiceCode();
  await store.save();
  return store.serviceCode;
}

const app = express();
app.use(cors());
app.use(express.json());

// Hər brauzer unikal ID göndərir (bildirişlərin özünə göstərilməməsi üçün)
app.use((req, res, next) => {
  req.clientId = req.get('x-client-id') || null;
  next();
});

// ---------- Real-vaxt bildirişlər ----------
let io = null;

// Hadisəni BÜTÜN istifadəçilərə göndərir — o cümlədən dəyişən özü də bildiriş alır
function broadcast(event, payload, originClientId, originUserId) {
  if (io) {
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.clientId !== originClientId) socket.emit(event, payload);
    }
  }
  // Brauzer bağlıdırsa — web push göndər (özü dəyişənə göndərilmir)
  push.sendToEveryone({ event, ...payload }, null).catch(() => {});
  // Mobil tətbiq bağlıdırsa — OneSignal göndər
  oneSignal
    .sendToEveryone(
      {
        title: payload.pushTitle || payload.title || 'PROMAR Helpdesk',
        body: payload.pushBody || payload.message || '',
        event,
        url: '/',
      },
      null
    )
    .catch(() => {});

  // Telegram botuna göndər (hər istifadəçi öz chat-ine alır)
  telegram
    .sendToEveryone({
      title: payload.title,
      body: payload.message,
      store: payload.store,
      event,
      actor: payload.by,
      resolved: payload.message ? /həll/i.test(payload.message) : false,
      archived: payload.archived,
    })
    .catch(() => {});

  // Expo push da göndərilir (ehtiyat)
  mobilePush
    .sendToEveryone(
      {
        title: payload.pushTitle || payload.title || 'PROMAR Helpdesk',
        body: payload.pushBody || payload.message || '',
        data: { event, url: '/' },
      },
      null
    )
    .catch(() => {});

  // Serverless rejimdə (Vercel) WebSocket yoxdur — hadisələr DB-dən oxunur
  Event.create({
    event,
    title: payload.title,
    message: payload.message,
    pushTitle: payload.pushTitle,
    pushBody: payload.pushBody,
    data: { ...payload },
    actorRole: payload.by || payload.actorRole,
    actor: originUserId,
  }).catch(() => {});
}

// Yeni hadisələr ( polling: ?since=ISO tarix)
app.get('/api/events', auth, async (req, res) => {
  const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 60 * 60 * 1000);
  if (Number.isNaN(since.getTime())) return res.status(400).json({ error: 'Yanlış tarix' });

  const rows = await Event.find({ at: { $gt: since } })
    .sort({ at: 1 })
    .limit(50)
    .lean();

  // Öz yaratdığı hadisəni özü görmür
  res.json(rows.filter((r) => String(r.actor || '') !== String(req.user._id)));
});

function onlineCount() {
  if (!io) return 0;
  return new Set([...io.sockets.sockets.values()].map((s) => s.data.clientId)).size;
}

// Helpdesk yalnız STATUS görür — məbləğ, qiymət və tarixlər gizlədilir
const isAdmin = (req) => req.user?.role === 'admin';

// Bildirişlərdə ad deyil, ROL göstərilir: ADMIN / HELPDESK
const roleLabel = (req) => (req.user?.role === 'admin' ? 'ADMIN' : 'HELPDESK');

// ---------- Autentifikasiya ----------
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'İstifadəçi adı və parol tələb olunur' });

  const user = await User.findOne({ username: String(username).toLowerCase().trim() });
  if (!user || !user.active) return res.status(401).json({ error: 'İstifadəçi adı və ya parol səhvdir' });

  const ok = await user.verifyPassword(password);
  if (!ok) return res.status(401).json({ error: 'İstifadəçi adı və ya parol səhvdir' });

  res.json({
    token: sign(user),
    user: { id: user._id, username: user.username, role: user.role },
  });
});

// Tokeni yoxlayır, istifadəçi məlumatını qaytarır
app.get('/api/auth/me', auth, (req, res) => {
  res.json({ id: req.user._id, username: req.user.username, role: req.user.role });
});

// Parolu dəyişmə (öz parolu)
app.post('/api/auth/password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Cari və yeni parol tələb olunur' });
  }
  if (String(newPassword).length < 4) {
    return res.status(400).json({ error: 'Yeni parol ən azı 4 simvol olmalıdır' });
  }
  const ok = await req.user.verifyPassword(currentPassword);
  if (!ok) return res.status(401).json({ error: 'Cari parol səhvdir' });

  req.user.setPassword(String(newPassword));
  await req.user.save();
  res.json({ ok: true });
});

// İstifadəçi yaratmaq (yalnız admin)
app.post('/api/users', auth, requireRole('admin'), async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'İstifadəçi adı və parol tələb olunur' });
  const exists = await User.findOne({ username: String(username).toLowerCase().trim() });
  if (exists) return res.status(400).json({ error: 'Bu istifadəçi adı artıq var' });
  const user = new User({ username: String(username).toLowerCase().trim(), role: role === 'admin' ? 'admin' : 'helpdesk' });
  user.setPassword(String(password));
  await user.save();
  res.status(201).json({ id: user._id, username: user.username, role: user.role });
});

app.get('/api/users', auth, requireRole('admin'), async (req, res) => {
  const users = await User.find().select('-passwordHash').sort({ username: 1 });
  res.json(users);
});

// İstifadəçini sil (öz hesabını silmək olmaz)
app.delete('/api/users/:id', auth, requireRole('admin'), async (req, res) => {
  if (String(req.user._id) === String(req.params.id)) {
    return res.status(400).json({ error: 'Öz hesabınızı silmək olmaz' });
  }
  await User.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ---------- Telegram (hesaba bağlı) ----------
// Telegram webhook-u göndərir: ?start=<code> ilə gələndə chat id-ni
// həmin panel hesabına bağlayır. Bağlantılar MongoDB-də saxlanılır.
app.post('/api/telegram/hook', async (req, res) => {
  try {
    const update = req.body || {};
    const msg = update.message || update.edited_message;
    if (!msg?.chat?.id) return res.json({ ok: true });

    const chatId = String(msg.chat.id);
    const code = (msg.text || '').replace(/^\/start\s*/i, '').trim();
    const userId = code ? await telegram.useCode(code) : null;

    if (userId) {
      await telegram.link(chatId, userId);
      await telegram.sendToChat(
        chatId,
        '✅ <b>PROMAR ilə əlaqələndirildiniz!</b>\n\nSiz indi panel hadisələrini bu chat-da alacaqsınız.\nYeni bağlantı üçün: Parametrlər → Telegram'
      );
      console.log('Telegram: chat bağlandı ->', chatId, 'userId', userId);
    } else if (code) {
      await telegram.sendToChat(chatId, '⚠️ Kod etibarsız və vaxtı keçib. Parametrlərdən yenidən "Telegram-ı qoş" basın.');
    } else {
      await telegram.sendToChat(
        chatId,
        '👋 Salam! Bu bot PROMAR panelinə bağlanır.\n\nBağlanmaq üçün panel → <b>Parametrlər → Telegram → "Telegram-ı qoş"</b> basın və verilən linki açın.'
      );
    }
    res.json({ ok: true });
  } catch (e) {
    console.warn('Telegram webhook xətası:', e.message);
    res.json({ ok: true });
  }
});

// Vəziyyət: bu hesab Telegram-a bağlıdır?
app.get('/api/telegram/status', auth, async (req, res) => {
  res.json({
    enabled: telegram.isConfigured(),
    bot: telegram.botUsername(),
    linked: Boolean(await telegram.getChatForUser(req.user._id)),
  });
});

// Bağlantı linki yarad (deep link)
app.post('/api/telegram/link', auth, async (req, res) => {
  const code = await telegram.createCode(req.user._id);
  res.json({
    ok: true,
    code,
    url: `https://t.me/${telegram.botUsername()}?start=${code}`,
  });
});

// Bağlantını qaldır
app.post('/api/telegram/unlink', auth, async (req, res) => {
  await telegram.unlinkUser(req.user._id);
  res.json({ ok: true });
});

// Test mesajı — yalnız bu hesaba (istəyə görə xüsusi mətn)
app.post('/api/telegram/test', auth, async (req, res) => {
  const text = req.body?.text
    ? String(req.body.text)
    : '<b>PROMAR test</b>\nTelegram bildirişləri işləyir ✅';
  const r = await telegram.sendToUser(req.user._id, text);
  res.json(r.ok ? { ok: true } : { error: r.reason || 'Göndərmə xətası' });
});

// ---------- Push konfiqurasiyası ----------
// VAPID public açar (girişsiz — brauzer abunə yaratmaq üçün lazımdır)
app.get('/api/push/config', (req, res) => {
  res.json({
    // WebSocket/Web push (VAPID) — mövcud mexanizm
    publicKey: push.PUBLIC_KEY || null,
    // OneSignal
    oneSignal: {
      appId: process.env.ONESIGNAL_APP_ID || null,
      enabled: oneSignal.isConfigured(),
    },
    web: oneSignal.isConfigured() || push.isConfigured(),
    mobile: oneSignal.isConfigured() || mobilePush.isConfigured(),
  });
});

// Diaqnostik: mənim qeydi olunan cihazlarım (test üçün)
app.get('/api/push/mine', auth, async (req, res) => {
  const rows = await MobilePush.find({ user: req.user._id }).sort({ _id: -1 }).limit(20).lean();
  res.json({
    count: rows.length,
    devices: rows.map((r) => ({
      platform: r.platform,
      active: r.active,
      token: String(r.token).slice(0, 24) + '…',
      createdAt: r.createdAt,
    })),
  });
});

// OneSignal player qeydi (external_id = istifadəçi id)
app.post('/api/push/onesignal', auth, async (req, res) => {
  const { playerId, platform } = req.body;
  if (!playerId) return res.status(400).json({ error: 'playerId tələb olunur' });
  await oneSignal.upsertPlayer(playerId, req.user._id, platform || 'web');
  res.json({ ok: true });
});

// Mobil (FCM) token qeydi / söndürmə
app.post('/api/push/mobile', auth, async (req, res) => {
  const { token, platform } = req.body;
  if (!token) return res.status(400).json({ error: 'Token tələb olunur' });
  await MobilePush.findOneAndUpdate(
    { token },
    {
      token,
      platform: platform === 'ios' ? 'ios' : platform === 'web' ? 'web' : 'android',
      user: req.user._id,
      active: true,
    },
    { new: true, upsert: true }
  );
  res.json({ ok: true });
});

app.delete('/api/push/mobile', auth, async (req, res) => {
  await MobilePush.updateMany({ user: req.user._id }, { active: false });
  res.json({ ok: true });
});

// Push abunəsi qeyd et / söndür
app.post('/api/push/web', auth, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Push abunə məlumatı tam deyil' });
  }
  await WebPush.findOneAndUpdate(
    { endpoint },
    { endpoint, keys, user: req.user._id, active: true },
    { new: true, upsert: true }
  );
  res.json({ ok: true });
});

app.delete('/api/push/web', auth, async (req, res) => {
  await WebPush.updateMany({ user: req.user._id }, { active: false });
  res.json({ ok: true });
});

// Bundan sonra bütün /api marşrutları giriş tələb edir
app.use('/api', auth);

// ---------- Mağazalar (siyahı yalnız admin) ----------
app.get('/api/stores', requireRole('admin'), async (req, res) => {
  const { active } = req.query;
  const filter = {};
  if (active !== undefined) filter.active = active === 'true';
  // Əlavə edilmə tarixinə görə sıralanır (elifba sırası yoxdur)
  const stores = await Store.find(filter).sort({ createdAt: 1, _id: 1 });

  // Servis kodu olmayan mağazalara avtomatik verilir.
  // Mağaza səhifəsi də bu endpoint-i çağırdığı üçün ora girəndə də kod yaranır.
  for (const store of stores) {
    if (!store.serviceCode) await ensureServiceCode(store);
  }

  res.json(stores);
});

// Yalnız ad + id — problem yaratmaq üçün dropdown (hər rol üçün)
app.get('/api/stores/options', async (req, res) => {
  const stores = await Store.find({ active: true }).select('name').sort({ name: 1 });
  res.json(stores);
});

app.post('/api/stores', requireRole('admin'), async (req, res) => {
  const { name, mapUrl, contacts, amount, effectiveFrom, note, active } = req.body;
  const prices = [];
  if (amount != null && amount !== '') {
    prices.push({ amount: Number(amount), effectiveFrom: effectiveFrom || currentMonth() });
  }
  const serviceCode = await generateServiceCode();
  const store = await Store.create({
    name,
    mapUrl,
    contacts: cleanContacts(contacts),
    note,
    active: active === undefined ? true : !!active,
    prices,
    serviceCode,
  });
  res.status(201).json(store);
});

app.put('/api/stores/:id', requireRole('admin'), async (req, res) => {
  const { name, mapUrl, contacts, note, active } = req.body;
  const update = {};
  for (const k of ['name', 'mapUrl', 'note']) {
    if (req.body[k] !== undefined) update[k] = req.body[k];
  }
  if (contacts !== undefined) update.contacts = cleanContacts(contacts);
  // active göndərilməyibsə toxunma
  if (active !== undefined) update.active = !!active;
  const store = await Store.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!store) return res.status(404).json({ error: 'Mağaza tapılmadı' });
  res.json(store);
});

// Aktiv/Deaktiv
app.patch('/api/stores/:id/active', requireRole('admin'), async (req, res) => {
  const store = await Store.findByIdAndUpdate(req.params.id, { active: !!req.body.active }, { new: true });
  if (!store) return res.status(404).json({ error: 'Mağaza tapılmadı' });
  res.json(store);
});

// Qiymət dəyişdirmə (yeni qiymət yalnız sonrakı aylara aiddir)
app.post('/api/stores/:id/price', requireRole('admin'), async (req, res) => {
  const { amount, effectiveFrom } = req.body;
  const store = await Store.findById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Mağaza tapılmadı' });
  store.prices.push({ amount: Number(amount), effectiveFrom: effectiveFrom || currentMonth() });
  await store.save();
  res.status(201).json(store);
});

app.delete('/api/stores/:id', requireRole('admin'), async (req, res) => {
  await Store.findByIdAndDelete(req.params.id);
  await Payment.deleteMany({ store: req.params.id });
  await Issue.deleteMany({ store: req.params.id });
  res.json({ ok: true });
});

// ---------- Ödənişlər ----------
app.get('/api/payments', async (req, res) => {
  // Helpdesk yalnız cari ayın statusunu görür, məbləğ/şərh/tarix yoxdur
  const admin = isAdmin(req);
  const month = admin ? (req.query.month || currentMonth()) : currentMonth();
  const includeInactive = admin && req.query.includeInactive === 'true';

  const storeFilter = includeInactive ? {} : { active: true };
  const stores = await Store.find(storeFilter).sort({ createdAt: 1, _id: 1 });
  const payments = await Payment.find({ month });

  const paidMap = {};
  for (const p of payments) paidMap[p.store.toString()] = p;

  const rows = stores.map((s) => {
    const payment = paidMap[s._id.toString()] || null;
    const row = {
      store: {
        _id: s._id,
        name: s.name,
        mapUrl: s.mapUrl,
        contacts: s.contacts,
        active: s.active,
      },
      // Əl ilə gecikdirilmiş işarələnmiş aylar və sonrakılar
      status: storeStatus(s, month, !!payment),
    };
    if (!admin) return row; // məbləğ və qiymət göndərilmir

    row.price = s.priceForMonth(month);
    row.payment = payment && {
      _id: payment._id,
      amount: payment.amount,
      paidAt: payment.paidAt,
      note: payment.note,
    };
    return row;
  });

  res.json({ month, rows });
});

// Mağazanın ödəniş statusu — əl ilə "gecikdi" işarəsi də nəzərə alınır
function storeStatus(store, month, hasPayment) {
  if (hasPayment) return 'paid';
  if (store.lateFrom && month >= store.lateFrom) return 'overdue';
  return computeStatus(month, false);
}

app.post('/api/payments', requireRole('admin'), async (req, res) => {
  const { storeId, month, amount, paidAt, note } = req.body;
  const store = await Store.findById(storeId);
  if (!store) return res.status(404).json({ error: 'Mağaza tapılmadı' });

  const finalAmount = amount != null && amount !== '' ? Number(amount) : store.priceForMonth(month);
  if (finalAmount == null) return res.status(400).json({ error: 'Qiymət təyin edilməyib' });

  const doc = await Payment.findOneAndUpdate(
    { store: storeId, month },
    { amount: finalAmount, paidAt: paidAt ? new Date(paidAt) : new Date(), note: note || '' },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  res.status(201).json(doc);
});

app.delete('/api/payments/:id', requireRole('admin'), async (req, res) => {
  await Payment.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// Toplu ödəniş: seçilmiş aylar arasındakı bütün ödənməmiş ayları ödənilib işarələyir
app.post('/api/stores/:id/payments/bulk', requireRole('admin'), async (req, res) => {
  const store = await Store.findById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Mağaza tapılmadı' });

  const { from, to, paidAt, note, amount } = req.body;
  if (!from || !to || from > to) return res.status(400).json({ error: 'Tarix aralığı düzgün deyil' });

  const months = monthRange(from, to);
  const existing = await Payment.find({ store: store._id, month: { $gte: from, $lte: to } });
  const existingMonths = new Set(existing.map((p) => p.month));

  const created = [];
  const skipped = [];
  const failed = [];

  const givenAmount = amount != null && amount !== '' ? Number(amount) : null;
  const currentPrice = store.priceForMonth(currentMonth()); // qiyməti olmayan aylar üçün

  for (const month of months) {
    if (existingMonths.has(month)) { skipped.push(month); continue; }

    // Verilmiş məbləg bütün aylara tətbiq olunur, boşdursa hər ay öz qiyməti
    const finalAmount = givenAmount ?? store.priceForMonth(month) ?? currentPrice;
    if (finalAmount == null) { failed.push(month); continue; }

    await Payment.create({
      store: store._id,
      month,
      amount: finalAmount,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      note: note || '',
    });
    created.push(month);
  }

  res.status(201).json({ created, skipped, failed });
});

// Ayı "gecikdi" işarələmək — bu ay və sonrakı bütün aylar gecikdirilmiş olur
app.post('/api/stores/:id/late', requireRole('admin'), async (req, res) => {
  const { month } = req.body || {};
  if (!month) return res.status(400).json({ error: 'Ay tələb olunur' });

  const store = await Store.findById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Mağaza tapılmadı' });

  // ən erkən gecikmiş ay saxlanılır
  if (!store.lateFrom || month < store.lateFrom) store.lateFrom = month;
  await store.save();

  res.json({ ok: true, lateFrom: store.lateFrom });
});

// Gecikmiş işarəsini sil
app.delete('/api/stores/:id/late', requireRole('admin'), async (req, res) => {
  const store = await Store.findById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Mağaza tapılmadı' });
  store.lateFrom = null;
  await store.save();
  res.json({ ok: true, lateFrom: null });
});

// ---------- Kassa (gəlir / xərc) ----------
// Ay sərhədləri (lokal vaxt) — "YYYY-MM" üçün [başlanğıc, son)
function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

function monthOfDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Kassa: ümumi qalıq + seçilmiş ayın gəlir/xərc yazıları.
// Mağaza ödənişləri də gəlir kimi bu siyahıya düşür (ödəniş tarixinə görə).
app.get('/api/cash', requireRole('admin'), async (req, res) => {
  const month = req.query.month || currentMonth();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Ay formatı düzgün deyil' });
  }

  const { start, end } = monthBounds(month);

  const [manual, payments, cashTotals, paymentTotals, paymentDates, cashMonths] = await Promise.all([
    CashEntry.find({ month }).sort({ date: -1, createdAt: -1 }),
    Payment.find({ paidAt: { $gte: start, $lt: end } })
      .populate('store', 'name')
      .sort({ paidAt: -1, createdAt: -1 }),
    CashEntry.aggregate([{ $group: { _id: '$type', total: { $sum: '$amount' } } }]),
    Payment.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payment.find({}).select('paidAt').sort({ paidAt: 1 }),
    CashEntry.distinct('month'),
  ]);

  const cashIn = cashTotals.find((t) => t._id === 'in')?.total || 0;
  const cashOut = cashTotals.find((t) => t._id === 'out')?.total || 0;
  const paymentTotal = paymentTotals[0]?.total || 0;
  const balance = cashIn - cashOut + paymentTotal;

  const entries = [
    ...manual.map((e) => ({
      id: String(e._id),
      source: 'manual',
      type: e.type,
      title: e.title,
      amount: e.amount,
      date: e.date,
      note: e.note,
    })),
    ...payments.map((p) => ({
      id: String(p._id),
      source: 'payment',
      type: 'in',
      title: p.store?.name ? `${p.store.name} — aylıq ödəniş` : 'Mağaza ödənişi',
      amount: p.amount,
      date: p.paidAt,
      note: p.note,
      paymentMonth: p.month,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const income = entries.filter((e) => e.type === 'in').reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter((e) => e.type === 'out').reduce((s, e) => s + e.amount, 0);

  // Filtr üçün mövcud aylar (yazı olan aylar + ödəniş ayları + cari ay)
  const monthSet = new Set([...cashMonths, currentMonth(), ...paymentDates.map((p) => monthOfDate(p.paidAt))]);
  const months = Array.from(monthSet)
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
    .sort((a, b) => (a < b ? 1 : -1));

  res.json({
    month,
    balance,
    income,
    expense,
    net: income - expense,
    entries,
    months,
  });
});

// Əl ilə gəlir/xərc əlavə etmək
app.post('/api/cash', requireRole('admin'), async (req, res) => {
  const { type, title, amount, date, note } = req.body || {};

  if (type !== 'in' && type !== 'out') {
    return res.status(400).json({ error: 'Növ düzgün deyil' });
  }
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'Ad tələb olunur' });
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ error: 'Məbləğ 0-dan böyük olmalıdır' });
  }
  const when = date ? new Date(date) : new Date();
  if (Number.isNaN(when.getTime())) {
    return res.status(400).json({ error: 'Tarix düzgün deyil' });
  }

  const entry = await CashEntry.create({
    type,
    title: String(title).trim(),
    amount: value,
    date: when,
    month: monthOfDate(when),
    note: note ? String(note).trim() : '',
    createdBy: req.user?._id,
  });

  res.status(201).json(entry);
});

// Yalnız əl ilə əlavə edilən yazını silmək olar (ödənişlər ödənişlər bölməsindən idarə olunur)
app.delete('/api/cash/:id', requireRole('admin'), async (req, res) => {
  const entry = await CashEntry.findByIdAndDelete(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Yazı tapılmadı' });
  res.json({ ok: true });
});

// ---------- Hesabatlar (aylıq + ümumi 2022-dən) ----------
// ?from=2022-01&to=2026-10
app.get('/api/report', requireRole('admin'), async (req, res) => {
  const to = req.query.to || currentMonth();
  const from = req.query.from || '2022-01';
  const singleMonth = from === to;

  const stores = await Store.find({}).sort({ createdAt: 1, _id: 1 });
  const payments = await Payment.find({ month: { $gte: from, $lte: to } });

  // storeId+month -> payment
  const pMap = {};
  for (const p of payments) pMap[`${p.store}|${p.month}`] = p;

  const months = singleMonth ? [to] : monthRange(from, to);

  const rows = [];
  let tExpected = 0;
  let tCollected = 0;
  let tLate = 0;

  for (const s of stores) {
    // Xidmətin başlanğıcı = ilk ödəniş (yoxdursa heç nə hesablanmır)
    const first = await Payment.findOne({ store: s._id }).sort({ month: 1 }).select('month');
    const startMonth = first?.month || null;
    if (!startMonth) continue; // heç ödəniş etməyən mağaza hesabatda yoxdur

    const store = {
      _id: s._id,
      name: s.name,
      active: s.active,
      startMonth,
      lateFrom: s.lateFrom,
      months: [],
      expected: 0,
      collected: 0,
      debt: 0,
      lateMonths: 0,
      pendingMonths: 0,
      paidMonths: 0,
    };

    for (const month of months) {
      if (month < startMonth) continue;
      const payment = pMap[`${s._id}|${month}`] || null;
      const price = s.priceForMonth(month) || 0;
      const status = storeStatus(s, month, !!payment);

      store.months.push({ month, price, status, paid: payment?.amount || 0 });
      store.expected += price;
      store.collected += payment?.amount || 0;
      if (status === 'overdue') store.lateMonths += 1;
      else if (status === 'pending') store.pendingMonths += 1;
      else if (status === 'paid') store.paidMonths += 1;
    }

    store.debt = Math.max(0, store.expected - store.collected);
    tExpected += store.expected;
    tCollected += store.collected;
    tLate += store.lateMonths;
    rows.push(store);
  }

  res.json({
    from,
    to,
    singleMonth,
    months,
    rows,
    totals: {
      stores: rows.length,
      expected: tExpected,
      collected: tCollected,
      debt: Math.max(0, tExpected - tCollected),
      lateMonths: tLate,
    },
  });
});

// Bir mağazanın bütün aylara görə ödəniş cədvəli (tarix aralığı ilə) — yalnız admin
app.get('/api/stores/:id/payments', requireRole('admin'), async (req, res) => {
  const store = await Store.findById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Mağaza tapılmadı' });

  const to = req.query.to || currentMonth();
  const from = req.query.from || '2022-01';

  const months = monthRange(from, to);
  const payments = await Payment.find({ store: store._id, month: { $gte: from, $lte: to } });
  const paidMap = {};
  for (const p of payments) paidMap[p.month] = p;

  // Xidmətin başlanğıcı = ən erkən ödəniş ayı. Ondan əvvəlki aylar boş qalır,
  // "gecikdirilmiş" sayılmır. Hələ ödəniş yoxdursa, başlanğıc = bu ay.
  const allPayments = payments.length
    ? await Payment.find({ store: store._id }).sort({ month: 1 }).limit(1)
    : [];
  const startMonth = allPayments.length ? allPayments[0].month : currentMonth();

  const cells = months.map((month) => {
    const payment = paidMap[month] || null;
    // Başlanğıcdan əvvəlki aylar boş
    const status = month < startMonth ? 'none' : storeStatus(store, month, !!payment);
    return {
      month,
      price: store.priceForMonth(month),
      status,
      payment: payment && {
        _id: payment._id,
        amount: payment.amount,
        paidAt: payment.paidAt,
        note: payment.note,
      },
    };
  });

  // Cədvəl üzrə yekun xülasə
  const activeCells = cells.filter((c) => c.status !== 'none');
  const summary = {
    expected: activeCells.reduce((s, c) => s + (c.price || 0), 0),
    collected: activeCells.reduce((s, c) => s + (c.payment?.amount || 0), 0),
    paidMonths: activeCells.filter((c) => c.status === 'paid').length,
    lateMonths: activeCells.filter((c) => c.status === 'overdue').length,
    pendingMonths: activeCells.filter((c) => c.status === 'pending').length,
  };
  summary.debt = Math.max(0, summary.expected - summary.collected);

  res.json({ store, from, to, startMonth, lateFrom: store.lateFrom, cells, summary });
});

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    if (out.length > 240) break; // 20 il qoruması
  }
  return out;
}

// ---------- Problemlər ----------
app.get('/api/issues', async (req, res) => {
  const filter = {};
  if (req.query.store) filter.store = req.query.store;
  if (req.query.status) filter.status = req.query.status;
  // Əsas siyahıda həll olunmuş problemlər göstərilmir (onlar arxivdədir)
  if (req.query.excludeResolved === 'true') filter.status = { $ne: 'resolved' };
  const issues = await Issue.find(filter).populate('store', 'name mapUrl contacts').sort({ createdAt: -1 });
  res.json(issues);
});

app.post('/api/issues', async (req, res) => {
  const { storeId, title, description, priority } = req.body;
  const issue = await Issue.create({ store: storeId, title, description, priority });
  const populated = await Issue.findById(issue._id).populate('store', 'name mapUrl contacts');
  broadcast(
    'issue:created',
    {
      id: populated._id,
      title: populated.title,
      store: populated.store?.name || '—',
      priority: populated.priority,
      by: roleLabel(req),
      at: new Date().toISOString(),
    },
    req.clientId,
    req.user._id
  );
  res.status(201).json(populated);
});

const ISSUE_STATUS_LABEL = {
  open: 'Açıq',
  in_progress: 'İşlənir',
  resolved: 'Həll olundu',
};

app.patch('/api/issues/:id', async (req, res) => {
  const { status, priority, description } = req.body;
  const before = await Issue.findById(req.params.id);
  if (!before) return res.status(404).json({ error: 'Problem tapılmadı' });

  const update = {};
  if (status) {
    update.status = status;
    update.resolvedAt = status === 'resolved' ? new Date() : null;
  }
  if (priority) update.priority = priority;
  if (description !== undefined) update.description = description;
  const issue = await Issue.findByIdAndUpdate(req.params.id, update, { new: true }).populate(
    'store',
    'name mapUrl contacts'
  );
  if (!issue) return res.status(404).json({ error: 'Problem tapılmadı' });

  // Status dəyişdisə (o cümlədan arxivə keçmə daxil) bildiriş göndər
  if (status && status !== before.status) {
    const archived = status === 'resolved' && before.status !== 'resolved';
    const reopened = before.status === 'resolved' && status !== 'resolved';
    let message;
    if (archived) message = 'həll olundu';
    else if (reopened) message = `yenidən açıldı (${ISSUE_STATUS_LABEL[status]})`;
    else message = `statusu dəyişdi: ${ISSUE_STATUS_LABEL[before.status]} → ${ISSUE_STATUS_LABEL[status]}`;

    broadcast(
      'issue:status',
      {
        id: issue._id,
        title: issue.title,
        store: issue.store?.name || '—',
        from: before.status,
        to: status,
        archived,
        message,
        by: roleLabel(req),
        at: new Date().toISOString(),
      },
      req.clientId,
      req.user._id
    );
  }

  res.json(issue);
});

app.delete('/api/issues/:id', async (req, res) => {
  const issue = await Issue.findById(req.params.id);
  await Issue.findByIdAndDelete(req.params.id);
  if (issue) {
    broadcast(
      'issue:deleted',
      { id: issue._id, title: issue.title, by: roleLabel(req), at: new Date().toISOString() },
      req.clientId,
      req.user._id
    );
  }
  res.json({ ok: true });
});

// ---------- Statistika ----------
app.get('/api/stats', async (req, res) => {
  const month = req.query.month || currentMonth();
  const stores = await Store.find({ active: true });
  const payments = await Payment.find({ month });
  const openIssues = await Issue.countDocuments({ status: { $ne: 'resolved' } });

  let paid = 0, overdue = 0, pending = 0, collected = 0, expected = 0;
  for (const s of stores) {
    const p = payments.find((x) => x.store.toString() === s._id.toString());
    const price = s.priceForMonth(month);
    if (price) expected += price;
    if (p) {
      paid += 1;
      collected += p.amount;
    } else if (computeStatus(month, false) === 'overdue') overdue += 1;
    else pending += 1;
  }

  const out = { month, totalStores: stores.length, paid, overdue, pending, openIssues };
  if (isAdmin(req)) {
    out.collected = collected;
    out.expected = expected;
  }
  res.json(out);
});

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Serve client build (production)
// Vercel-də yalnız server/ qovluğu deploy olunur — ona görə build
// server/public-ə kopyalanır (npm run build:deploy). Lokal işləyəndə
// client/dist varsa o istifadə olunur.
const publicDir = path.join(__dirname, 'public');
const clientDist = fs.existsSync(publicDir)
  ? publicDir
  : path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist, {
  etag: true,
  lastModified: true,
  maxAge: 0,
  setHeaders(res, filePath) {
    // HTML heç vaxt keshə girməsin — yeni build dərhal görünsün
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    }
  },
}));
// Xəta handler-i — serverless-da HTML 500 yerine aydın JSON qaytarır
app.use((err, req, res, _next) => {
  const msg = String(err?.message || err);
  const blocked = /whitelist|not authorized|IP address|buffering timed out|ECONNREFUSED|server selection/i.test(msg);
  console.error('API xətası:', msg);
  res.status(503).json({
    error: blocked
      ? 'MongoDB bağlantısı bloklanıb: Atlas > Network Access > "Allow access from anywhere" (0.0.0.0/0)'
      : 'Server xətası',
    detail: msg.slice(0, 160),
  });
});

// Serverless mühit (Vercel, Netlify Functions): daimi proses yoxdur,
// WebSocket də işləmər — funksiya yalnız HTTP sorğularını cavablandırır.
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// SPA fallback (Vercel-də də işləyir — statik fayllar funksiyanın özündədir)
app.get(/^(?!\/api).*/, (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    if (IS_SERVERLESS) {
      console.log('Serverless rejim: HTTP işləyir, WebSocket yoxdur');
      return;
    }

    const httpServer = http.createServer(app);

    io = new Server(httpServer, {
      cors: { origin: true, credentials: true },
      path: '/socket.io',
    });

    io.on('connection', (socket) => {
      // Brauzerin unikal ID-si — bildirişi göndərənə göndərilmir
      socket.data.clientId = socket.handshake.auth?.clientId || socket.id;
      socket.emit('presence', { online: onlineCount() });
      socket.broadcast.emit('presence', { online: onlineCount() });

      socket.on('disconnect', () => {
        io.emit('presence', { online: onlineCount() });
      });
    });

    httpServer.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
  })
  .catch((err) => {
    const ipHint =
      /whitelist|not authorized|IP/i.test(err.message)
        ? '\n\n  -> Bu adətən IP whitelist problemidir. MongoDB Atlas > Network Access > ' +
          '"Allow access from anywhere" (0.0.0.0/0) və ya hazırkı IP-ni əlavə edin.'
        : '';
    console.error('\nMongoDB bağlantı xətası:\n ', err.message, ipHint, '\n');
    if (IS_SERVERLESS) {
      // Serverless-da crash etmə: funksiya hər dəfə yenidən cəhd edəcək
      console.error('Serverless: bağlantı olmadan davam edirik\n');
    } else {
      process.exit(1);
    }
  });

// Vercel və s. funksiya mühiti üçün Express app-i ixrac edirik
module.exports = app;
module.exports.app = app;