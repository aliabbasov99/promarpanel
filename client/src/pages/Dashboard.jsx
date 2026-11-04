import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { currentMonth, monthLabel, formatMoney } from '../utils';
import { LuCheck, LuClock, LuTriangleAlert, LuStore, LuTriangleAlert as LuBug, LuArrowRight, LuMapPin, LuWallet, LuArrowDownLeft, LuArrowUpRight } from 'react-icons/lu';
import { useAuth } from '../auth';
import { useLiveRefresh } from '../useLiveRefresh';

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [openIssues, setOpenIssues] = useState([]);
  const [cash, setCash] = useState(null);
  const [error, setError] = useState('');

  const month = currentMonth();

  useEffect(() => {
    (async () => {
      try {
        const [s, p, i] = await Promise.all([
          api.getStats(month),
          api.getPayments(month),
          api.getIssues('?status=open'),
        ]);
        setStats(s);
        setRows(p.rows);
        setOpenIssues(i.slice(0, 6));
        if (isAdmin) setCash(await api.getCash(month));
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [month, isAdmin]);

  // Serverless rejimdə (WebSocket yoxdur) ehtiyat yeniləmə
  useLiveRefresh(
    useCallback(() => {
      api.getStats(month).then(setStats).catch(() => {});
      api.getPayments(month).then((d) => setRows(d.rows)).catch(() => {});
      api.getIssues('?status=open').then((i) => setOpenIssues(i.slice(0, 6))).catch(() => {});
      if (isAdmin) api.getCash(month).then(setCash).catch(() => {});
    }, [month, isAdmin])
  );

  if (error) return <div className="error-box">Xəta: {error}</div>;
  if (!stats) return <div className="loading">Yüklənir…</div>;

  const overdueRows = rows.filter((r) => r.status === 'overdue');
  const progress = isAdmin && stats.expected > 0 ? Math.round((stats.collected / stats.expected) * 100) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>İdarəetmə Paneli</h1>
          <div className="sub">Aylıq vəziyyət — {monthLabel(month)}</div>
        </div>
        {isAdmin && (
          <div className="toolbar">
            <Link to="/kassa" className="btn ghost">
              <LuWallet size={15} /> Kassa tarixçəsi
            </Link>
          </div>
        )}
      </div>

      {isAdmin && cash && (
        <div className="stat-grid">
          <div className="stat-card secondary cash-balance">
            <div className="label"><LuWallet size={13} /> Kassa 1 qalığı</div>
            <div className="value">{formatMoney(cash.balances?.kassa1 ?? cash.balance)}</div>
            <div className="label" style={{ marginTop: 6 }}>Servis ödənişləri</div>
          </div>
          <div className="stat-card secondary cash-balance">
            <div className="label"><LuWallet size={13} /> Kassa 2 qalığı</div>
            <div className="value">{formatMoney(cash.balances?.kassa2 ?? 0)}</div>
            <div className="label" style={{ marginTop: 6 }}>Şirkət gəlir/xərcləri</div>
          </div>
          <div className="stat-card success">
            <div className="label"><LuArrowDownLeft size={13} /> Gələnlər</div>
            <div className="value">{formatMoney(cash.income)}</div>
            <div className="label" style={{ marginTop: 6 }}>{monthLabel(month)}</div>
          </div>
          <div className="stat-card danger">
            <div className="label"><LuArrowUpRight size={13} /> Gedənlər</div>
            <div className="value">{formatMoney(cash.expense)}</div>
            <div className="label" style={{ marginTop: 6 }}>{monthLabel(month)}</div>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label"><LuStore size={13} /> Aktiv mağaza</div>
          <div className="value">{stats.totalStores}</div>
        </div>
        <div className="stat-card success">
          <div className="label"><LuCheck size={13} /> Ödənilib</div>
          <div className="value">{stats.paid}</div>
        </div>
        <div className="stat-card warning">
          <div className="label"><LuClock size={13} /> Gözlənilir</div>
          <div className="value">{stats.pending}</div>
        </div>
        <div className="stat-card danger">
          <div className="label"><LuTriangleAlert size={13} /> Gecikdirilmiş</div>
          <div className="value">{stats.overdue}</div>
        </div>
        {isAdmin && (
          <div className="stat-card secondary">
            <div className="label">Toplanan</div>
            <div className="value">{formatMoney(stats.collected)}</div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <div className="label" style={{ marginTop: 6 }}>
              {progress}% · {formatMoney(stats.expected)} gözlənilir
            </div>
          </div>
        )}
        <div className="stat-card">
          <div className="label"><LuBug size={13} /> Açıq problem</div>
          <div className="value">{stats.openIssues}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        <section className="panel">
          <div className="panel-head">
            <h2>Gecikdirilmiş ödənişlər</h2>
            <Link to="/odenisler" className="btn ghost sm">Hamısı <LuArrowRight size={14} /></Link>
          </div>
          {overdueRows.length === 0 ? (
            <div className="empty">Gecikdirilmiş ödəniş yoxdur.</div>
          ) : (
            <table>
              <thead>
                <tr><th>Mağaza</th>{isAdmin && <th>Qiymət</th>}<th>Status</th></tr>
              </thead>
              <tbody>
                {overdueRows.map((r) => (
                  <tr key={r.store._id}>
                    <td>
                    <div>{r.store.name}</div>
                    {r.store.mapUrl && (
                      <a className="map-link" href={r.store.mapUrl} target="_blank" rel="noreferrer">
                        <LuMapPin size={12} /> Xəritə
                      </a>
                    )}
                  </td>
                    {isAdmin && <td className="nowrap">{formatMoney(r.price)}</td>}
                    <td><span className="badge overdue">Gecikdirilmiş</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Açıq problemlər</h2>
            <Link to="/problemler" className="btn ghost sm">Hamısı <LuArrowRight size={14} /></Link>
          </div>
          {openIssues.length === 0 ? (
            <div className="empty">Açıq problem yoxdur.</div>
          ) : (
            <table>
              <thead>
                <tr><th>Problem</th><th>Mağaza</th><th>Prioritet</th></tr>
              </thead>
              <tbody>
                {openIssues.map((i) => (
                  <tr key={i._id}>
                    <td>{i.title}</td>
                    <td>{i.store?.name || '—'}</td>
                    <td><span className={`badge ${i.priority}`}>{i.priority}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}