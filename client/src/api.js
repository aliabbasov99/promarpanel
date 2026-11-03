import { io } from 'socket.io-client';
import { getClientId } from './identity';

const BASE = '/api';

// Vercel və s.: frontend Vercel-də, backend başqa yerdədir.
// VITE_API_URL = https://api.sizin-domain.az  (dev-də boş buraxılır — Vite proxy işləyir)
const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const SOCKET_ORIGIN = API_ORIGIN || undefined;

// Vercel serverless mühitdə WebSocket işləmir (funksiya daimi deyil),
// ona görə production-da socket qoşulmur — bildirişlər polling ilə gəlir.
const SOCKET_ENABLED = import.meta.env.DEV;

let token = localStorage.getItem('promar.token') || null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('promar.token', t);
  else localStorage.removeItem('promar.token');
}

export function getToken() {
  return token || localStorage.getItem('promar.token') || null;
}

async function request(path, options = {}) {
  const t = getToken();
  const res = await fetch(API_ORIGIN + BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': getClientId(),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => null);

  if (res.status === 401 && data?.error !== 'İstifadəçi adı və ya parol səhvdir') {
    // Sessiya bitdi
    setToken(null);
    if (!location.pathname.startsWith('/login')) location.href = '/login';
  }
  if (!res.ok) throw new Error(data?.error || 'Xəta baş verdi');
  return data;
}

// Real-vaxt bildirişlər
export const socket = io(SOCKET_ORIGIN, {
  path: '/socket.io',
  auth: { clientId: getClientId() },
  autoConnect: SOCKET_ENABLED,
  // Serverless (Vercel) mühitdə WebSocket yoxdur — tekrarları kəsmək üçün
  reconnectionDelay: 3000,
  reconnectionDelayMax: 30000,
  reconnectionAttempts: 5,
  timeout: 8000,
});

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),

  getStores: (active) => request(`/stores${active !== undefined ? `?active=${active}` : ''}`),
  getStoreOptions: () => request('/stores/options'),
  createStore: (body) => request('/stores', { method: 'POST', body: JSON.stringify(body) }),
  updateStore: (id, body) => request(`/stores/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  toggleStore: (id, active) =>
    request(`/stores/${id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  addPrice: (id, body) => request(`/stores/${id}/price`, { method: 'POST', body: JSON.stringify(body) }),
  deleteStore: (id) => request(`/stores/${id}`, { method: 'DELETE' }),

  getPayments: (month, includeInactive = false) =>
    request(`/payments?month=${month}&includeInactive=${includeInactive}`),
  getStorePayments: (id, from, to) => request(`/stores/${id}/payments?from=${from}&to=${to}`),
  bulkPay: (id, body) =>
    request(`/stores/${id}/payments/bulk`, { method: 'POST', body: JSON.stringify(body) }),
  pay: (body) => request('/payments', { method: 'POST', body: JSON.stringify(body) }),
  deletePayment: (id) => request(`/payments/${id}`, { method: 'DELETE' }),

  getIssues: (params = '') => request(`/issues${params}`),
  createIssue: (body) => request('/issues', { method: 'POST', body: JSON.stringify(body) }),
  updateIssue: (id, body) => request(`/issues/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteIssue: (id) => request(`/issues/${id}`, { method: 'DELETE' }),

  getStats: (month) => request(`/stats?month=${month}`),
  getCash: (month) => request(`/cash?month=${month}`),
  addCash: (body) => request('/cash', { method: 'POST', body: JSON.stringify(body) }),
  deleteCash: (id) => request(`/cash/${id}`, { method: 'DELETE' }),
  // Serverless (Vercel) rejimdə WebSocket yoxdur — bildirişlər bu sorğu ilə gəlir
  getEvents: (since) => request(`/events?since=${encodeURIComponent(since)}`),

  unsubscribePush: () => request('/push/web', { method: 'DELETE' }),
  registerMobilePush: (token, platform) =>
    request('/push/mobile', { method: 'POST', body: JSON.stringify({ token, platform }) }),
  unregisterMobilePush: () => request('/push/mobile', { method: 'DELETE' }),

  // OneSignal (web + mobil)
  registerOneSignalPlayer: (playerId, platform) =>
    request('/push/onesignal', { method: 'POST', body: JSON.stringify({ playerId, platform }) }),

  // Firebase (FCM) — həm web, həm Android
  getPushConfig: () => request('/push/config'),
  registerFirebaseToken: (token) =>
    request('/push/mobile', { method: 'POST', body: JSON.stringify({ token, platform: 'web' }) }),
  deleteMobilePush: () => request('/push/mobile', { method: 'DELETE' }),

  // Gecikmiş işarəsi
  markLate: (storeId, month) =>
    request(`/stores/${storeId}/late`, { method: 'POST', body: JSON.stringify({ month }) }),
  clearLate: (storeId) => request(`/stores/${storeId}/late`, { method: 'DELETE' }),

  // Hesabatlar
  getReport: (from, to) => request(`/report?from=${from}&to=${to}`),

  // Telegram (hesaba bağlı)
  telegramStatus: () => request('/telegram/status'),
  telegramLink: () => request('/telegram/link', { method: 'POST' }),
  telegramUnlink: () => request('/telegram/unlink', { method: 'POST' }),
  telegramTest: () => request('/telegram/test', { method: 'POST' }),

  // İstifadəçilər (admin)
  getUsers: () => request('/users'),
  createUser: (body) => request('/users', { method: 'POST', body: JSON.stringify(body) }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
};