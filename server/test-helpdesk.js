// Helpdesk-in görməməliyi: məbləğ/qiymət/cədvə olmamalıdır
const URL = 'http://localhost:5000';
const call = (path, token, opts = {}) =>
  fetch(URL + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opts.headers || {}),
    },
  }).then(async (r) => ({ code: r.status, body: await r.json().catch(() => null) }));

(async () => {
  const admin = (await call('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin' }) })).body;
  const hd = (await call('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ username: 'helpdesk', password: 'helpdesk' }) })).body;
  const aT = admin.token, hT = hd.token;

  const hPay = (await call('/api/payments', hT)).body;
  const aPay = (await call('/api/payments', aT)).body;
  const hPayOld = (await call('/api/payments?month=2020-01', hT)).body;

  const hStoresRaw = await call('/api/stores', hT);
  const aStores = (await call('/api/stores', aT)).body;
  const hOptions = (await call('/api/stores/options', hT)).body;

  const storeId = aStores[0]._id;
  const hGrid = await call(`/api/stores/${storeId}/payments`, hT);
  const aGrid = await call(`/api/stores/${storeId}/payments`, aT);

  const hStats = (await call('/api/stats', hT)).body;
  const aStats = (await call('/api/stats', aT)).body;

  const checks = [
    ['helpdesk ödəniş sətirində qiymət YOXDUR', hPay.rows.every(r => r.price === undefined)],
    ['helpdesk ödəniş sətirində payment YOXDUR', hPay.rows.every(r => r.payment === undefined)],
    ['helpdesk statusu GÖRÜR', hPay.rows.every(r => ['paid','pending','overdue'].includes(r.status))],
    ['helpdesk yalnız CARİ ayı görür', hPay.month === new Date().toISOString().slice(0,7)],
    ['helpdesk başqa ay tələb edə bilmir', hPayOld.month === hPay.month],
    ['admin qiyməti GÖRÜR', aPay.rows.some(r => r.price !== undefined)],
    ['helpdesk mağaza SİYAHISINA GİRƏ BİLMİR (403)', hStoresRaw.code === 403],
    ['admin mağaza siyahısını görür', aStores.length > 0],
    ['helpdesk dropdown (ad+id) görür', Array.isArray(hOptions) && hOptions.length > 0 && Object.keys(hOptions[0]).join() === '_id,name'],
    ['helpdesk ödəniş cədvəlinə GİRƏ BİLMİR (403)', hGrid.code === 403],
    ['admin ödəniş cədvəlinə GİRƏ BİLƏR', aGrid.code === 200],
    ['helpdesk statistikada məbləğ YOXDUR', hStats.collected === undefined && hStats.expected === undefined],
    ['admin statistikada məbləğ VAR', aStats.collected !== undefined],
  ];

  let ok = true;
  for (const [name, pass] of checks) {
    if (!pass) ok = false;
    console.log(`${pass ? '✔' : '✘'} ${name}`);
  }
  console.log('\nNümunə helpdesk sətiri:', JSON.stringify(hPay.rows[0]));
  console.log(ok ? '\nNƏTİCƏ: HAMISI UYGUN' : '\nNƏTİCƏ: XƏTA VAR');
  process.exit(ok ? 0 : 1);
})();