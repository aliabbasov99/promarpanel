import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { MONTHS_AZ, currentMonth, monthLabel, formatDate, formatMoney } from '../utils';
import Modal from '../components/Modal';
import BulkModal from '../components/BulkModal';
import { ContactList } from './Stores';
import { LuArrowLeft, LuMapPin, LuCheck, LuClock, LuTriangleAlert, LuPencil, LuCheckCheck, LuFileSpreadsheet, LuHash } from 'react-icons/lu';
import { useAuth } from '../auth';
import { exportStoreExcel } from '../exportExcel';

// Cədvəl xanası üçün kompakt məbləğ (AZN ayrıca, kiçik)
function cellMoney(v) {
  if (v == null) return '—';
  const n = Number(v).toLocaleString('az-AZ', { maximumFractionDigits: 2 });
  return <>{n}<span className="cell-cur"> AZN</span></>;
}

const STATUS = {
  paid: { label: 'Ödənilib' },
  pending: { label: 'Gözlənilir' },
  overdue: { label: 'Gecikdirilmiş' },
  none: { label: 'Xidmət başlamayıb' },
};

// Cədvəl xanasında yalnız qiymət yazılır, status yazısı yoxdur (rəng statusu bildirir)

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function StoreDetail() {
  const { isAdmin } = useAuth();
  // Ödəniş cədvəli (qiymətlərlə) yalnız admin üçün
  if (!isAdmin) return <Navigate to="/magazalar" replace />;
  return <StoreDetailInner />;
}

