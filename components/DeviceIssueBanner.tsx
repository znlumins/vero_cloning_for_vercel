"use client";
// Banner yang menampilkan masalah DI SISI PERANGKAT pengguna.
//
// Fitur AI VERO berjalan di perangkat pengguna, jadi ketika gagal, penyebabnya
// hampir selalu salah satu dari: izin ditolak, perangkat tidak ada, browser
// tidak mendukung, atau halaman dibuka di alamat non-HTTPS. Semua itu terlihat
// identik ("fiturnya rusak") kalau tidak disebutkan.
//
// Tombol "Salin detail" ada karena pesannya sering perlu diteruskan — ke tim,
// ke dosen, atau ke laporan. Menyalin apa adanya jauh lebih berguna daripada
// screenshot yang harus diketik ulang.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Copy, X } from "lucide-react";
import {
  detectBrowser,
  runDeviceDiagnostics,
  type DeviceIssue,
  type DiagnosticsNeeds,
} from "@/lib/deviceDiagnostics";

interface Props {
  needs: DiagnosticsNeeds;
  /** Nama fitur untuk kalimat pembuka, mis. "Penerjemah Isyarat". */
  fitur: string;
  className?: string;
}

export default function DeviceIssueBanner({ needs, fitur, className = "" }: Props) {
  const [issues, setIssues] = useState<DeviceIssue[]>([]);
  const [ditutup, setDitutup] = useState(false);

  // `needs` biasanya ditulis sebagai objek literal di JSX, jadi identitasnya
  // berubah tiap render. Yang dipakai sebagai dependency adalah BENTUKNYA
  // (hasil JSON), bukan referensinya — tanpa ini efeknya berjalan tanpa henti.
  const needsKey = JSON.stringify(needs);

  useEffect(() => {
    let batal = false;
    const periksa = async () => {
      const hasil = await runDeviceDiagnostics(JSON.parse(needsKey));
      if (batal) return;
      setIssues(hasil);
      const fatal = hasil.filter((i) => i.severity === "fatal");
      if (fatal.length) {
        toast.error(fatal[0].title, { description: fatal[0].fix, duration: 8000 });
      }
    };
    periksa();

    // Menyambung/mencabut webcam saat halaman terbuka harus mengubah hasilnya —
    // kalau tidak, pengguna yang baru menancapkan kamera tetap dituduh tidak
    // punya kamera sampai ia memuat ulang.
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    md?.addEventListener?.("devicechange", periksa);
    window.addEventListener("online", periksa);
    window.addEventListener("offline", periksa);
    return () => {
      batal = true;
      md?.removeEventListener?.("devicechange", periksa);
      window.removeEventListener("online", periksa);
      window.removeEventListener("offline", periksa);
    };
  }, [needsKey]);

  const salin = useCallback(() => {
    const browser = detectBrowser();
    const baris = [
      `VERO — Diagnostik Perangkat (${fitur})`,
      `Waktu    : ${new Date().toISOString()}`,
      `Browser  : ${browser.name}`,
      `Alamat   : ${window.location.origin}`,
      `Core CPU : ${navigator.hardwareConcurrency ?? "?"}`,
      "",
      ...issues.map((i) => `[${i.severity.toUpperCase()}] ${i.title}\n  ${i.detail}\n  Solusi: ${i.fix}`),
    ];
    navigator.clipboard
      ?.writeText(baris.join("\n"))
      .then(() => toast.success("Detail diagnostik disalin"))
      .catch(() => toast.error("Gagal menyalin — browser menolak akses clipboard"));
  }, [issues, fitur]);

  if (!issues.length || ditutup) return null;

  const adaFatal = issues.some((i) => i.severity === "fatal");

  return (
    <div
      role="alert"
      className={`rounded-3xl border p-5 ${
        adaFatal ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          size={20}
          className={`shrink-0 mt-0.5 ${adaFatal ? "text-red-600" : "text-amber-600"}`}
        />
        <div className="flex-1 min-w-0">
          <p
            className={`text-[10px] font-black uppercase tracking-widest ${
              adaFatal ? "text-red-700" : "text-amber-700"
            }`}
          >
            {adaFatal ? "Masalah di perangkat Anda" : "Perhatian pada perangkat Anda"}
          </p>
          <p className="mt-1 text-sm font-bold text-slate-700 leading-relaxed">
            {adaFatal
              ? `${fitur} tidak bisa dijalankan karena hal berikut terjadi di perangkat ini, bukan di server VERO:`
              : `${fitur} tetap bisa dipakai, tapi perangkat ini punya keterbatasan berikut:`}
          </p>

          <ul className="mt-3 space-y-3">
            {issues.map((i) => (
              <li
                key={i.id}
                className="bg-white/70 border border-slate-200 rounded-2xl px-4 py-3"
              >
                <p className="text-sm font-black text-slate-900">{i.title}</p>
                <p className="mt-1 text-xs font-bold text-slate-500 leading-relaxed">{i.detail}</p>
                <p className="mt-2 text-xs font-bold text-indigo-600 leading-relaxed">
                  Solusi: {i.fix}
                </p>
              </li>
            ))}
          </ul>

          <button
            onClick={salin}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white border border-slate-200 text-xs font-black text-slate-600 hover:border-indigo-500 hover:text-indigo-600 transition-all"
          >
            <Copy size={14} /> Salin detail
          </button>
        </div>

        <button
          onClick={() => setDitutup(true)}
          aria-label="Tutup peringatan"
          className="shrink-0 p-1.5 rounded-xl text-slate-400 hover:bg-white hover:text-slate-700 transition-all"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
