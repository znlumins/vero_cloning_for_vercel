/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, 
  reactCompiler: true,

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },

  // --- REWRITES: sengaja KOSONG ---
  //
  // Dulu di sini ada proxy /api/v1/* dan /ws/* ke backend Go di :8080.
  // Dibuang 18 Agustus 2026 karena backend itu tidak pernah dipakai:
  //   * prediksi AI jalan di browser lewat TensorFlow.js (public/models/),
  //     bukan di server — lihat DEPLOYMENT.md bagian 0;
  //   * meeting memakai PeerJS (app/dashboard/diskusi/meeting/page.tsx),
  //     bukan signaling lewat /ws.
  //
  // Efeknya di produksi: bot pemindai mengetuk /api/v1/env, /api/v1/config,
  // /api/v1/settings — jalur yang TIDAK ADA di project ini. Rewrite membuat
  // Next mencoba menyambung ke :8080 yang mati, lalu menumpahkan
  // ECONNREFUSED ke pm2 log sampai error asli tenggelam di antaranya.
  // Tanpa rewrite, ketukan itu dibalas 404 dan berhenti di situ.
  //
  // Kalau backend Go suatu saat benar-benar dihidupkan, kembalikan blok ini
  // DAN pastikan prosesnya jalan lebih dulu — jangan yang satu tanpa yang lain.
};

module.exports = nextConfig;