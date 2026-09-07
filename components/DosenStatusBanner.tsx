"use client";
// Pemberitahuan status verifikasi untuk akun dosen.
//
// Tanpa ini, dosen yang belum disetujui melihat halaman yang tombol-tombolnya
// hilang begitu saja — tidak ada bedanya dengan aplikasi rusak. Yang paling
// membuat frustrasi bukan fitur yang terkunci, melainkan terkunci tanpa tahu
// kenapa dan sampai kapan.
//
// Tidak menampilkan apa pun untuk mahasiswa, admin, dan dosen yang sudah
// disetujui — mereka tidak sedang menunggu apa pun.

import { AlertTriangle, Clock } from "lucide-react";
import { isDosenMenunggu, isDosenDitolak, type SessionUser } from "@/lib/access";

export default function DosenStatusBanner({
  user,
  className = "",
}: {
  user: SessionUser | null | undefined;
  className?: string;
}) {
  const menunggu = isDosenMenunggu(user);
  const ditolak = isDosenDitolak(user);
  if (!menunggu && !ditolak) return null;

  return (
    <div
      role="status"
      className={`rounded-3xl border p-5 flex items-start gap-3 ${
        ditolak ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200"
      } ${className}`}
    >
      {ditolak ? (
        <AlertTriangle size={20} className="text-rose-600 shrink-0 mt-0.5" />
      ) : (
        <Clock size={20} className="text-amber-600 shrink-0 mt-0.5" />
      )}
      <div className="min-w-0">
        <p
          className={`text-[10px] font-black uppercase tracking-widest ${
            ditolak ? "text-rose-700" : "text-amber-700"
          }`}
        >
          {ditolak ? "Pengajuan dosen ditolak" : "Menunggu verifikasi admin"}
        </p>
        <p className="mt-1 text-sm font-bold text-slate-700 leading-relaxed">
          {ditolak
            ? "Akun dosen Anda tidak disetujui, jadi membuat kelas dan tugas tidak tersedia. Hubungi admin bila menurut Anda ini keliru."
            : "Akun dosen Anda sedang diperiksa admin. Semua fitur lain tetap bisa dipakai — membuat kelas dan tugas terbuka begitu disetujui."}
        </p>
      </div>
    </div>
  );
}
