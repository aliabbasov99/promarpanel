# Bildirişlər — mövcud vəziyyət və tam həllin planı

> **Oyanıb oxumaq üçün:** növbəti dəfə "bildirişləri işlət / push əlavə et" deyəndə
> **bu faylı oxu** və aşağıdakı addımları icra et.

---

## 1. Qısa status

| Mühit | Vəziyyət | Vəziyyət (app bağlı) |
|---|---|---|
| Web — tətbiq açıqdır | İşləyir (toast + zəng sayğacı) | — |
| Web — tabaq arxa planda | İşləyir (WebSocket + Notification API, icazə verilibsə) | — |
| Mobil — app açıqdır | İşləyir (zolaq + sistem bildirişi) | — |
| Mobil — app arxa planda | İşləyir (expo-notifications local) | — |
| Mobil — app öldürülüb (swipe) | **İŞLƏMİR** | **İŞLƏMİR** |

**Səbəb:** server hadisələri yalnız **WebSocket (Socket.IO)** ilə yayımlayır. WebSocket bağlantısı
proses bağlandıqda düşür — push mexanizmi yoxdur.

---

## 2. Mövcud arxitektura

```
Problemin yaradılması / status dəyişməsi
        │
        ▼
   server/index.js
   broadcast('issue:status', {...}, req.clientId)
        │  hər açıq socket-ə göndərilir,
        │  ÇOX dəyişən istifadəçiyə (clientId) GÖNDƏRİLMİR
        ▼
   Socket.IO (server/index.js)
        │
        ├── web  : client/src/notify.jsx  → toast + bell
        └── mobil: mobile/src/notify.jsx  → toast + expo-notifications
```

İstifadəçi adı yoxdur — bildirişdə **rol** göstərilir (`ADMIN` / `HELPDESK`).
Mətn formatı:
```
ADMIN - "Namelum-printer islmemir"
həll olundu · ELMAR DSK
```

### Fayllar (toxunmaq lazım olanlar)
- `server/index.js` — `broadcast()` funksiyası, `/api/auth/*`, hadisə nöqtələri
- `server/models/User.js` — istifadəçi modeli
- `server/middleware/auth.js` — JWT
- `client/src/notify.jsx` — web bildirişləri
- `client/src/pages/Settings.jsx` — bildiriş aç/bağla
- `mobile/src/notify.jsx` — mobil bildirişlər
- `mobile/src/screens/Settings.jsx` — icazə düyməsi
- `mobile/app.json` — `expo.extra.eas.projectId` (push üçün vacibdir)

---

## 3. Niyə push lazımdır

WebSocket = "bu cihaz yalnız indi açıqdır".
Push = "cihaz bağlı olsa da, server istifadəçiyə özü çatdırır" (FCM/APNs).

---

## 4. Tam həllin planı (icra etmək üçün)

### Addım 1 — Asılılıqlar

```bash
# server
npm install expo-server-sdk --prefix server

# mobile
npx expo install expo-notifications expo-device expo-constants  (artıq qurulub)
cd mobile && eas login && eas init      # projectId alınır -> app.json-a düşür
```

### Addım 2 — Model

`server/models/PushToken.js` (yeni):
```js
const pushTokenSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token:    { type: String, required: true, unique: true },
  platform: { type: String, enum: ['ios', 'android'], default: 'android' },
  active:   { type: Boolean, default: true },
}, { timestamps: true });
```

### Addım 3 — Endpoint-lər

```js
// token qeydi (hər istifadəçi öz cihazını qeyd edir)
app.post('/api/push/token', auth, async (req, res) => {
  const { token, platform } = req.body;
  await PushToken.findOneAndUpdate(
    { token },
    { token, platform, user: req.user._id, active: true },
    { new: true, upsert: true }
  );
  res.json({ ok: true });
});

// bildirişləri söndürən istifadəçi üçün token deaktivləşdirmə
app.delete('/api/push/token', auth, async (req, res) => {
  await PushToken.updateMany({ user: req.user._id }, { active: false });
  res.json({ ok: true });
});
```

### Addım 4 — Göndərmə

