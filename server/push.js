// Web push göndərmə (brauzer bağlı olanda da bildiriş gəlsin)
const webpush = require('web-push');
const WebPush = require('./models/WebPush');

const PUBLIC_KEY = process.env.WEB_PUSH_PUBLIC_KEY;
const PRIVATE_KEY = process.env.WEB_PUSH_PRIVATE_KEY;

if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:admin@promar.az', PUBLIC_KEY, PRIVATE_KEY);
}

function isConfigured() {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

// Yalnız "dəyişən istifadəçiyə" push göndərilmir
async function sendToEveryone(payload, excludeUserId) {
  if (!isConfigured()) return;

  const subs = await WebPush.find({ active: true });
  if (!subs.length) return;

  const targets = subs.filter((s) => String(s.user) !== String(excludeUserId || ''));
  if (!targets.length) return;

  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    targets.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 60 * 60 * 24 })
    )
  );

  // Token etibarsız olduqda abunəni söndür (410/404)
  results.forEach((r, i) => {
    const status = r.status === 'fulfilled' ? r.value.statusCode : 0;
    if (status === 404 || status === 410) {
      WebPush.updateOne({ _id: targets[i]._id }, { active: false }).catch(() => {});
    }
  });
}

module.exports = { sendToEveryone, isConfigured, PUBLIC_KEY };