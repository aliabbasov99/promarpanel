import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../api';
import { currentMonth, monthLabel, formatDate, formatMoney } from '../utils';
import Modal from '../components/Modal';
import LoadingBar from '../components/LoadingBar';
import { ContactList } from './Stores';
import { LuCheck, LuClock, LuTriangleAlert, LuEye, LuRotateCcw, LuMapPin, LuFileSpreadsheet, LuChartColumn, LuCalendarRange } from 'react-icons/lu';
import { exportPayments } from '../exportPayments';
import { exportMonthlyReport, exportOverallReport } from '../exportReport';
import { useAuth } from '../auth';
import { useLiveRefresh } from '../useLiveRefresh';

const STATUS = {
  paid: { label: 'Ödənilib', cls: 'paid', icon: LuCheck },
  pending: { label: 'Gözlənilir', cls: 'pending', icon: LuClock },
  overdue: { label: 'Gecikdirilmiş', cls: 'overdue', icon: LuTriangleAlert },
};

export default function Payments() {
  const { isAdmin } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [showInactive, setShowInactive] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [payModal, setPayModal] = useState(null);

  const load = async (m, inc) => {
    setLoading(true);
    try {
      const data = await api.getPayments(m, inc);
      setRows(data.rows);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(month, showInactive); }, [month, showInactive]);

  // Serverless rejimdə (WebSocket yoxdur) ehtiyat yeniləmə
  useLiveRefresh(useCallback(() => {
    api.getPayments(month, showInactive).then((d) => setRows(d.rows)).catch(() => {});
  }, [month, showInactive]));

  const months = useMemo(() => {
    const now = new Date();
    const list = [];
    for (let i = 0; i < 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return list;
  }, []);

  const visible = rows.filter((r) => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (q && !r.store.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  // ---- Hesabatlar (aylıq + ümumi 2022-dən) ----
  const [repBusy, setRepBusy] = useState(false);
  const [report, setReport] = useState(null);

  const openReport = async () => {
    setRepBusy(true);
    try {
      const data = await api.getReport(month, month);
      setReport(data);
      exportMonthlyReport(data, month);
    } catch (e) {
      alert('Hesabat yaradıla bilmədi: ' + e.message);
    } finally {
      setRepBusy(false);
    }
  };

  const openOverall = async () => {
    setRepBusy(true);
    try {
      const data = await api.getReport('2022-01', currentMonth());
      setReport(data);
      exportOverallReport(data);
    } catch (e) {
      alert('Hesabat yaradıla bilmədi: ' + e.message);
    } finally {
      setRepBusy(false);
    }
  };

  const totals = {
    paid: rows.filter((r) => r.status === 'paid').length,
    pending: rows.filter((r) => r.status === 'pending').length,
    overdue: rows.filter((r) => r.status === 'overdue').length,
    collected: rows.filter((r) => r.payment).reduce((s, r) => s + (r.payment?.amount || 0), 0),
    expected: rows.reduce((s, r) => s + (r.price || 0), 0),
  };
  const pct = totals.expected > 0 ? Math.round((totals.collected / totals.expected) * 100) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Aylıq ödənişlər</h1>
          <div className="sub">
            {isAdmin
              ? 'Ödəniş ayın 10-na qədər gözlənilir, 10 keçəndə gecikdirilmiş sayılır'
              : `${monthLabel(month)} üçün vəziyyət`}
          </div>
        </div>
        <div className="toolbar">
          {isAdmin && (
            <>
              <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Ay">
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              <button className="btn ghost" onClick={() => setShowInactive((v) => !v)}>
                <LuEye size={15} />
                {showInactive ? 'Aktiv göstər' : 'Hamısını göstər'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="error-box">Xəta: {error}</div>}

      {/* Hesabat nəticəsi */}
      {report && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-head">
            <h2>
              Hesabat —{' '}
              {report.singleMonth
                ? monthLabel(report.to)
                : `${monthLabel(report.from)} — ${monthLabel(report.to)}`}
            </h2>
            <button className="btn ghost sm" onClick={() => setReport(null)}>
              Bağla
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mağaza</th>
                  <th>Gözlənilən</th>
                  <th>Toplanan</th>
                  <th>Borc</th>
                  <th>Gecikmiş ay</th>
                  <th>Ödənilib</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((s) => (
                  <tr key={s._id}>
                    <td>{s.name}</td>
                    <td>{formatMoney(s.expected)}</td>
                    <td>{formatMoney(s.collected)}</td>
                    <td style={{ color: s.debt > 0 ? 'var(--danger)' : undefined, fontWeight: '600' }}>
                      {formatMoney(s.debt)}
                    </td>
                    <td>
                      <span className={`badge ${s.lateMonths > 0 ? 'overdue' : 'paid'}`}>
                        {s.lateMonths}
                      </span>
                    </td>
                    <td className="muted">{s.paidMonths}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: '700' }}>
                  <td>UMUMİ</td>
                  <td>{formatMoney(report.totals.expected)}</td>
                  <td>{formatMoney(report.totals.collected)}</td>
                  <td style={{ color: 'var(--danger)' }}>{formatMoney(report.totals.debt)}</td>
                  <td>{report.totals.lateMonths}</td>
                  <td className="muted">{report.totals.stores} mağaza</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card success">
          <div className="label">Ödənilib</div>
          <div className="value">{totals.paid}</div>
        </div>
        <div className="stat-card warning">
          <div className="label">Gözlənilir</div>
          <div className="value">{totals.pending}</div>
        </div>
        <div className="stat-card danger">
          <div className="label">Gecikdirilmiş</div>
          <div className="value">{totals.overdue}</div>
        </div>
        {isAdmin && (
          <div className="stat-card secondary">
            <div className="label">Toplanan</div>
            <div className="value">{formatMoney(totals.collected)}</div>
            <div className="progress"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
            <div className="label" style={{ marginTop: 6 }}>{pct}% · {formatMoney(totals.expected)} gözlənilir</div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>{monthLabel(month)}</h2>
          <div className="toolbar">
            <input placeholder="Mağaza axtar…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Status">
              <option value="all">Bütün statuslar</option>
              <option value="paid">Ödənilib</option>
              <option value="pending">Gözlənilir</option>
              <option value="overdue">Gecikdirilmiş</option>
            </select>
            <button
              className="btn ghost"
              onClick={() => exportPayments(rows, month, filter)}
              disabled={visible.length === 0}
              title="Seçilmiş statusdakı mağazaları Excel-ə ixrac et"
            >
              <LuFileSpreadsheet size={15} />
              Excel
            </button>
            <button
              className="btn ghost"
              onClick={openReport}
              disabled={!isAdmin || repBusy}
              title="Bu ay üçün hesabat: gözlənilən, tutulan, borc, gecikmiş ay"
            >
              <LuChartColumn size={15} />
              {repBusy ? 'Yüklənir…' : 'Aylıq hesabat'}
            </button>
            <button
              className="btn ghost"
              onClick={openOverall}
              disabled={!isAdmin || repBusy}
              title="2022-ci ildən bu günə qədər ümumi hesabat"
            >
              <LuCalendarRange size={15} />
              Ümumi hesabat
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingBar />
        ) : visible.length === 0 ? (
          <div className="empty">Məlumat yoxdur.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mağaza</th>
                  <th>Xəritə</th>
                  <th>Əlaqə</th>
                  {isAdmin && <th>Qiymət</th>}
                  {isAdmin && <th>Ödəniş tarixi</th>}
                  <th>Status</th>
                  {isAdmin && <th>Əməliyyat</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const S = STATUS[r.status];
                  return (
                    <tr key={r.store._id}>
                      <td>
                        {r.store.name}
                        {!r.store.active && <span className="badge inactive" style={{ marginLeft: 6 }}>Deaktiv</span>}
                      </td>
                      <td>
                        {r.store.mapUrl ? (
                          <a className="map-link" href={r.store.mapUrl} target="_blank" rel="noreferrer">
                            <LuMapPin size={13} /> Xəritədə bax
                          </a>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td className="nowrap">
                        <ContactList store={r.store} compact />
                      </td>
                      {isAdmin && <td className="nowrap">{formatMoney(r.price)}</td>}
                      {isAdmin && <td className="nowrap">{r.payment ? formatDate(r.payment.paidAt) : '—'}</td>}
                      <td><span className={`badge ${S.cls}`}><S.icon size={12} /> {S.label}</span></td>
                      {isAdmin && (
                      <td className="nowrap actions">
                        <div className="actions-inner">
                          {r.payment ? (
                            <>
                              <button className="btn ghost sm" onClick={() => setPayModal(r)}>Redaktə</button>
                              <button
                                className="btn danger sm"
                                onClick={async () => {
                                  if (!confirm('Ödəniş silinsin?')) return;
                                  await api.deletePayment(r.payment._id);
                                  load(month, showInactive);
                                }}
                              >
                                <LuRotateCcw size={12} />
                              </button>
                            </>
                          ) : (
                            <button className="btn sm" onClick={() => setPayModal(r)}>Ödəniş et</button>
                          )}
                        </div>
                      </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payModal && (
        <PaymentModal
          row={payModal}
          month={month}
          onClose={() => setPayModal(null)}
          onSaved={() => { setPayModal(null); load(month, showInactive); }}
        />
      )}
    </>
  );
}

function PaymentModal({ row, month, onClose, onSaved }) {
  const [amount, setAmount] = useState(row.payment?.amount ?? row.price ?? '');
  const [paidAt, setPaidAt] = useState(
    row.payment?.paidAt
      ? new Date(row.payment.paidAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [note, setNote] = useState(row.payment?.note || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.pay({ storeId: row.store._id, month, amount, paidAt, note });
      onSaved();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Ödəniş — ${row.store.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Ləğv et</button>
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saxlanır…' : 'Təsdiqlə'}</button>
        </>
      }
    >
      {err && <div className="error-box">{err}</div>}
      <div className="form-grid">
        <div className="field">
          <label>Ay</label>
          <input value={monthLabel(month)} disabled />
        </div>
        <div className="field">
          <label>Məbləğ (AZN)</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Ödəniş tarixi</label>
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Qeyd</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Məs. nağd ödəniş, köçürmə..." />
        </div>
      </div>
    </Modal>
  );
}