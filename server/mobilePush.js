// Mobil push (Expo push — pulsuz)
// expo-server-sdk ESM moduludur, serverımız CommonJS-dir -> dinamik import() lazımdır.
const MobilePush = require('./models/MobilePush');

let expoPromise = null;

// Lazım olanda yüklənir (server qalxanda xəta vermir)
async function getExpo() {
  if (!process.env.EXPO_PUSH_TOKEN) return null;
  if (!expoPromise) {
    expoPromise = import('expo-server-sdk')
      .then(({ Expo }) => new Expo(process.env.EXPO_PUSH_TOKEN))
      .catch((e) => {
        console.warn('expo-server-sdk yüklənmədi (push söndürülüb):', e.message);
        return null;
      });
  }
  return expoPromise;
}

function isConfigured() {
  return Boolean(process.env.EXPO_PUSH_TOKEN);
}

// Dəyişən istifadəçiyə göndərilmir
async function sendToEveryone(payload, excludeUserId) {
  const expo = await getExpo();
  if (!expo) return;

  const subs = await MobilePush.find({ active: true });
  const targets = subs.filter((s) => String(s.user) !== String(excludeUserId || ''));
  if (!targets.length) return;

  const messages = targets.map((s) => ({
    to: s.token,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
  }));

  // Gönderilməsi lazım olan tokenlara uyğun receipt yoxlaması
  let sentTokens = targets.map(() => null);

  for (const chunk of expo.chunkPushNotifications(messages)) {
    const startIdx = sentTokens.findIndex((t, i) => t === null);
    const ticket = await expo.sendPushNotificationsAsync(chunk);

    (ticket.data || []).forEach((r, i) => {
      const idx = startIdx + i;
      sentTokens[idx] = r.id || null;

      // Token artıq qeydi deyil (cihaz silinib / tətbiq uninstall)
      if (
        r.status === 'error' &&
        /DeviceNotRegistered|not a valid/i.test(r.message || r.details?.error || '')
      ) {
        sentTokens[idx] = null;
        MobilePush.updateOne({ token: targets[idx].token }, { active: false }).catch(() => {});
      }
    });
  }

  // Receipt yoxlaması (bir neçə dəqiqə sonra)
  const pairs = [];
  sentTokens.forEach((id, i) => id && pairs.push({ id, token: targets[i].token }));
  if (pairs.length) {
    setTimeout(async () => {
      try {
        const receipts = await expo.getPushNotificationReceiptsAsync(pairs.map((p) => p.id));
        for (const p of pairs) {
          const r = receipts[p.id];
          if (r && r.status === 'error' && /DeviceNotRegistered/i.test(r.message || '')) {
            MobilePush.updateOne({ token: p.token }, { active: false }).catch(() => {});
          }
        }
      } catch {
        /* receipt alınmasa da problem deyil */
      }
    }, 15 * 60 * 1000).unref?.();
  }
}

module.exports = { sendToEveryone, isConfigured };