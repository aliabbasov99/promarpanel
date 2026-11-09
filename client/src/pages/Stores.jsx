import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { currentMonth, monthLabel, formatMoney, formatDate, formatPhone, waLink, normalizePhone } from '../utils';
import Modal from '../components/Modal';
import { LuPlus, LuPencil, LuTrash2, LuPower, LuTags, LuMapPin, LuEye, LuEyeOff, LuUser, LuX } from 'react-icons/lu';
import { FaWhatsapp } from 'react-icons/fa';
import { useAuth } from '../auth';
import { useLiveRefresh } from '../useLiveRefresh';
import LoadingBar from '../components/LoadingBar';

// Əlaqə siyahısını "Ad — nömrə" satırlarına çevirir
export function contactRows(s) {
  if (Array.isArray(s?.contacts) && s.contacts.length) return s.contacts;
  if (s?.contactName || s?.phone) return [{ contactName: s.contactName || '', phone: s.phone || '' }];
  return [];
}

export function ContactList({ store, compact = false }) {
  const list = contactRows(store);
  if (!list.length) return <span className="muted">—</span>;
  return (
    <div className="contact-list">
      {list.map((c, i) => {
        const wa = waLink(c.phone);
        return (
          <div key={i} className="contact-row">
            <LuUser size={12} className="contact-icon" />
            <span className="contact-name">{c.contactName || '—'}</span>
            {c.phone ? (
              <span className="contact-phone">
                <a className="phone-link" href={`tel:+994${normalizePhone(c.phone)}`}>{formatPhone(c.phone)}</a>
                {wa && (
                  <a className="wa-link" href={wa} target="_blank" rel="noreferrer" title="WhatsApp">
                    <FaWhatsapp size={13} />
                  </a>
                )}
              </span>
            ) : (
              <span className="muted">nömrə yoxdur</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Stores() {
  const { isAdmin } = useAuth();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [priceModal, setPriceModal] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setStores(await api.getStores());
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // Serverless rejimdə ehtiyat yeniləmə
  useLiveRefresh(() => {
    api.getStores().then(setStores).catch(() => {});
  });

  const visible = stores.filter((s) => {
    if (!showInactive && !s.active) return false;
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
      s.name.toLowerCase().includes(needle) ||
      (s.serviceCode || '').toLowerCase().includes(needle) ||
      contactRows(s).some((c) =>
        (c.contactName || '').toLowerCase().includes(needle) || (c.phone || '').includes(needle)
      )
    );
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mağazalar</h1>
          <div className="sub">
          {isAdmin
            ? 'Ad, xəritə linki, əlaqə nömrələri və məsul şəxslər'
            : 'Mağaza məlumatları və əlaqə nömrələri'}
        </div>
        </div>
        <div className="toolbar">
          <input placeholder="Axtar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn ghost" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? <LuEyeOff size={15} /> : <LuEye size={15} />}
            {showInactive ? 'Aktiv göstər' : 'Hamısını göstər'}
          </button>
          {isAdmin && (
            <button className="btn" onClick={() => setEditModal({})}>
              <LuPlus size={16} /> Yeni mağaza
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-box">Xəta: {error}</div>}

      <div className="panel">
        {loading ? (
          <LoadingBar />
        ) : visible.length === 0 ? (
          <div className="empty">Mağaza tapılmadı.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mağaza adı</th>
                  <th>Xəritə</th>
                  <th>Əlaqə nömrələri</th>
                  {isAdmin && <th>Cari qiymət</th>}
                  {isAdmin && <th>Servis kodu</th>}
                  <th>Status</th>
                  {isAdmin && <th>Əməliyyat</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s._id}>
                    <td>
                      {isAdmin ? (
                        <Link to={`/magazalar/${s._id}`} className="store-link">{s.name}</Link>
                      ) : (
                        <strong>{s.name}</strong>
                      )}
                    </td>
                    <td>
                      {s.mapUrl ? (
                        <a className="map-link" href={s.mapUrl} target="_blank" rel="noreferrer">
                          <LuMapPin size={13} /> Xəritədə bax
                        </a>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td><ContactList store={s} /></td>
                    {isAdmin && <td className="nowrap">{formatMoney(latestPrice(s, currentMonth()))}</td>}
                    {isAdmin && (
                    <td>
                      {s.serviceCode ? (
                        <span className="code-pill" title="Servis kodu">{s.serviceCode}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    )}
                    <td>
                      <span className={`badge ${s.active ? 'active' : 'inactive'}`}>
                        {s.active ? 'Aktiv' : 'Deaktiv'}
                      </span>
                    </td>
                    {isAdmin && (
                    <td className="nowrap actions">
                      <div className="actions-inner">
                        <button className="btn ghost sm" title="Redaktə" onClick={() => setEditModal(s)}><LuPencil size={13} /></button>
                        <button className="btn ghost sm" title="Qiymət dəyiş" onClick={() => setPriceModal(s)}><LuTags size={13} /></button>
                        <button
                          className="btn ghost sm"
                          title={s.active ? 'Deaktiv et' : 'Aktiv et'}
                          onClick={async () => { await api.toggleStore(s._id, !s.active); load(); }}
                        >
                          <LuPower size={13} />
                        </button>
                        <button
                          className="btn danger sm"
                          title="Sil"
                          onClick={async () => {
                            if (!confirm(`"${s.name}" silinsin? Bütün ödəniş və problemləri silinəcək.`)) return;
                            await api.deleteStore(s._id);
                            load();
                          }}
                        >
                          <LuTrash2 size={13} />
                        </button>
                      </div>
                    </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editModal && (
        <StoreModal store={editModal} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); load(); }} />
      )}
      {priceModal && (
        <PriceModal store={priceModal} onClose={() => setPriceModal(null)} onSaved={() => { setPriceModal(null); load(); }} />
      )}
    </>
  );
}

function latestPrice(store, month) {
  const valid = store.prices.filter((p) => p.effectiveFrom <= month);
  if (!valid.length) return null;
  return valid.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0].amount;
}

function StoreModal({ store, onClose, onSaved }) {
  const isNew = !store._id;
  const [contacts, setContacts] = useState(() => {
    const existing = contactRows(store);
    return existing.length ? existing : [{ contactName: '', phone: '' }];
  });
  const [f, setF] = useState({
    name: store.name || '',
    mapUrl: store.mapUrl || '',
    note: store.note || '',
    active: store.active !== false,
    amount: '',
    effectiveFrom: currentMonth(),
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const updateContact = (i, key, value) =>
    setContacts(contacts.map((c, idx) => (idx === i ? { ...c, [key]: value } : c)));
  const addContact = () => setContacts([...contacts, { contactName: '', phone: '' }]);
  const removeContact = (i) => setContacts(contacts.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!f.name.trim()) return setErr('Mağaza adı tələb olunur');
    try {
      const body = { ...f, contacts };
      if (isNew) await api.createStore(body);
      else await api.updateStore(store._id, body);
      onSaved();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <Modal
      title={isNew ? 'Yeni mağaza' : 'Mağazanı redaktə et'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Ləğv et</button>
          <button className="btn" onClick={save}>Yadda saxla</button>
        </>
      }
    >
      {err && <div className="error-box">{err}</div>}
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Mağaza adı *</label>
          <input value={f.name} onChange={set('name')} placeholder="Bakı" />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Google Maps linki</label>
          <input value={f.mapUrl} onChange={set('mapUrl')} placeholder="https://maps.google.com/?q=..." />
        </div>

        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Əlaqə nömrələri və məsul şəxslər</label>
          <div className="contact-editor">
            {contacts.map((c, i) => (
              <div className="contact-edit-row" key={i}>
                <LuUser size={14} className="contact-icon" />
                <input
                  placeholder="Ad, Soyad"
                  value={c.contactName}
                  onChange={(e) => updateContact(i, 'contactName', e.target.value)}
                />
                <div className="phone-input">
                  <span className="phone-prefix">+994</span>
                  <input
                    inputMode="numeric"
                    placeholder="50 000 00 00"
                    value={c.phone}
                    onChange={(e) => updateContact(i, 'phone', e.target.value.replace(/\D/g, '').slice(0, 9))}
                  />
                </div>
                <button
                  className="icon-btn"
                  title="Sil"
                  onClick={() => removeContact(i)}
                  disabled={contacts.length === 1}
                >
                  <LuX size={15} />
                </button>
              </div>
            ))}
            <button className="btn ghost sm" onClick={addContact}>
              <LuPlus size={14} /> Nömrə əlavə et
            </button>
          </div>
        </div>

        {isNew && (
          <div className="field">
            <label>Aylıq qiymət (AZN)</label>
            <input type="number" step="0.01" value={f.amount} onChange={set('amount')} placeholder="120" />
          </div>
        )}
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Qeyd</label>
          <input value={f.note} onChange={set('note')} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Status</label>
          <select value={f.active ? '1' : '0'} onChange={(e) => setF({ ...f, active: e.target.value === '1' })}>
            <option value="1">Aktiv</option>
            <option value="0">Deaktiv</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}

function PriceModal({ store, onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState(currentMonth());
  const [err, setErr] = useState('');

  const save = async () => {
    if (amount === '') return setErr('Məbləğ yazın');
    try {
      await api.addPrice(store._id, { amount, effectiveFrom: from });
      onSaved();
    } catch (e) {
      setErr(e.message);
    }
  };

  const history = [...store.prices].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));

  return (
    <Modal
      title={`Qiymət dəyiş — ${store.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Ləğv et</button>
          <button className="btn" onClick={save}>Tətbiq et</button>
        </>
      }
    >
      {err && <div className="error-box">{err}</div>}
      <div className="form-grid">
        <div className="field">
          <label>Yeni aylıq qiymət (AZN)</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <div className="hint" style={{ marginBottom: 6 }}>Mövcud tarixçə</div>
        {history.map((p, i) => (
          <div key={i} style={{ fontSize: 13 }} className="muted">
            {formatMoney(p.amount)} · {monthLabel(p.effectiveFrom)}-dan (əlavə edildi: {formatDate(p.createdAt)})
          </div>
        ))}
        {!history.length && <div className="muted">Qiymət təyin edilməyib</div>}
      </div>
    </Modal>
  );
}