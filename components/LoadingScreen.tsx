// components/LoadingScreen.tsx
import Image from "next/image";
import { Loader2 } from "lucide-react";

export default function LoadingScreen() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-white text-slate-900 antialiased">
      <Image
        src="/vero-logo.svg"
        alt="VeroApp Logo"
        width={120}
        height={120}
        priority
        className="mb-8 animate-pulse"
      />
      <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-4">Memuat VeroApp</h1>
      <p className="text-slate-500 text-lg font-medium flex items-center gap-2">
        <Loader2 size={20} className="animate-spin text-indigo-600" />
        Harap tunggu sebentar...
      </p>
    </div>
  );
}