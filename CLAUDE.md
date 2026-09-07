# CLAUDE.md — Panduan Sistem untuk Claude AI
# Project: VERO Inclusive LMS

Dokumen ini adalah memori persisten untuk Claude. Baca sebelum mengerjakan apapun di project ini.

---

## 1. Ringkasan Arsitektur

### Apa Ini
VERO adalah LMS (Learning Management System) inklusif berbasis AI untuk tunarungu/tunawicara. Dibuat untuk kompetisi PKM-KC / PIMNAS. Stack: **Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS v4 + Prisma + MySQL lokal (Laragon)**.

### Pola Arsitektur Wajib Dipertahankan

**1. Custom DB Mock Client (`lib/db.ts`)**
Ini adalah layer krusial. JANGAN ubah interfacenya.
- `db.from('table').select/insert/update/delete/upsert` — chainable seperti Supabase
- `db.auth.getUser/signIn/signUp/signOut/updateUser` — auth via localStorage
- `db.storage.from('bucket').upload/getPublicUrl` — file storage
- Session disimpan di `localStorage` sebagai `db_mock_user` dan `db_mock_session`
- Semua query diroute ke `POST /api/db` yang menggunakan Prisma → MySQL

**2. API Routes Architecture**
```
/api/auth/route.ts  — Auth operations (sign in/up/out, password)
/api/db/route.ts    — Generic CRUD via Prisma (table → Prisma model mapping)
/api/upload/route.ts — File upload ke /public/uploads/
```

**3. Page Layout Pattern**
Setiap halaman dashboard menggunakan struktur ini (JANGAN ubah):
```tsx
<div className="flex min-h-screen bg-white">
  <Sidebar role={...} userName={...} />
  <main className="flex-1 flex flex-col h-screen overflow-hidden">
    <header>  {/* Sticky header dengan GlobalSearch + NotificationBell */}
    <div className="flex-1 overflow-y-auto p-6">  {/* Scrollable content */}
  </main>
  <RightSidebar userId={...} />  {/* Hanya pada halaman tertentu */}
</div>
```

**4. Role-based UI**
Roles: `MAHASISWA`, `DOSEN`, `ADMIN`. Selalu cek dari:
```ts
const role = user?.user_metadata?.role || "MAHASISWA"
```
Render kondisional berdasarkan role. Tidak ada middleware route guard — guard dilakukan di `useEffect` per halaman dengan `db.auth.getUser()`.

**5. MediaPipe AI Pattern**
Model AI diload via CDN (bukan npm) menggunakan `<Script>` dari jsDelivr:
```tsx
<Script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js" strategy="afterInteractive" />
```
Race condition fix: null-kan ref SEBELUM memanggil `.close()` pada hands instance.

---

## 2. Standar & Aturan Koding (Coding Standards)

### Wajib Dipatuhi

**TypeScript**
- Semua file baru harus `.tsx` atau `.ts`
- Boleh pakai `any` untuk data dari `db.*` (sudah ada eslint suppress di banyak file)
- Deklarasi interface untuk props dan data shapes yang digunakan di komponen
- Jangan hapus `// @ts-ignore` yang sudah ada (untuk model ML imports)

**"use client" — PENTING**
Semua page di `/app/dashboard/**` adalah Client Components. Selalu tambahkan:
```tsx
"use client";
```
di baris pertama. Tidak ada Server Components di dalam dashboard.

**Konvensi Penamaan**
- Komponen React: PascalCase (`ClassDetailPage`, `GlobalSearch`)
- State variables: camelCase (`isModalOpen`, `upcomingTasks`)
- Database columns: snake_case (ditangani otomatis oleh `api/db/route.ts`)
- File: kebab-case untuk route files, PascalCase untuk komponen

**Styling — Tailwind CSS v4**
Pola desain VERO yang konsisten (JANGAN ubah character ini):
- Border radius: `rounded-2xl`, `rounded-3xl`, `rounded-4xl` (bukan rounded-md)
- Font weight: `font-black` untuk heading, `font-bold` untuk body
- Text transform: `uppercase tracking-widest` untuk label kecil
- Primary color: `indigo-600` / `slate-900`
- Cards: `bg-white border border-slate-200 shadow-sm` dengan hover `hover:border-{color}-500 hover:-translate-y-0.5`
- Input fields: `bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-100`

**State Management**
- Gunakan `useState` + `useEffect` biasa (tidak ada Redux/Zustand)
- Untuk komunikasi antar komponen: custom `window.dispatchEvent(new Event("..."))` (contoh: `avatar-updated`)
- Untuk data refs yang butuh escape closure: gunakan `useRef` (contoh: `modelTypeRef`, `gestureEnabledRef`)

**Toast Notifications**
Selalu gunakan `sonner`:
```tsx
import { toast } from "sonner";
toast.success("..."); toast.error("..."); toast.info("...");
```

**Date Formatting**
Selalu gunakan `date-fns` dengan locale Indonesia:
```tsx
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
format(date, 'dd MMM yyyy', { locale: idLocale })
```

**Icon Library**
Selalu gunakan `lucide-react`. Tidak boleh pakai library icon lain.

**Animasi**
Gunakan `framer-motion` untuk animasi UI (accordion, page transitions). Jangan pakai CSS animation untuk hal yang kompleks.

