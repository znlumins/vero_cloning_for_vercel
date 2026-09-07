"use client";
import { useState } from "react";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { signIn } from "next-auth/react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await db.auth.signInWithPassword({ email, password });
    
    if (error) {
      toast.error("Email atau Password Salah!");
    } else {
      toast.success("Berhasil masuk!");
      router.push("/dashboard");
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-700 bg-white">
      {/* Left Form Side */}
      <div className="w-full md:w-1/2 min-h-screen flex flex-col justify-center px-8 sm:px-16 lg:px-24 xl:px-32 relative">
          {/* Back Button */}
          <Link href="/" className="absolute top-8 left-8 sm:left-12 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Kembali
          </Link>

          <div className="max-w-sm mx-auto w-full relative z-10">
            <h2 className="text-3xl font-black mb-2 text-slate-900">Selamat Datang</h2>
            <p className="text-slate-500 text-sm font-medium mb-8">Masukkan kredensial Anda untuk mengakses akun.</p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <input 
                  type="email" 
                  placeholder="Masukkan email Anda"
                  value={email}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition-all text-sm font-medium" 
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                <input 
                  type="password" 
                  placeholder="Masukkan password Anda"
                  value={password}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition-all text-sm font-medium" 
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                />
              </div>

              <div className="flex items-center justify-between text-xs py-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-600 border-slate-300 cursor-pointer" />
                  <span className="text-slate-500 font-bold group-hover:text-slate-900 transition-colors">Remember me</span>
                </label>
                <Link href="/forgot-password" className="text-indigo-600 font-bold hover:underline">Forgot password?</Link>
              </div>
              
              <button 
                type="submit" 
                className="w-full bg-indigo-600 text-white font-black py-3 rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-300 transition-all disabled:opacity-50 mt-4"
                disabled={loading}
              >
                {loading ? "Memproses..." : "Sign in"}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center space-x-4">
              <div className="flex-1 border-t border-slate-200"></div>
              <span className="text-xs text-slate-400 font-bold uppercase">Or continue with</span>
              <div className="flex-1 border-t border-slate-200"></div>
            </div>

            <button 
              onClick={() => {
                setLoading(true);
                signIn("google", { callbackUrl: "/auth/sync" });
              }}
              type="button" 
              className="mt-6 w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-700 font-black py-3 rounded-xl shadow-sm hover:bg-slate-50 transition-all disabled:opacity-50"
              disabled={loading}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
            
            <div className="mt-8 text-center text-xs font-bold text-slate-500">
              Don&apos;t have an account? <Link href="/register" className="text-indigo-600 hover:underline">Register</Link>
            </div>
          </div>
          
          <div className="absolute bottom-8 left-0 right-0 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            © 2026 VERO ECOSYSTEM
          </div>
        </div>

        {/* Right Decorative Side — logo VERO besar di tengah */}
        <div className="hidden md:flex w-1/2 relative overflow-hidden items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-indigo-100">
          {/* Blob dekoratif lembut agar tidak polos */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-200/50 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-violet-200/50 rounded-full blur-3xl" />

          <div className="relative z-10 flex flex-col items-center px-12 text-center">
            <Image
              src="/vero-logo.svg"
              alt="VERO"
              width={560}
              height={245}
              priority
              className="w-[70%] max-w-md h-auto drop-shadow-sm"
            />
            <p className="mt-8 text-sm font-bold text-slate-500 max-w-sm leading-relaxed">
              Platform pembelajaran inklusif bertenaga AI — penerjemah bahasa
              isyarat, speech-to-text, dan kolaborasi untuk semua.
            </p>
          </div>
        </div>

    </div>
  );
}