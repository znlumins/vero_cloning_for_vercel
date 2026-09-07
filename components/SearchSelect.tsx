"use client";
// Isian ketik-dan-pilih: mengetik menyaring daftar, tapi nilai di luar daftar
// tetap diterima apa adanya.
//
// Bukan <select>. Daftar kampus memuat ratusan baris dan daftar prodi puluhan;
// <select> memaksa pengguna menggulir mencari miliknya, dan yang kampusnya tidak
// terdaftar tidak punya jalan sama sekali. Di sini yang diketik LANGSUNG menjadi
// nilainya — saran hanyalah pintasan, bukan pembatas. Lihat alasan lengkapnya di
// lib/universitas.ts.

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

interface Props {
  value: string;
  onChange: (nilai: string) => void;
  options: string[];
  placeholder?: string;
  /** Jumlah saran yang ditampilkan. Menampilkan ratusan sekaligus membuat
   *  daftarnya berat digulir dan justru tidak membantu. */
  maxSaran?: number;
  id?: string;
}

export default function SearchSelect({
  value,
  onChange,
  options,
  placeholder,
  maxSaran = 8,
  id,
}: Props) {
  const [terbuka, setTerbuka] = useState(false);
  const wadahRef = useRef<HTMLDivElement>(null);

  // Klik di luar menutup daftar. Tanpa ini, saran menggantung di atas konten
  // lain dan menghalangi isian berikutnya.
  useEffect(() => {
    if (!terbuka) return;
    const tutup = (e: MouseEvent) => {
      if (wadahRef.current && !wadahRef.current.contains(e.target as Node)) {
        setTerbuka(false);
      }
    };
    document.addEventListener("mousedown", tutup);
    return () => document.removeEventListener("mousedown", tutup);
  }, [terbuka]);

  const kunci = value.trim().toLowerCase();
  const saran = options
    .filter((o) => (kunci ? o.toLowerCase().includes(kunci) : true))
    .slice(0, maxSaran);

  // Nilai yang sudah persis sama dengan salah satu saran tidak perlu ditawarkan
  // lagi — daftar yang cuma berisi apa yang sudah diketik hanya menghalangi.
  const persisSama = options.some((o) => o.toLowerCase() === kunci);

  return (
    <div ref={wadahRef} className="relative">
      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setTerbuka(true);
          }}
          onFocus={() => setTerbuka(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setTerbuka(false);
          }}
          autoComplete="off"
          /* Kontras placeholder dinaikkan ke slate-500 dan diberi latar
             slate-50. Placeholder bawaan browser jatuh di sekitar slate-400 di
             atas putih — sekitar 2.5:1, di bawah ambang WCAG 4.5:1 — dan di
             halaman yang justru dipakai Teman Tuli sebagai gerbang pertama,
             isian yang nyaris tak terbaca membuat orang mengira kolomnya mati. */
          className="w-full p-4 pr-11 bg-slate-50 border-2 border-slate-300 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 font-bold text-sm text-slate-900 placeholder:text-slate-500 placeholder:font-semibold transition-all"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Tampilkan pilihan"
          onClick={() => setTerbuka((t) => !t)}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <ChevronDown
            size={18}
            className={`transition-transform ${terbuka ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {terbuka && saran.length > 0 && !(persisSama && saran.length === 1) && (
        <ul className="absolute z-30 mt-2 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl py-1">
          {saran.map((o) => (
            <li key={o}>
              <button
                type="button"
                onClick={() => {
                  onChange(o);
                  setTerbuka(false);
                }}
                className="w-full text-left px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center justify-between gap-2"
              >
                <span className="truncate">{o}</span>
                {o.toLowerCase() === kunci && (
                  <Check size={14} className="text-indigo-600 shrink-0" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Ditampilkan hanya saat pengguna benar-benar mengetik sesuatu di luar
          daftar — supaya ia yakin isiannya diterima, bukan mengira salah. */}
      {terbuka && value.trim() && saran.length === 0 && (
        <div className="absolute z-30 mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-xl px-4 py-3">
          <p className="text-xs font-bold text-slate-600 leading-relaxed">
            Tidak ada di daftar — tidak masalah, yang Anda ketik akan tersimpan
            apa adanya.
          </p>
        </div>
      )}
    </div>
  );
}
