// FCM service account JSON-unu Vercel env-ə yazır (PS çağırışında pozulmasın deyə node ilə)
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const vercel = path.join(process.env.APPDATA, 'npm', 'vercel.cmd');
const value = fs.readFileSync(path.join(__dirname, 'fcm-service-account.txt'), 'utf8').trim();

const args = [
  'env', 'add', 'FCM_SERVICE_ACCOUNT', 'production',
  '--value', value, '--yes', '--force',
];

console.log('Göndərilən uzunluq:', value.length);
const res = spawnSync(vercel, args, { cwd: root, stdio: 'inherit', shell: true });
process.exit(res.status || 0);