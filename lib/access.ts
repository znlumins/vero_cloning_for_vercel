// Aturan siapa boleh apa — SATU tempat untuk seluruh aplikasi.
//
// KENAPA TERPUSAT
// ---------------
// Sebelum berkas ini ada, tiap halaman menulis sendiri
// `user?.user_metadata?.role === "ADMIN"`. Cara itu sudah terbukti gagal:
// pemeriksaan ADMIN tersebar di dashboard padahal ADMIN tidak pernah ada di
// enum Role, jadi selama berbulan-bulan CRUD pengumuman terkunci di balik
// syarat yang mustahil benar — dan tidak ada yang menyadarinya karena tidak ada
// satu pun tempat yang bisa dibaca untuk memeriksanya.
//
// PERINGATAN KEAMANAN
// -------------------
// Seluruh fungsi di sini membaca metadata sesi di localStorage, yang bisa
// disunting siapa pun lewat DevTools. Jadi ini HANYA untuk menampilkan/
// menyembunyikan UI. Setiap operasi yang benar-benar berbahaya wajib diperiksa
// ulang di server (lihat app/api/admin/route.ts), bukan bersandar pada ini.

export type Role = "MAHASISWA" | "DOSEN" | "ADMIN";
export type HearingStatus = "TEMAN_TULI" | "TEMAN_DENGAR";
export type DosenStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface SessionUser {
  id?: string;
  email?: string | null;
  user_metadata?: {
    full_name?: string;
    role?: string;
    avatar_url?: string | null;
    hearing_status?: string | null;
    dosen_status?: string | null;
    university?: string | null;
    study_program?: string | null;
  };
}

export function roleOf(user: SessionUser | null | undefined): Role {
  const r = user?.user_metadata?.role;
  return r === "ADMIN" || r === "DOSEN" ? r : "MAHASISWA";
}

export function hearingStatusOf(user: SessionUser | null | undefined): HearingStatus | null {
  const s = user?.user_metadata?.hearing_status;
  return s === "TEMAN_TULI" || s === "TEMAN_DENGAR" ? s : null;
}

export function dosenStatusOf(user: SessionUser | null | undefined): DosenStatus | null {
  const s = user?.user_metadata?.dosen_status;
  return s === "PENDING" || s === "APPROVED" || s === "REJECTED" ? s : null;
}

export function isAdmin(user: SessionUser | null | undefined): boolean {
  return roleOf(user) === "ADMIN";
}

/**
 * Dosen yang sudah TERVERIFIKASI. Inilah syarat untuk membuat kelas, tugas, dan
 * menilai — bukan sekadar `role === "DOSEN"`.
 *
 * Bedanya penting: seseorang yang baru mendaftar sebagai dosen sudah punya role
 * DOSEN sejak detik pertama, tapi belum boleh berbuat apa-apa sampai admin
 * menyetujuinya.
 */
export function isDosenAktif(user: SessionUser | null | undefined): boolean {
  return roleOf(user) === "DOSEN" && dosenStatusOf(user) === "APPROVED";
}

/** Dosen yang pengajuannya masih menunggu keputusan admin. */
export function isDosenMenunggu(user: SessionUser | null | undefined): boolean {
  return roleOf(user) === "DOSEN" && dosenStatusOf(user) === "PENDING";
}

/** Dosen yang pengajuannya ditolak. */
export function isDosenDitolak(user: SessionUser | null | undefined): boolean {
  return roleOf(user) === "DOSEN" && dosenStatusOf(user) === "REJECTED";
}

/**
 * Boleh memakai kewenangan mengajar: dosen terverifikasi ATAU admin.
 *
 * Admin ikut masuk karena ia mengelola seluruh platform — memisahkan keduanya
 * hanya akan membuat admin terhalang di fiturnya sendiri.
 */
export function bolehMengajar(user: SessionUser | null | undefined): boolean {
  return isAdmin(user) || isDosenAktif(user);
}

/**
 * Profil dianggap BELUM LENGKAP selama status pendengaran belum dipilih.
 *
 * Satu penanda saja, bukan kolom `profile_completed` terpisah — dua sumber
 * kebenaran untuk hal yang sama pasti berselisih cepat atau lambat. Akun lama
 * (dibuat sebelum kolom ini ada) otomatis terhitung belum lengkap, dan itu
 * memang disengaja: justru data merekalah yang paling perlu dilengkapi.
 */
export function profilBelumLengkap(user: SessionUser | null | undefined): boolean {
  return !!user && hearingStatusOf(user) === null;
}

export const LABEL_HEARING: Record<HearingStatus, string> = {
  TEMAN_TULI: "Teman Tuli",
  TEMAN_DENGAR: "Teman Dengar",
};

export const LABEL_ROLE: Record<Role, string> = {
  MAHASISWA: "Mahasiswa",
  DOSEN: "Dosen",
  ADMIN: "Admin",
};

export const LABEL_DOSEN_STATUS: Record<DosenStatus, string> = {
  PENDING: "Menunggu verifikasi",
  APPROVED: "Terverifikasi",
  REJECTED: "Ditolak",
};
