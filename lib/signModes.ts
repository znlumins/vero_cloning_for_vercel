"use client";
// Sumber TUNGGAL kombinasi mode isyarat: sistem (BISINDO/SIBI) x tingkat
// (ABJAD/KATA), dan model mana yang melayani tiap kombinasi.
//
// Ada di satu berkas supaya ketiga halaman AI (terjemah, meeting, presentasi)
// tidak pernah berbeda pendapat soal kombinasi mana yang tersedia. Dulu tiap
// halaman memutuskan sendiri: terjemah & meeting mengunci BISINDO dan
// menyembunyikan SIBI, presentasi memakai daftar datar bisindo/kata/sibi yang
// mencampur sistem dengan tingkat. Menambah satu mode berarti menyunting tiga
// tempat dan mudah terlewat satu.

export type SignSystem = "bisindo" | "sibi";
export type SignLevel = "abjad" | "kata";
/** Nama folder di public/models/. */
export type ModelId = "bisindo" | "sibi" | "kata" | "kata_sibi";

export const SIGN_SYSTEMS: { id: SignSystem; label: string; hint: string }[] = [
  { id: "bisindo", label: "BISINDO", hint: "Bahasa Isyarat Indonesia" },
  { id: "sibi", label: "SIBI", hint: "Sistem Isyarat Bahasa Indonesia" },
];

export const SIGN_LEVELS: { id: SignLevel; label: string }[] = [
  { id: "abjad", label: "ABJAD" },
  { id: "kata", label: "KATA" },
];

/**
 * Model yang melayani sebuah kombinasi — atau `null` bila belum ada.
 *
 * Perhatikan penamaan folder yang menyesatkan di public/models/: folder `kata`
 * itu BISINDO kata, bukan kata secara umum. Nama itu berasal dari masa ketika
 * hanya BISINDO yang punya model kata; SIBI kata memakai nama yang jelas,
 * `kata_sibi`. Fungsi ini yang menyembunyikan ketidakkonsistenan itu dari
 * seluruh halaman; jangan menebak nama folder langsung di tempat lain.
 *
 * Keempat kombinasi kini punya model, jadi tidak ada lagi yang mengembalikan
 * null — tipe `| null` sengaja dipertahankan supaya penambahan sistem atau
 * tingkat berikutnya tidak perlu mengubah tanda tangan di tiga halaman.
 */
export function modelFor(system: SignSystem, level: SignLevel): ModelId | null {
  if (system === "bisindo") return level === "abjad" ? "bisindo" : "kata";
  return level === "abjad" ? "sibi" : "kata_sibi";
}

export function isModeAvailable(system: SignSystem, level: SignLevel): boolean {
  return modelFor(system, level) !== null;
}

/**
 * Alasan sebuah kombinasi belum bisa dipakai. Ditampilkan apa adanya ke
 * pengguna — tombol mati tanpa penjelasan terbaca seperti aplikasi rusak,
 * padahal ini pekerjaan yang memang belum dilakukan.
 *
 * Sejak 17 Agustus 2026 keempat kombinasi sudah punya model, jadi fungsi ini
 * selalu mengembalikan null. Sengaja TIDAK dihapus: begitu ada sistem atau
 * tingkat baru, di sinilah alasannya ditulis — dan pemanggilnya di
 * SignModeSelect sudah siap menampilkannya.
 */
export function unavailableReason(system: SignSystem, level: SignLevel): string | null {
  if (isModeAvailable(system, level)) return null;
  return `Model ${modeLabel(system, level)} belum tersedia.`;
}

/** Label ringkas untuk header/toast, mis. "BISINDO · KATA". */
export function modeLabel(system: SignSystem, level: SignLevel): string {
  const s = SIGN_SYSTEMS.find((x) => x.id === system)?.label ?? system.toUpperCase();
  const l = SIGN_LEVELS.find((x) => x.id === level)?.label ?? level.toUpperCase();
  return `${s} · ${l}`;
}
