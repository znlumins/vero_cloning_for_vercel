"use client";
// Helper Text-to-Speech Bahasa Indonesia bersama.
//
// DUA JALUR, SATU FUNGSI
// ----------------------
// 1. UTAMA — `/api/tts`: audio disintesis di server dengan suara neural
//    Bahasa Indonesia. Semua pengguna mendengar suara yang PERSIS SAMA, apa pun
//    browser dan sistem operasinya. Lihat app/api/tts/route.ts untuk alasannya.
// 2. CADANGAN — `speechSynthesis` bawaan browser. Dipakai hanya kalau jalur
//    utama gagal (server tak terjangkau, offline, autoplay diblokir).
//
// Kualitas suaranya berbeda jauh, jadi jalur cadangan bukan pengganti yang
// setara — ia hanya menjaga fitur tetap berbunyi alih-alih diam sama sekali.
//
// Catatan penting soal jalur cadangan: di Microsoft Edge, menyetel
// `utterance.lang = 'id-ID'` saja TIDAK cukup — tanpa `utterance.voice` yang
// eksplisit, Edge jatuh ke voice Inggris dan membaca teks Indonesia dengan
// aksen Inggris.

export type TtsVoice = "perempuan" | "laki-laki";
/** Jalur mana yang akhirnya berbunyi — berguna untuk ditampilkan di UI. */
export type TtsSource = "server" | "browser" | "gagal";

let cachedVoice: SpeechSynthesisVoice | null = null;
let initialized = false;

// Audio yang sedang diputar dari jalur server. Disimpan agar `interrupt` bisa
// menghentikannya — `speechSynthesis.cancel()` tidak menyentuh elemen <audio>.
let audioAktif: HTMLAudioElement | null = null;

// Sekali jalur server terbukti gagal, jangan menunggu timeout-nya lagi pada tiap
// ucapan berikutnya: langsung pakai jalur cadangan. Direset saat halaman dimuat
// ulang, jadi gangguan sementara tidak mematikannya selamanya.
let serverMati = false;

function pickIndonesianVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // Semua voice berbahasa Indonesia (lang id-* atau namanya menyebut Indonesia).
  const indo = voices.filter(
    (v) => v.lang?.toLowerCase().startsWith("id") || /indonesia/i.test(v.name)
  );
  // Utamakan yang paling natural: "Natural"/"Online" (Microsoft/Edge) atau
  // "Google", baru voice Indonesia apa pun.
  return (
    indo.find((v) => /natural|online/i.test(v.name)) ||
    indo.find((v) => /google/i.test(v.name)) ||
    indo.find((v) => v.lang === "id-ID") ||
    indo[0] ||
    null
  );
}

function ensureInit() {
  if (initialized || typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }
  initialized = true;
  cachedVoice = pickIndonesianVoice();
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    cachedVoice = pickIndonesianVoice();
  });
}

/** Panggil sekali saat komponen mount agar daftar voice mulai dimuat lebih awal. */
export function primeIndonesianVoice() {
  ensureInit();
}

/** Nama voice cadangan browser yang aktif (untuk ditampilkan di UI), atau null. */
export function activeIndonesianVoiceName(): string | null {
  ensureInit();
  if (!cachedVoice) cachedVoice = pickIndonesianVoice();
  return cachedVoice?.name ?? null;
}

/** Hentikan ucapan yang sedang berjalan, dari jalur mana pun. */
export function stopSpeaking() {
  if (typeof window === "undefined") return;
  if (audioAktif) {
    audioAktif.pause();
    // src dikosongkan supaya browser melepas berkas audionya; pause() saja
    // menyisakan buffer yang menggantung.
    audioAktif.src = "";
    audioAktif = null;
  }
  if ("speechSynthesis" in window && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
}

/** Jalur cadangan: suara bawaan browser. */
function ucapDenganBrowser(text: string, rate: number, onEnd?: () => void): TtsSource {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return "gagal";
  ensureInit();
  if (!cachedVoice) cachedVoice = pickIndonesianVoice();
  try {
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = "id-ID";
    if (cachedVoice) ut.voice = cachedVoice;
    ut.rate = rate;
    if (onEnd) {
      ut.onend = onEnd;
      ut.onerror = onEnd;
    }
    window.speechSynthesis.speak(ut);
    return "browser";
  } catch (e) {
    console.warn("TTS cadangan gagal:", e);
    onEnd?.();
    return "gagal";
  }
}

/**
 * Ucapkan teks dalam Bahasa Indonesia.
 *
 * Sengaja TIDAK pernah menolak (reject): pemanggilnya rata-rata tidak menunggu
 * hasilnya, dan promise yang ditolak tanpa penangan akan memunculkan
 * unhandledrejection di konsol pengguna.
 *
 * @param opts.rate       kecepatan bicara (default 1)
 * @param opts.interrupt  batalkan ucapan yang sedang berjalan lebih dulu
 * @param opts.voice      "perempuan" (default) atau "laki-laki" — jalur server
 * @param opts.onEnd      dipanggil saat ucapan selesai (untuk indikator UI)
 * @returns jalur mana yang akhirnya berbunyi
 */
export async function speakIndonesian(
  text: string,
  opts?: { rate?: number; interrupt?: boolean; voice?: TtsVoice; onEnd?: () => void }
): Promise<TtsSource> {
  if (typeof window === "undefined" || !text) return "gagal";
  const rate = opts?.rate ?? 1;
  const onEnd = opts?.onEnd;

  if (opts?.interrupt) stopSpeaking();

  if (serverMati) return ucapDenganBrowser(text, rate, onEnd);

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: opts?.voice ?? "perempuan" }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = rate;
    // Object URL wajib dilepas setelah selesai; kalau tidak, tiap ucapan
    // meninggalkan blob di memori sampai tab ditutup.
    const bersihkan = () => {
      URL.revokeObjectURL(url);
      if (audioAktif === audio) audioAktif = null;
      onEnd?.();
    };
    audio.addEventListener("ended", bersihkan);
    audio.addEventListener("error", bersihkan);

    audioAktif = audio;
    await audio.play();
    return "server";
  } catch (e) {
    // Kegagalan di sini bisa berarti dua hal yang perlu dibedakan:
    //  - autoplay diblokir (NotAllowedError): server baik-baik saja, jangan
    //    tandai mati — ucapan berikutnya yang dipicu klik akan berhasil;
    //  - server/jaringan bermasalah: tandai mati supaya ucapan berikutnya tidak
    //    menunggu timeout yang sama lagi.
    if ((e as { name?: string })?.name !== "NotAllowedError") {
      serverMati = true;
    }
    console.warn("TTS server gagal, memakai suara bawaan browser:", e);
    return ucapDenganBrowser(text, rate, onEnd);
  }
}
