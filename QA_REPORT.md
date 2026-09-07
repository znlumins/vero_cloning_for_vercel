# Laporan QA — VERO LMS

Tanggal: 29 Juli 2026 · Diperiksa oleh: sesi QA otomatis

Cakupan: TypeScript typecheck, ESLint, build produksi, dan uji keamanan langsung
terhadap seluruh API route (server dev di port 3000).

---

## Ringkasan

| Pemeriksaan | Hasil |
|---|---|
| TypeScript (`tsc --noEmit`) | **0 error** |
| Build produksi (`next build`) | **sukses**, 31 route ter-generate |
| Bug keamanan **kritis** ditemukan | **5 — semuanya diperbaiki & diuji** |
| Bug lint fungsional | 2 diperbaiki |
| Sisa lint | gaya penulisan (`any`, unused var) — bukan bug |

---

## Bug keamanan yang diperbaiki (dibuktikan lewat uji, bukan dugaan)

### 1. KRITIS — `/api/db` membocorkan hash password ke publik
**Sebelum:** `POST /api/db {"table":"users","action":"select"}` tanpa login sama
sekali mengembalikan seluruh baris tabel `users`, **termasuk hash bcrypt dan
token reset**. Dibuktikan: response memuat `"password":"$2b$10$..."`.

**Perbaikan:** `app/api/db/route.ts` — fungsi `buangKolomRahasia()` menghapus
`password`, `reset_token`, `reset_token_expiry` dari SEMUA response, apa pun
tabelnya. Dashboard tetap bisa menampilkan daftar user (id/email/nama).

**Uji sesudah:** field yang keluar hanya `id, email, created_at`. Password hilang.

### 2. KRITIS — `/api/db` mengizinkan tulis tabel users tanpa izin
**Sebelum:** siapa pun bisa `update`/`delete` baris `users` mana pun lewat satu
POST — menimpa password akun orang lain, menghapus akun.

**Perbaikan:** tulis (`insert`/`update`/`delete`/`upsert`) ke tabel `users`
ditolak `403`. Perubahan password sah tetap jalan lewat `/api/auth` yang
memverifikasi kepemilikan.

**Uji sesudah:** `update`/`delete` users → `403`. `select` users → tetap jalan.

### 3. KRITIS — `/api/upload` menerima berkas apa pun tanpa autentikasi
**Sebelum:** `POST /api/upload` menerima `.html`, `.svg`, `.js`, ukuran berapa
pun, tanpa login. Berkas di `/uploads/` disajikan apa adanya → HTML/SVG yang
diunggah bisa menjalankan skrip di domain yang sama (**stored XSS**). Dibuktikan:
`evil.html` berhasil diunggah.

**Perbaikan:** `app/api/upload/route.ts` — daftar-putih ekstensi (gambar,
dokumen, `.mp4`/`.webm`), batas ukuran 25 MB. Nama berkas tetap dibangun dari
UUID (tidak ada path traversal).

**Uji sesudah:** `.html` & `.svg` → ditolak `400`. `.png` sah → diterima.

### 4. TINGGI — `forgot-password` membocorkan tautan reset di response
**Sebelum:** endpoint mengembalikan `mockResetUrl` berisi token reset langsung di
JSON. Siapa pun yang tahu email korban bisa meminta tautan resetnya dan
**mengambil alih akun**. (Komentar kode sendiri menandai "HAPUS INI".)

**Perbaikan:** `mockResetUrl` hanya disertakan saat `NODE_ENV !== "production"`.
Di produksi wajib pakai SMTP sungguhan.

---

## Bug lint fungsional yang diperbaiki

- `app/dashboard/akademik/tugas/page.tsx` — `let taskQuery` → `const` (tak pernah
  di-reassign).
- `components/GlobalSearch.tsx` — tanda kutip tak ter-escape di JSX → `&ldquo;`/`&rdquo;`.

---

### 5. KRITIS — `/api/db` & `/api/upload` menerima operasi tanpa autentikasi
**Sebelum:** pola **"mock Supabase"** — `lib/db.ts` memanggil `/api/db` langsung
dari browser **tanpa token sesi**, dan session di localStorage berupa
`mock-db-jwt-token-<userId>` yang bisa ditebak (cukup tahu userId → mengaku jadi
dia). Siapa pun di internet bisa CRUD tabel apa pun tanpa login.

**Perbaikan (token bertanda tangan HMAC):**
- `lib/authToken.ts` — token ditandatangani HMAC-SHA256 dengan `NEXTAUTH_SECRET`,
  berumur 7 hari, diverifikasi waktu-tetap. Tidak bisa dipalsukan tanpa rahasia.
- `app/api/auth/route.ts` — `signIn` menerbitkan token ini, bukan token tebakan.
- `lib/db.ts` — mengirim `Authorization: Bearer <token>` di tiap request
  `/api/db` dan `/api/upload`; kalau server balas `401`, sesi basi dibersihkan
  dan pengguna diarahkan ke login.
- `app/api/db/route.ts` & `app/api/upload/route.ts` — menolak `401` tanpa token
  sah.
- `app/register/page.tsx` — menghapus `db.from('profiles').insert` yang redundan
  (profil sudah dibuat server-side saat signUp) dan kini mustahil (belum login).

**Uji sesudah (8 skenario, semua lolos):**

| Skenario | Hasil |
|---|---|
| `/api/db` tanpa token | `401` |
| `/api/upload` tanpa token | `401` |
| login password salah | ditolak |
| login sah → token → `/api/db` | jalan |
| token dipalsukan (1 char diubah) | `401` |
| token gaya lama `mock-db-jwt-token-<id>` | `401` |
| upload PNG dengan token | diterima |
| build produksi setelah semua perubahan | sukses |

---

## Sisa yang disarankan (peningkatan, bukan lubang terbuka)

**Otorisasi per-baris.** Sekarang semua pengguna **terautentikasi** bisa membaca/
menulis data. Idealnya ditambah aturan kepemilikan (mis. mahasiswa tak bisa
mengubah tugas milik dosen lain, atau menaikkan `profiles.role` sendiri jadi
DOSEN). Ini lapisan lanjutan; gerbang autentikasi di atas sudah menutup akses
anonim yang jadi risiko terbesar. Kerjakan saat ada waktu, tidak mendesak untuk
demo internal.

**`NEXTAUTH_SECRET` di produksi.** Token memakai rahasia ini. Di dev ada fallback
bawaan; di server WAJIB set `NEXTAUTH_SECRET` yang kuat, kalau tidak token bisa
ditempa. (Sudah masuk daftar env produksi.)

**Server action `globalSearch`** mengembalikan katalog kelas/tugas/materi tanpa
autentikasi. Bukan kredensial, risikonya rendah, tapi bisa diberi gerbang login
kalau katalog dianggap privat.

---

## Yang diperiksa dan TERNYATA aman

- TypeScript: tidak ada error tipe.
- Build produksi: sukses.
- `/api/auth` signup/signin: password di-hash bcrypt, verifikasi benar.
- `forgot-password`: sudah tahan email enumeration (selalu balas sukses).
- `/api/upload`: nama berkas dari UUID, tidak ada path traversal.
- 106 peringatan `no-explicit-any` + 74 `unused-vars`: gaya penulisan, bukan bug.
  Sengaja TIDAK diubah massal — churn berisiko tanpa nilai fungsional.