function StoreDetailInner() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [store, setStore] = useState(null);
  const [from, setFrom] = useState('2022-01');
  const [to, setTo] = useState(currentMonth());
  const [editModal, setEditModal] = useState(null);
  const [bulkModal, setBulkModal] = useState(false);

  // Ayı "gecikdi" işarələmək — bu ay və sonrakılar gecikdirilmiş sayılır
  const markLate = async (month) => {
    try {
      await api.markLate(id, month);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const clearLate = async () => {
    try {
      await api.clearLate(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  // Server sənədindəki qiymət tarixçəsindən "YYYY-MM" ayının qiymətini tapır
  const priceOn = (store, month) => {
    const valid = (store?.prices || []).filter((p) => p.effectiveFrom <= month);
    if (!valid.length) return null;
    return valid.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0].amount;
  };
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStores()
      .then((all) => {
        const s = all.find((x) => x._id === id);
        if (!s) setError('Mağaza tapılmadı');
        else setStore(s);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const load = () => {
    if (!from) return;
    setLoading(true);
    api.getStorePayments(id, from, to)
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  // Excel ixracı (ödəniş cədvəli + digər məlumatlar)
  const doExport = () => {
    if (!data) return;
    try {
      exportStoreExcel({ store: data.store, cells: data.cells, rows: data.cells, startMonth: data.startMonth });
    } catch (e) {
      setError('Excel faylı yaradıla bilmədi: ' + e.message);
    }
  };

  useEffect(() => { load(); }, [id, from, to]);

  // Cədvəli illərə görə qruplaşdır
  const years = useMemo(() => {
    if (!data) return [];
    const map = {};
    for (const c of data.cells) {
      const y = c.month.slice(0, 4);
      (map[y] ||= []).push(c);
    }
    return Object.entries(map).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [data]);

  const totals = useMemo(() => {
    if (!data) return { paid: 0, overdue: 0, pending: 0, paidSum: 0, debt: 0 };
    let paid = 0, overdue = 0, pending = 0, paidSum = 0, debt = 0;
    for (const c of data.cells) {
      if (c.status === 'paid') { paid++; paidSum += c.payment.amount; }
      else if (c.status === 'overdue') { overdue++; debt += c.price || 0; }
      else pending++;
    }
    return { paid, overdue, pending, paidSum, debt };
  }, [data]);

  if (error && !data) return <div className="error-box">Xəta: {error}</div>;
  if (!store || !data) return <div className="loading">Yüklənir…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/magazalar" className="btn ghost sm" style={{ marginBottom: 8 }}>
            <LuArrowLeft size={14} /> Mağazalar
          </Link>
          <h1>{store.name}</h1>
          <div className="sub">
            {store.mapUrl ? (
              <a className="map-link" href={store.mapUrl} target="_blank" rel="noreferrer">
                <LuMapPin size={12} /> Xəritədə bax
              </a>
            ) : 'Xəritə linki yoxdur'}
            {' · '}<span className={`badge ${store.active ? 'active' : 'inactive'}`}>{store.active ? 'Aktiv' : 'Deaktiv'}</span>
          </div>
        </div>
        <div className="toolbar">
          <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Başlanğıc ay">
            {monthOptions(to, -monthsBetween(MIN_MONTH, to)).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <span className="muted">→</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Son ay">
            {monthOptions(to, 24).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button className="btn" onClick={() => setBulkModal(true)}>
            <LuCheckCheck size={16} /> Toplu ödəniş
          </button>
          {data.lateFrom ? (
            <button className="btn ghost" onClick={clearLate} title="Gecikmiş işarəsini sil">
              <LuTriangleAlert size={16} /> Gecikmiş: {monthLabel(data.lateFrom)}
            </button>
          ) : null}
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card secondary">
          <div className="label"><LuHash size={13} /> Servis kodu</div>
          <div className="value service-code">{store.serviceCode || '—'}</div>
        </div>
        <div className="stat-card success">
          <div className="label"><LuCheck size={13} /> Ödənilmiş ay</div>
          <div className="value">{totals.paid}</div>
        </div>
        <div className="stat-card danger">
          <div className="label"><LuTriangleAlert size={13} /> Gecikmiş ay</div>
          <div className="value">{totals.overdue}</div>
        </div>
        <div className="stat-card warning">
          <div className="label"><LuClock size={13} /> Gözlənilir</div>
          <div className="value">{totals.pending}</div>
        </div>
        <div className="stat-card">
          <div className="label">Ödənilmiş məbləğ</div>
          <div className="value">{formatMoney(totals.paidSum)}</div>
        </div>
        <div className="stat-card danger">
          <div className="label">Borclaşma</div>
          <div className="value">{formatMoney(totals.debt)}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Aylıq ödəniş cədvəli</h2>
          <div className="legend">
            <span className="badge paid"><LuCheck size={11} /> Ödənilib</span>
            <span className="badge pending"><LuClock size={11} /> Gözlənilir</span>
            <span className="badge overdue"><LuTriangleAlert size={11} /> Gecikdirilmiş</span>
            <span className="badge cell-none-badge">Xidmət başlamayıb</span>
          </div>
        </div>

        {loading ? (
          <div className="loading">Yüklənir…</div>
        ) : data.cells.length === 0 ? (
          <div className="empty">Seçilmiş tarix aralığında ay yoxdur.</div>
        ) : (
          <div className="table-scroll">
            <table className="year-grid">
              <thead>
                <tr>
                  <th className="year-label">İl</th>
                  {MONTHS_AZ.map((m, i) => <th key={i} className="month-col">{m.slice(0, 3)}</th>)}
                </tr>
              </thead>
              <tbody>
                {years.map(([year, cells]) => (
                  <tr key={year}>
                    <td className="year-label">{year}</td>
                    {Array.from({ length: 12 }).map((_, mi) => {
                      const cell = cells.find((c) => Number(c.month.slice(5, 7)) === mi + 1);
                      if (!cell) return <td key={mi} className="empty-cell" />;
                      const S = STATUS[cell.status];
                      const future = cell.month > currentMonth();
                      const blank = future || cell.status === 'none';
                      return (
                        <td key={mi}>
                          <button
                            className={`cell cell-${future ? 'future' : cell.status}`}
                            onClick={() => !future && setEditModal(cell)}
                            title={`${monthLabel(cell.month)} — ${S.label}${cell.price ? ' · ' + formatMoney(cell.price) : ''}`}
                            disabled={future}
                          >
                            {blank ? (
                              <span className="cell-inner"><span className="cell-sub">·</span></span>
                            ) : (
                              <span className="cell-inner">
                                <span className="cell-amount">{cellMoney(cell.payment?.amount ?? cell.price)}</span>
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="export-bar">
        <button className="btn secondary" onClick={doExport} disabled={!data}>
          <LuFileSpreadsheet size={16} /> Excel yüklə
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          Faylda 4 səhifə: ödəniş cədvəli, aylar matrisi, qiymət tarixçəsi və əlaqə nömrələri
        </span>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><h2>Qiymət tarixçəsi</h2></div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Qiymət</th><th>Tətbiq ayı</th><th>Əlavə edilmə tarixi</th></tr>
            </thead>
            <tbody>
              {[...store.prices]
                .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))
                .map((p, i) => (
                  <tr key={i}>
                    <td><strong>{formatMoney(p.amount)}</strong></td>
                    <td>{monthLabel(p.effectiveFrom)}-dan</td>
                    <td className="muted">{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
              {!store.prices.length && <tr><td colSpan={3} className="muted">Qiymət təyin edilməyib</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><h2>Əlaqə nömrələri</h2></div>
        <div className="panel-body"><ContactList store={store} /></div>
      </div>

      {editModal && (
        <MonthPaymentModal
          cell={editModal}
          storeId={id}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); load(); }}
          onMarkLate={async () => {
            await markLate(editModal.month);
            setEditModal(null);
          }}
        />
      )}
      {bulkModal && data && (
        <BulkModal
          storeId={id}
          data={{ ...data, store }}
          onClose={() => setBulkModal(false)}
          onSaved={load}
        />
      )}
    </>
  );
}

function monthOptions(from, delta) {
  const out = [];
  for (let i = 0; i <= Math.abs(delta); i++) out.push(shiftMonth(from, delta > 0 ? i : -i));
  return delta < 0 ? out.reverse() : out;
}

const MIN_MONTH = '2022-01';

function monthsBetween(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

function MonthPaymentModal({ cell, storeId, onClose, onSaved, onMarkLate }) {
  const [amount, setAmount] = useState(cell.payment?.amount ?? cell.price ?? '');
  const [paidAt, setPaidAt] = useState(
    cell.payment?.paidAt ? new Date(cell.payment.paidAt).toISOString().slice(0, 10) : monthEnd(cell.month)
  );
  const [note, setNote] = useState(cell.payment?.note || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.pay({ storeId, month: cell.month, amount, paidAt, note });
      onSaved();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('Bu ayın ödənişi silinsin?')) return;
    await api.deletePayment(cell.payment._id);
    onSaved();
  };

  return (
    <Modal
      title={`${monthLabel(cell.month)} — ödəniş`}
      onClose={onClose}
      footer={
        <>
          {cell.payment && <button className="btn danger" onClick={remove}>Ödənişi sil</button>}
          <button className="btn ghost" onClick={onClose}>Ləğv et</button>
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saxlanır…' : 'Təsdiqlə'}</button>
        </>
      }
    >
      {err && <div className="error-box">{err}</div>}

      {/* Ödəniş yoxdursa — bu ayı "gecikdi" işarələmək */}
      {!cell.payment && cell.status !== 'none' && (
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Gecikmiş işarəsi</label>
          <div className="toolbar">
            <button className="btn ghost sm" onClick={onMarkLate} disabled={busy}>
              Bu ayı gecikdi işarələ
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              Bu ay və sonrakı aylar gecikdirilmiş sayılır
            </span>
          </div>
        </div>
      )}
      <div className={`status-callout ${cell.status}`}>
        {cell.status === 'overdue' && 'Bu ayın ödənişi gecikmişdir.'}
        {cell.status === 'pending' && 'Bu ayın ödənişi hələ gözlənilir.'}
        {cell.status === 'paid' && 'Bu ay ödənilib. Məbləğı redaktə edə bilərsiniz.'}
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Qiymət (o ay üçün)</label>
          <input value={formatMoney(cell.price)} disabled />
        </div>
        <div className="field">
          <label>Ödənilmiş məbləğ (AZN)</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Ödəniş tarixi</label>
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Qeyd</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Məs. nağd ödəniş" />
        </div>
      </div>
    </Modal>
  );
}

// Keçmiş ay üçün avtomatik olaraq ayın son gününü seçir
function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 0);
  return d.toISOString().slice(0, 10);
}