`server/push.js` (yeni):
```js
const { Expo } = require('expo-server-sdk');
const expo = new Expo(process.env.EXPO_PUSH_TOKEN);

async function sendToUser(userId, title, body, data = {}) {
  const tokens = await PushToken.find({ user: userId, active: true });
  if (!tokens.length) return;
  const chunks = [];
  for (const t of tokens) {
    chunks.push({ to: t.token, sound: 'default', title, body, data });
  }
  for (const c of Expo.chunkPushNotifications(chunks)) {
    const r = await expo.sendPushNotificationsAsync(c);
    // token etibarsız olduqda deaktivləşdir
    if (Array.isArray(r.data)) {
      r.data.forEach((d, i) => {
        if (d.status === 'error' && /NotRegistered|Invalid/i.test(d.message || '')) {
          tokens[i].active = false;
          tokens[i].save();
        }
      });
    }
  }
}
```

### Addım 5 — `broadcast()`-i genişləndirmək

Server-də rol dəyişəndə **həmin istifadəçiyə də** push gönərilməlidir
(indiki WebSocket-da özünə göndərilmir — bu qəsdidir).
`broadcast()`-ə əlavə olaraq `senderUserId` parametri və `sendToUser` çağırışı:

```js
function broadcast(event, payload, originClientId, originUserId) {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.clientId !== originClientId) socket.emit(event, payload);
  }
  // Bağlı cihazlar üçün push — özünə istisna olaraq
  io.emit(event, payload);                       // socket.io eyni xidmət worker-ləri arasında
  if (originUserId) {
    const p = PushToken.find({ user: originUserId, active: true }).distinct('user');
    // həmin userId-lərə push göndər (bütün digər istifadəçilərə)
  }
}
```

> Qeyd: "dəyişən özü görməsin" qaydası push üçün də saxlanılmalıdır —
> `req.user._id`-i `originUserId` kimi ötürüb, ondan başqaları seçilir.

### Addım 6 — Mobil tərəf

`mobile/src/notify.jsx`:
```js
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from './api';

// girişdən sonra və app ön planda qalxanda
async function registerPush(userId) {
  if (!Device.isDevice) return;                 // emulatorda işləmir
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const token = (await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig.extra.eas?.projectId,
  })).data;
  await api.registerPushToken(token, Platform.OS);   // POST /api/push/token
}
```
- `api.js`-ə `registerPushToken` və `unregisterPushToken` əlavə edilməlidir.
- Bildiriş bağlandıqda `DELETE /api/push/token`.
- Parametrlərdə icazə düyməsi artıq var (`requestPermission`), sadəcə yuxarıdakı qeydə bağlanır.

### Addım 7 — Environment

`server/.env`-ə:
```
EXPO_PUSH_TOKEN=<expo.dev hesabından alınır>
```
Bu token **gizlidir**, heç vaxt repoya commit edilmir.

### Addım 8 — Yoxlama

1. Telefonda app bağlı ikən problem aç → bildiriş gəlməlidir.
2. Bildirişə toxunmaqla app açılmalı, düzgün ekrana (Problemlər) getməlidir.
3. Token etibarsız olduqda loglarda xəbərdarlıq çıxmalı, token avtomatik deaktivləşməlidir.
4. Bildirişlər aç/bağla açarı push-u da dayandırmalıdır (token deaktiv + local filter).

---

## 5. Veb üçün əlavə qeydlər

Vebdə push yoxdur — brauzerlər PWA + Service Worker istifadə edir:

- `client/public/sw.js` — service worker, `push` və `notificationclick` event-ləri
- `client/src/...` — `navigator.serviceWorker.register('/sw.js')` və
  `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
- VAPID açarı lazımdır (`web-push` paketi + açarların yaradılması)
- Push yalnız HTTPS-də işləyir (`localhost` istisna)

**Cari vəziyyədə veb üçün bu lazım deyil**: tətbiq açıq olanda WebSocket kifayətdir.
Yalnız "brauzer bağlıyken" bildiriş lazımdırsa PWA yolu görülməlidir.

---

## 6. Test komandaları (server işləyərkən)

```bash
cd server
node test-auth.js          # rol qaydaları
node test-helpdesk.js      # helpdesk məlumat gizlətmə
node test-live.js          # WebSocket canlılığı
node test-notify-text.js   # bildiriş mətnləri
```

Push əlavə olunduqdan sonra yeni test: `test-push.js` (token qeydi + mock göndərmə).