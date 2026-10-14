import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { socket, api } from './api';

const NotifyContext = createContext(null);
export const useNotify = () => useContext(NotifyContext);

const KEY_NOTIF = 'promar.notifications';

const STATUS_LABEL = {
  open: 'Açıq',
  in_progress: 'İşlənir',
  resolved: 'Həll olundu',
};

export function NotifyProvider({ children }) {
  const [items, setItems] = useState([]);
  const [online, setOnline] = useState(1);
  const [unread, setUnread] = useState(0);
  const [enabled, setEnabled] = useState(() => localStorage.getItem(KEY_NOTIF) !== 'off');
  // WebSocket varmı? (Vercel serverless-də yoxdur — o halda ehtiyat yeniləmə işə düşür)
  const [live, setLive] = useState(() => socket.connected);

  // Socket qopanda heç nə baş vermir — aşağıdakı polling işə düşür
  useEffect(() => {
    if (live) return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // Parametrlər səhifəsindən aç/bağla dəyişikliyi
  useEffect(() => {
    const onToggle = (e) => setEnabled(e.detail !== false);
    document.addEventListener('promar-notify-toggle', onToggle);
    return () => document.removeEventListener('promar-notify-toggle', onToggle);
  }, []);

  const push = useCallback((n) => {
    if (localStorage.getItem(KEY_NOTIF) === 'off') return;
    setItems((prev) => [n, ...prev].slice(0, 30));
    setUnread((u) => u + 1);

    // Brauzer bildirişi (icazə verilibsə)
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(n.title, { body: n.body, tag: n.id });
      } catch {
        /* bəzi brauzerlər blok edir */
      }
    }
    setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== n.id));
    }, 9000);
  }, []);

  const toggle = () => setEnabled((v) => !v);

  useEffect(() => {
    socket.on('presence', (p) => setOnline(p.online));
    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));

    socket.on('issue:created', (d) => {
      push({
        id: 'created-' + d.id + Date.now(),
        kind: 'created',
        title: d.by + ' - "' + d.title + '"',
        body: `Yeni problem · ${d.store}`,
        at: d.at,
      });
    });

    socket.on('issue:status', (d) => {
      push({
        id: 'status-' + d.id + Date.now(),
        kind: d.archived ? 'archived' : 'status',
        title: d.by + ' - "' + d.title + '"',
        body: `${d.message} · ${d.store}`,
        at: d.at,
      });
    });

    socket.on('issue:deleted', (d) => {
      push({
        id: 'deleted-' + d.id + Date.now(),
        kind: 'deleted',
        title: d.by + ' - "' + d.title + '"',
        body: 'Problem silindi',
        at: d.at,
      });
    });

    return () => {
      socket.off('presence');
      socket.off('issue:created');
      socket.off('issue:status');
      socket.off('issue:deleted');
    };
  }, [push]);

  // ---- Serverless rejim (Vercel): WebSocket yoxdur, 25 saniyədə bir yoxlayır ----
  useEffect(() => {
    if (live) return undefined;

    let since = new Date().toISOString();
    let busy = false;

    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const rows = await api.getEvents(since);
        rows.forEach((r) => {
          const d = r.data || {};
          push({
            id: 'ev-' + r._id,
            kind:
              r.event === 'issue:created'
                ? 'created'
                : r.event === 'issue:deleted'
                  ? 'deleted'
                  : d.archived
                    ? 'archived'
                    : 'status',
            title: d.title ? `${d.by || r.actorRole} - "${d.title}"` : d.by || 'PROMAR',
            body: d.message ? `${d.message} · ${d.store || ''}`.replace(/ · $/, '') : '',
            at: r.at,
          });
        });
        if (rows.length) since = rows[rows.length - 1].at;
        // Səhifələr öz məlumatını yeniləsin
        window.dispatchEvent(new Event('promar:refresh'));
      } catch {
        /* şəbəkə yoxdur — növbəti cəhdda yenidən */
      } finally {
        busy = false;
      }
    };

    poll();
    const timer = setInterval(poll, 25000);
    return () => clearInterval(timer);
  }, [live, push]);

  const clear = () => { setItems([]); setUnread(0); };
  const markRead = () => setUnread(0);

  return (
    <NotifyContext.Provider
      value={{
        items, unread, online, clear, markRead,
        enabled, toggle, live, statusLabel: STATUS_LABEL,
      }}
    >
      {children}
    </NotifyContext.Provider>
  );
}