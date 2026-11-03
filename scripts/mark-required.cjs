// Məcburi xanaları işarələyir: <Field label="X *" required> — ulduz qırmızı
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'mobile', 'src', 'screens');
const files = ['Stores.jsx', 'Issues.jsx', 'Login.jsx', 'StoreDetail.jsx'];

// Məcburi olanlar (məntiq: server tərəfdə məcburi olanlar)
const required = {
  'Stores.jsx': ['Magaza adi *'],
  'Issues.jsx': ['Magaza *', 'Problem *'],
  'Login.jsx': ['Istifadəçi adı', 'Parol'],
  'StoreDetail.jsx': ['Qiymət (o ay üçün)', 'Qiymət (AZN)'],
};

let total = 0;
for (const f of files) {
  const p = path.join(root, f);
  let src = fs.readFileSync(p, 'utf8');
  let n = 0;

  for (const label of required[f] || []) {
    // "Magaza adi *" -> "Magaza adi *" + required  (artıq ulduzlu olanlar)
    const patterns = [
      new RegExp(`<Field label="${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`, 'g'),
      new RegExp(`(<Field label="${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}")(\\s*/>)`, 'g'),
    ];

    // 1) artıq "*" olanlar: required əlavə et
    src = src.replace(
      new RegExp(`<Field label="${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`, 'g'),
      `<Field label="${label}" required>`
    );

    // 2) ulduzusuz olanlar: ulduz + required
    if (label.indexOf('*') === -1) {
      src = src.replace(
        new RegExp(`<Field label="${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`, 'g'),
        `<Field label="${label} *" required>`
      );
    }
    n += 1;
  }

  fs.writeFileSync(p, src, 'utf8');
  console.log(`${f}: ${n} məcburi xana işarələndi`);
  total += n;
}
console.log('Cəmi:', total);