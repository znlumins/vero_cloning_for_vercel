
# Panduan Deployment Server — VERO LMS

Disesuaikan dengan project ini (Next.js 16 + MySQL). Terakhir diperbarui 30 Juli 2026.

Server target (yang kamu sebutkan): **2 core CPU · 1,92 GB RAM · 2 GB swap · Ubuntu Server · Nginx · IP privat**.

---

## 0. Ringkasan: apa yang SEBENARNYA perlu jalan di server

Hasil audit kode project ini:

| Komponen | Perlu di server? | Alasan |
|---|---|---|
| **Next.js** (frontend + API routes) | ✅ WAJIB | Inti aplikasi. API `/api/db`, `/api/auth`, `/api/upload` ada di sini. |
| **MySQL** | ✅ WAJIB | Prisma `provider = "mysql"`, semua data lewat sini. |
| **Backend Go** (`backend/`) | ❌ TIDAK | Frontend tidak pernah memanggil `/api/v1` atau `/ws`. Rewrite ke `:8080` tidak terpakai. |
| **Python microservice** (`ai_microservice/`) | ❌ TIDAK | Prediksi AI sekarang jalan di browser (TensorFlow.js), bukan server. |
| **Model AI** (`public/models/`) | ✅ (file statis) | Dimuat & dijalankan di **browser pengguna**, bukan CPU server. Ringan (~5 MB). |

**Konsekuensi:** deployment jauh lebih ringan dari kelihatannya — cukup Next.js + MySQL.
Beban CPU/RAM server untuk AI = **nol** (semua di browser klien).

---

## 1. Kecukupan server & peringatan RAM

Beban **runtime** Next.js untuk app seukuran ini ringan (~150–300 MB) — 1,92 GB cukup.

⚠️ **Masalahnya di `next build`**, bukan runtime. Next.js 16 + React Compiler + Tailwind 4
memuncak **2–4 GB RAM** saat build. RAM 1,92 GB + swap 2 GB = mepet, berisiko
OOM-killed di tengah build.

**Pilih salah satu (urut dari yang disarankan):**

1. **Build di tempat lain, kirim hasilnya** (paling aman untuk RAM kecil):
   build di laptop atau GitHub Actions, lalu kirim folder `.next/` ke server.
   Server tinggal `npm start` — tidak pernah build di RAM sempit.
2. **Naikkan swap jadi 4 GB** sebelum build di server:
   ```bash
   sudo fallocate -l 4G /swapfile2
   sudo chmod 600 /swapfile2
   sudo mkswap /swapfile2 && sudo swapon /swapfile2
   # permanen: tambahkan ke /etc/fstab -> /swapfile2 none swap sw 0 0
   ```
3. **Pindahkan MySQL keluar server** (mengurangi tekanan RAM): pakai DB terkelola
   gratis (Railway/PlanetScale/Aiven MySQL). Deps `@neondatabase/serverless`
   sudah ada, tapi schema aktif MySQL — jadi pilih MySQL terkelola, bukan Neon.

Tambahkan juga ini ke `next.config.ts` agar footprint runtime lebih kecil:
```js
const nextConfig = {
  output: 'standalone',   // <-- tambah baris ini
  // ... sisanya biarkan
}
```
Dengan `standalone`, jalankan `node .next/standalone/server.js` (bukan `npm start`),
dan tidak perlu `node_modules` penuh di server.

---

## 2. Software yang harus diinstall di server

```bash
# Node.js 20+ (project ini dites di Node 24)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# MySQL (kalau tidak pakai DB terkelola)
sudo apt install -y mysql-server
sudo mysql_secure_installation

# Nginx (sudah aktif katamu) + process manager
sudo npm install -g pm2
```
Go dan Python **tidak perlu** diinstall (lihat bagian 0).

---

## 3. Environment variables (`.env`) — LENGKAP

`.env` di-gitignore (benar), jadi WAJIB dibuat manual di server. Ini semua kunci
yang dipakai kode project ini:

