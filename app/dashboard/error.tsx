"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard Error:", error);
    toast.error("Terjadi kesalahan pada dashboard!");
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="w-20 h-20 bg-rose-50 text-rose-600 flex items-center justify-center rounded-3xl mb-6 shadow-sm border border-rose-100">
        <AlertCircle size={40} strokeWidth={2} />
      </div>
      <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase mb-3">
        Oops! Sesuatu Berjalan Salah
      </h2>
      <p className="text-slate-500 font-medium max-w-md mx-auto mb-8">
        Maaf, kami kesulitan memuat data halaman ini. Ini mungkin masalah koneksi atau error sementara.
      </p>
      <div className="flex items-center gap-4">
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 bg-slate-900 hover:bg-indigo-600 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95"
        >
          <RefreshCw size={16} /> Coba Lagi
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95"
        >
          <Home size={16} /> Ke Beranda Utama
        </Link>
      </div>
    </div>
  );
}
