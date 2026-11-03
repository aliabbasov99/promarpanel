// OneSignal bildirişləri (server tərəfdə göndərmə)
//
// Konfiqurasiya (mühit dəyişənləri):
//   ONESIGNAL_APP_ID  = 4414c1df-0437-4050-bfba-449d4d570dfe
//   ONESIGNAL_REST_KEY = <Settings > API Keys > REST API key>
//
// Hər istifadəçi OneSignal "External ID" = Mongo user id ilə qeyd olunur.
// Beləliklə bildirişi göndərən istifadəçi özü almır (alias filter ilə).
const MobilePush = require('./models/MobilePush');

const API = 'https://api.onesignal.com';

function isConfigured() {
  return Boolean(process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_REST_KEY);
}

function authHeader() {
  // OneSignal rəsmi sxemi: Authorization: Key <API_KEY>
  const key = process.env.ONESIGNAL_REST_KEY || '';
  return 'Key ' + key;
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(
      'OneSignal ' + res.status + ': ' + (data?.errors?.join(', ') || text.slice(0, 160))
    );
  }
  return data;
}

/**
 * Cihazı (player) qeyd et və External ID ilə bağla
 * @param {string} playerId  OneSignal player/subscription id
 * @param {string} externalId  server user id (Mongo ObjectId)
 * @param {string} platform  android | ios | web
 */
async function upsertPlayer(playerId, externalId, platform) {
  if (!playerId) return;
  try {
    await api('/players', {
      method: 'POST',
      body: JSON.stringify({
        app_id: process.env.ONESIGNAL_APP_ID,
        id: playerId,
        external_id: String(externalId),
        device_type: platform === 'ios' ? 5 : platform === 'web' ? 8 : 3, // IOS=5 WEB=8 ANDROID=3
        language: 'az',
        // Bildirişlərə icazə verilənlər arasında olsun
        notification_subscription: { id: playerId },
        last_active: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn('OneSignal player xətası:', e.message);
  }

  // Token bazada saxlayılır (təkrar qeyd üçün)
  await MobilePush.findOneAndUpdate(
    { token: playerId },
    { token: playerId, platform: platform || 'android', user: externalId, active: true },
    { new: true, upsert: true }
  );
}

/**
 * Bütün cihazlara göndər (mənsub istifadəçiyə göndərilmir)
 * @param {{title:string, body:string, event?:string, url?:string}} payload
 * @param {string} excludeUserId
 */
async function sendToEveryone(payload, excludeUserId) {
  if (!isConfigured()) return;

  const body = {
    app_id: process.env.ONESIGNAL_APP_ID,
    headings: { az: payload.title || 'PROMAR Helpdesk', en: payload.title || 'PROMAR Helpdesk' },
    contents: { az: payload.body || '', en: payload.body || '' },
    // Göndərən özü almasın
    filters: excludeUserId
      ? [{ field: 'external_id', relation: '!=', value: String(excludeUserId) }]
      : [],
    // Yaşlı/əvvəlki abunələr göndərilməsin
    send_after_first_open: false,
    include_aliases: {},
    data: { url: payload.url || '/', event: payload.event || '' },
    android_sound: 'default',
    priority: 10,
  };

  try {
    const res = await api('/notifications', { method: 'POST', body: JSON.stringify(body) });
    if (res.errors?.length) console.warn('OneSignal:', res.errors.join(', '));
    return res;
  } catch (e) {
    console.warn('OneSignal göndərmə xətası:', e.message);
  }
}

module.exports = { upsertPlayer, sendToEveryone, isConfigured };