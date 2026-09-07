# Product Requirements Document (PRD)
# VERO — Inclusive Learning Management System

**Versi:** 1.0
**Tanggal:** 2026-06-08
**Tim:** PKM-KC Universitas Brawijaya
**Status:** Aktif Dikembangkan (Prototipe PIMNAS)

---

## 1. Ikhtisar Proyek (Project Overview)

### Visi
VERO adalah platform akademik terintegrasi yang **mendobrak batasan komunikasi** di lingkungan pendidikan tinggi bagi penyandang tunarungu dan tunawicara. Nama VERO berasal dari konsep "Voice" dan "Recognition", mewakili misi utamanya: mengubah gestur tangan dan suara menjadi jembatan komunikasi inklusif dua arah.

### Misi Bisnis
Menjadi **LMS (Learning Management System) pertama di Indonesia** yang mengintegrasikan AI penerjemah bahasa isyarat (BISINDO & SIBI) secara real-time langsung di dalam platform pembelajaran, tanpa membutuhkan perangkat atau aplikasi tambahan.

### Konteks Kompetisi
Project ini dikembangkan sebagai karya PKM-KC (Program Kreativitas Mahasiswa – Karsa Cipta) untuk kompetisi PIMNAS. Judul resmi proposal:
> *"Rancang Bangun Sistem Ruang Kuliah Inklusif Berbasis Kamera Penerjemah Terintegrasi Deep Neural Network untuk Komunikasi Dua Arah Tunarungu dan Tunawicara"*

### Target Pengguna (User Persona)
| Role | Deskripsi | Kebutuhan Utama |
|------|-----------|-----------------|
| **MAHASISWA** | Mahasiswa aktif, termasuk penyandang tunarungu/tunawicara | Akses kelas, absensi, tugas, komunikasi inklusif via isyarat |
| **DOSEN** | Pengajar yang membuat & mengelola kelas | Manajemen kelas, jadwal, tugas, pantau presensi |
| **ADMIN** | Admin institusi | Manajemen user, pantau kelas, kelola pengumuman |

---

## 2. Fitur Utama (Core Features)

### 2.1 Modul Autentikasi & Profil
- Registrasi dengan pilihan role (MAHASISWA/DOSEN)
- Login dengan email + password (session disimpan di localStorage)
- Manajemen profil: nama, NIM/NIP, bio, foto avatar (upload file lokal)
- Ganti password dengan verifikasi password lama
- Preferensi notifikasi (UI tersedia, logic belum final)

### 2.2 Dashboard (Beranda)
- **MAHASISWA**: Stats presensi aktual (% kehadiran real), daftar tugas aktif
- **DOSEN**: Jumlah kelas diajar, tugas diberikan, total mahasiswa
- **ADMIN**: Jumlah pengguna, kelas, pengumuman sistem
- Papan pengumuman publik dengan CRUD penuh (Admin only)
- Papan pengumuman timeline dengan tag kategori berwarna

### 2.3 Modul Akademik
#### Jelajahi (Mahasiswa only)
- Eksplorasi course publik yang tersedia
- Bergabung ke kelas dengan kode unik

#### Kelasku
- **Dosen**: Buat kelas baru, kelola anggota, buat jadwal pertemuan
- **Mahasiswa**: Lihat kelas yang diikuti, akses detail kelas
- Detail kelas memiliki 4 tab: **Forum** (postingan), **Materi** (link/file), **Jadwal**, **Anggota**
- Dosen dapat membuat jadwal dengan indikator "LIVE" saat sesi berlangsung
- Tombol "Join Meeting" muncul otomatis saat jadwal sedang aktif (real-time)

#### Absensi (Hub Absensi)
- **Dosen**: Buka/tutup sesi presensi per kelas, lihat status real-time tiap mahasiswa
- **Mahasiswa**: Konfirmasi kehadiran (Hadir Luring / Hadir Daring / Izin) saat sesi terbuka
- Rekap kehadiran per kelas dengan persentase (color-coded: hijau ≥80%, kuning ≥50%, merah <50%)

#### Tugas & Project
- Dosen membuat tugas dengan judul, mata kuliah, dan deadline
- Mahasiswa melihat tugas aktif, progress (0-100%), dan tombol kumpul
- Task submission dengan catatan dan file upload

#### Arsip Belajar
- Personal file archive per user
- Upload dan manajemen file pembelajaran

### 2.4 Studio AI — Fitur Unggulan
#### Translate Gesture (Penerjemah Bahasa Isyarat)
- **Real-time hand gesture recognition** via MediaPipe Hands
- Support dua standar bahasa isyarat Indonesia: **BISINDO** dan **SIBI**
- Model ML dijalankan sepenuhnya di sisi klien (browser) — tidak butuh server AI
- Toggle model secara langsung; prediksi ditampilkan besar-besar di layar
- Guard race condition saat stop kamera (fixed "SolutionWasm instance already deleted" bug)

