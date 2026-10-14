import { api, getToken } from './api';

const VAPID_HELP =
  'Push yalnız HTTPS və ya localhost-da işləyir. Bu halda http://IP ünvanı ilə açmısınız.';

// VAPID açarını server-dən alır
async function getPublicKey() {
  const res = await fetch('/api/push/config');
  const data = await res.json();
  return data.publicKey;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function permission() {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission; // default | granted | denied
}

// Service Worker qeydi
export async function registerSW() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return reg;
}

// İcazə al + abunə yarat + serverə göndər
export async function enablePush() {
  if (!pushSupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };

  const publicKey = await getPublicKey();
  if (!publicKey) return { ok: false, reason: 'no-key' };

  const reg = await registerSW();
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ||
    await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

  const token = await getToken();
  await fetch('/api/push/web', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(sub.toJSON()),
  });

  return { ok: true, subscription: sub };
}

// Abunəni söndür
export async function disablePush() {
  try {
    if (pushSupported()) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    }
    await api.unsubscribePush();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

export async function isSubscribed() {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
}

export { VAPID_HELP };