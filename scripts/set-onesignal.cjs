// OneSignal App ID və açarını bütün fayllara yazır
const fs = require('fs');
const path = require('path');

const APP_ID = '706fdc45-ae83-4fcd-bef0-fd00f6dca0a6';
const REST_KEY = 'os_v2_app_obx5yrnoqnh43pxq7uapnxfau3jr5hltth4eubnzq6laa3ev4w2s7u4xe7dh2tkr7mv37frnevvoyl2nwelwdrha53ot6uqodfun6ty';

const root = path.join(__dirname, '..');

function setEnvVar(file, key, value) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return console.log('yoxdur:', file);
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  let found = false;
  const out = lines.map((l) => {
    if (l.trim().startsWith(key + '=')) {
      found = true;
      return key + '=' + value;
    }
    return l;
  });
  if (!found) out.push(key + '=' + value);
  fs.writeFileSync(p, out.join('\n'), 'utf8');
  console.log('yenilendi:', file, '->', key);
}

function patchJson(file, mutate) {
  const p = path.join(root, file);
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  mutate(json);
  fs.writeFileSync(p, JSON.stringify(json, null, 2), 'utf8');
  console.log('yenilendi:', file);
}

setEnvVar('server/.env', 'ONESIGNAL_APP_ID', APP_ID);
setEnvVar('server/.env', 'ONESIGNAL_REST_KEY', REST_KEY);
setEnvVar('client/.env', 'VITE_ONESIGNAL_APP_ID', APP_ID);

patchJson('mobile/app.json', (j) => {
  const ex = j.expo.extra || (j.expo.extra = {});
  ex.onesignal = { appId: APP_ID, oneSignalAuthKey: REST_KEY };
});

// client/src/oneSignal.js — ehtiyat dəyər
const sw = path.join(root, 'client', 'src', 'oneSignal.js');
let src = fs.readFileSync(sw, 'utf8');
src = src.replace(/4414c1df-0437-4050-bfba-449d4d570dfe/g, APP_ID);
fs.writeFileSync(sw, src, 'utf8');
console.log('yenilendi: client/src/oneSignal.js');

// Service worker (köhnə Firebase SW artıq lazım deyil, amma OneSignal SW lazımdır)
const osw = path.join(root, 'client', 'public', 'OneSignalSDKWorker.js');
if (fs.existsSync(osw)) console.log('OneSignalSW mövcuddur');

console.log('\nApp ID:', APP_ID);
console.log('REST key:', REST_KEY.slice(0, 30) + '…');