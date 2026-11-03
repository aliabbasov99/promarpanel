// Telegram bildirişləri — HESABA BAĞLI
//
// Hər istifadəçi öz Telegram hesabını (chat id) panel hesabına bağlayır.
// Bağlantı MongoDB-də saxlanılır (serverless mühitdə yaddaş yoxdur).
//
// İş axını:
//   1) Parametrlərdə "Telegram-ı qoş" → server qısa kod (code) yaradır
//   2) Deep link: https://t.me/<bot>?start=<code>
//   3) İstifadəçi Telegram-da "Start" basır → webhook /start gəlir (code ilə)
//   4) Server chat id-ni həmin istifadəçiyə bağlayır
//   5) Hadisələr həmin chat-ə göndərilir
const Setting = require('./models/Setting');

const KEY_LINKS = 'telegram_links'; // { chatId: userId }
const KEY_CODES = 'telegram_codes'; // { code: { userId, ts } }
const CODE_TTL = 30 * 60 * 1000; // 30 dəqiqə

function isConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

function botUsername() {
  return process.env.TELEGRAM_BOT_USERNAME || 'promarpanelbot';
}

async function getSetting(key, fallback) {
  try {
    const row = await Setting.findOne({ key }).lean();
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

async function setSetting(key, value) {
  await Setting.findOneAndUpdate({ key }, { key, value }, { new: true, upsert: true });
  return value;
}

// --- Bağlantılar ---
async function getLinks() {
  const v = await getSetting(KEY_LINKS, {});
  return v && typeof v === 'object' ? v : {};
}

// Bu istifadəçinin Telegram chat id-si (yoxdursa null)
async function getChatForUser(userId) {
  const links = await getLinks();
  const entry = Object.entries(links).find(([, uid]) => String(uid) === String(userId));
  return entry ? entry[0] : null;
}

// Bu chat hansı istifadəçiyə bağlı?
async function getUserForChat(chatId) {
  const links = await getLinks();
  return links[String(chatId)] || null;
}

async function link(chatId, userId) {
  const links = await getLinks();
  // əvvəlki bağlantını təmizlə (tək chat → tək istifadəçi)
  for (const [chat, uid] of Object.entries(links)) {
    if (String(uid) === String(userId)) delete links[chat];
  }
  // bu chat əvvəl başqasına bağlıdırsa, onu da sil
  for (const [chat, uid] of Object.entries(links)) {
    if (chat === String(chatId)) delete links[chat];
  }
  links[String(chatId)] = String(userId);
  await setSetting(KEY_LINKS, links);
  return links;
}

async function unlinkUser(userId) {
  const links = await getLinks();
  for (const [chat, uid] of Object.entries(links)) {
    if (String(uid) === String(userId)) delete links[chat];
  }
  await setSetting(KEY_LINKS, links);
  return links;
}

// --- Bağlantı kodu ---
async function createCode(userId) {
  const codes = await getSetting(KEY_CODES, {});
  const now = Date.now();
  // köhnə kodları təmizlə
  for (const [c, v] of Object.entries(codes)) {
    if (now - (v.ts || 0) > CODE_TTL) delete codes[c];
  }
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  codes[code] = { userId: String(userId), ts: now };
  await setSetting(KEY_CODES, codes);
  return code;
}

async function useCode(code) {
  const codes = await getSetting(KEY_CODES, {});
  const entry = codes[String(code || '').toUpperCase()];
  if (!entry) return null;
  if (Date.now() - (entry.ts || 0) > CODE_TTL) {
    delete codes[String(code).toUpperCase()];
    await setSetting(KEY_CODES, codes);
    return null;
  }
  delete codes[String(code).toUpperCase()];
  await setSetting(KEY_CODES, codes);
  return entry.userId;
}

// --- Göndərmə ---
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendToChat(chatId, text) {
  if (!isConfigured() || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      // bot tərəfindən bloklanıb və ya istifadəçi silinib
      if (res.status === 403) {
        const links = await getLinks();
        delete links[String(chatId)];
        await setSetting(KEY_LINKS, links);
      }
      console.warn('Telegram xətası:', data?.description || res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Telegram göndərmə xətası:', e.message);
    return false;
  }
}

// Hər istifadəçinin öz chat-ine göndər
async function sendToEveryone(payload) {
  if (!isConfigured()) return;

  const links = await getLinks();
  const chats = Object.keys(links);
  if (!chats.length) return;

  const SEP = '----------------------------------';
  const actor = payload.actor || 'PROMAR';
  const store = escapeHtml(payload.store || '');
  const title = escapeHtml(payload.title || '');

  let header;
  if (payload.event === 'issue:created') {
    header = '<b>Yeni problem əlavə edildi!</b>';
  } else if (payload.event === 'issue:status') {
    if (payload.resolved) header = '<b>Problem həll edildi!</b>';
    else if (payload.archived) header = '<b>Problem arxivləndi!</b>';
    else header = '<b>Problem işlənir!</b>';
  } else if (payload.event === 'issue:deleted') {
    header = '<b>Problem silindi!</b>';
  } else {
    header = `<b>${escapeHtml(payload.title || 'PROMAR Helpdesk')}</b>`;
  }

  const text = [
    header,
    `${store} - ${title}`,
    '',
    `<b>${escapeHtml(actor)}</b> tərəfindən.`,
    SEP,
  ].join('\n');

  for (const chatId of chats) {
    await sendToChat(chatId, text);
  }
}

// Tək istifadəçiyə (test üçün)
async function sendToUser(userId, text) {
  const chatId = await getChatForUser(userId);
  if (!chatId) return { ok: false, reason: 'Telegram bağlı deyil' };
  const ok = await sendToChat(chatId, text);
  return { ok, reason: ok ? null : 'Göndərmə xətası' };
}

module.exports = {
  isConfigured,
  botUsername,
  getLinks,
  getChatForUser,
  getUserForChat,
  link,
  unlinkUser,
  createCode,
  useCode,
  sendToChat,
  sendToUser,
  sendToEveryone,
};