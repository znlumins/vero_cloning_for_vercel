"use client";
import { useState } from "react";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { signIn } from "next-auth/react";
import { ShieldCheck } from "lucide-react";

export default function Register() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "MAHASISWA",
    // Kosong = belum dipilih. Sengaja tidak diberi nilai awal: menebakkan salah
    // satu berarti sebagian pengguna mendaftar dengan status yang tidak pernah
    // benar-benar mereka pilih, dan justru data inilah yang jadi bukti bahwa
    // VERO dipakai bersama oleh Teman Tuli dan Teman Dengar.
    hearing_status: "",
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 6) return toast.error("Password minimal 6 karakter!");
    if (!form.hearing_status) return toast.error("Pilih dulu: Teman Tuli atau Teman Dengar.");
    setLoading(true);

    const { error } = await db.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.name,
          role: form.role,
          hearing_status: form.hearing_status,
        },
      },
    });

    if (error) {
      toast.error(error.message);
    } else {
      // Profil sudah dibuat server-side di dalam transaksi signUp (/api/auth),
      // jadi tidak ada insert profil dari sini. Selain redundan, insert itu kini
      // mustahil: pengguna belum login sehingga belum punya token — dan endpoint
      // /api/db sekarang menolak request tanpa autentikasi.
      if (form.role === "DOSEN") {
        toast.success("Registrasi berhasil — menunggu verifikasi admin.", {
          description:
            "Anda sudah bisa masuk. Membuat kelas & tugas terbuka setelah admin menyetujui akun dosen Anda.",
          duration: 9000,
        });
      } else {
        toast.success("Registrasi Berhasil!");
      }
      router.push("/login");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-700 bg-white">
      {/* Left Form Side.
          Formulir ini JAUH lebih tinggi daripada /login — pemilih peran, pemilih
          status pendengaran, tiga isian, tombol Google. Dulu tinggi itu dipaksa
          masuk ke `min-h-screen justify-center` dengan tombol Kembali dan baris
          hak cipta dipasang `absolute`. Dua akibatnya nyata: isi yang melebihi
          layar terpotong di ATAS dan tidak bisa digulir (perilaku baku flex
          justify-center), lalu baris hak cipta melayang menimpa tombol Google.
          Sekarang semuanya kolom biasa yang mengalir: memusat kalau muat,
          menggulir kalau tidak. */}
      <div className="w-full md:w-1/2 flex-1 md:min-h-screen flex flex-col px-6 sm:px-10 lg:px-16 xl:px-24 py-8">
        {/* Back Button */}
        <Link href="/" className="self-start flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          Kembali
        </Link>

        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full py-10">
          <h2 className="text-3xl font-black mb-2 text-slate-900">Buat Akun Baru</h2>
          <p className="text-slate-500 text-sm font-medium mb-8">Masukkan data diri Anda untuk memulai di Vero.</p>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Role Selection */}
            <div className="flex gap-3 mb-3">
              {["MAHASISWA", "DOSEN"].map((r) => (
                <button
                  key={r} type="button"
                  onClick={() => setForm({ ...form, role: r })}
                  className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-all border-2 ${form.role === r ? "bg-indigo-50 border-indigo-600 text-indigo-700" : "border-slate-100 text-slate-500 hover:border-slate-200"}`}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Pemberitahuan verifikasi dosen. Muncul SEBELUM mendaftar, bukan
                setelah: orang yang mengira akunnya langsung aktif lalu menemukan
                fiturnya terkunci akan mengira aplikasinya rusak. */}
            {form.role === "DOSEN" && (
              <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50 border border-amber-200 mb-3">
                <ShieldCheck size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
                  Akun dosen diverifikasi admin lebih dulu. Anda tetap bisa masuk
                  setelah mendaftar, tapi membuat kelas dan tugas baru terbuka
                  setelah disetujui.
                </p>
              </div>
            )}

            {/* Status pendengaran — WAJIB, dan inilah data yang menjadikan VERO
                bisa dibuktikan dipakai bersama oleh Teman Tuli & Teman Dengar. */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Saya adalah <span className="text-indigo-600">*</span>
              </label>
              {/* Sengaja TANPA keterangan tambahan. Menjelaskan Teman Tuli
                  sebagai "sulit mendengar" membingkainya sebagai kekurangan —
                  bingkai yang justru tidak dipakai komunitas Tuli sendiri.
                  Istilahnya sudah dikenal; menerangkannya malah merendahkan. */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: "TEMAN_TULI", label: "Teman Tuli" },
                  { id: "TEMAN_DENGAR", label: "Teman Dengar" },
                ].map((opsi) => (
                  <button
                    key={opsi.id}
                    type="button"
                    onClick={() => setForm({ ...form, hearing_status: opsi.id })}
                    className={`py-3.5 px-3 rounded-2xl transition-all border-2 text-center ${
                      form.hearing_status === opsi.id
                        ? "bg-indigo-50 border-indigo-600"
                        : "border-slate-100 hover:border-slate-200"
                    }`}
                  >
                    <span
                      className={`block text-xs font-black ${
                        form.hearing_status === opsi.id ? "text-indigo-700" : "text-slate-600"
                      }`}
                    >
                      {opsi.label}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] font-bold text-slate-400 leading-relaxed">
                Dipakai untuk menyesuaikan tampilan dan mencatat bahwa VERO
                digunakan bersama. Bisa diubah kapan saja di Pengaturan.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap</label>
              <input
                type="text"
                placeholder="Masukkan nama lengkap"
                value={form.name}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition-all text-sm font-medium"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                placeholder="Masukkan email Anda"
                value={form.email}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition-all text-sm font-medium"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                placeholder="Buat password"
                value={form.password}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition-all text-sm font-medium"
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white font-black py-3 rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-300 transition-all disabled:opacity-50 mt-6"
              disabled={loading}
            >
              {loading ? "Memproses..." : "Register Now"}
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
            Already have an account? <Link href="/login" className="text-indigo-600 hover:underline">Sign in</Link>
          </div>
        </div>

        <div className="shrink-0 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          © 2026 VERO ECOSYSTEM
        </div>
      </div>

      {/* Right Decorative Side — SENGAJA identik dengan /login.
          Sebelumnya halaman ini memakai foto login-bg.png sementara /login
          memakai logo + copywriting, sehingga pindah login->register terasa
          seperti berpindah produk. Kalau sisi ini diubah, ubah di KEDUA
          halaman sekaligus. */}
      {/* sticky + h-screen: kolom formulir kini boleh lebih tinggi dari layar,
          dan tanpa ini sisi dekoratif ikut memanjang sehingga logonya terpusat
          di tengah kolom raksasa — artinya di luar layar saat halaman dibuka. */}
      <div className="hidden md:flex w-1/2 sticky top-0 h-screen overflow-hidden items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-indigo-100">
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