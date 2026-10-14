// Mobil push göndərmə (Expo push — pulsuz)
// Tətbiq tam bağlı olanda da bildiriş gələcək.
const { Expo } = require('expo-server-sdk');
const MobilePush = require('./models/MobilePush');

const expo = process.env.EXPO_PUSH_TOKEN ? new Expo(process.env.EXPO_PUSH_TOKEN) : null;

function isConfigured() {
  return Boolean(expo);
}

// Dəyişən istifadəçiyə göndərilmir
async function sendToEveryone(payload, excludeUserId) {
  if (!expo) return;

  const subs = await MobilePush.find({ active: true });
  const targets = subs.filter((s) => String(s.user) !== String(excludeUserId || ''));
  if (!targets.length) return;

  const chunks = expo.chunkPushNotifications(
    targets.map((s) => ({
      to: s.token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
    }))
  );

  for (const chunk of chunks) {
    const ticket = await expo.sendPushNotificationsAsync(chunk);

    // Token etibarsızdırsa (DeviceNotRegistered) söndür
    (ticket.data || []).forEach((r, i) => {
      if (
        r.status === 'error' &&
        /DeviceNotRegistered|not registered/i.test(r.message || r.details?.error || '')
      ) {
        MobilePush.updateOne({ token: targets[i].token }, { active: false }).catch(() => {});
      }
    });

    // Receipt yoxlaması (2-ci dəfə göndərmə xətası = token ölü)
    const ids = (ticket.data || []).map((r) => r.id).filter(Boolean);
    if (ids.length) {
      setTimeout(async () => {
        try {
          const receipts = await expo.getPushNotificationReceiptsAsync(ids);
          ids.forEach((id, i) => {
            const r = receipts[id];
            if (r && r.status === 'error' && /DeviceNotRegistered/i.test(r.message || '')) {
              MobilePush.updateOne({ token: targets[i].token }, { active: false }).catch(() => {});
            }
          });
        } catch {
          /* receipt alınmasa da problem deyil */
        }
      }, 15 * 60 * 1000);
    }
  }
}

module.exports = { sendToEveryone, isConfigured };