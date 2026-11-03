import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { currentMonth, monthLabel, formatDate, formatMoney } from '../utils';
import Modal from '../components/Modal';
import {
  LuArrowDownLeft, LuArrowUpRight, LuPlus, LuTrash2, LuWallet, LuListFilter,
} from 'react-icons/lu';
import { useLiveRefresh } from '../useLiveRefresh';

const TYPES = {
  in: { label: 'Gəlir', badge: 'in', sign: '+' },
  out: { label: 'Xərc', badge: 'out', sign: '−' },
};

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Cash() {
  const [month, setMonth] = useState(currentMonth());
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'in' | 'out'
  const [form, setForm] = useState({ title: '', amount: '', date: todayInput(), note: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (m) => {
    try {
      const result = await api.getCash(m);
      setData(result);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(month); }, [month, load]);

  // Serverless rejimdə ehtiyat yeniləmə
  useLiveRefresh(useCallback(() => load(month), [month, load]));

  // Son 18 ay — serverdən gələn aylarla birləşdirilir
  const fallbackMonths = useMemo(() => {
    const now = new Date();
    const list = [];
    for (let i = 0; i < 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return list;
  }, []);

  const months = useMemo(() => {
    const set = new Set([month, ...(data?.months || []), ...fallbackMonths]);
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [data, fallbackMonths, month]);

  const entries = (data?.entries || []).filter((e) => filter === 'all' || e.type === filter);

  const openModal = (type) => {
    setForm({ title: '', amount: '', date: todayInput(), note: '' });
    setModal(type);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.addCash({ ...form, type: modal });
      const addedMonth = form.date.slice(0, 7);
      setModal(null);
      if (addedMonth !== month) setMonth(addedMonth);
      else await load(month);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry) => {
    if (!confirm(`"${entry.title}" yazısı silinsin?`)) return;
    try {
      await api.deleteCash(entry.id);
      await load(month);
    } catch (e) {
      alert(e.message);
    }
  };

  const balance = data?.balance ?? 0;
  const income = data?.income ?? 0;
  const expense = data?.expense ?? 0;
  const net = data?.net ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kassa</h1>
          <div className="sub">
            Mağaza ödənişləri avtomatik gəlirə əlavə olunur — {monthLabel(month)}
          </div>
        </div>
        <div className="toolbar">
          <button className="btn ghost" onClick={() => openModal('out')}>
            <LuArrowUpRight size={15} /> Xərc əlavə et
          </button>
          <button className="btn" onClick={() => openModal('in')}>
            <LuArrowDownLeft size={15} /> Gəlir əlavə et
          </button>
        </div>
      </div>

      {error && <div className="error-box">Xəta: {error}</div>}

      <div className="stat-grid">
        <div className="stat-card secondary cash-balance">
          <div className="label"><LuWallet size={13} /> Kassa qalığı</div>
          <div className="value">{formatMoney(balance)}</div>
          <div className="label" style={{ marginTop: 6 }}>Bütün dövr üzrə</div>
        </div>
        <div className="stat-card success">
          <div className="label"><LuArrowDownLeft size={13} /> Gələnlər</div>
          <div className="value">{formatMoney(income)}</div>
          <div className="label" style={{ marginTop: 6 }}>{monthLabel(month)}</div>
        </div>
        <div className="stat-card danger">
          <div className="label"><LuArrowUpRight size={13} /> Gedənlər</div>
          <div className="value">{formatMoney(expense)}</div>
          <div className="label" style={{ marginTop: 6 }}>{monthLabel(month)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Aylıq xalis</div>
          <div className="value" style={{ color: net < 0 ? 'var(--danger)' : 'var(--success)' }}>
            {net > 0 ? '+' : ''}{formatMoney(net)}
          </div>
          <div className="label" style={{ marginTop: 6 }}>Gəlir − xərc</div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Kassa tarixçəsi</h2>
          <div className="toolbar">
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Ay">
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Növ">
              <option value="all">Hamısı</option>
              <option value="in">Yalnız gəlirlər</option>
              <option value="out">Yalnız xərclər</option>
            </select>
          </div>
        </div>

        {!data ? (
          <div className="loading">Yüklənir…</div>
        ) : entries.length === 0 ? (
          <div className="empty">
            <LuListFilter size={22} style={{ marginBottom: 8 }} />
            <div>Bu ay üçün yazı yoxdur.</div>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tarix</th>
                  <th>Növ</th>
                  <th>Ad</th>
                  <th>Mənbə</th>
                  <th className="right">Məbləğ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const t = TYPES[entry.type];
                  return (
                    <tr key={`${entry.source}:${entry.id}`}>
                      <td className="nowrap">{formatDate(entry.date)}</td>
                      <td><span className={`badge ${t.badge}`}>{t.label}</span></td>
                      <td>
                        <div>{entry.title}</div>
                        {entry.note && <div className="muted small">{entry.note}</div>}
                      </td>
                      <td className="muted">
                        {entry.source === 'payment'
                          ? `Mağaza ödənişi${entry.paymentMonth ? ` (${monthLabel(entry.paymentMonth)})` : ''}`
                          : 'Əl ilə'}
                      </td>
                      <td className={`right nowrap cash-amount ${entry.type}`}>
                        {t.sign}{formatMoney(entry.amount)}
                      </td>
                      <td className="right">
                        {entry.source === 'manual' ? (
                          <button
                            className="icon-btn danger"
                            title="Sil"
                            aria-label="Sil"
                            onClick={() => remove(entry)}
                          >
                            <LuTrash2 size={15} />
                          </button>
                        ) : (
                          <span className="muted small" title="Ödənişlər bölməsindən idarə olunur">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <Modal
          title={modal === 'in' ? 'Gəlir əlavə et' : 'Xərc əlavə et'}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={() => setModal(null)}>Ləğv et</button>
              <button type="submit" form="cash-form" className="btn" disabled={busy}>
                <LuPlus size={15} /> {busy ? 'Əlavə olunur…' : 'Əlavə et'}
              </button>
            </>
          }
        >
          <form id="cash-form" onSubmit={submit} className="form-grid">
            <div className="field">
              <label htmlFor="cash-title">Ad</label>
              <input
                id="cash-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={modal === 'in' ? 'Məs. Əlavə gəlir' : 'Məs. Ofis xərci'}
                autoFocus
                required
              />
            </div>
            <div className="field">
              <label htmlFor="cash-amount">Məbləğ (AZN)</label>
              <input
                id="cash-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="cash-date">Tarix</label>
              <input
                id="cash-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="cash-note">Qeyd (istəyə bağlı)</label>
              <textarea
                id="cash-note"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Əlavə məlumat…"
              />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
