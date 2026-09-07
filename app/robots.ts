import type { MetadataRoute } from "next";

// robots.txt.
//
// CATATAN PENTING SOAL CLOUDFLARE: sebelum berkas ini ada, /robots.txt yang
// tayang seluruhnya dihasilkan fitur "Managed robots.txt" Cloudflare. Kalau
// setelah deploy isi /robots.txt masih blok "# BEGIN Cloudflare Managed
// content" dan tanpa baris Sitemap, matikan fitur itu di dasbor Cloudflare
// (Settings → Manage robots.txt) supaya berkas dari aplikasi ini yang dipakai.
//
// Yang hilang dari versi Cloudflare dan justru paling dibutuhkan: baris
// Sitemap. Tanpa itu perayap tidak tahu peta situs kita ada.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Semua ini di balik autentikasi atau bukan halaman untuk dibaca
        // manusia lewat hasil pencarian.
        disallow: [
          "/dashboard/",
          "/api/",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    sitemap: "https://verolearning.my.id/sitemap.xml",
    host: "https://verolearning.my.id",
  };
}
