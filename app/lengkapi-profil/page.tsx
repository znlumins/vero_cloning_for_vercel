"use client";
// Halaman "lengkapi profil" — pintu wajib sebelum masuk dashboard.
//
// KENAPA ADA
// ----------
// Mendaftar lewat Google tidak pernah menanyakan apa pun: NextAuth langsung
// membuat akun dari data Google dan melempar pengguna ke dashboard. Akibatnya
// akun Google tidak punya status Teman Tuli/Dengar sama sekali, dan role-nya
// dipatok MAHASISWA tanpa pernah ditanyakan — dosen yang masuk lewat Google
// terjebak sebagai mahasiswa tanpa jalan keluar.
//
// Halaman ini menutup keduanya. Yang dipakai sebagai penanda "belum lengkap"
// hanyalah hearing_status yang NULL (lihat lib/access.ts).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Ear, GraduationCap, ShieldCheck, Loader2, School, BookOpen } from "lucide-react";
import { db } from "@/lib/db";
import LoadingScreen from "@/components/LoadingScreen";
import SearchSelect from "@/components/SearchSelect";
import { UNIVERSITAS, PROGRAM_STUDI } from "@/lib/universitas";
import { profilBelumLengkap, roleOf, LABEL_HEARING, type SessionUser } from "@/lib/access";

