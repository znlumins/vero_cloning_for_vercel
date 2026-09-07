import type { MetadataRoute } from "next";

// Peta situs untuk mesin pencari. Sebelum berkas ini ada, /sitemap.xml membalas
// 404 — Google tidak punya daftar halaman mana yang layak dirayapi.
//
// Hanya halaman PUBLIK yang masuk. Semua di bawah /dashboard ada di balik login;
// mencantumkannya cuma membuat laporan Search Console penuh galat "halaman
// dialihkan / tidak dapat diakses".
const BASE = "https://verolearning.my.id";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-08-15");

  return [
    { url: `${BASE}/`, lastModified, changeFrequency: "weekly", priority: 1.0 },
    // Versi publik fitur penerjemah. Halaman aslinya di
    // /dashboard/studio/translate SENGAJA tidak didaftarkan: ia di balik login
    // dan dirender di sisi klien, jadi yang diterima perayap cuma cangkang
    // kosong "Memuat VeroApp" — halaman kosong yang terindeks menurunkan
    // penilaian kualitas situs.
    { url: `${BASE}/terjemah`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/fitur`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/tentang`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/tim`, lastModified, changeFrequency: "monthly", priority: 0.6 },
  ];
}
