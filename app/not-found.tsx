// app/not-found.tsx
import Link from 'next/link';
import Image from 'next/image';
import { Home } from 'lucide-react'; // Hanya import Home, Hourglass dihapus

export default function ComingSoonPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-slate-900 antialiased text-center">
      
      {/* Logo Anda */}
      <Image
        src="/vero-logo.svg" // Pastikan path logo Anda benar
        alt="VeroApp Logo"
        width={100}
        height={100}
        className="mb-8"
      />

      {/* Konten Tanpa Kotak Kontainer & Tanpa Icon */}
      <div className="max-w-lg w-full"> 
        {/* Icon Hourglass dihapus dari sini */}
        <h1 className="text-5xl font-black text-slate-900 mb-4 tracking-tight leading-tight">
          Fitur Segera Hadir!
        </h1>
        <p className="text-lg text-slate-600 font-medium mb-10 leading-relaxed">
          Terima kasih atas minat Anda. Fitur ini sedang dalam pengembangan 
          dan akan segera tersedia untuk Anda nikmati di VeroApp.
        </p>
        <Link href="/dashboard" 
          className="inline-flex items-center gap-3 px-10 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-200"
        >
          <Home size={20} /> Kembali ke Dashboard
        </Link>
      </div>

      <footer className="mt-20 text-slate-400 text-sm font-medium">
        © {new Date().getFullYear()} VeroApp. All rights reserved.
      </footer>
    </div>
  );
}