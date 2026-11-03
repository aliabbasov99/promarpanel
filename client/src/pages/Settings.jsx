import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotify } from '../notify';
import { useAuth } from '../auth';
import { api } from '../api';
import { applyTheme } from '../theme';
import { initPWA, getState, onInstallChange, promptInstall } from '../pwa';
import { initOneSignal } from '../oneSignal';
import {
  pushSupported, permission, enablePush, disablePush, isSubscribed, VAPID_HELP,
} from '../push';
import {
  LuBell, LuMoon, LuSun, LuKeyRound, LuLogOut, LuUsers, LuCheck, LuSend,
} from 'react-icons/lu';

export default function Settings() {
  const { online } = useNotify();
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [theme, setTheme] = useState(localStorage.getItem('promar.theme') || 'light');
  const [notifOn, setNotifOn] = useState(localStorage.getItem('promar.notifications') !== 'off');
  const [passOpen, setPassOpen] = useState(false);

  // ---- Brauzer push (bildiriş) ----
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushInfo, setPushInfo] = useState('');
  const [perm, setPerm] = useState('default');

  // PWA (tətbiqi yüklə)
  const [pwa, setPwa] = useState({ canInstall: false, installed: false, ios: false, secure: true });
  const [pwaBusy, setPwaBusy] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    setPwa(getState());
    return onInstallChange(setPwa);
  }, []);

  const pwaInfo = pwa.installed
    ? 'Tətbiq artıq yüklənib — ayrıca pəncərədə açılır'
    : !pwa.secure
      ? 'Yalnız HTTPS və ya localhost-da mümkündür'
      : pwa.canInstall
        ? 'Chrome/Edge: tətbiq ayrıca pəncərədə işləyəcək'
        : 'Brauzer menyusundan "Quraşdır / Yüklə" seçin';

  const doInstall = async () => {
    setPwaBusy(true);
    try {
      await promptInstall();
      setPwa(getState());
    } finally {
      setPwaBusy(false);
    }
  };

  useEffect(() => {
    (async () => {
      if (!('Notification' in window)) return setPerm('unsupported');
      setPerm(Notification.permission);
      if (Notification.permission === 'default') {
        // İlk açılışda icazə soruşulur (yalnız bir dəfə)
        const p = await permission();
        setPerm(p);
      }
      if (!pushSupported() || !window.isSecureContext) return;
      const sub = await isSubscribed();
      setPushOn(sub);
    })();
  }, []);

  // Brauzer ayarlarında bildiriş icazələrini açmaq
  const openBrowserSettings = () => {
    const url = `chrome://settings/content/notifications`;
    const w = window.open(url, '_blank');
    if (!w) location.href = url; // yeni sekməsi bloklanıb
  };

  const askPush = async () => {
    setPushBusy(true);
    try {
      const res = await enablePush();
      if (res.ok) {
        setPushOn(true);
        setPushInfo('Aktivdır — brauzer bağlı olanda da bildiriş gələcək');
      } else {
        setPushInfo({
          denied: 'Brauzer icazəsi rədd edildi',
          'no-key': 'Server VAPID açarı yoxdur',
          unsupported: 'Bu brauzer dəstəkləmir',
        }[res.reason] || 'Yandırıla bilmədi');
      }
    } catch (e) {
      setPushInfo('Xəta: ' + e.message);
    } finally {
      setPushBusy(false);
    }
  };

  const turnOffPush = async () => {
    setPushBusy(true);
    try {
      await disablePush();
      setPushOn(false);
      setPushInfo('Söndürülüb');
    } finally {
      setPushBusy(false);
    }
  };

  // ---- Telegram (hesaba bağlı) ----
  const [tg, setTg] = useState({ linked: false, enabled: false, url: '', bot: '' });
  const [tgBusy, setTgBusy] = useState(false);

  const loadTg = async () => {
    try {
      const s = await api.telegramStatus();
      setTg((t) => ({ ...t, ...s }));
    } catch {
      /* server əlçatan deyilsə sus */
    }
  };

  useEffect(() => {
    loadTg();
  }, []);

  const tgLink = async () => {
    setTgBusy(true);
    try {
      const r = await api.telegramLink();
      setTg((t) => ({ ...t, url: r.url, code: r.code }));
    } catch (e) {
      alert('Telegram linki yaradıla bilmədi: ' + e.message);
    } finally {
      setTgBusy(false);
    }
  };

  const tgUnlink = async () => {
    setTgBusy(true);
    try {
      await api.telegramUnlink();
      setTg((t) => ({ ...t, linked: false, url: '' }));
    } finally {
      setTgBusy(false);
    }
  };

  const tgTest = async () => {
    setTgBusy(true);
    try {
      const r = await api.telegramTest();
      if (r.error) alert(r.error);
    } catch (e) {
      alert('Test göndərilmədi: ' + e.message);
    } finally {
      setTgBusy(false);
    }
  };

  // ---- İstifadəçilər (admin) ----
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'helpdesk' });
  const [busyUser, setBusyUser] = useState(false);
  const [userErr, setUserErr] = useState('');

  const loadUsers = async () => {
    try {
      setUsers(await api.getUsers());
    } catch {
      setUsers([]);
    }
  };

  const createUser = async () => {
    if (!newUser.username.trim() || !newUser.password) {
      return setUserErr('İstifadəçi adı və parol tələb olunur');
    }
    setBusyUser(true);
    setUserErr('');
    try {
      await api.createUser(newUser);
      setNewUser({ username: '', password: '', role: 'helpdesk' });
      await loadUsers();
    } catch (e) {
      setUserErr(e.message);
    } finally {
      setBusyUser(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  // ---- OneSignal bildirişi ----
  const [osBusy, setOsBusy] = useState(false);
  const [osOn, setOsOn] = useState(false);

  const askOneSignal = async () => {
    setOsBusy(true);
    try {
      const res = await initOneSignal();
      if (res.ok) {
        setOsOn(true);
      } else {
        setOsOn(false);
        alert(
          res.reason === 'denied'
            ? 'Bildiriş icazəsi rədd edildi — brauzer ayarlarından açın.'
            : 'Bildiriş yandırıla bilmədi: ' + res.reason
        );
      }
    } finally {
      setOsBusy(false);
    }
  };

  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    applyTheme(t);
  };

  const toggleNotif = () => {
    const v = !notifOn;
    setNotifOn(v);
    localStorage.setItem('promar.notifications', v ? 'on' : 'off');
    if (v) document.dispatchEvent(new CustomEvent('promar-notify-toggle', { detail: true }));
    else document.dispatchEvent(new CustomEvent('promar-notify-toggle', { detail: false }));
  };

  const doLogout = () => {
    if (confirm('Çıxış etmək istəyirsiniz?')) {
      logout();
      navigate('/login');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Parametrlər</h1>
          <div className="sub">Bildirişlər, görünüş və təhlükəsizlik</div>
        </div>
      </div>

      {/* Hesab */}
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-head"><h2>Hesab</h2></div>
        <div className="panel-body">
          <div className="account-row">
            <div className="account-avatar">{(user?.username || '?').slice(0, 2).toUpperCase()}</div>
            <div>
              <div className="account-name">{user?.username}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <span className={`badge ${user?.role === 'admin' ? 'paid' : 'pending'}`}>
                  {user?.role === 'admin' ? 'Admin' : 'Helpdesk'}
                </span>
                <span className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <LuUsers size={13} /> {online} istifadəçi onlayn
                </span>
              </div>
            </div>
            <button className="btn danger" onClick={doLogout}>
              <LuLogOut size={15} /> Çıxış
            </button>
          </div>
        </div>
      </div>

      {/* İstifadəçilər — yalnız admin */}
      {isAdmin && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-head">
            <h2><LuUsers size={16} /> İstifadəçilər</h2>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {users.map((u) => (
              <div key={u._id} className="settings-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {u.username} {u._id === user?._id ? <span className="muted">(siz)</span> : null}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {u.role === 'admin' ? 'Admin — tam hüquq' : 'Helpdesk — yalnız cari ay statusu'}
                  </div>
                </div>
                {u._id !== user?._id && (
                  <button
                    className="btn ghost sm"
                    onClick={async () => {
                      if (!confirm(`${u.username} hesabını silmək istəyirsiniz?`)) return;
                      await api.deleteUser(u._id);
                      loadUsers();
                    }}
                  >
                    Sil
                  </button>
                )}
              </div>
            ))}

            <div className="settings-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ flex: 1, minWidth: 180, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="input"
                  placeholder="İstifadəçi adı"
                  value={newUser.username}
                  onChange={(e) => setNewUser((u) => ({ ...u, username: e.target.value }))}
                  autoCapitalize="none"
                />
                <input
                  className="input"
                  placeholder="Parol"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                />
                <select
                  className="input"
                  value={newUser.role}
                  onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value }))}
                  style={{ maxWidth: 140 }}
                >
                  <option value="helpdesk">Helpdesk</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button className="btn sm" onClick={createUser} disabled={busyUser}>
                {busyUser ? 'Yaradılır…' : 'Əlavə et'}
              </button>
            </div>
            {userErr && <div className="error-box">{userErr}</div>}
          </div>
        </div>
      )}

      {/* Telegram */}
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-head">
          <h2><LuSend size={16} /> Telegram</h2>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="settings-row" style={{ borderTop: 'none', paddingTop: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {tg.linked ? 'Bağlıdır' : 'Bağlı deyil'}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {tg.linked
                  ? 'Hadisələr bu Telegram hesabınıza gələcək'
                  : 'İstifadəçi adı və parolunuzla giriş etdiyiniz hesabın hadisələri Telegram-a gəlsin'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {tg.linked ? (
                <>
                  <button className="btn ghost sm" onClick={tgTest} disabled={tgBusy}>
                    Test
                  </button>
                  <button className="btn ghost sm" onClick={tgUnlink} disabled={tgBusy}>
                    Söndür
                  </button>
                </>
              ) : (
                <button className="btn sm" onClick={tgLink} disabled={tgBusy}>
                  {tgBusy ? 'Yaradılır…' : 'Telegram-ı qoş'}
                </button>
              )}
            </div>
          </div>

          {tg.url && (
            <div className="hint">
              Bu linki Telegram-da açın və **Start** düyməsini basın:
              <br />
              <a href={tg.url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                {tg.url}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Bildirişlər */}
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-head">
          <h2><LuBell size={16} /> Bildirişlər</h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>
              {notifOn ? 'Açıqdır' : 'Bağlıdır'}
            </span>
            <button className={`switch ${notifOn ? 'on' : ''}`} onClick={toggleNotif}>
              <span />
            </button>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Bildiriş icazəsi açıq deyilsə — brauzer ayarlarına açmaq düyməsi */}
          {perm === 'denied' && (
            <div className="settings-row" style={{ borderTop: 'none', paddingTop: 0 }}>
              <div className="muted" style={{ fontSize: 13 }}>
                Bildiriş icazələri bağlıdır
              </div>
              <button className="btn sm" onClick={openBrowserSettings}>
                Bildiriş icazələrini aç
              </button>
            </div>
          )}

          {/* OneSignal — əsas kanal */}
          <div className="settings-row" style={{ borderTop: 'none', paddingTop: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Bildirişləri yandır</div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {!osOn ? (
                <button className="btn sm" onClick={askOneSignal} disabled={osBusy}>
                  {osBusy ? 'Gözlənilir…' : 'Yandır'}
                </button>
              ) : (
                <button className="btn ghost sm" onClick={() => { setOsOn(false); setOsInfo('Söndürüldü'); }}>
                  Söndür
                </button>
              )}
            </div>
          </div>

          {pushOn && (
            <div className="settings-row" style={{ borderTop: 'none', paddingTop: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Brauzer bildirişi</div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="btn ghost sm" onClick={turnOffPush}>Söndür</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tətbiq (PWA) */}
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-head"><h2>Tətbiq (PWA)</h2></div>
        <div className="panel-body">
          <div className="settings-row" style={{ borderTop: 'none', paddingTop: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>PROMAR Dashboard-ı yüklə</div>
              <div className="muted" style={{ fontSize: 12 }}>{pwaInfo}</div>
            </div>
            {!pwa.installed && (
              <div style={{ flexShrink: 0 }}>
                {pwa.canInstall ? (
                  <button className="btn sm" onClick={doInstall} disabled={pwaBusy}>
                    {pwaBusy ? 'Yüklənir…' : 'Yüklə'}
                  </button>
                ) : (
                  <button className="btn ghost sm" onClick={() => setShowIosHelp((v) => !v)}>
                    Necə?
                  </button>
                )}
              </div>
            )}
          </div>

          {showIosHelp && (
            <div className="hint" style={{ marginTop: 12 }}>
              <strong>iPhone / iPad:</strong> Safari-də <em>Paylaş</em> → <em>Ana ekrana əlavə et</em>.
              <br />
              <strong>Windows / Android (Chrome):</strong> brauzer menyusundakı
              <em> ⋮ → Quraşdır / Yüklə</em> və ya ünvan barındakı install simvolu.
            </div>
          )}
        </div>
      </div>

      {/* Görünüş */}
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-head"><h2><LuMoon size={16} /> Görünüş</h2></div>
        <div className="panel-body">
          <div className="theme-row">
            <button className={`theme-card ${theme === 'light' ? 'active' : ''}`} onClick={() => { setTheme('light'); applyTheme('light'); }}>
              <LuSun size={20} />
              <span>Gündüz</span>
            </button>
            <button className={`theme-card dark ${theme === 'dark' ? 'active' : ''}`} onClick={toggleTheme}>
              <LuMoon size={20} />
              <span>Qara rejim</span>
            </button>
          </div>
        </div>
      </div>

      {/* Təhlükəsizlik */}
      <div className="panel">
        <div className="panel-head"><h2><LuKeyRound size={16} /> Təhlükəsizlik</h2></div>
        <div className="panel-body">
          {!passOpen ? (
            <button className="btn" onClick={() => setPassOpen(true)}>Parolu dəyişmək</button>
          ) : (
            <ChangePassword onDone={() => setPassOpen(false)} />
          )}
        </div>
      </div>
    </>
  );
}

function ChangePassword({ onDone }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setMsg(null);
    if (!cur || !next) return setMsg({ type: 'error', text: 'Cari və yeni parolu doldurun' });
    if (next !== repeat) return setMsg({ type: 'error', text: 'Yeni parollar uyğun gəlmir' });
    if (next.length < 4) return setMsg({ type: 'error', text: 'Parol ən azı 4 simvol olmalıdır' });
    setBusy(true);
    try {
      await api.changePassword(cur, next);
      setMsg({ type: 'ok', text: 'Parol uğurla dəyişdirildi' });
      setCur(''); setNext(''); setRepeat('');
      setTimeout(onDone, 1500);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pass-form" style={{ maxWidth: 460 }}>
      {msg && (
        <div className={`pass-msg ${msg.type}`}>
          {msg.type === 'ok' && <LuCheck size={13} />} {msg.text}
        </div>
      )}
      <div className="field">
        <label>Cari parol</label>
        <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
      </div>
      <div className="field">
        <label>Yeni parol</label>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </div>
      <div className="field">
        <label>Yeni parol (təkrar)</label>
        <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
      </div>
      <div className="settings-actions">
        <button className="btn ghost" onClick={onDone}>Ləğv et</button>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saxlanır…' : 'Parolu dəyiş'}</button>
      </div>
    </div>
  );
}