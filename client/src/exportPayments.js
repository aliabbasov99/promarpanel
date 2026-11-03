// Ödənişlər səhifəsi — Excel ixracı
// Sütunlar: MAGAZA ADI | QIYMƏT | STATUS
import * as XLSX from 'xlsx';
import { monthLabel, formatMoney } from './utils';

const STATUS_LABEL = {
  paid: 'Ödənilib',
  pending: 'Gözlənilir',
  overdue: 'Gecikdirilmiş',
};

/**
 * @param {Array} rows  api.getPayments() cavabının sətirləri
 * @param {string} month  YYYY-MM
 * @param {string} filter  seçilmiş status (all | paid | pending | overdue)
 */
export function exportPayments(rows, month, filter = 'all') {
  const list = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  const data = list.map((r) => ({
    'MAĞAZA ADI': r.store?.name || '—',
    'QIYMƏT': r.price || 0,
    STATUS: STATUS_LABEL[r.status] || r.status,
  }));

  const sheet = XLSX.utils.json_to_sheet(data, {
    header: ['MAĞAZA ADI', 'QIYMƏT', 'STATUS'],
  });

  // Sütun enləri
  sheet['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 16 }];

  // Qiymət sütunu ədədi formatda
  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let i = 1; i <= range.e.r; i++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: i, c: 1 })];
    if (cell && cell.t === 'n') cell.z = '#,##0.00';
  }

  const statusName =
    filter === 'all' ? 'butun-statuslar' : STATUS_LABEL[filter].toLowerCase();

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, `${monthLabel(month)}`);
  XLSX.writeFile(wb, `promar-odenisler-${month}-${statusName}.xlsx`);
}