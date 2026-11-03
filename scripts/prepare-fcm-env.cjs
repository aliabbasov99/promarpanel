// Firebase service account JSON-unu TEK sətirlə compact hala salır
// (Vercel env dəyişənində çoxsətirli JSON pozulur)
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'server', 'firebase-service-account.json');
const json = JSON.parse(fs.readFileSync(src, 'utf8'));
const compact = JSON.stringify(json);

fs.writeFileSync(path.join(__dirname, 'fcm-service-account.txt'), compact, 'utf8');
console.log('Uzunluq:', compact.length, 'simvol');
console.log('private_key düzgün:', compact.includes('\\nBEGIN PRIVATE KEY'));
console.log('Yazıldı: scripts/fcm-service-account.txt');