export default function LengkapiProfilPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);

  const [role, setRole] = useState<"MAHASISWA" | "DOSEN">("MAHASISWA");
  const [hearing, setHearing] = useState<"TEMAN_TULI" | "TEMAN_DENGAR" | "">("");
  const [kampus, setKampus] = useState("");
  const [prodi, setProdi] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await db.auth.getUser();
      if (!u) {
        router.replace("/login");
        return;
      }
      // Sudah lengkap => tidak ada yang perlu dikerjakan di sini. Tanpa penjaga
      // ini, halaman tetap bisa dibuka manual dan pengguna bisa menimpa
      // rolenya sendiri lewat URL.
      if (!profilBelumLengkap(u)) {
        router.replace("/dashboard");
        return;
      }
      setUser(u);
      const r = roleOf(u);
      if (r === "DOSEN") setRole("DOSEN");
      setMemuat(false);
    })();
  }, [router]);

  const simpan = async () => {
    if (!hearing) {
      toast.error("Pilih dulu: Teman Tuli atau Teman Dengar.");
      return;
    }
    if (!kampus.trim()) {
      toast.error("Isi dulu asal kampus Anda.");
      return;
    }
    setMenyimpan(true);
    try {
      const sesiStr = localStorage.getItem("db_mock_session");
      const token = sesiStr ? JSON.parse(sesiStr)?.access_token : null;

      const res = await fetch("/api/profile/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role,
          hearing_status: hearing,
          university: kampus,
          study_program: prodi,
        }),
      });
      const hasil = await res.json();
      if (!res.ok || hasil.error) {
        throw new Error(hasil?.error?.message || "Gagal menyimpan profil.");
      }

      // Metadata sesi di browser HARUS ikut diperbarui. Kalau tidak, penjaga
      // profil membaca hearing_status yang masih null dan melempar pengguna
      // kembali ke halaman ini — berputar tanpa henti.
      await db.auth.updateUser({ data: hasil.data });

      if (hasil.data.role === "DOSEN") {
        toast.success("Profil tersimpan — akun dosen menunggu verifikasi admin.", {
          description: "Anda bisa memakai VERO sekarang; membuat kelas & tugas terbuka setelah disetujui.",
          duration: 9000,
        });
      } else {
        toast.success("Profil lengkap. Selamat datang di VERO!");
      }
      router.replace("/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan profil.");
      setMenyimpan(false);
    }
  };

  if (memuat || !user) return <LoadingScreen />;

  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <Image
          src="/vero-logo.svg"
          alt="VERO"
          width={200}
          height={88}
          priority
          className="w-32 h-auto mx-auto mb-8"
        />

        <div className="bg-indigo-50 border border-indigo-200 rounded-3xl p-5 mb-8 flex items-start gap-3">
          <ShieldCheck size={20} className="text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
              Satu langkah lagi
            </p>
            <p className="mt-1 text-sm font-bold text-slate-700 leading-relaxed">
              Profil Anda belum lengkap. Lengkapi dulu sebelum masuk ke VERO —
              data ini menentukan tampilan yang Anda terima dan hak akses akun.
            </p>
          </div>
        </div>

        <h1 className="text-2xl font-black text-slate-900 mb-1">
          Halo, {user.user_metadata?.full_name || "Teman VERO"}
        </h1>
        <p className="text-sm font-bold text-slate-500 mb-8">
          Dua pertanyaan singkat, lalu Anda siap memakai VERO.
        </p>

        {/* 1. Status pendengaran */}
        <p className="text-xs font-black text-slate-700 mb-2 flex items-center gap-2">
          <Ear size={14} className="text-indigo-600" /> Saya adalah
          <span className="text-indigo-600">*</span>
        </p>
        {/* Tanpa keterangan tambahan — lihat catatan yang sama di
            app/register/page.tsx. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {(["TEMAN_TULI", "TEMAN_DENGAR"] as const).map((opsi) => (
            <button
              key={opsi}
              type="button"
              onClick={() => setHearing(opsi)}
              className={`p-4 rounded-2xl border-2 text-center transition-all ${
                hearing === opsi
                  ? "bg-indigo-50 border-indigo-600"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span
                className={`block text-sm font-black ${
                  hearing === opsi ? "text-indigo-700" : "text-slate-700"
                }`}
              >
                {LABEL_HEARING[opsi]}
              </span>
            </button>
          ))}
        </div>

        {/* 2. Asal kampus & prodi. Ketikan bebas — daftar hanya membantu
             mengetik. Lihat lib/universitas.ts untuk alasannya. */}
        <p className="text-xs font-black text-slate-700 mb-2 flex items-center gap-2">
          <School size={14} className="text-indigo-600" /> Asal kampus
          <span className="text-indigo-600">*</span>
        </p>
        <SearchSelect
          value={kampus}
          onChange={setKampus}
          options={UNIVERSITAS}
          placeholder="Ketik nama kampus, mis. Universitas Brawijaya"
        />

        <p className="text-xs font-black text-slate-700 mb-2 mt-5 flex items-center gap-2">
          <BookOpen size={14} className="text-indigo-600" /> Program studi
        </p>
        <SearchSelect
          value={prodi}
          onChange={setProdi}
          options={PROGRAM_STUDI}
          placeholder="Ketik program studi, mis. Teknik Informatika"
        />

        {/* 3. Peran */}
        <p className="text-xs font-black text-slate-700 mb-2 mt-8 flex items-center gap-2">
          <GraduationCap size={14} className="text-indigo-600" /> Saya bergabung sebagai
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {[
            { id: "MAHASISWA" as const, label: "Mahasiswa", desc: "Mengikuti kelas & tugas" },
            { id: "DOSEN" as const, label: "Dosen", desc: "Mengajar & menilai" },
          ].map((opsi) => (
            <button
              key={opsi.id}
              type="button"
              onClick={() => setRole(opsi.id)}
              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                role === opsi.id
                  ? "bg-indigo-50 border-indigo-600"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span
                className={`block text-sm font-black ${
                  role === opsi.id ? "text-indigo-700" : "text-slate-700"
                }`}
              >
                {opsi.label}
              </span>
              <span className="block text-[11px] font-bold text-slate-400 mt-1">{opsi.desc}</span>
            </button>
          ))}
        </div>

        {role === "DOSEN" && (
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50 border border-amber-200 mb-4">
            <ShieldCheck size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
              Akun dosen diverifikasi admin lebih dulu. Anda tetap bisa memakai
              VERO, tapi membuat kelas dan tugas baru terbuka setelah disetujui.
            </p>
          </div>
        )}

        <p className="text-[10px] font-bold text-slate-400 leading-relaxed mb-6">
          Peran hanya bisa dipilih sekali di sini. Setelah tersimpan, perubahan
          peran dilakukan oleh admin. Status Teman Tuli/Dengar tetap bisa Anda
          ubah kapan saja lewat Pengaturan.
        </p>

        <button
          onClick={simpan}
          disabled={menyimpan}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black py-3.5 rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50"
        >
          {menyimpan ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Menyimpan...
            </>
          ) : (
            "Simpan & Masuk ke VERO"
          )}
        </button>
      </div>
    </div>
  );
}
