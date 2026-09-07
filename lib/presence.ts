// Status daring/luring — satu tempat yang menentukan artinya.
//
// KENAPA DITURUNKAN DARI WAKTU, BUKAN DARI BOOLEAN
// ------------------------------------------------
// Godaan pertama selalu kolom `is_online`: dinyalakan saat masuk, dimatikan saat
// keluar. Cara itu rusak pada kejadian yang paling sering terjadi — tab ditutup
// paksa, laptop ditutup, wifi putus, browser di-kill. Tidak ada yang sempat
// mengirim "saya keluar", jadi orangnya menyala hijau selamanya dan tidak ada
// satu pun proses yang akan membetulkannya.
//
// Karena itu yang disimpan hanya SATU cap waktu: `last_seen`, didenyutkan
// berkala selama tab terbuka. Daring berarti "terlihat baru-baru ini". Kalau
// browser mati mendadak, denyutnya berhenti dan statusnya luntur sendiri tanpa
// perlu ada yang membereskan.

import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

/** Jarak antar denyut. */
export const JEDA_DENYUT_MS = 30_000;

/**
 * Berapa lama sejak denyut terakhir seseorang masih dianggap daring.
 *
 * Sengaja lebih dari dua kali JEDA_DENYUT_MS: satu denyut yang meleset karena
 * jaringan tersendat tidak boleh langsung membuat orang tampak pergi.
 */
export const AMBANG_DARING_MS = 75_000;

export function sedangDaring(lastSeen: string | Date | null | undefined): boolean {
  if (!lastSeen) return false;
  const t = new Date(lastSeen).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= AMBANG_DARING_MS;
}

/**
 * Teks status untuk ditampilkan di bawah nama.
 * Contoh: "Aktif sekarang" atau "Terakhir aktif 21:27, 26 Agustus 2026".
 */
export function labelKehadiran(lastSeen: string | Date | null | undefined): string {
  if (sedangDaring(lastSeen)) return "Aktif sekarang";
  if (!lastSeen) return "Belum pernah aktif";
  const d = new Date(lastSeen);
  if (Number.isNaN(d.getTime())) return "Belum pernah aktif";
  return `Terakhir aktif ${format(d, "HH:mm, d MMMM yyyy", { locale: idLocale })}`;
}