| Kunci | Wajib? | Nilai untuk produksi |
|---|---|---|
| `DATABASE_URL` | ✅ | `mysql://user:pass@localhost:3306/vero` (atau URL DB terkelola) |
| `NEXTAUTH_SECRET` | ✅✅ | string acak kuat — **`openssl rand -base64 32`** |
| `NEXTAUTH_URL` | ✅ | URL publik HTTPS, mis. `https://vero.domainmu.com` |
| `NEXT_PUBLIC_APP_URL` | ✅ | sama dengan NEXTAUTH_URL (dipakai link reset password) |
| `GOOGLE_CLIENT_ID` | ✅ | dari Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | ✅ | dari Google Cloud Console |
| `EMAIL_SERVER_USER` | ✅ (untuk reset password) | alamat Gmail pengirim, mis. `vero...@gmail.com` |
| `EMAIL_SERVER_PASSWORD` | ✅ (untuk reset password) | **App Password** Gmail (bukan password akun) — buat di myaccount.google.com/apppasswords |
| `EMAIL_SERVER_HOST` | ⬜ | default `smtp.gmail.com` |
| `EMAIL_SERVER_PORT` | ⬜ | default `465` (SSL); pakai `587` untuk STARTTLS |
| `EMAIL_FROM` | ⬜ | default `VERO <EMAIL_SERVER_USER>` |
| `GOLANG_BACKEND_URL` | ⬜ opsional | tidak terpakai frontend; boleh diisi apa saja atau dihapus |

> **Reset password (forgot password)** mengirim tautan lewat email SMTP. Kalau
> `EMAIL_SERVER_USER`/`PASSWORD` kosong, fitur ini tidak mengirim email (di dev
> link dicetak ke konsol server). Gmail wajib **App Password** + 2FA aktif.
>
> **Login Google:** setelah login, aplikasi mengambil token sesi via
> `/api/auth/token` (berdasarkan sesi NextAuth). Pastikan `NEXTAUTH_URL` =
> `https://verolearning.my.id` dan `NEXTAUTH_SECRET` terisi, kalau tidak
> pengguna Google akan ter-logout saat berpindah halaman.

> **`NEXTAUTH_SECRET` sangat kritis.** Selain NextAuth, ia juga menandatangani
> token keamanan `/api/db` & `/api/upload` (perbaikan keamanan QA). Kalau kosong
> atau lemah di server, autentikasi bisa dipalsukan. Jangan pakai nilai default.

---

## 4. Bersihkan repo SEBELUM push (±64 MB sampah untuk server)

File-file ini tidak berguna di server Linux dan membebani clone:

| Path | Ukuran | Masalah |
|---|---|---|
| `backend/server.exe` | 13,7 MB | binary Windows, mustahil jalan di Ubuntu, ter-track git |
| `dataset/` | 49,5 MB | artefak training (`.keras`, `.pkl`), tidak dipakai runtime |
| `public/models/bisindo_cadangan*/` | ~3 MB | cadangan model, belum ter-track — jangan ikut ter-commit |
| `backend/`, `ai_microservice/` | — | tidak dipakai frontend; opsional dihapus dari deploy |

Tambahkan ke `.gitignore` lalu untrack (file di disk tetap aman):
```bash
git rm -r --cached backend/server.exe dataset public/models/bisindo_cadangan public/models/bisindo_cadangan_praD
# tambahkan pola ke .gitignore:
#   /dataset
#   backend/server.exe
#   public/models/*_cadangan*
```

---

## 5. Langkah deploy (di server)

```bash
# 1. Clone dari branch DEPLOY (main-production — berisi semua fitur terbaru).
#    Catatan: `main` sengaja TIDAK dipakai (masih bercabang dengan kerja tim lain).
git clone -b main-production https://github.com/znlumins/vero_learning_management_system.git
cd vero_learning_management_system

# 2. Install dependency
npm ci   # (pakai package-lock.json; lebih deterministik dari npm install)

# 3. Buat file .env (lihat bagian 3), lalu generate Prisma client + migrasi skema
npx prisma generate
npx prisma migrate deploy      # atau: npx prisma db push (kalau belum pakai migration)

# 4. Build (perhatikan RAM — lihat bagian 1)
npm run build

# 5. Jalankan
pm2 start npm --name vero -- start        # kalau TANPA output:standalone
# atau (kalau pakai output:standalone):
# pm2 start .next/standalone/server.js --name vero
pm2 save && pm2 startup                    # auto-start saat server reboot
```
Next.js jalan di **port 3000** secara default.

---

## 5b. Menarik perubahan terbaru ke server (update rutin)

Ini yang dijalankan **setiap kali ada commit baru** — bukan clone ulang.

```bash
# 1. Masuk ke folder aplikasi di server
cd ~/vero_learning_management_system

# 2. Pastikan berada di branch deploy
git branch --show-current        # harus: main-production

# 3. Tarik perubahan
git pull origin main-production
```

