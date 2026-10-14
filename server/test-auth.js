// Login və rol testi
const URL = 'http://localhost:5000';
const call = (path, opts = {}) =>
  fetch(URL + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } })
    .then(async (r) => ({ code: r.status, body: await r.json().catch(() => null) }));

(async () => {
  const out = [];

  // 1) Girişsiz sorğu
  out.push(['girişsiz /api/stores', (await call('/api/stores')).code, 401]);

  // 2) Səhv parol
  out.push(['səhv parol', (await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'wrong' }) })).code, 401]);

  // 3) Admin login
  const admin = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin' }) });
  out.push(['admin login', admin.code, 200]);

  // 4) Helpdesk login
  const hd = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'helpdesk', password: 'helpdesk' }) });
  out.push(['helpdesk login', hd.code, 200]);

  const aH = { Authorization: 'Bearer ' + admin.body.token };
  const hH = { Authorization: 'Bearer ' + hd.body.token };

  // 5) Token yoxluğu
  out.push(['token-siz /api/auth/me', (await call('/api/auth/me')).code, 401]);
  out.push(['admin /api/auth/me', (await call('/api/auth/me', { headers: aH })).code, 200]);
  out.push(['helpdesk /api/auth/me', (await call('/api/auth/me', { headers: hH })).code, 200]);

  const stores = await call('/api/stores/options', { headers: hH });
  out.push(['helpdesk mağaza dropdown görür', stores.code, 200]);

  const storeId = stores.body[0]._id;
  // 6) Helpdesk ödəniş yaza bilməz
  const hdPay = await call('/api/payments', { method: 'POST', headers: hH, body: JSON.stringify({ storeId, month: '2026-10' }) });
  out.push(['helpdesk ödəniş YAZA bilməz', hdPay.code, 403]);

  // 7) Helpdesk mağaza siyahısına və əlavəyə görə bilməz
  const hdList = await call('/api/stores', { headers: hH });
  out.push(['helpdesk mağaza SİYAHISI görə bilməz', hdList.code, 403]);
  const hdStore = await call('/api/stores', { method: 'POST', headers: hH, body: JSON.stringify({ name: 'Test mağaza' }) });
  out.push(['helpdesk mağaza ƏLAVƏ EDƏ bilməz', hdStore.code, 403]);

  // 8) Helpdesk problem qeyd edə bilər (bu ona görə icazəlidir)
  const hdIssue = await call('/api/issues', { method: 'POST', headers: hH, body: JSON.stringify({ storeId, title: 'Helpdesk testi' }) });
  out.push(['helpdesk problem AÇA bilər', hdIssue.code, 201]);
  if (hdIssue.code === 201) {
    await call('/api/issues/' + hdIssue.body._id, { method: 'DELETE', headers: hH });
  }

  // 9) Helpdesk helpdesk hesabı yarada bilməz
  const hdUser = await call('/api/users', { method: 'POST', headers: hH, body: JSON.stringify({ username: 'x', password: 'x' }) });
  out.push(['helpdesk istifadəçi YARADA bilməz', hdUser.code, 403]);

  // 10) Admin parol dəyişmə (test: eyni parolu qoy)
  const ch = await call('/api/auth/password', { method: 'POST', headers: aH, body: JSON.stringify({ currentPassword: 'admin', newPassword: 'admin' }) });
  out.push(['admin parol dəyişmə', ch.code, 200]);

  // 11) Yanlış cari parol
  const ch2 = await call('/api/auth/password', { method: 'POST', headers: aH, body: JSON.stringify({ currentPassword: 'bad', newPassword: 'x123' }) });
  out.push(['yanlış cari parol', ch2.code, 401]);

  let ok = true;
  for (const [name, got, want] of out) {
    const pass = got === want;
    if (!pass) ok = false;
    console.log(`${pass ? '✔' : '✘'} ${name}: ${got} (gözlənilən ${want})`);
  }
  console.log(ok ? '\nNƏTICƏ: HAMISI UYGUN' : '\nNƏTİCƏ: XƏTA VAR');
  process.exit(ok ? 0 : 1);
})();