### Dilarang
- Jangan buat file Server Component baru di dalam `/dashboard`
- Jangan ubah interface `db` di `lib/db.ts` (chainable API harus tetap sama)
- Jangan hapus `reactStrictMode: false` di `next.config.ts` (akan break MediaPipe)
- Jangan gunakan `getServerSideProps` atau `getStaticProps` — ini App Router
- Jangan hardcode `localhost` di URL — gunakan relative paths untuk API calls

---

## 3. Daftar Perintah Terminal Penting (CLI Commands)

```bash
# Development server
npm run dev           # Start Next.js dev server di http://localhost:3000

# Build & Production
npm run build         # TypeScript compile + Next.js build
npm run start         # Jalankan production build

# Linting
npm run lint          # ESLint check

# Database (Prisma)
npx prisma generate   # Regenerate Prisma client setelah ubah schema.prisma
npx prisma db push    # Push schema ke database MySQL (Laragon harus running)
npx prisma studio     # GUI untuk browse database

# Database connection (Laragon)
# Pastikan Laragon running sebelum npm run dev
# DATABASE_URL di .env: mysql://root:@localhost:3306/vero_db
```

**Catatan Dev Environment:**
- Database: MySQL via Laragon (lokal)
- Port: `3306` default MySQL Laragon
- Tidak butuh `.env` khusus untuk AI (model runs client-side)
- MediaPipe butuh HTTPS atau `localhost` (kamera tidak bisa di IP lokal biasa)

---

## 4. Prosedur Debugging & Penanganan Error

### Error Umum & Solusinya

**"SolutionWasm instance already deleted" (MediaPipe)**
- Penyebab: Race condition saat stop kamera, `onFrame` masih jalan setelah `.close()`
- Fix: Null-kan `handsRef.current = null` SEBELUM `hands.close()`. Lihat `studio/translate/page.tsx:162-195` untuk pola yang benar.

**Kamera tidak bisa diakses**
- Penyebab: Browser blokir `getUserMedia` di non-HTTPS/non-localhost
- Fix: Selalu akses via `http://localhost:3000`, bukan IP lokal
- Code guard sudah ada: `if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)`

**PeerJS connection error**
- Penyebab: Firewall atau port UDP diblokir, atau PeerJS public server down
- Fix: Pastikan koneksi internet aktif. Untuk production gunakan STUN/TURN server sendiri.

**Database "Table X not mapped"**
- Penyebab: Table baru di schema belum ditambahkan ke `tableModelMap` di `/api/db/route.ts`
- Fix: Tambahkan entry baru di `tableModelMap` di `app/api/db/route.ts:6-24`

**TypeScript build error di model files**
- File `modelbisindo.js` dan `modelsibi.js` tidak punya type definitions
- Selalu gunakan `// @ts-ignore` sebelum import:
```tsx
// @ts-ignore
import { score as predictBisindoModel } from "../../../utils/modelbisindo";
```

**`use(params)` di dynamic routes**
- Next.js 16 mewajibkan `use()` untuk unwrap Promise params di Client Components
- Pola wajib:
```tsx
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
```

### Checklist Sebelum Commit
1. `npm run build` harus berhasil tanpa error TypeScript
2. Test halaman di `localhost` (bukan IP) untuk fitur kamera
3. Pastikan Laragon MySQL running saat test database features
4. Cek tampilan di mobile viewport (ada bottom nav terpisah di `Sidebar.tsx`)

---

## 5. Pedoman Komunikasi & Output

### Cara Claude Harus Bekerja di Project Ini

**Bahasa Output**
Gunakan Bahasa Indonesia untuk semua komunikasi dengan user project ini. Kode tetap dalam English (variabel, fungsi, komentar kode).

**Gaya Respons**
- Langsung ke implementasi — tidak perlu panjang lebar menjelaskan rencana
- Tunjukkan kode yang diubah, bukan seluruh file
- Jika ada bug, tunjukkan lokasi file:baris dan fix-nya langsung
- Ringkas di akhir: apa yang diubah dan apa next step (1-2 kalimat)

**Saat Membuat Fitur Baru**
1. Ikuti pola page yang sudah ada (auth check di `useEffect`, `LoadingScreen` saat loading)
2. Gunakan `db.from()` API — JANGAN langsung fetch ke Prisma dari client
3. Sertakan role check jika fitur khusus role tertentu
4. Gunakan komponen yang sudah ada: `Sidebar`, `GlobalSearch`, `NotificationBell`, `LoadingScreen`, `ConfirmModal`

**Saat Debug**
- Selalu cek `lib/db.ts` untuk memahami bagaimana query bekerja
- Cek `app/api/db/route.ts` untuk memahami bagaimana filter diterjemahkan ke Prisma
- Cek `prisma/schema.prisma` untuk nama model dan field yang benar

**UI Design Rules**
- Pertahankan design system VERO: rounded corners besar, font-black headings, warna indigo + slate
- Jangan ganti style library atau tambah component library baru
- Untuk modal baru, gunakan pola yang sama dengan modal di `dashboard/page.tsx` (backdrop blur + rounded-3xl card)

**Yang TIDAK Boleh Dilakukan**
- Jangan refactor kode yang tidak diminta
- Jangan tambah abstraksi baru jika tidak diperlukan
- Jangan ganti `lib/db.ts` interface
- Jangan sarankan migrasi ke library lain kecuali diminta
- Jangan tambah komentar kode kecuali untuk logika yang benar-benar tidak jelas
