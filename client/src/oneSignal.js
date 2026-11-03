// OneSignal — WEB (brauzer bildirişləri)
// Service worker: /OneSignalSDKWorker.js
//
// OneSignal SDK v16 qaydası:
//   window.OneSignalDeferred.push(async function (OneSignal) { ... })
// — funksiyaya SDK obyekti ötürülür, `OneSignalDeferred.init()` yoxdur.
import { api } from './api';

const APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || '706fdc45-ae83-4fcd-bef0-fd00f6dca0a6';

let initPromise = null;

// SDK-ni yükləyib OneSignal obyektini qaytarır
function loadSdk() {
  return new Promise((resolve, reject) => {
    if (window.OneSignal) return resolve(window.OneSignal);

    window.OneSignalDeferred = window.OneSignalDeferred || [];

    // SDK hazır olanda bu funksiya OneSignal obyektini alır
    window.OneSignalDeferred.push((OneSignal) => resolve(OneSignal));

    if (!document.querySelector('script[data-onesignal]')) {
      const script = document.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer = true;
      script.setAttribute('data-onesignal', '1');
      script.onerror = () => reject(new Error('OneSignal SDK yüklənmədi (internet?)'));
      document.head.appendChild(script);
    }

    setTimeout(() => {
      if (!window.OneSignal) reject(new Error('OneSignal SDK cavab vermədi'));
    }, 15000);
  });
}

// Bildirişi aktivləşdir: icazə + opt-in + player id-ni serverə göndər
export async function initOneSignal() {
  if (!('Notification' in window) || !window.isSecureContext) {
    return { ok: false, reason: 'Bu brauzer bildirişi dəstəkləmir (HTTPS lazımdır)' };
  }

  if (!initPromise) {
    initPromise = (async () => {
      const OneSignal = await loadSdk();

      await OneSignal.init({
        appId: APP_ID,
        serviceWorkerPath: '/OneSignalSDKWorker.js',
        serviceWorkerParam: { scope: '/' },
        allowLocalhostAsSecureOrigin: true,
        notifyButton: { enable: false },
      });

      // İcazə
      await OneSignal.Notifications.requestPermission();

      if (!OneSignal.Notifications.permission) {
        return { ok: false, reason: 'denied' };
      }

      // Abunə
      if (OneSignal.User?.PushSubscription?.optedOut) {
        await OneSignal.User.PushSubscription.optOut();
      }
      if (!OneSignal.User?.PushSubscription?.optedIn) {
        await OneSignal.User.PushSubscription.optIn();
      }

      const id = OneSignal.User?.PushSubscription?.id || null;
      if (id) await api.registerOneSignalPlayer(id, 'web');

      return { ok: true, playerId: id };
    })().catch((e) => ({ ok: false, reason: e.message }));
  }

  return initPromise;
}

export function oneSignalAppId() {
  return APP_ID;
}