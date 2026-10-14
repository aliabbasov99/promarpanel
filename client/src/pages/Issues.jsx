import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatDate } from '../utils';
import Modal from '../components/Modal';
import { ContactList } from './Stores';
import { LuPlus, LuTrash2, LuSearch, LuArchive, LuUndo2 } from 'react-icons/lu';

const STATUS = { open: 'Açıq', in_progress: 'İşlənir', resolved: 'Həll olundu' };
const PRIORITY = { high: 'Yüksək', medium: 'Orta', low: 'Aşağı' };

export default function Issues() {
  const [view, setView] = useState('active'); // active | archive
  const [issues, setIssues] = useState([]);
  const [stores, setStores] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [q, setQ] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');

  const load = async (params) => {
    try {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
      setIssues(await api.getIssues(qs ? `?${qs}` : ''));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    // Arxivdə yalnız həll olunmuşlar; əsas siyahıda həll olunmuşlar yoxdur
    load({ status: view === 'archive' ? 'resolved' : '', store: storeFilter, excludeResolved: view === 'active' });
    api.getStoreOptions().then(setStores).catch(() => {});
  }, [view, storeFilter]);

  const visible = issues.filter((i) =>
    !q ||
    i.title.toLowerCase().includes(q.toLowerCase()) ||
    (i.store?.name || '').toLowerCase().includes(q.toLowerCase())
  );

  const reload = () => load({ status: view === 'archive' ? 'resolved' : '', store: storeFilter, excludeResolved: view === 'active' });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Problemlər</h1>
          <div className="sub">
            {view === 'archive'
              ? 'Həll olunmuş problemlər — statusu dəyişib yenidən açmaq olar'
              : 'Yeni problem qeyd edin — hər problemin mağazası seçilir'}
          </div>
        </div>
        <div className="toolbar">
          <button className={`btn ${view === 'archive' ? '' : 'ghost'}`} onClick={() => setView('archive')}>
            <LuArchive size={16} /> Arxiv
          </button>
          <button className="btn" onClick={() => setShowModal(true)}>
            <LuPlus size={16} /> Yeni problem
          </button>
        </div>
      </div>

      {error && <div className="error-box">Xəta: {error}</div>}

      <div className="panel">
        <div className="panel-head">
          <h2>{view === 'archive' ? 'Arxiv (həll olunmuş)' : 'Açıq problemlər'}</h2>
          <div className="toolbar">
            <div className="search-wrap">
              <LuSearch size={14} className="search-icon" />
              <input className="search-input" placeholder="Axtar…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} aria-label="Mağaza">
              <option value="">Bütün mağazalar</option>
              {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
            {view === 'active' && (
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
                <option value="">Bütün statuslar</option>
                <option value="open">Açıq</option>
                <option value="in_progress">İşlənir</option>
              </select>
            )}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="empty">
            {view === 'archive' ? 'Arxivdə problem yoxdur.' : 'Açıq problem yoxdur.'}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Problem</th>
                  <th>Mağaza</th>
                  <th>Əlaqə</th>
                  <th>Prioritet</th>
                  <th>Status</th>
                  <th>Tarix</th>
                  <th>Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((i) => (
                  <tr key={i._id}>
                    <td>
                      <strong>{i.title}</strong>
                      {i.description && <div className="muted" style={{ fontSize: 12 }}>{i.description}</div>}
                    </td>
                    <td>{i.store?.name || '—'}</td>
                    <td className="nowrap">
                      <ContactList store={i.store} compact />
                    </td>
                    <td><span className={`badge ${i.priority}`}>{PRIORITY[i.priority]}</span></td>
                    <td>
                      <select
                        value={i.status}
                        className="inline-select"
                        onChange={async (e) => {
                          await api.updateIssue(i._id, { status: e.target.value });
                          reload();
                        }}
                        aria-label="Status dəyiş"
                      >
                        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="nowrap muted">{formatDate(i.createdAt)}</td>
                    <td className="nowrap actions">
                      <div className="actions-inner">
                        {i.status === 'resolved' && (
                          <button
                            className="btn ghost sm"
                            title="Yenidən aç"
                            onClick={async () => {
                              await api.updateIssue(i._id, { status: 'open' });
                              reload();
                            }}
                          >
                            <LuUndo2 size={13} />
                          </button>
                        )}
                        <button
                          className="btn danger sm"
                          title="Sil"
                          onClick={async () => {
                            if (!confirm('Problem silinsin?')) return;
                            await api.deleteIssue(i._id);
                            reload();
                          }}
                        >
                          <LuTrash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <IssueModal
          stores={stores}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); reload(); }}
        />
      )}
    </>
  );
}

function IssueModal({ stores, onClose, onSaved }) {
  const [storeId, setStoreId] = useState(stores[0]?._id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!storeId) return setErr('Mağaza seçin');
    if (!title.trim()) return setErr('Problem başlığı yazın');
    setBusy(true);
    try {
      await api.createIssue({ storeId, title, description, priority });
      onSaved();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Yeni problem"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Ləğv et</button>
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saxlanır…' : 'Yadda saxla'}</button>
        </>
      }
    >
      {err && <div className="error-box">{err}</div>}
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Mağaza *</label>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">— seçin —</option>
            {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Problem *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Məs. Kassa printer işləmir" />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Təfərrüat</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label>Prioritet</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="high">Yüksək</option>
            <option value="medium">Orta</option>
            <option value="low">Aşağı</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}