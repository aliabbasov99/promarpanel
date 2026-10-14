export const MONTHS_AZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun',
  'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
];

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month) {
  const [y, m] = month.split('-');
  return `${MONTHS_AZ[Number(m) - 1]} ${y}`;
}

export function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('az-AZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export function formatMoney(n) {
  if (n == null) return '—';
  return `${Number(n).toLocaleString('az-AZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} AZN`;
}

// Telefonu saxlanan formanata gətirir: yalnız 9 rəqəm (operator kodu-suz)
export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('994')) d = d.slice(3);
  else if (d.length === 10 && d.startsWith('0')) d = d.slice(1);
  return d;
}

// "+994 XX XXX XX XX" görünüşü
export function formatPhone(raw) {
  const d = normalizePhone(raw);
  if (!d) return '';
  const p = d.padEnd(9, 'X');
  return `+994 ${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5, 7)} ${p.slice(7)}`.replace(/X/g, '');
}

// WhatsApp linki
export function waLink(raw) {
  const d = normalizePhone(raw);
  return d ? `https://wa.me/994${d}` : null;
}