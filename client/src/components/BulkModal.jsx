import { useState } from 'react';
import { api } from '../api';
import { currentMonth, monthLabel, formatMoney } from '../utils';
import Modal from './Modal';
import { LuCheckCheck } from 'react-icons/lu';

// Seçilmiş tarix aralığındakı bütün ödənməmiş ayları "ödənilib" işarələyir.
// Hər ay öz qiyməti ilə yazılır (qiymət tarixçəsinə uyğun).
export default function BulkModal({ storeId, data, onClose, onSaved }) {
  const months = data.cells.map((c) => c.month);
  const lastMonth = months[months.length - 1] || currentMonth();

  const store = data.store;
  const currentPrice = (() => {
    const valid = (store?.prices || []).filter((p) => p.effectiveFrom <= currentMonth());
    if (!valid.length) return null;
    return valid.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0].amount;
  })();

  const unpaid = data.cells.filter((c) => !c.payment);
  const [from, setFrom] = useState(unpaid.length ? unpaid[0].month : months[0] || currentMonth());
  const [to, setTo] = useState(lastMonth);
  const [amount, setAmount] = useState(currentPrice ?? '');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  // Başlanğıc ay dəyişəndə son avtomatik ən son aya çəkilir
  const changeFrom = (value) => {
    setFrom(value);
    setTo(lastMonth);
    setResult(null);
  };

  const selected = unpaid.filter((c) => c.month >= from && c.month <= to);
  const hasAmount = amount !== '' && amount != null;
  const total = selected.length * (hasAmount ? Number(amount) || 0 : (currentPrice ?? 0));

  const submit = async () => {
    if (!selected.length) return setErr('Bu aralıqda ödənməmiş ay yoxdur');
    setBusy(true);
    setErr('');
    try {
      const res = await api.bulkPay(storeId, { from, to, paidAt, note, amount });
      setResult(res);
      onSaved(); // cədvəli yenilə, modalı bağlama
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Toplu ödəniş"
      onClose={onClose}
      footer={
        result ? (
          <button className="btn" onClick={onClose}>Bağla</button>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>Ləğv et</button>
            <button className="btn" onClick={submit} disabled={busy || !selected.length}>
              <LuCheckCheck size={15} />
              {busy ? 'Qeyd edilir…' : `${selected.length} ayı ödənilib işarələ`}
            </button>
          </>
        )
      }
    >
      {result ? (
        <>
          <div className={`status-callout ${result.created.length ? 'paid' : 'pending'}`}>
            <strong>{result.created.length} ay</strong> ödənilib işarələndi
            {result.created.length > 0 && `: ${result.created.map(monthLabel).join(', ')}`}
          </div>
          {result.skipped.length > 0 && (
            <div className="hint">
              Artıq ödənişi olan aylar ({result.skipped.length}): {result.skipped.map(monthLabel).join(', ')}
            </div>
          )}
          {result.failed.length > 0 && (
            <div className="error-box">
              Qiymət təyin edilmədiyi üçün yazılmadı: {result.failed.map(monthLabel).join(', ')}
            </div>
          )}
        </>
      ) : (
        <>
          {err && <div className="error-box">{err}</div>}
          <div className="form-grid">
            <div className="field">
              <label>Başlanğıc ay</label>
              <select value={from} onChange={(e) => changeFrom(e.target.value)}>
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Son ay</label>
              <select value={to} onChange={(e) => { setTo(e.target.value); setResult(null); }}>
                {months.filter((m) => m >= from).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Qiymət (AZN)</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                placeholder={currentPrice ?? ''}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Ödəniş tarixi</label>
              <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div className="field">
              <label>Cəmi</label>
              <input value={`${total} AZN`} readOnly />
            </div>
            <div className="field">
              <label>Qeyd</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Məs. bank köçürməsi" />
            </div>
          </div>

          <p className="hint">
            {selected.length} ay seçilib (ödənməmiş). Qiyməti dəyişsəniz, seçilmiş bütün aylara
            həmin məbləğ yazılır; xanayı boş buraxsanız hər ay öz qiyməti ilə yazılır.
            Sonradan hər ayı ayrıca redaktə edə bilərsiniz.
          </p>
        </>
      )}
    </Modal>
  );
}