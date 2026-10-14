// client/dist -> server/public kopyalayır (Vercel-də yalnız server/ deploy olunur)
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'client', 'dist');
const dest = path.join(__dirname, '..', 'server', 'public');

if (!fs.existsSync(src)) {
  console.error('client/dist yoxdur — əvvəlcə "npm run build --prefix client" icra edin');
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('Hazır: server/public (' + fs.readdirSync(dest).length + ' fayl)');