Kalau `git pull` menolak dengan *"Your local changes would be overwritten"*,
artinya ada berkas yang tersunting langsung di server. Jangan langsung
`git reset --hard` — lihat dulu apa yang berubah:

```bash
git status                  # berkas mana yang tersunting
git diff                    # isinya apa

# Kalau memang sampah/tak sengaja, baru buang:
git checkout -- <nama-berkas>
```

> `.env` tidak akan tertimpa `git pull` — berkas itu ada di `.gitignore` dan
> memang tidak pernah masuk repo. Aman.

Lanjutkan sesuai **apa yang berubah** di commit itu:

```bash
# 4. Kalau package.json / package-lock.json ikut berubah
npm ci

# 5. Kalau prisma/schema.prisma ikut berubah
npx prisma generate
npx prisma migrate deploy

# 6. Build ulang — WAJIB, hampir selalu
npm run build

# 7. Muat ulang aplikasinya
pm2 reload vero              # reload, bukan restart: tanpa jeda layanan
pm2 logs vero --lines 50     # pastikan tidak ada error saat start
```

Cara cepat tahu langkah mana yang perlu, tanpa menebak:

```bash
git diff --name-only HEAD@{1} HEAD
```

### Kenapa `npm run build` hampir selalu wajib

Next.js menyajikan **hasil build**, bukan berkas sumber. Selama `.next/` belum
dibuat ulang, perubahan apa pun di `app/` atau `components/` tidak akan terlihat
di situs — termasuk `sitemap.xml`, `robots.txt`, dan gambar Open Graph, yang
semuanya dibangkitkan saat build sebagai berkas statis.

Ingat peringatan RAM di bagian 1: `next build` memuncak 2–4 GB. Di server 1,92 GB
build bisa kena OOM-kill di tengah jalan. Kalau itu terjadi, `.next/` tinggal
separuh dan aplikasi gagal start. Amannya: build di laptop, lalu kirim `.next/`
ke server dan cukup `pm2 reload` di sana.

### `pm2 reload` vs `pm2 restart`

- `pm2 reload vero` — jalankan proses baru dulu, baru matikan yang lama. Pengguna
  yang sedang membuka meeting tidak terputus. **Pakai ini.**
- `pm2 restart vero` — matikan lalu nyalakan. Ada jeda beberapa detik dan sesi
  meeting yang sedang berjalan ikut putus.

### Kalau situs pakai Cloudflare, bersihkan cache

Halaman VERO disajikan dengan `Cache-Control: s-maxage=31536000`, jadi Cloudflare
bisa menahan versi lama **berbulan-bulan** meski server sudah diperbarui. Setelah
deploy yang mengubah tampilan atau metadata:

**Dasbor Cloudflare → Caching → Configuration → Purge Everything.**

Verifikasi dari laptop, bukan dari browser (browser punya cache sendiri):

```bash
curl -sI https://verolearning.my.id | grep -i "cf-cache-status"
curl -s https://verolearning.my.id | grep -o "<title>[^<]*</title>"
curl -s https://verolearning.my.id/robots.txt | head -20
curl -s https://verolearning.my.id/sitemap.xml | head -20
```

> ⚠️ Kalau `/robots.txt` yang muncul masih berisi blok
> `# BEGIN Cloudflare Managed content` dan **tanpa** baris `Sitemap:`, berarti
> Cloudflare masih menimpa berkas dari aplikasi. Matikan di
> **Cloudflare → Settings → Manage robots.txt**, lalu purge cache lagi.

### Kalau update gagal dan perlu mundur

```bash
git log --oneline -5              # cari commit terakhir yang diketahui aman
git checkout <hash-commit-aman>
npm run build && pm2 reload vero
```

Setelah masalahnya beres di laptop dan sudah dipush, kembali ke branch:

```bash
git checkout main-production && git pull origin main-production
npm run build && pm2 reload vero
```

---

## 6. Nginx reverse proxy (port 3000 → publik)

`/etc/nginx/sites-available/vero`:
```nginx
server {
    listen 80;
    server_name vero.domainmu.com;

    client_max_body_size 50M;   # penting: upload file (foto profil/slide) sampai 25 MB

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/vero /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 7. HTTPS — WAJIB, bukan opsional

Ini bagian paling kritis untuk VERO. Fitur intinya pakai **kamera & mikrofon**
(`getUserMedia`) di halaman translate, presentasi, meeting, dan speech.
**Browser memblokir kamera/mic di `http://` selain `localhost`.**

Artinya kalau situs diakses lewat `http://<ip-privat>` atau `http://domain`,
halaman terbuka **tapi kamera & mic mati total** — fitur utama tidak jalan.

