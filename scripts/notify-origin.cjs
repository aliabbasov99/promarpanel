const fs = require('fs');
const path = require('path');

// Hadisəni göndərən istifadəçiyə də bildiriş getsin (SİZİN istəyiniz)
const p = path.join(__dirname, '..', 'server', 'index.js');
let src = fs.readFileSync(p, 'utf8');

// broadcast() daxilində bütün originUserId argumentlarını null ilə əvəz edir
const before = src;

// 1) Şərh dəyiş
src = src.replace(
  '// Hadisəni dəyişən istifadəçiyə GÖNDƏRMİR, qalan bütün istifadəçilərə göndərir',
  '// Hadisəni BÜTÜN istifadəçilərə göndərir — o cümlədən dəyişən özü də bildiriş alır'
);

// 2) push/oneSignal/telegram/expo çağırışlarında exclude = null
src = src.replace(/push\.sendToEveryone\(\{ event, \.\.\.payload \}, originUserId\)/, 'push.sendToEveryone({ event, ...payload }, null)');
src = src.replace(/(\n        url: '\/',)\n      \},\n      originUserId\n    \)/g, "$1\n      },\n      null\n    )");
src = src.replace(/(\n        event,\n      \},\n      )originUserId\n    \)/g, "$1null\n    )");

fs.writeFileSync(p, src, 'utf8');
console.log(src === before ? 'Dəyişiklik olmadı!' : 'Yeniləndi');
console.log('qalan originUserId istinadları:', (src.match(/originUserId/g) || []).length);