// Hesabat ixracı — aylıq və ümumi (2022-dən)
// Sütunlar: MAĞAZA | BAŞLANGIÇ | GÖZLƏNİLƏN | TUTULAN | BORC | GECİKMİŞ AY |
//           ÖDƏNİLİB AY | GÖZLƏNİR AY
import * as XLSX from 'xlsx';
import { monthLabel, formatMoney } from './utils';

const STATUS_LABEL = {
  paid: 'Ödənilib',
  pending: 'Gözlənilir',
  overdue: 'Gecikdirilmiş',
};

/** Aylıq hesabat: seçilmiş ay üzrə */
export function exportMonthlyReport(data, month) {
  const rows = data.rows.map((s) => ({
    'MAĞAZA ADI': s.name,
    'BAŞLANGIÇ': monthLabel(s.startMonth),
    GÖZLƏNİLƏN: s.expected,
    TUTULAN: s.collected,
    BORC: s.debt,
    'GECİKMİŞ AY': s.lateMonths,
    'ÖDƏNİLİB AY': s.paidMonths,
  }));

  const t = data.totals;
  rows.push({
    'MAĞAZA ADI': 'UMUMİ',
    'BAŞLANGIÇ': '',
    GÖZLƏNİLƏN: t.expected,
    TUTULAN: t.collected,
    BORC: t.debt,
    'GECİKMİŞ AY': t.lateMonths,
    'ÖDƏNİLİB AY': '',
  });

  return saveSheet(rows, `promar-aylik-hesabat-${month}.xlsx`, monthLabel(month));
}

/** Ümumi hesabat: 2022-dən bu günə qədər (ay-ay sətirlər) */
export function exportOverallReport(data) {
  const header = {
    'MAĞAZA ADI': '',
    'GÖZLƏNİLƏN': '',
    TUTULAN: '',
    BORC: '',
    'GECİKMİŞ AY': '',
  };
  for (const m of data.months) header[monthLabel(m)] = '';

  const rows = [];
  for (const s of data.rows) {
    const row = {
      'MAĞAZA ADI': s.name,
      GÖZLƏNİLƏN: s.expected,
      TUTULAN: s.collected,
      BORC: s.debt,
      'GECİKMİŞ AY': s.lateMonths,
    };
    for (const m of s.months) {
      // Ay-ay: ödənilibdirsə məbləğ, yoxdursa boş
      row[monthLabel(m.month)] = m.status === 'paid' ? m.paid : '';
    }
    rows.push(row);
  }

  // Yekun sətir
  const totalRow = {
    'MAĞAZA ADI': 'UMUMİ',
    GÖZLƏNİLƏN: data.totals.expected,
    TUTULAN: data.totals.collected,
    BORC: data.totals.debt,
    'GECİKMİŞ AY': data.totals.lateMonths,
  };
  rows.push(totalRow);

  return saveSheet(rows, `promar-umumi-hesabat-${data.from}_${data.to}.xlsx`, 'Ümumi', header);
}

function saveSheet(rows, filename, sheetName, extraHeader) {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const sheet = XLSX.utils.json_to_sheet(rows, { header: keys });

  // Sütun genişlikləri
  sheet['!cols'] = keys.map((k) => ({
    wch: k === 'MAĞAZA ADI' ? 30 : k.includes('AY') ? 13 : 14,
  }));

  // Rəqəmlər 2 onluq
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = 0; c < keys.length; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === 'n') cell.z = '#,##0.00';
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  XLSX.writeFile(wb, filename);
  return filename;
}

export { STATUS_LABEL, formatMoney };