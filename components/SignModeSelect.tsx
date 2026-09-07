"use client";
// Pemilih mode isyarat: sistem (BISINDO/SIBI) x tingkat (ABJAD/KATA).
//
// Kombinasi yang belum punya model TIDAK disembunyikan, melainkan ditampilkan
// nonaktif beserta alasannya. Menyembunyikannya membuat pengguna mengira fitur
// itu tidak pernah ada; menampilkannya sebagai "belum tersedia" jujur bahwa ini
// pekerjaan yang belum selesai, bukan batasan permanen.

import {
  SIGN_LEVELS,
  SIGN_SYSTEMS,
  isModeAvailable,
  unavailableReason,
  type SignLevel,
  type SignSystem,
} from "@/lib/signModes";

interface SignModeSelectProps {
  system: SignSystem;
  level: SignLevel;
  onChange: (system: SignSystem, level: SignLevel) => void;
  /** Dikunci saat AI berjalan — ganti mode berarti memuat ulang model. */
  disabled?: boolean;
  /** Tata letak ringkas untuk header meeting (tanpa judul kolom). */
  compact?: boolean;
}

export default function SignModeSelect({
  system,
  level,
  onChange,
  disabled = false,
  compact = false,
}: SignModeSelectProps) {
  const alasan = unavailableReason(system, level);

  const tombol = (aktif: boolean, mati: boolean) =>
    `rounded-xl font-black transition-all ${
      compact
        ? "shrink-0 whitespace-nowrap px-2.5 py-1 text-[10px]"
        : "flex-1 px-3 py-2.5 text-[11px]"
    } ${
      aktif
        ? "bg-slate-900 text-white shadow"
        : "bg-white text-slate-500 hover:text-slate-800"
    } ${mati ? "opacity-40 cursor-not-allowed" : ""}`;

  // Bungkus kelompok tombol. Di mode compact keduanya berdampingan dalam SATU
  // baris: header meeting tingginya terkunci h-14, sedangkan versi bertumpuk
  // (sistem di atas, tingkat di bawah) lebih tinggi dari itu sehingga tombolnya
  // terpotong dan mendorong isi header lain.
  const kelompok = compact
    ? "flex items-center h-8 gap-1 bg-slate-100 p-1 rounded-xl"
    : "flex gap-1.5 bg-slate-100 p-1.5 rounded-2xl";

  return (
    <div
      className={
        compact ? "relative flex items-center gap-1.5" : "space-y-3"
      }
    >
      {!compact && (
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest text-center">
          Bahasa Isyarat
        </p>
      )}

      {/* Sistem isyarat. SIBI dan BISINDO adalah dua bahasa berbeda — tidak
          boleh dicampur, jadi ini pilihan tegas, bukan saklar halus. */}
      <div className={kelompok}>
        {SIGN_SYSTEMS.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(s.id, level)}
            title={s.hint}
            className={tombol(system === s.id, disabled)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Tingkat. Kombinasi tanpa model dimatikan di sini, bukan disembunyikan. */}
      <div className={kelompok}>
        {SIGN_LEVELS.map((l) => {
          const tersedia = isModeAvailable(system, l.id);
          return (
            <button
              key={l.id}
              type="button"
              disabled={disabled || !tersedia}
              onClick={() => onChange(system, l.id)}
              title={unavailableReason(system, l.id) ?? l.label}
              className={tombol(level === l.id, disabled || !tersedia)}
            >
              {l.label}
              {!tersedia && (
                <span
                  className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Alasan kombinasi belum tersedia. Di mode compact dipasang melayang
          (absolute) supaya tidak ikut menambah tinggi header meeting. */}
      {alasan && (
        <p
          className={
            compact
              ? "absolute top-full right-0 mt-2 z-50 w-72 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed shadow-lg"
              : "text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed"
          }
        >
          {alasan}
        </p>
      )}
    </div>
  );
}
