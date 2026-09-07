"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Konfirmasi password tidak cocok!");
      return;
    }
    if (password.length < 6) {
      toast.error("Password minimal 6 karakter!");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        toast.error(data.error || "Gagal mereset kata sandi.");
      } else {
        toast.success("Kata sandi berhasil diperbarui. Silakan login.");
        setTimeout(() => router.push("/login"), 1500);
      }
    } catch (err) {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-black text-slate-900 mb-2">Token Tidak Valid</h2>
        <p className="text-slate-500 mb-6">Tautan reset password ini tidak memiliki token yang sah.</p>
        <Link href="/forgot-password" className="text-indigo-600 font-bold hover:underline">Minta Tautan Baru</Link>
      </div>
    );
  }

  return (
    <div className="p-8 sm:p-12 relative z-10">
      <h2 className="text-3xl font-black text-slate-900 mb-2">Buat Password Baru</h2>
      <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
        Silakan masukkan kata sandi baru Anda di bawah ini.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Kata Sandi Baru</label>
          <input 
            type="password" 
            placeholder="Minimal 6 karakter"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600 outline-none transition-all text-sm font-medium text-slate-700 bg-slate-50/50 focus:bg-white" 
            required 
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Konfirmasi Kata Sandi</label>
          <input 
            type="password" 
            placeholder="Ketik ulang kata sandi baru"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600 outline-none transition-all text-sm font-medium text-slate-700 bg-slate-50/50 focus:bg-white" 
            required 
          />
        </div>
        
        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-300 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
        >
          {loading ? "Menyimpan..." : "Simpan Password Baru"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 font-sans p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-indigo-100/50 relative overflow-hidden">
        {/* Dekorasi */}
        <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -ml-10 -mt-10 opacity-60"></div>
        
        <Suspense fallback={<div className="p-12 text-center text-slate-500 font-bold animate-pulse">Memuat...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
