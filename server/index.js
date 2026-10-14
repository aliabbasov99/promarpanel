const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const dotenv = require('dotenv');
const { Server } = require('socket.io');

dotenv.config();

const Store = require('./models/Store');
const Payment = require('./models/Payment');
const Issue = require('./models/Issue');
const User = require('./models/User');
const WebPush = require('./models/WebPush');
const MobilePush = require('./models/MobilePush');
const Event = require('./models/Event');

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

// Hadisəni dəyişən istifadəçiyə GÖNDƏRMİR, qalan bütün istifadəçilərə göndərir
function broadcast(event, payload, originClientId, originUserId) {
  if (io) {
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.clientId !== originClientId) socket.emit(event, payload);
    }
  }
  // Brauzer bağlıdırsa — web push göndər (özü dəyişənə göndərilmir)
  push.sendToEveryone({ event, ...payload }, originUserId).catch(() => {});
  // Mobil tətbiq bağlıdırsa — Expo push göndər
  mobilePush
    .sendToEveryone(
      {
        title: payload.pushTitle || payload.title || 'PROMAR Helpdesk',
        body: payload.pushBody || payload.message || '',
        data: { event, url: '/' },
      },
      originUserId
    )
    .catch(() => {});

  // Serverless rejimdə (Vercel) WebSocket yoxdur — hadisələr DB-dən oxunur
  useEffect(() => {
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

// ---------- Web push (brauzer bildirişləri) ----------
// VAPID public açar (girişsiz — brauzer abunə yaratmaq üçün lazımdır)
app.get('/api/push/config', (req, res) => {
  res.json({
    publicKey: push.PUBLIC_KEY || null,
    web: push.isConfigured(),
    mobile: mobilePush.isConfigured(),
  });
});

// Mobil push token qeydi / söndürmə
app.post('/api/push/mobile', auth, async (req, res) => {
  const { token, platform } = req.body;
  if (!token) return res.status(400).json({ error: 'Token tələb olunur' });
  await MobilePush.findOneAndUpdate(
    { token },
    { token, platform: platform === 'ios' ? 'ios' : 'android', user: req.user._id, active: true },
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
  const stores = await Store.find(filter).sort({ name: 1 });
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
  const store = await Store.create({
    name,
    mapUrl,
    contacts: cleanContacts(contacts),
    note,
    active: active === undefined ? true : !!active,
    prices,
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
  const stores = await Store.find(storeFilter).sort({ name: 1 });
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
      status: computeStatus(month, !!payment),
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
    const status = month < startMonth ? 'none' : computeStatus(month, !!payment);
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

  res.json({ store, from, to, startMonth, cells });
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
const clientDist = path.join(__dirname, '..', 'client', 'dist');
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
// Serverless mühit (Vercel, Netlify Functions): daimi proses yoxdur,
// WebSocket də işləmər — funksiya yalnız HTTP sorğularını cavablandırır.
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// SPA fallback
app.get(/^(?!\/api).*/, (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  // Vercel-də statik fayllar CDN tərəfindən verilir (routes: /->index.html),
  // funksiya yalnız //api sorğularına baxır
  if (IS_SERVERLESS) return res.status(404).json({ error: 'Not found' });
  return res.sendFile(path.join(clientDist, 'index.html'));
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