Karena server-mu **IP privat** (tidak bisa diakses publik langsung), solusi terbaik:

### Cloudflare Tunnel (disarankan)
- Gratis, HTTPS otomatis, **tidak perlu buka port firewall** (koneksi keluar dari server),
  URL tetap. Cocok untuk server kampus.
- Butuh 1 domain yang di-manage Cloudflare (domain murah ~20rb/tahun cukup).
```bash
# di server:
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
sudo mv cloudflared /usr/local/bin/ && sudo chmod +x /usr/local/bin/cloudflared
cloudflared tunnel login
cloudflared tunnel create vero
# arahkan tunnel ke Nginx/localhost:3000, lalu:
cloudflared tunnel route dns vero vero.domainmu.com
cloudflared tunnel run vero
```
Jadikan service permanen: `sudo cloudflared service install`.

### Alternatif
- **Domain publik + Let's Encrypt** (kalau server bisa diakses dari internet & port 80/443 terbuka): `sudo certbot --nginx`.
- **ngrok** (cepat untuk demo, tapi URL berubah tiap restart → merepotkan untuk OAuth).

---

## 8. Google OAuth untuk produksi

Setelah punya domain publik:
1. Google Cloud Console → Credentials → OAuth Client → tambahkan:
   - Authorized JavaScript origins: `https://vero.domainmu.com`
   - Authorized redirect URIs: `https://vero.domainmu.com/api/auth/callback/google`
2. OAuth consent screen → **PUBLISH APP** (agar semua orang bisa login, bukan cuma test user).
3. Pastikan `.env` server: `NEXTAUTH_URL=https://vero.domainmu.com`.

---

## 9. Hal khusus VERO yang perlu diperhatikan

| Hal | Catatan |
|---|---|
| **Upload file** | `/api/upload` menyimpan ke `public/uploads/` di disk server. Folder ini **tidak ada di git** — pastikan writable, dan **backup terpisah** (hilang kalau server di-reset). Untuk skala besar pertimbangkan object storage. |
| **Video meeting (WebRTC)** | Pakai PeerJS cloud + Google STUN. Jalan di HTTPS. **Jaringan kampus** kadang blokir P2P — kalau video antar-peserta gagal, perlu tambahkan server **TURN** (mis. `coturn` atau Metered/Twilio). |
| **MediaPipe & widget Sienna** | Dimuat dari CDN jsDelivr **oleh browser pengguna** (bukan server). Aman selama pengguna punya internet. Server tidak perlu akses ke CDN ini. |
| **Model AI** | File statis di `public/models/`. Pastikan ikut ter-deploy (jangan masuk .gitignore). Inferensi di browser. |
| **Timezone** | Set timezone server ke `Asia/Jakarta` agar tanggal/absensi konsisten: `sudo timedatectl set-timezone Asia/Jakarta`. |

---

## 10. Checklist verifikasi setelah deploy

- [ ] `pm2 status` → proses `vero` online
- [ ] Buka `https://domainmu.com` → landing tampil, HTTPS hijau (gembok)
- [ ] Register + login email/password → masuk dashboard
- [ ] Login Google → berhasil (redirect URI & consent screen benar)
- [ ] Halaman **translate** → tekan Mulai AI → **kamera menyala** (bukti HTTPS OK)
- [ ] Prediksi isyarat muncul (model termuat di browser)
- [ ] Upload foto profil di Settings → tersimpan & tampil
- [ ] Dark mode toggle jalan
- [ ] `sudo journalctl` / `pm2 logs vero` bersih dari error fatal

---

## 11. Troubleshooting cepat

| Gejala | Penyebab paling mungkin |
|---|---|
| Build ke-kill / "JavaScript heap out of memory" | RAM habis saat build → lihat bagian 1 (swap / build di luar) |
| Kamera tidak menyala di server, tapi jalan di localhost | Situs belum HTTPS → bagian 7 |
| Login Google `redirect_uri_mismatch` | Redirect URI di Google Console ≠ domain server → bagian 8 |
| Login Google `Access blocked / unverified` | Consent screen belum di-Publish, atau email bukan test user |
| Data tidak muncul / API 401 setelah login | `NEXTAUTH_SECRET` beda/kosong di server → bagian 3 |
| Upload gagal (413) | `client_max_body_size` Nginx kurang → bagian 6 |
| Video meeting hitam/tak tersambung | Jaringan blokir P2P → perlu TURN → bagian 9 |
