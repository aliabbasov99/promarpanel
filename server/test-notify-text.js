// Bildiriş mətnlərini yoxla
const { io } = require('socket.io-client');
const URL = 'http://localhost:5000';

const B = io(URL, { path: '/socket.io', auth: { clientId: 'tester-B' }, transports: ['websocket'] });
const got = [];
B.on('issue:created', (d) => got.push({ tip: 'created', by: d.by, title: d.title, msg: d.message }));
B.on('issue:status', (d) => got.push({ tip: 'status', by: d.by, title: d.title, msg: d.message }));

const h = {
  'Content-Type': 'application/json',
  'x-client-id': 'tester-A',
  'x-user-name': encodeURIComponent('Namelum'),
};
const j = (p, o) => fetch(URL + p, o).then((r) => r.json());

(async () => {
  await new Promise((r) => setTimeout(r, 1200));
  const token = (await fetch(URL + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  }).then((r) => r.json())).token;
  h.Authorization = 'Bearer ' + token;

  const stores = await j('/api/stores', { headers: h });
  const storeId = stores[0]._id;

  const issue = await j('/api/issues', {
    method: 'POST', headers: h,
    body: JSON.stringify({ storeId, title: 'Namelum-printer islmemir', priority: 'high' }),
  });
  await j('/api/issues/' + issue._id, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'in_progress' }) });
  await j('/api/issues/' + issue._id, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'resolved' }) });
  await j('/api/issues/' + issue._id, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'open' }) });
  await j('/api/issues/' + issue._id, { method: 'DELETE', headers: h });

  await new Promise((r) => setTimeout(r, 700));
  B.close();

  const fmt = (g) => {
    if (g.tip === 'created') return `${g.by} - "${g.title}"\n      Yeni problem · ${stores[0].name}`;
    if (g.tip === 'deleted') return `${g.by} - "${g.title}"\n      Problem silindi`;
    return `${g.by} - "${g.title}" tərəfindən ${g.msg}`;
  };
  got.forEach((g) => console.log('•', fmt(g)));
  process.exit(0);
})();