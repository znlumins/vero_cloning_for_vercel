"use client";
// Alat ukur performa pipeline AI bahasa isyarat.
//
// KENAPA ADA: keluhan "ngelag di laptop lemah" selama ini ditebak-tebak. Tanpa
// angka, kita tidak tahu apakah biang keroknya laju MediaPipe, backend TFJS yang
// diam-diam jatuh ke CPU, atau ongkos inferensi.
//
// EMPAT angka yang dikumpulkan, dan pertanyaan yang dijawab masing-masing:
//
//   1. fps          — berapa frame/detik yang benar-benar SELESAI diproses.
//                     Ini gejalanya, bukan penyebabnya.
//   2. cameraFps    — berapa frame/detik yang DIKIRIM kamera, sebelum MediaPipe
//                     menyentuhnya. Webcam laptop di ruang redup diam-diam
//                     membelah laju jadi 15fps demi gambar lebih terang.
//   3. costMs       — berapa ms satu frame MediaPipe. 1000/costMs = PLAFON fps
//                     perangkat ini, apa pun yang kita lakukan di tempat lain.
//   4. backend      — "webgl"/"wasm" (cepat) vs "cpu" (lambat berkali lipat).
//                     TFJS memilih diam-diam dan tidak memberi tahu siapa pun.
//
// Angka 2 dan 3 itu yang memisahkan dua penyebab yang dari luar terlihat
// IDENTIK — sama-sama "15 fps" — padahal obatnya berlawanan:
//
//   kamera 15, biaya 20ms  -> MediaPipe sanggup 50fps tapi cuma disuapi 15.
//                             Biang keroknya KAMERA. Obatnya cahaya, bukan kode.
//   kamera 30, biaya 60ms  -> kamera normal, MediaPipe cuma sanggup 16fps.
//                             Biang keroknya BEBAN. Obatnya Mode Ringan.
//
// Dipakai bersama framePacer: pacer memanggil tick() sekali per frame terproses
// dan reportCost() dengan biaya frame itu.

