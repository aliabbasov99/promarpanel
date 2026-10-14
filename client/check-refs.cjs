// Teyin edilməmiş identifikatorları aşkarlayır (JSX komponentləri və hook-lar)
const fs = require('fs');
const path = require('path');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.jsx?$/.test(e.name) ? [p] : [];
  });
}

const files = walk(path.join(__dirname, 'src'));
const problems = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const defined = new Set();

  // import { a, b } from '...'  /  import X from '...'
  const importRe = /import\s+([^;]+?)\s+from\s+['"][^'"]+['"]/g;
  for (const m of src.matchAll(importRe)) {
    const clause = m[1];
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      braces[1].split(',').forEach((n) => {
        const name = n.trim().split(/\s+as\s+/).pop().trim();
        if (name) defined.add(name);
      });
    }
    const def = clause.trim().match(/^([A-Za-z_$][\w$]*)/);
    if (def) defined.add(def[1]);
  }

  const add = (re) => { for (const m of src.matchAll(re)) defined.add(m[1]); };
  add(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g);
  add(/(?:function|class)\s+([A-Za-z_$][\w$]*)/g);
  add(/export\s+(?:const|function|default\s+function)\s+([A-Za-z_$][\w$]*)/g);
  add(/\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    m[1].split(',').forEach((n) => { const x = n.trim(); if (x) defined.add(x); });
  }

  // istifadə olunanlar
  const used = new Set();
  for (const m of src.matchAll(/<\/?([A-Z][\w.]*)/g)) used.add(m[1].split('.')[0]);
  for (const m of src.matchAll(/\buse[A-Z]\w*/g)) used.add(m[0]);

  for (const u of used) {
    if (u === 'React') continue;
    if (!defined.has(u)) problems.push(`${path.relative(__dirname, file)} -> ${u}`);
  }
}

if (problems.length) {
  console.log('Təyin edilməmiş:');
  problems.forEach((p) => console.log('  ' + p));
  process.exit(1);
} else {
  console.log('Teyin edilməmiş identifikator yoxdur ✔');
}