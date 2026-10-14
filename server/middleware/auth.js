const jwt = require('jsonwebtoken');
const User = require('../models/User');

const SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '3650d'; // ~10 il — uzun müddətli sessiya

function sign(user) {
  return jwt.sign({ uid: user._id.toString(), role: user.role }, SECRET, { expiresIn: TOKEN_TTL });
}

// Bütün qorunan marşrutlar üçün: Authorization: Bearer <token>
async function auth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Daxil olmaq lazımdır' });

  try {
    const payload = jwt.verify(token, SECRET);
    const user = await User.findById(payload.uid);
    if (!user || !user.active) return res.status(401).json({ error: 'İstifadəçi tapılmadı və ya deaktivdir' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Sessiya bitib, yenidən daxil olun' });
  }
}

// Yalnız admin (rol yoxlaması)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Bu əməliyyat üçün icazəniz yoxdur' });
    }
    next();
  };
}

module.exports = { auth, requireRole, sign };