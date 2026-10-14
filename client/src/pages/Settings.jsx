import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotify } from '../notify';
import { useAuth } from '../auth';
import { api } from '../api';
import { applyTheme } from '../theme';
import { initPWA, getState, onInstallChange, promptInstall } from '../pwa';
import {
  pushSupported, permission, enablePush, disablePush, isSubscribed, VAPID_HELP,
} from '../push';
import {
  LuBell, LuMoon, LuSun, LuKeyRound, LuLogOut, LuUsers, LuCheck,
} from 'react-icons/lu';

export default function Settings() {
  const { online } = useNotify();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [theme, setTheme] = useState(localStorage.getItem('promar.theme') || 'light');
  const [notifOn, setNotifOn] = useState(localStorage.getItem('promar.notifications') !== 'off');
  const [passOpen, setPassOpen] = useState(false);

  // ---- Brauzer push (bildiriş) ----
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushInfo, setPushInfo] = useState('');

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
      if (!pushSupported()) return setPushInfo('Bu brauzer push dəstəkləmir');
      if (!window.isSecureContext) {
        return setPushInfo(`${VAPID_HELP} (İndi: http://${location.host})`);
      }
      const perm = await permission();
      if (perm === 'denied') {
        return setPushInfo('Brauzer icazəsi rədd edilib — brauzer ayarlarından açın');
      }
      const sub = await isSubscribed();
      setPushOn(sub);
      setPushInfo(
        sub
          ? 'Aktivdır — brauzer bağlı olanda da bildiriş gələcək'
          : perm === 'granted'
            ? 'Hələ yandırılmayıb'
            : 'Yandırmaq üçün brauzer icazəsi lazımdır'
      );
    })();
  }, []);

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
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="settings-empty">
            {notifOn
              ? 'Bildirişlər açıqdır — başqası problem açanda və status dəyişəndə xəbərdarlıq alırsınız.'
              : 'Bildirişlər bağlıdır — problem və status dəyişiklikləri göstərilməyəcək.'}
          </div>

          {/* Brauzer push: tab/brauzer bağlı olanda da bildiriş gəlir */}
          <div className="settings-row">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Brauzer bildirişi (push)</div>
              <div className="muted" style={{ fontSize: 12 }}>{pushInfo}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {!pushOn ? (
                <button className="btn sm" onClick={askPush} disabled={pushBusy}>
                  {pushBusy ? 'Gözlənilir…' : 'Yandır'}
                </button>
              ) : (
                <button className="btn ghost sm" onClick={turnOffPush}>Söndür</button>
              )}
            </div>
          </div>
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