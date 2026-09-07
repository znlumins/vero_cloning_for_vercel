"use client";
// Deteksi perangkat kelas bawah untuk memutuskan "Mode Ringan" MediaPipe.
//
// Laptop CPU lemah (mis. Intel Core i3 gen lama) kepayahan menjalankan
// Holistic `modelComplexity: 1` @ 1280x720 — halaman jadi nge-lag parah dan
// deteksi isyarat gagal. Mode Ringan menurunkan complexity ke 0 dan resolusi
// kamera ke 640x480 agar tetap jalan, dengan sedikit penurunan akurasi.

export interface DeviceProfile {
  isLowEnd: boolean;
  cores: number;
  memoryGB: number | null;
}

/**
 * Tebak apakah perangkat tergolong lemah dari jumlah core logis & RAM.
 * `deviceMemory` hanya tersedia di Chromium (satuan GB, dibulatkan, maks 8).
 */
export function detectDevice(): DeviceProfile {
  if (typeof navigator === "undefined") {
    return { isLowEnd: false, cores: 8, memoryGB: null };
  }
  const cores = navigator.hardwareConcurrency || 8;
  const memoryGB = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null;
  const lowCores = cores <= 4;
  const lowMem = memoryGB != null && memoryGB <= 4;
  return { isLowEnd: lowCores || lowMem, cores, memoryGB };
}

/** Konfigurasi MediaPipe & kamera sesuai mode ringan/normal. */
export function mediaConfigFor(lightMode: boolean) {
  return {
    modelComplexity: (lightMode ? 0 : 1) as 0 | 1,
    width: lightMode ? 640 : 1280,
    height: lightMode ? 480 : 720,

    // Jarak minimum antar prediksi (ms).
    //
    // Sebelumnya prediksi dijalankan pada SETIAP frame yang lolos — dan karena
    // dua model (abjad + kata) dijalankan sekaligus, itu dua forward-pass LSTM
    // tiap frame. Pada 30fps artinya 60 inferensi per detik, jauh lebih banyak
    // dari yang dibutuhkan: peredam prediksi hanya memilih terbanyak dari 5
    // tebakan terakhir, jadi ~8 prediksi/detik sudah menutup ~600ms riwayat.
    //
    // Menjarangkan prediksi TIDAK mengurangi akurasi (jendela fitur yang dipakai
    // tetap 30 frame terbaru), tapi memangkas ongkos inferensi ~3x dan
    // mengembalikan waktu CPU ke MediaPipe — yang justru menaikkan fps, dan
    // lewat buffer berbasis waktu ikut menaikkan akurasi.
    predictIntervalMs: lightMode ? 200 : 120,
  };
}

export const RECOMMENDED_SPEC =
  "Untuk fitur AI bahasa isyarat yang lancar, disarankan perangkat setara Intel Core i5 generasi 8+ / AMD Ryzen 5, RAM 8 GB, dengan browser Chrome atau Edge terbaru.";