import { useCallback, useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import { initTFBackend } from "@/lib/tfBackend";

export interface PerfStats {
  /** Frame per detik yang benar-benar diproses (diperbarui tiap ~1 detik). */
  fps: number;
  /** Frame per detik yang dikirim kamera. 0 = belum terukur. */
  cameraFps: number;
  /** Laju yang DIJANJIKAN kamera lewat getSettings(). 0 = tidak diketahui. */
  cameraTargetFps: number;
  /** Rata-rata biaya satu frame MediaPipe (ms). 0 = belum terukur. */
  costMs: number;
  /** Backend TFJS aktif: "webgl" | "wasm" | "cpu" | "-" (belum siap). */
  backend: string;
  /** Panggil sekali setiap frame selesai diproses. */
  tick: () => void;
  /** Laporkan biaya satu frame (ms) — sambungkan ke framePacer `onSample`. */
  reportCost: (ms: number) => void;
  /** Daftarkan elemen video sumber agar fps kamera bisa diukur; null melepas. */
  watchVideo: (el: HTMLVideoElement | null) => void;
  /** Nolkan penghitung — panggil saat deteksi dimulai/berhenti. */
  reset: () => void;
}

/** Ambang fps di bawahnya prediksi mulai tidak bisa dipercaya. */
export const FPS_WARN_THRESHOLD = 15;
/** Di bawah ini kamera dianggap ikut jadi penyebab, bukan cuma korban. */
export const CAMERA_WARN_FPS = 20;
/** Di atas ini satu frame MediaPipe dianggap mahal (plafon < 20fps). */
export const COST_WARN_MS = 50;

/**
 * Jumlah frame yang sudah didekode elemen video. Inilah angka yang JUJUR soal
 * laju kamera — beda dengan getSettings().frameRate yang cuma menyebut laju
 * hasil negosiasi, bukan yang benar-benar terkirim.
 */
function decodedFrames(el: HTMLVideoElement): number | null {
  const q = (
    el as unknown as { getVideoPlaybackQuality?: () => { totalVideoFrames: number } }
  ).getVideoPlaybackQuality?.();
  if (q && typeof q.totalVideoFrames === "number") return q.totalVideoFrames;
  // Safari lawas memakai nama berprefiks.
  const webkit = (el as unknown as { webkitDecodedFrameCount?: number }).webkitDecodedFrameCount;
  return typeof webkit === "number" ? webkit : null;
}

/** Laju yang dijanjikan kamera saat negosiasi constraint. */
function negotiatedFps(el: HTMLVideoElement): number {
  const stream = el.srcObject as MediaStream | null;
  const track = stream?.getVideoTracks?.()[0];
  const rate = track?.getSettings?.().frameRate;
  return typeof rate === "number" ? Math.round(rate) : 0;
}

export function usePerfStats(): PerfStats {
  const [fps, setFps] = useState(0);
  const [cameraFps, setCameraFps] = useState(0);
  const [cameraTargetFps, setCameraTargetFps] = useState(0);
  const [costMs, setCostMs] = useState(0);
  const [backend, setBackend] = useState("-");

  const framesRef = useRef(0);
  const windowStartRef = useRef(0);

  // Biaya frame ditumpuk di ref, BUKAN state — reportCost dipanggil puluhan kali
  // per detik di jalur panas; setState di situ akan membakar lebih banyak CPU
  // daripada yang sedang diukur.
  const costSumRef = useRef(0);
  const costCountRef = useRef(0);

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const camFramesRef = useRef<number | null>(null);
  const camAtRef = useRef(0);

  // Pakai initTFBackend (idempoten) supaya angka yang ditampilkan adalah backend
  // hasil pemilihan eksplisit kita, bukan tebakan sementara sebelum fallback
  // selesai. Lihat lib/tfBackend.ts.
  useEffect(() => {
    let cancelled = false;
    initTFBackend()
      .then((name) => {
        if (!cancelled) setBackend(name || tf.getBackend() || "-");
      })
      .catch(() => {
        if (!cancelled) setBackend("gagal");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Satu denyut per detik untuk mengeluarkan angka yang ditumpuk di ref.
  // Saat tidak ada deteksi berjalan, denyut ini keluar lebih awal tanpa
  // memanggil setState sama sekali — jadi tidak memicu render sia-sia.
  useEffect(() => {
    const id = setInterval(() => {
      if (costCountRef.current > 0) {
        setCostMs(Math.round(costSumRef.current / costCountRef.current));
        costSumRef.current = 0;
        costCountRef.current = 0;
      }

      const el = videoElRef.current;
      if (!el) return;

      setCameraTargetFps(negotiatedFps(el));

      const now = performance.now();
      const total = decodedFrames(el);

      // Browser tidak menyediakan hitungan frame (Firefox lama). Pakai angka
      // yang dijanjikan kamera sebagai perkiraan — kurang jujur, tapi lebih
      // baik daripada kosong.
      if (total === null) {
        setCameraFps(negotiatedFps(el));
        return;
      }

      const prevFrames = camFramesRef.current;
      const prevAt = camAtRef.current;
      camFramesRef.current = total;
      camAtRef.current = now;

      // Sampel pertama hanya menjadi garis dasar.
      if (prevFrames === null || prevAt === 0) return;

      const elapsed = now - prevAt;
      if (elapsed <= 0) return;
      setCameraFps(Math.max(0, Math.round(((total - prevFrames) * 1000) / elapsed)));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const tick = useCallback(() => {
    const now = performance.now();

    // Frame pertama hanya menandai awal jendela pengukuran.
    if (windowStartRef.current === 0) {
      windowStartRef.current = now;
      return;
    }

    framesRef.current += 1;
    const elapsed = now - windowStartRef.current;

    // Perbarui sekali per detik supaya angkanya terbaca, bukan berkedip.
    if (elapsed >= 1000) {
      setFps(Math.round((framesRef.current * 1000) / elapsed));
      framesRef.current = 0;
      windowStartRef.current = now;
    }
  }, []);

  const reportCost = useCallback((ms: number) => {
    if (!Number.isFinite(ms) || ms < 0) return;
    costSumRef.current += ms;
    costCountRef.current += 1;
  }, []);

  const watchVideo = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    // Garis dasar dinolkan supaya frame yang terdekode SEBELUM pengukuran
    // dimulai tidak ikut terhitung di jendela pertama.
    camFramesRef.current = null;
    camAtRef.current = 0;
    if (!el) {
      setCameraFps(0);
      setCameraTargetFps(0);
    }
  }, []);

  const reset = useCallback(() => {
    framesRef.current = 0;
    windowStartRef.current = 0;
    costSumRef.current = 0;
    costCountRef.current = 0;
    camFramesRef.current = null;
    camAtRef.current = 0;
    setFps(0);
    setCostMs(0);
    setCameraFps(0);
  }, []);

  return {
    fps,
    cameraFps,
    cameraTargetFps,
    costMs,
    backend,
    tick,
    reportCost,
    watchVideo,
    reset,
  };
}
