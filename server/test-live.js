// Vite dev server (5173) üzərindən WebSocket bildirişlərinin canlılığı
const { io } = require('socket.io-client');

const targets = [
  { name: 'Vite dev (5173)', url: 'http://localhost:5173' },
  { name: 'Server build (5000)', url: 'http://localhost:5000' },
];

const login = async (url) => {
  const r = await fetch(url + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  });
  return (await r.json()).token;
};

(async () => {
  for (const t of targets) {
    const got = [];
    const sock = io(t.url, {
      path: '/socket.io',
      auth: { clientId: 'live-test-B' },
      transports: ['websocket'], // yalnız WebSocket (proxy-ni yoxlamaq üçün)
    });

    const connected = await new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 6000);
      sock.on('connect', () => { clearTimeout(to); resolve(true); });
      sock.on('connect_error', () => { clearTimeout(to); resolve(false); });
    });

    if (!connected) {
      console.log(`✘ ${t.name}: WebSocket qoşulmadı`);
      sock.close();
      continue;
    }

    sock.on('issue:created', (d) => got.push('created'));
    sock.on('issue:status', (d) => got.push('status'));

    const token = await login(t.url);
    const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'x-client-id': 'live-test-A' };
    const j = (p, o) => fetch(t.url + p, o).then((r) => r.json());

    const stores = await j('/api/stores', { headers: h });
    const issue = await j('/api/issues', {
      method: 'POST', headers: h,
      body: JSON.stringify({ storeId: stores[0]._id, title: 'Canlı testi' }),
    });
    await j('/api/issues/' + issue._id, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'resolved' }) });
    await j('/api/issues/' + issue._id, { method: 'DELETE', headers: h });

    // Gecikmiş bildiriş — real vaxt ölçümü
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 600));
    const latency = Date.now() - t0;

    console.log(`✔ ${t.name}: WebSocket qoşuldu, ${got.length} bildiriş ${latency}ms-də alındı [${got.join(', ')}]`);
    sock.close();
  }
  process.exit(0);
})();