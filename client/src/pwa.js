// PWA (tətbiq kimi quraşdırma) — Chrome/Edge üçün "Yüklə" düyməsi
let deferredPrompt = null;
const listeners = new Set();

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  const state = getState();
  for (const fn of listeners) fn(state);
}

export function initPWA() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Chrome öz "Yüklə" menyusu göstərməsin, biz öz düyməmizi göstərək
    e.preventDefault();
    deferredPrompt = e;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
}

export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export function isIOS() {
  const ua = window.navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
}

export function getState() {
  return {
    canInstall: Boolean(deferredPrompt),
    installed: isStandalone(),
    ios: isIOS(),
    secure: window.isSecureContext,
  };
}

// "Yüklə" düyməsini basanda
export async function promptInstall() {
  if (!deferredPrompt) return { ok: false, reason: 'unavailable' };
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    deferredPrompt = null;
    emit();
    return { ok: true };
  }
  return { ok: false, reason: 'dismissed' };
}