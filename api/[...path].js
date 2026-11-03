// Vercel serverless funksiya — bütün sorğular (statik + /api/*) buraya gəlir.
//
// Problem: Vercel-də hər funksiya "soğuq" başlaya bilər; MongoDB bağlantısı
// qurulmamış sorğu mongoose-in 10 saniyəlik buffering timeout'una düşürdü.
// Burada bağlantı gözlənilir, vaxt aşımı isə dərhal JSON xəta qaytarır.
const mongoose = require('mongoose');

// server/index.js require edilməzdən əvvəl tənzimlənir
mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', 4000);
mongoose.set('strictQuery', true);

const app = require('../server/index.js');

let ready = null;

function ensureDb() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!ready) {
    ready = mongoose
      .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 3,
      })
      .then(() => {
        // connect() bəzən "connecting" vəziyyətində qaytarır — real bağlantını gözlə
        if (mongoose.connection.readyState !== 1) return mongoose.connection.asPromise();
        return mongoose.connection;
      })
      .catch((e) => {
        ready = null;
        throw e;
      });
  }
  return ready;
}

module.exports = async (req, res) => {
  try {
    // Həm connect() həm də real bağlantı yoxlanılır (Vercel 10 saniyə limiti)
    await Promise.race([
      ensureDb(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('DB bağlantısı zaman aşımına uğradı')), 7000)),
    ]);
  } catch (e) {
    const msg = String(e.message || '');
    const blocked = /whitelist|not authorized|IP address|ECONNREFUSED|server selection|bağlantı/i.test(msg);
    // Express-ə çatmadan əvvəl cavab veririk — res hələ sadə Node response-dur
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.end(
      JSON.stringify({
        error: blocked
          ? 'MongoDB bağlantısı bloklanıb: Atlas > Network Access > "Allow access from anywhere" (0.0.0.0/0)'
          : 'Verilənlər bazası əlçatan deyil',
        detail: msg.slice(0, 160),
      })
    );
  }
  return app(req, res);
};