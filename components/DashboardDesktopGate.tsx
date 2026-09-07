"use client";
// Gerbang desktop untuk SELURUH aplikasi VERO (semua yang ada di /dashboard).
//
// KENAPA SATU TITIK, BUKAN DIPASANG PER HALAMAN
// ---------------------------------------------
// Kalau dipasang satu per satu, halaman baru yang ditambahkan besok akan lolos
// begitu saja — dan tidak ada yang menyadarinya sampai ada yang membukanya di
// ponsel. Dipasang di layout, cakupannya otomatis mengikuti isi dashboard.
//
// CARA MENGUBAH CAKUPANNYA
// ------------------------
// Kalau ternyata terlalu luas — misalnya Diskusi dan Absensi ingin tetap bisa
// dipakai di ponsel — JANGAN longgarkan komponen ini. Cabut saja pemakaiannya
// dari app/dashboard/layout.tsx, lalu bungkus halaman yang memang perlu digerbang
// dengan <DesktopOnly> seperti yang sudah dilakukan translate, presentasi, dan
// meeting. Dengan begitu daftar halaman yang diblokir selalu terbaca eksplisit,
// bukan tersembunyi di balik daftar pengecualian.
//
// Halaman depan, tentang, tim, dan login TIDAK ikut digerbang: orang harus tetap
// bisa membaca apa itu VERO dari ponselnya. Yang ditutup adalah aplikasinya.

import DesktopOnly from "@/components/DesktopOnly";

const ALASAN =
  "VERO menjalankan penerjemah bahasa isyarat dan pengenalan suara langsung di perangkat Anda, di atas video kamera yang berjalan terus-menerus. Ponsel dan tablet kehabisan tenaga lalu memanas sebelum satu sesi selesai, jadi aplikasinya hanya bisa dibuka lewat laptop atau PC.";

export default function DashboardDesktopGate({ children }: { children: React.ReactNode }) {
  return (
    <DesktopOnly
      fitur="Aplikasi VERO"
      alasan={ALASAN}
      // Ke halaman depan, BUKAN /dashboard — kalau ke dashboard, tombolnya cuma
      // mengembalikan orang ke gerbang ini lagi.
      hrefKembali="/"
      labelKembali="Kembali ke halaman depan"
    >
      {children}
    </DesktopOnly>
  );
}
