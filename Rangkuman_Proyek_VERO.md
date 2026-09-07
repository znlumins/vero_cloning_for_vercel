# Rangkuman Konteks Proyek VERO (PKM-KC)
*(Dokumen Grounding Context)*

## 1. Arsitektur Sistem & Alur Logika (PlantUML)
- **Sistem:** Berjalan secara *Closed-Loop* dari L1 (IoT Edge) -> L2 (Backend) -> L3 (Frontend AI) -> L_Out (IoT Audio).
- **Fork Node (Eksekusi Paralel):** Diterapkan pada L3 saat kondisi "Aman". Sistem memecah alur menjadi dua eksekusi simultan di milidetik yang sama tanpa delay:
  - Hasil 2: Menampilkan teks terjemahan ke antarmuka React (*Sign-to-Text*).
  - Hasil 3: Meneruskan teks ke *Text-to-Speech* lalu dikirim balik ke alat untuk diledakkan melalui modul MAX98357A dan *Speaker* fisik 3W.

## 2. Judul Proposal (Final PIMNAS - 20 Kata)
"Rancang Bangun Sistem Ruang Kuliah Inklusif Berbasis Kamera Penerjemah Terintegrasi Deep Neural Network untuk Komunikasi Dua Arah Tunarungu dan Tunawicara"

## 3. Narasi Abstrak/Bab 1 (Final)
"Inovasi ini menghadirkan konsep VERO sebagai LMS terintegrasi AI yang memadukan teknologi *voice processing* dan ***Computer Vision*** dalam pembelajaran formal. Arsitektur ***Deep Neural Network*** berbasis ***TensorFlow.js*** dirancang secara **bertahap**. Pada tahap prototipe, sistem difokuskan pada pengenalan 26 gestur alfabetis (A - Z) serta 12 kosakata dasar dalam interaksi akademik berbasis SIBI dan BISINDO. Selanjutnya, sistem akan dikembangkan secara berkelanjutan melalui pengayaan pangkalan data kosakata yang luas dan variatif, guna mendukung fleksibilitas komunikasi dalam berbagai konteks interaksi yang kompleks."

## 4. Stack Teknologi & Algoritma AI
- **MediaPipe:** Ekstraksi *landmark* tangan (*real-time*).
- **Python/DNN:** Komputasi *offline training* model.
- **TensorFlow.js (TFJS):** Inferensi *Client-Side* di *browser* pengguna.
- **Golang (Backend L2):** Menggunakan **Goroutines Multiplexer** untuk *high-concurrency* dan *non-blocking I/O*. Mengatur lalu lintas video (WebRTC) dan sensor (WebSocket) tanpa *bottleneck* (anti-lag).
- **React.js:** Frontend LMS (L3).
- **Supabase:** Database *cloud* (PostgreSQL & Auth).

## 5. Revisi Anggaran (RAB) Hardware
- Pemisahan modul MAX98357A dan penambahan wujud fisik **Speaker 3W 4 Ohm**.
- Mengganti *Shared Hosting* menjadi **Sewa VPS Linux** (karena Golang butuh akses *root*).
- Penambahan komponen catu daya pendukung (**Baterai LiPo / Adaptor Daya 5V 2A**) untuk ESP32-S3.

## 6. Status Tahap Pelatihan AI (Offline Training L4)
- *Environment* terpisah: SIBI (Model V6) dan BISINDO (Model V4) sudah terstruktur di Google Drive.
- **Next Step:** Konversi model hasil *training* (Python) menjadi format **TFJS** (`model.json` dan `.bin`) agar siap didistribusikan untuk *Concurrent Loading* via `Promise.all` di React L3.

## 7. Infrastruktur Server Utama
- **Pilihan Final:** **Jagoan Hosting (Paket Nebula)**.
- **Alasan Teknis:** Menyediakan *Unmetered Bandwidth* (10 Gbps) untuk kelancaran aliran video WebRTC dari kamera OV5640. Lokasi *server* lokal menekan *delay* latensi hingga mendekati 0ms, dan memberikan kebebasan akses *root* Linux untuk menaikkan batas `ulimit` menjadi 65.535 koneksi serta membatasi port UDP di *firewall*.
