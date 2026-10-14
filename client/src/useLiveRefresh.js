import { useEffect } from 'react';

// Serverless mühitdə (Vercel) WebSocket işləmir — bu hook 45 saniyədə bir
// məlumatı yeniləyir ki, istifadəçi köhnə məlumatı görməsin.
export function useLiveRefresh(fn) {
  useEffect(() => {
    const handler = () => fn();
    window.addEventListener('promar:refresh', handler);
    return () => window.removeEventListener('promar:refresh', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn]);
}