// Köhnə sənədlər
# panel-promar

MERN stack əsaslı IT Helpdesk idarəetmə paneli (Azure dili).

## Qovluqlar
- `server/` — Express + Mongoose (MongoDB Atlas)
- `client/` — React + Vite + React Router

## İşə salma

### Server
```
cd server
npm install
npm run dev      # nodemon, http://localhost:5000
```
`.env` faylında `MONGO_URI` və `PORT` təyin olunur.

Demo məlumat yükləmək:
```
npm run seed
```

### Client
```
cd client
npm install
npm run dev      # http://localhost:5173
```

## İstifadəçilər

Panelə girişsiz daxil olmaq mümkün deyil. İki rol var:

| Rol | Parol | İcazələr |
|---|---|---|
| `admin` / `admin` | admin | Hər şey: mağaza yaratmaq/redaktə/silmək, qiymət dəyişmək, ödəniş qeyd etmək və silmək, problemlər |
| `helpdesk` / `helpdesk` | helpdesk | Ödənişləri **görə bilər**, problem açıb status dəyişə bilər, mağazaları görə bilər. **Yaza bilməz** (ödəniş qeydi, mağaza əlavəsi, qiymət dəyişməsi) |

Parollar **bcrypt** ilə hash-lənir, açıq saxlanmır. Parolu dəyişmək üçün:
Parametrlər (⚙) → Təhlükəsizlik → "Parolu dəyişmək".

Yeni istifadəçi yaratmaq:
```
POST /api/users  (admin token ilə)
{ "username": "nov", "password": "1234", "role": "helpdesk" }
```

## Bildirişlər

Problem açıldıqda, status dəyişəndə (o cümlədən arxivlənmə və yenidən açılma) və
problem silindikdə **digər** istifadəçilər real-vaxt bildiriş alır (Socket.IO).
Dəyişikliyi edən istifadəçi öz bildirişini görmür.

Parametrlər menyusunda bildirişləri aç/bağla etmək, qara rejim və parol dəyişmək olar.

Bildiriş formatı:
```
ADMIN - "TEREZI ISLEMIR"
həll olundu · ELMAR DSK
```
Başlıqda rol (ADMIN/HELPDESK) və problem adı, altında nə baş verdiyi.

| | App/brauzer açıq | Tam bağlı |
|---|---|---|
| Web | ✅ işləyir | ✅ (PWA push) |
| Mobil | ✅ işləyir | ❌ push yoxdur |

**Tam həllün planı** (push, token qeydi, `expo-server-sdk`, PWA) → **`NOTIFICATIONS.md`**

## Səhifələr
1. **İdarəetmə** — statistika + faiz çubuğu, gecikdirilmiş ödənişlər, açıq problemlər
2. **Ödənişlər** — ay seçimi, cədvəl; 10-a qədər "Gözlənilir", 10 keçəndə "Gecikdirilmiş".
   "Hamısını göstər" / "Aktiv göstər" — deaktiv mağazaları gizlədir.
3. **Problemlər** — açıq problemlər + **Arxiv** (həll olunmuşlar). Problem "Həll olundu"
   olunanda avtomatik arxivə keçir, arxivdə statusu dəyişib yenidən açmaq mümkündür.
4. **Mağazalar** — ad, Google Maps linki, telefon, şəxs, aktiv/deaktiv, qiymət tarixçəsi

## Mobil (React Native / Expo)

`mobile/` qovluğunda web panel ilə eyni funksiyaların mobil versiyası — eyni API, eyni server,
eyni bildiriş formatı. Detallı təlimat: `mobile/README.md`.

```bash
npm run mobile:android   # Android
npm run mobile:ios       # iOS (macOS)
```

Server ünvanı `mobile/app.json` → `expo.extra.apiUrl` (və ya `EXPO_PUBLIC_API_URL`).

## Qiymət məntiqi
Mağazanın qiymətləri `prices` massivi ilə saxlanılır: `{ amount, effectiveFrom: "YYYY-MM" }`.
Ay üçün qiymət = `effectiveFrom <= month` olan ən son qiymət. Beləliklə keçmiş ödənişlərin
qiyməti heç vaxt dəyişmir.

## Deploy (yeni server)

```bash
# 1. Asılılıqlar (server: socket.io, bcryptjs, jsonwebtoken | client: socket.io-client)
npm run setup

# 2. Client build (server client/dist qovluğunu özü xidmət edir)
npm run build

# 3. İlk dəfə istifadəçilər (admin/admin, helpdesk/helpdesk)
npm run seed-users

# 4. Başlat
npm start
```

Panel `http://localhost:5000` (və ya PORT) üzərində açılır — həm API, həm frontend, həm də bildiriş WebSocket-i eyni portdadır.

**Vacib environment dəyişənləri** (`server/.env`):

| Dəyişən | Açıqlama |
|---|---|
| `MONGO_URI` | MongoDB Atlas URI-si (IP whitelist unutmayın) |
| `JWT_SECRET` | Token açarı — **dəyişməyin**, bütün cihazlarda eyni olmalıdır |
| `PORT` | Standart 5000 |

### nginx varsa

Bildirişlər WebSocket ilə işləyir, ona görə `/socket.io` üçün `Upgrade` başlıqları lazımdır:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 600s;
}
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
}
```

Bu blok olmasa da panel işləyir, sadəcə bildirişlər WebSocket əvəzinə HTTP long-polling ilə gedir (yavaş, amma işlək).

### Docker / serverless
- **Docker** — işləyir (Node.js process, port 5000).
- **Vercel / Netlify Functions kimi serverless** mühitdə işləməz: WebSocket və daimi bağlantı dəstəklənmir. Bu halda Render, Railway, Fly.io, VPS və ya Docker istifadə edin."# promarpanel" 
