// Mode tampilan untuk akun ADMIN: melihat VERO sebagai pengelola, atau sebagai
// pengguna biasa.
//
// INI MURNI SOAL NAVIGASI, BUKAN HAK AKSES
// ----------------------------------------
// Berpindah ke Mode Pengguna TIDAK menurunkan kewenangan siapa pun — akunnya
// tetap admin, dan /api/admin tetap melayaninya. Yang berubah cuma menu apa yang
// ditampilkan sidebar dan halaman mana yang jadi beranda.
//
// Karena itu mode ini disimpan di localStorage, dan itu aman: nilainya tidak
// pernah dipakai untuk memutuskan siapa boleh apa. Seseorang yang menyunting
// localStorage jadi "admin" hanya akan melihat menu yang tautannya menuju
// halaman yang akan menolaknya, karena /api/admin memverifikasi peran dari
// database pada setiap permintaan. Lihat catatan di app/api/admin/route.ts.
//
// KENAPA MODE JUGA TERBACA DARI URL
// Route /dashboard/admin/* SELALU berarti Mode Admin, apa pun isi localStorage.
// Dengan begitu menyegarkan halaman, membuka tautan langsung, atau menekan
// tombol kembali tidak pernah membuat sidebar berselisih dengan isi halaman.
// localStorage hanya menentukan mode di halaman yang dipakai KEDUA mode —
// Pengaturan — dan mode mana yang dituju saat admin baru masuk.

export type ModeTampilan = "admin" | "pengguna";

const KUNCI = "vero_mode_tampilan";

/** Disiarkan setelah mode berubah, supaya sidebar di tab yang sama ikut menyesuaikan. */
export const PERISTIWA_MODE = "vero-mode-berubah";

export const AWALAN_RUTE_ADMIN = "/dashboard/admin";

/** Bagian-bagian panel admin; sekaligus daftar putih untuk segmen route. */
export const BAGIAN_ADMIN = ["ringkasan", "pengguna", "dosen", "kelas"] as const;
export type BagianAdmin = (typeof BAGIAN_ADMIN)[number];

export const BAGIAN_ADMIN_DEFAULT: BagianAdmin = "ringkasan";

export function adalahBagianAdmin(v: string | undefined | null): v is BagianAdmin {
  return !!v && (BAGIAN_ADMIN as readonly string[]).includes(v);
}

/** Beranda Mode Admin. */
export function rutaBagian(bagian: BagianAdmin): string {
  return `${AWALAN_RUTE_ADMIN}/${bagian}`;
}

export const BERANDA_ADMIN = rutaBagian(BAGIAN_ADMIN_DEFAULT);
export const BERANDA_PENGGUNA = "/dashboard";

/** Route ini milik Mode Admin? */
export function ruteMilikAdmin(pathname: string): boolean {
  return pathname.startsWith(AWALAN_RUTE_ADMIN);
}

export function bacaMode(): ModeTampilan {
  if (typeof window === "undefined") return "pengguna";
  try {
    return localStorage.getItem(KUNCI) === "admin" ? "admin" : "pengguna";
  } catch {
    // localStorage bisa dilarang (mode privat di sebagian browser). Kehilangan
    // ingatan mode bukan alasan untuk merusak halaman.
    return "pengguna";
  }
}

export function simpanMode(mode: ModeTampilan): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KUNCI, mode);
  } catch {
    /* diabaikan — lihat alasannya di bacaMode() */
  }
  window.dispatchEvent(new Event(PERISTIWA_MODE));
}
