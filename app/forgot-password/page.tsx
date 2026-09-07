"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        toast.error(data.error || "Gagal mengirim tautan reset.");
      } else {
        toast.success("Tautan reset kata sandi telah dikirim ke email Anda.");
        // Untuk MOCK TESTING karena belum ada SMTP, buka langsung URL-nya
        if (data.mockResetUrl) {
          toast.info("MOCK MODE: Mengarahkan ke link reset otomatis (cek URL)");
          setTimeout(() => router.push(data.mockResetUrl.replace(window.location.origin, "")), 2000);
        }
      }
    } catch (err) {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 font-sans p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-indigo-100/50 p-8 sm:p-12 relative overflow-hidden">
        {/* Dekorasi kecil */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-10 -mt-10 opacity-60"></div>
        
        <Link href="/login" className="inline-flex items-center text-sm font-bold text-slate-400 hover:text-indigo-600 transition-colors mb-8 relative z-10">
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Kembali ke Login
        </Link>

        <div className="relative z-10">
          <h2 className="text-3xl font-black text-slate-900 mb-2">Lupa Password?</h2>
          <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
            Jangan khawatir, ini bisa terjadi. Masukkan alamat email yang terhubung dengan akun Anda.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Alamat Email</label>
              <input 
                type="email" 
                placeholder="misal: budi@univ.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600 outline-none transition-all text-sm font-medium text-slate-700 bg-slate-50/50 focus:bg-white" 
                required 
              />
            </div>
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-300 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Mengirim...
                </>
              ) : "Kirim Tautan Reset"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
