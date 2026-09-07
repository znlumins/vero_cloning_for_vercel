"use client";
// Pengatur laju frame untuk pipeline MediaPipe.
//
// MASALAH YANG DIPERBAIKI (akar penyebab lag di laptop lemah):
// Sebelumnya ketiga halaman AI memakai pola ini —
//
//     const loop = async () => {
//       if (!enabled) return;
//       await holistic.send({ image: vid });   // tunggu selesai
//       requestAnimationFrame(loop);           // langsung minta lagi
//     };
//
// Karena frame berikutnya diminta SEGERA setelah yang sebelumnya selesai, tidak
// ada satu pun pembatas laju. MediaPipe jalan secepat yang CPU sanggup, artinya
// main thread terpakai 100% tanpa jeda. Akibatnya:
//   - Laptop kencang : 60fps+ — jauh di atas kebutuhan (model dilatih 30fps),
//                      boros tenaga & baterai tanpa manfaat akurasi.
//   - Laptop lemah   : CPU saturasi total. Browser tak pernah kebagian giliran
//                      untuk repaint/menanggapi klik → "buka browser saja berat".
//
// SOLUSI: setiap siklus, tunggu selama yang TERBESAR di antara tiga batasan:
//   1. Sisa waktu menuju target interval — mengunci laju di ~30fps pada
//      perangkat kencang (selaras dengan fps data latih).
//   2. Jeda minimum wajib — menjamin browser SELALU dapat giliran, bahkan saat
//      perangkat begitu lemah sampai satu frame makan ratusan milidetik.
//   3. Jeda proporsional biaya — membatasi duty cycle. Kalau satu frame makan
//      200ms dan duty cycle maks 0,8 maka siklus dibuat 250ms, menyisakan 50ms
//      bernapas. Inilah yang membuat halaman tetap responsif di perangkat lemah,
//      alih-alih membeku total.
//
// setTimeout dipakai untuk jeda (bukan rAF saja) karena rAF tidak bisa
// memperpanjang jarak antar frame — ia justru menempel pada refresh layar.
// rAF tetap dipakai di akhir jeda agar pekerjaan tetap selaras dengan repaint.

export interface FramePacerOptions {
  /** Laju sasaran pada perangkat mampu. Default 30 — sama dengan fps data latih. */
  targetFps?: number;
  /** Jeda minimum wajib per siklus (ms), jaminan napas untuk browser. Default 8. */
  minGapMs?: number;
  /** Porsi maksimum waktu yang boleh dipakai memproses (0–1). Default 0,8. */
  maxDutyCycle?: number;
  /**
   * Dipanggil tiap frame selesai, dengan biaya pemrosesannya dalam ms.
   *
   * Angka ini adalah satu-satunya cara mengetahui PLAFON MediaPipe di sebuah
   * perangkat: 1000 / biaya = fps maksimum yang mungkin dicapai, apa pun yang
   * kita lakukan di tempat lain. Tanpa itu, fps rendah tidak bisa dibedakan
   * antara "MediaPipe berat" dan "kamera memang cuma mengirim sedikit frame" —
   * dua penyebab dengan obat yang sama sekali berbeda.
   */
  onSample?: (costMs: number) => void;
}

export interface FramePacer {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

/**
 * Bungkus pekerjaan per-frame (biasanya `holistic.send({ image })`) dengan
 * pengaturan laju. Pemanggil cukup start() dan stop().
 */
export function createFramePacer(
  work: () => Promise<void> | void,
  options: FramePacerOptions = {}
): FramePacer {
  const targetFps = options.targetFps ?? 30;
  const minGapMs = options.minGapMs ?? 8;
  const maxDutyCycle = options.maxDutyCycle ?? 0.8;
  const onSample = options.onSample;
  const targetInterval = 1000 / targetFps;

  let running = false;
  let rafId: number | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const step = async () => {
    rafId = null;
    if (!running) return;

    const startedAt = performance.now();
    try {
      await work();
    } catch (e) {
      // Satu frame gagal tidak boleh mematikan loop — MediaPipe sesekali
      // melempar saat instance ditutup di tengah frame yang tertunda.
      console.warn("framePacer: pekerjaan frame gagal:", e);
    }
    if (!running) return;

    const cost = performance.now() - startedAt;
    // Laporkan biaya frame ini SEBELUM menghitung jeda — pelapornya cuma
    // menumpuk angka di ref, tidak memicu render, jadi aman di jalur panas.
    if (onSample) {
      try {
        onSample(cost);
      } catch {
        // Alat ukur tidak boleh menjatuhkan pipeline yang diukurnya.
      }
    }
    // Jeda agar porsi memproses tidak melebihi maxDutyCycle.
    const dutyGap = cost * (1 / maxDutyCycle - 1);
    const wait = Math.max(targetInterval - cost, minGapMs, dutyGap);

    timerId = setTimeout(() => {
      timerId = null;
      if (!running) return;
      rafId = requestAnimationFrame(step);
    }, wait);
  };

  return {
    start() {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(step);
    },
    stop() {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
    isRunning() {
      return running;
    },
  };
}
