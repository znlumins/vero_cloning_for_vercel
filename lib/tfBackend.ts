"use client";
// Pemilihan backend TensorFlow.js secara EKSPLISIT, dengan fallback yang sadar.
//
// MASALAH YANG DIPERBAIKI: sebelumnya tidak ada satu pun panggilan setBackend di
// seluruh proyek, jadi TFJS memilih sendiri. Di laptop yang driver GPU-nya lemah
// atau WebGL-nya diblokir, TFJS DIAM-DIAM jatuh ke backend "cpu" — implementasi
// JavaScript murni yang berkali lipat lebih lambat. Tidak ada cara bagi kita
// maupun pengguna untuk tahu itu sedang terjadi, dan itu salah satu tersangka
// utama laporan "ngelag parah di laptop univ".
//
// Urutan pilihan:
//   1. webgl — memakai GPU, tercepat untuk model LSTM ini.
//   2. wasm  — WebAssembly (+SIMD bila didukung). Jauh lebih cepat dari "cpu"
//              untuk perangkat tanpa WebGL yang sehat. Biner disajikan lokal
//              dari /tfjs-wasm/ (bukan CDN) supaya versinya dijamin cocok
//              dengan paket npm dan tetap jalan tanpa akses jsDelivr.
//   3. cpu   — jaring pengaman terakhir; lambat, tapi lebih baik daripada gagal.
//
// setBackend() bisa "berhasil" tapi ambruk saat operasi pertama, jadi tiap
// kandidat diuji dengan satu operasi kecil sungguhan sebelum diterima.

import * as tf from "@tensorflow/tfjs";

let initPromise: Promise<string> | null = null;

/** Jalankan satu operasi nyata untuk memastikan backend benar-benar berfungsi. */
async function smokeTest(): Promise<boolean> {
  try {
    const t = tf.tidy(() => tf.zeros([2, 2]).square().sum());
    const v = await t.data();
    t.dispose();
    return Number.isFinite(v[0]);
  } catch {
    return false;
  }
}

async function tryBackend(name: string): Promise<boolean> {
  try {
    const ok = await tf.setBackend(name);
    if (!ok) return false;
    await tf.ready();
    if (tf.getBackend() !== name) return false;
    return await smokeTest();
  } catch {
    return false;
  }
}

/**
 * Siapkan backend TFJS. Idempoten — panggilan berikutnya memakai hasil yang sama,
 * jadi aman dipanggil dari beberapa komponen sekaligus.
 * @returns nama backend yang akhirnya dipakai.
 */
export function initTFBackend(): Promise<string> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (await tryBackend("webgl")) return "webgl";
    console.warn("TFJS: WebGL tidak tersedia/gagal — mencoba WASM.");

    try {
      // Impor dinamis: modul WASM hanya diunduh kalau WebGL memang gagal.
      const wasm = await import("@tensorflow/tfjs-backend-wasm");
      // Biner lokal. Kalau paket npm di-update, segarkan folder ini dengan:
      //   npm run sync:tfjs-wasm
      wasm.setWasmPaths("/tfjs-wasm/");
      if (await tryBackend("wasm")) return "wasm";
    } catch (e) {
      console.warn("TFJS: backend WASM gagal dimuat:", e);
    }

    console.warn(
      "TFJS: jatuh ke backend CPU — inferensi akan jauh lebih lambat. " +
        "Sarankan pengguna memakai Chrome/Edge terbaru dengan akselerasi perangkat keras aktif."
    );
    await tryBackend("cpu");
    return tf.getBackend() || "cpu";
  })();

  return initPromise;
}
