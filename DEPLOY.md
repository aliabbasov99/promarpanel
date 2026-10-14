# PROMAR — Vercel deploy təlimatı

Vercel pulsuz planında işləyir: frontend (statik) + backend (serverless funksiya).
MongoDB Atlas artıq `cluster0.xuqsfhl` ilə işləyir.

---

## 1. Vercel-də environment dəyişənləri (VACİB)

**Vercel → layihə → Settings → Environment Variables**

| Ad | Dəyər |
|---|---|
| `MONGO_URI` | `server/.env` faylındakı `mongodb+srv://...` |
| `JWT_SECRET` | `server/.env` faylındakı dəyər |
| `WEB_PUSH_PUBLIC_KEY` | `server/.env` faylındakı `BOFL...` |
| `WEB_PUSH_PRIVATE_KEY` | `server/.env` faylındakı `9tl2...` |

> `PORT` yazma — Vercel özü verir.
> `.env` faylını yükləməyin; Vercel yalnız dashboard-dan oxuyur.
> (Logda `injected env (0)` görünürsə — bu addım edilməyib.)

Dəyişənləri həm **Production**, həm **Preview** üçün əlavə edin.

---

## 2. MongoDB Atlas — IP girişi

**Atlas → Network Access** → `Allow access from anywhere` (`0.0.0.0/0`).

Vercel funksiyalarının IP-si dəyişkendir, ona görə siyahıya əlavə etmək olmur.

---

## 3. Deploy

Kodu GitHub-a push edin (və ya `vercel` CLI ilə yükləyin).

Layihə kökündə `vercel.json` var:

```json
{
  "buildCommand": "npm run vercel:build",
  "installCommand": "npm install",
  "outputDirectory": "client/dist",
  "functions": { "api/[...path].js": { "maxDuration": 30 } },
  "rewrites": [{ "source": "/:path((?!api/).*)", "destination": "/index.html" }]
}
```

- Frontend Vercel-da qurulur (`npm run vercel:build` → `client/dist`).
- `/api/*` sorğuları `api/[...path].js` serverless funksiyasına gedir
  (funksiya `server/index.js` Express app-ini çağırır).
- Qalan bütün yollar SPA `index.html`-ə yönləndirilir.

Köhnə `builds`/`routes` formatı (Vercel legacy) işləmir — kök səhifə JS faylının
mətni göstərirdi və `/api/*` 404 verirdi. İndi yalnız bu struktur istifadə olunur.

`.vercelignore` `node_modules`, `mobile`, `server/.env` fayllarını yükləməyi bloklayır.

**Frontend API ünvanı:** `client/.env.production` faylında
```
VITE_API_URL=https://promarpanel.vercel.app
```
(Domen dəyişərsə bu faylı və `mobile/app.json` → `expo.extra.apiUrl` hissəsini yeniləyin.)

---

## 4. Deploy sonrası yoxlama

| Sorğu | Gözlənilən |
|---|---|
| `https://promarpanel.vercel.app/` | 200, PROMAR login ekranı |
| `.../api/push/config` | `{"publicKey":"BOFL...","web":true,"mobile":false}` |
| `.../api/auth/login` (POST) | `{"token": ...}` |
| `.../sw.js`, `.../manifest.webmanifest` | 200 (PWA quraşdırma) |

---

## 5. Vercel-in məhdudiyyətləri (vacib)

| Xüsusiyyət | Vercel | İzah |
|---|---|---|
| Panel, mağazalar, ödənişlər, problemlər | ✅ | |
| Excel ixracı | ✅ | |
| Mobil app qoşulması | ✅ | `mobile/app.json` → `apiUrl` |
| **WebSocket** | ❌ | Serverless funksiyada daimi proses yoxdur |
| **Bildirişlər (app açıq)** | ✅ (polling) | 25 saniyədə bir `/api/events` sorğusu |
| **Məlumat yenilənməsi** | ✅ (polling) | 25-45 saniyə gecikmə |
| **Brauzer bağlı ikən push** | ⚠️ zəif | Funksiya "yatır" — hadisə baş verdikdə göndərilir |

Bu səbəbdə server `IS_SERVERLESS` rejimdə `socket.io`-nu açmır, `broadcast()` isə
hadisələri MongoDB-ə yazır (`server/models/Event.js`, 48 saat saxlanılır).
Frontend `live === false` olanda avtomatik polling-ə keçir.

**Həmişə açıq, ani bildiriş lazımdırsa** — daimi prosesli host (Oracle Cloud Always Free,
Fly.io, Railway) lazımdır; Vercel bunu verə bilmir.

---

## 6. Mobil tətbiq

`mobile/app.json`:
```json
"extra": { "apiUrl": "https://promarpanel.vercel.app" }
```

Sonra `eas init` (projectId) + `EXPO_PUSH_TOKEN` `server/.env`-ə və Vercel-ə əlavə olunur.
Mobil push yalnız bundan sonra aktiv olur (`/api/push/config` → `"mobile": true`).