#### Speech (Komunikasi Suara-Teks)
- **Speech-to-Text (STT)**: Rekam suara real-time via Web Speech API, tampilkan transkripsi
- **Text-to-Speech (TTS)**: Ketik teks, sistem membacakan dengan suara
- Quick phrases preset untuk aksesibilitas ("Tolong bantu saya", "Saya tidak bisa bicara", dst.)
- Bahasa: Indonesia (`id-ID`)

#### Whiteboard
- Kanvas menggambar digital dengan react-sketch-canvas
- Tools: pensil, penghapus, 5 warna, undo/redo, hapus semua, export PNG
- Fix: erase mode menggunakan `useEffect` + `canvasRef.current.eraseMode()` (bukan prop langsung)

#### Presentasi
- Upload multi-slide (gambar) dan presentasikan ke peserta meeting
- Navigasi slide prev/next yang disinkronkan ke semua peserta via PeerJS data channel

### 2.5 Diskusi & Meeting
#### Halaman Diskusi
- Chat grup dan direct message (DM) antar pengguna
- Group management

#### VeroMeeting (Video Conference)
- Video call P2P berbasis **PeerJS (WebRTC)**
- Multi-participant support (grid layout adaptive)
- Fitur inklusif terintegrasi dalam satu ruang meeting:
  - **Gesture AI Overlay**: Terjemahan isyarat real-time di atas video feed
  - **STT Subtitle**: Transkripsi suara tampil sebagai subtitle
  - **TTS Playback**: Baca otomatis subtitle peserta lain
  - **Whiteboard Kolaboratif**: Real-time sync via PeerJS data channel
  - **Screen/Slide Presentation**: Sinkronisasi slide ke semua peserta
- Kontrol: Mute/unmute mic, on/off kamera, keluar meeting
- Auto-cleanup: hapus record partisipan dari DB saat user keluar

### 2.6 Notifikasi
- Bell notifikasi dengan badge unread count
- Notifikasi in-app per user dari database

### 2.7 Pencarian Global
- GlobalSearch component untuk search across content

---

## 3. Teknologi & Arsitektur (Tech Stack & Architecture)

### Frontend
| Teknologi | Versi | Fungsi |
|-----------|-------|--------|
| Next.js | 16.1.6 | Full-stack framework (App Router) |
| React | 19.2.3 | UI library |
| TypeScript | ^5 | Type safety |
| Tailwind CSS | ^4 | Utility-first styling |
| Framer Motion | ^12 | Animasi UI |
| Lucide React | ^0.563 | Icon library |
| Sonner | ^2 | Toast notifications |

### AI & Computer Vision
| Teknologi | Source | Fungsi |
|-----------|--------|--------|
| MediaPipe Hands | CDN (jsDelivr) | Ekstraksi 21 landmark tangan real-time |
| Model BISINDO | `modelbisindo.js` (compiled) | Pengenalan gestur BISINDO (A-Z + kata dasar) |
| Model SIBI | `modelsibi.js` (compiled) | Pengenalan gestur SIBI |
| Web Speech API | Browser native | Speech-to-Text & Text-to-Speech |

### Real-time Communication
| Teknologi | Versi | Fungsi |
|-----------|-------|--------|
| PeerJS | ^1.5.5 | P2P WebRTC video call |
| STUN Server | Google STUN | ICE negotiation |
| react-sketch-canvas | ^6.2.0 | Shared whiteboard |

### Backend & Database
| Teknologi | Versi | Fungsi |
|-----------|-------|--------|
| Prisma ORM | ^6.19.3 | Database access layer (type-safe) |
| MySQL | via Laragon | Database lokal (development) |
| Next.js API Routes | - | Server-side endpoints |
| bcrypt | ^6 | Password hashing |

### Arsitektur Unik: Custom DB Mock Layer
```
Client Component → lib/db.ts (DBQueryBuilder) → /api/db/route.ts → Prisma → MySQL
```
`lib/db.ts` mengimplementasikan API yang identik dengan Supabase JS Client (chainable `.from().select().eq()...`) namun me-route semua query ke API Route lokal. Ini memungkinkan migrasi mudah ke Supabase production di masa depan.

**Auth**: Session disimpan di `localStorage` sebagai `db_mock_user` dan `db_mock_session`.

