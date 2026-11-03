const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'client', 'src', 'pages', 'Settings.jsx');
let src = fs.readFileSync(p, 'utf8');
const lines = src.split(/\r?\n/);

// 114-ci sətirdən (index 113) 197-ci sətirə qədər (index 196) Firebase+OneSignal blokunu təmizlə
const clean = [
  '  // ---- OneSignal bildirişi ----',
  '  const [osBusy, setOsBusy] = useState(false);',
  '  const [osOn, setOsOn] = useState(false);',
  '',
  '  const askOneSignal = async () => {',
  '    setOsBusy(true);',
  '    try {',
  '      const res = await initOneSignal();',
  '      if (res.ok) {',
  '        setOsOn(true);',
  '      } else {',
  '        setOsOn(false);',
  "        alert(",
  "          res.reason === 'denied'",
  "            ? 'Bildiriş icazəsi rədd edildi — brauzer ayarlarından açın.'",
  "            : 'Bildiriş yandırıla bilmədi: ' + res.reason",
  '        );',
  '      }',
  '    } finally {',
  '      setOsBusy(false);',
  '    }',
  '  };',
  '',
];

const out = [...lines.slice(0, 113), ...clean, ...lines.slice(197)];
let result = out.join('\n');

// Firebase import-unu sil
result = result.replace(/import \{ enableFirebasePush, disableFirebasePush, firebaseEnabled \} from '\.\.\/firebasePush';\n/, '');

fs.writeFileSync(p, result, 'utf8');
console.log('Settings.jsx təmizləndi');

// Qalan Firebase istinadlarını yoxla
const left = result.split(/\r?\n/).filter((l) => /fcm|Firebase/i.test(l));
console.log(left.length ? 'Qalan: ' + left.join(' | ') : 'Firebase qalığı yoxdur ✅');