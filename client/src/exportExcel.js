import * as XLSX from 'xlsx';
import { MONTHS_AZ } from './utils';

// Mağazanın bütün məlumatını .xlsx faylı kimi yükləyir (brauzerdə endirilir)
export function exportStoreExcel({ store, cells, rows, startMonth }) {
  const wb = XLSX.utils.book_new();

  // Yalnız xidmətin başlanğıcından sonrakı aylar (ilk ödəniş tarixindən)
  const from = startMonth || findStartMonth(cells);
  const list = (rows || cells).filter((c) => !from || c.month >= from);

  // ---------- 1. Ödəniş cədvəli ----------
  const header = ['Ay', 'Status', 'Ödənilmiş məbləğ (AZN)', 'Ödəniş tarixi'];
  const body = list.map((c) => [
    monthLabel(c.month),
    statusLabel(c.status),
    c.payment?.amount ?? '',
    c.payment?.paidAt ? formatDate(c.payment.paidAt) : '',
  ]);

  const sheet1 = XLSX.utils.aoa_to_sheet([
    [`PROMAR — ${store?.name || ''} — Aylıq ödəniş cədvəli`],
    ['Xidmətin başlanğıcı', monthLabel(from || '')],
    ['Tarix aralığı', `${monthLabel(list[0]?.month || '')} — ${monthLabel(list[list.length - 1]?.month || '')}`],
    ['Çıxış tarixi', formatDate(new Date())],
    [],
    header,
    ...body,
  ]);
  sheet1['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, sheet1, 'Ödəniş cədvəli');

  // ---------- 2. İl matrisi ----------
  const matrix = [['İl', ...MONTHS_AZ]];
  const byYear = {};
  for (const c of list) {
    const y = c.month.slice(0, 4);
    (byYear[y] ||= {})[Number(c.month.slice(5, 7))] = c.payment?.amount ?? c.price ?? '';
  }
  Object.keys(byYear).sort().reverse().forEach((y) => {
    matrix.push([y, ...Array.from({ length: 12 }, (_, i) => byYear[y][i + 1] ?? '')]);
  });
  const sheet2 = XLSX.utils.aoa_to_sheet(matrix);
  sheet2['!cols'] = [{ wch: 8 }, ...Array.from({ length: 12 }, () => ({ wch: 12 }))];
  XLSX.utils.book_append_sheet(wb, sheet2, 'Aylar matrisi');

  // ---------- 3. Qiymət tarixçəsi ----------
  const prices = [...(store?.prices || [])].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  const sheet3 = XLSX.utils.aoa_to_sheet([
    ['Qiymət (AZN)', 'Tətbiq ayı', 'Əlavə edilmə tarixi'],
    ...prices.map((p) => [p.amount, monthLabel(p.effectiveFrom), formatDate(p.createdAt)]),
  ]);
  sheet3['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, sheet3, 'Qiymət tarixçəsi');

  // ---------- 4. Əlaqə nömrələri ----------
  const contacts = Array.isArray(store?.contacts) ? store.contacts : [];
  const sheet4 = XLSX.utils.aoa_to_sheet([
    ['Məsul şəxs', 'Telefon', 'WhatsApp'],
    ...contacts.map((c) => [c.contactName || '', c.phone ? `+994 ${c.phone}` : '', c.phone ? `https://wa.me/994${c.phone}` : '']),
  ]);
  sheet4['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, sheet4, 'Əlaqə nömrələri');

  const name = (store?.name || 'magaza').replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'magaza';
  XLSX.writeFile(wb, `${name} - odenis-${today()}.xlsx`);
}

// ---------- köməkçilər ----------
// İlk ödənişin ayı = xidmətin başlanğıcı
function findStartMonth(cells) {
  const firstPaid = (cells || []).find((c) => c.payment);
  if (firstPaid) return firstPaid.month;
  const notNone = (cells || []).find((c) => c.status !== 'none');
  return notNone ? notNone.month : null;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthLabel(m) {
  if (!m) return '';
  const [y, mm] = m.split('-');
  return `${MONTHS_AZ[Number(mm) - 1]} ${y}`;
}

function statusLabel(s) {
  return { paid: 'Ödənilib', pending: 'Gözlənilir', overdue: 'Gecikdirilmiş', none: 'Xidmət başlamayıb' }[s] || '';
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
}