### Struktur Folder
```
/app
  /api
    /auth/route.ts    — Autentikasi (sign in/up/out, password update)
    /db/route.ts      — Generic CRUD handler via Prisma
    /upload/route.ts  — File upload handler
    /index.py         — Python backend (AI prediction, future use)
  /dashboard
    /akademik         — Jelajahi, Kelasku, Absensi, Tugas, Arsip
    /diskusi          — Chat & VeroMeeting
    /studio           — Translate, Speech, Whiteboard, Presentasi
    /notifications
    /settings
  /login, /register   — Auth pages
  /page.tsx           — Landing page publik
/components           — Shared UI components
/lib
  /db.ts              — Custom DB mock client (Supabase-compatible API)
  /prisma.ts          — Prisma client singleton
/prisma
  /schema.prisma      — Database schema
/app/utils
  /handLogic.ts       — Feature extraction logic (MediaPipe landmarks → ML features)
  /modelbisindo.js    — Compiled BISINDO ML model
  /modelsibi.js       — Compiled SIBI ML model
```

---

## 4. Alur Pengguna (User Flow)

### Alur Umum
```
Landing Page (/) → Login (/login) → Dashboard (/dashboard) → [Fitur Pilihan]
```

### Alur Mahasiswa — Mengikuti Kelas
```
Akademik → Jelajahi → [Cari kelas] → Join dengan kode → 
Kelasku → [Pilih kelas] → Forum/Materi/Jadwal
```

### Alur Dosen — Membuat & Mengelola Kelas
```
Dashboard → Alat Cepat Dosen → [Buat Kelas] → 
Kelasku → [Detail Kelas] → Forum/Jadwal/Absensi
```

### Alur Meeting dengan AI Inklusif
```
Kelasku → Detail Kelas → Tab Jadwal → [Saat Live] Join Meeting →
VeroMeeting → [Aktifkan Gesture AI / STT] → 
Komunikasi real-time dengan terjemahan otomatis
```

### Alur Absensi
```
DOSEN: Absensi → Pilih Kelas → Buka Presensi → [Mahasiswa absen] → Tutup Presensi
MAHASISWA: Absensi → [Notif sesi aktif muncul] → Konfirmasi Kehadiran
```

### Alur Translate Gesture (Standalone)
```
Studio → Translate Gesture → Pilih model (BISINDO/SIBI) → 
Aktifkan AI → [Arahkan tangan ke kamera] → Hasil terjemahan real-time
```

---

## 5. Rencana Pengembangan Selanjutnya (Future Roadmap)

### Phase 1 — Penyempurnaan MVP (Segera)
- [ ] **Realtime Absensi**: Implementasi long-polling atau WebSocket agar Dosen tidak perlu klik "Refresh" manual
- [ ] **Notifikasi Fungsional**: Trigger notifikasi otomatis saat jadwal dimulai, tugas baru, dll.
- [ ] **Task Submission**: Lengkapi UI dan logika pengumpulan tugas dengan upload file
- [ ] **Preference Notifikasi**: Aktifkan toggle notifikasi di Settings (saat ini hanya UI)
- [ ] **Validasi Form**: Tambah validasi lebih ketat di form registrasi, kelas, dan tugas

### Phase 2 — Peningkatan AI
- [ ] **Perluasan Kosakata Model**: Tambah kosakata BISINDO/SIBI dari 26 alfabet ke ratusan kata konteks akademik
- [ ] **Konversi ke TensorFlow.js format resmi**: Ganti compiled `.js` model ke format `model.json + .bin` via TF.js converter untuk loading yang lebih efisien
- [ ] **Two-handed gesture recognition**: Perkuat deteksi dua tangan simultan untuk BISINDO
- [ ] **Model confidence threshold**: Tampilkan confidence score, filter prediksi noise

### Phase 3 — Infrastruktur & Skalabilitas
- [ ] **Migrasi ke Supabase**: `lib/db.ts` sudah kompatibel — cukup ganti target API ke Supabase endpoint
- [ ] **Deployment ke VPS Linux (Jagoan Hosting Nebula)**: Untuk production dengan unmetered bandwidth WebRTC
- [ ] **Golang Signaling Server**: Ganti PeerJS public server ke custom Golang WebSocket signaling (goroutines multiplexer) untuk high-concurrency
- [ ] **ESP32-S3 + MAX98357A Integration**: Hardware IoT loop (L1→L2→L3→Audio) untuk ruang kuliah fisik inklusif
- [ ] **Recording & Playback**: Rekam sesi meeting + subtitle untuk aksesibilitas pasca-kelas

### Phase 4 — Fitur Lanjutan
- [ ] **Admin Panel Lengkap**: User management, kelas management, analytics dashboard
- [ ] **Gamifikasi Absensi**: Badge, streak, reward untuk konsistensi kehadiran
- [ ] **AI Tutor Chatbot**: Integrasi LLM untuk bantuan belajar kontekstual
- [ ] **Responsive Mobile App**: Konversi ke PWA atau React Native
- [ ] **Multi-bahasa Isyarat**: Dukungan ASL (American Sign Language) untuk kolaborasi internasional
