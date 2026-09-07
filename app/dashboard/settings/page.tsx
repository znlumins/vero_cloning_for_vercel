"use client";
import { useEffect, useState, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import { User, Shield, Key, Bell, CreditCard, ChevronRight, Loader2, Camera, Trash2, KeyRound, Palette } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import ThemeToggle from "@/components/ThemeToggle";
import { toast } from "sonner";
import Image from "next/image";
import SearchSelect from "@/components/SearchSelect";
import { UNIVERSITAS, PROGRAM_STUDI } from "@/lib/universitas";
import {
  hearingStatusOf,
  dosenStatusOf,
  roleOf,
  LABEL_HEARING,
  LABEL_ROLE,
  LABEL_DOSEN_STATUS,
  type HearingStatus,
} from "@/lib/access";

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State untuk Upload Foto
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // State untuk Profil
  const [profileForm, setProfileForm] = useState({ full_name: "", email: "", nim: "", bio: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  // Terpisah dari profileForm karena penyimpanannya lewat endpoint sendiri —
  // lihat alasannya di handleSaveProfile.
  const [hearing, setHearing] = useState<HearingStatus | null>(null);
  const [kampus, setKampus] = useState("");
  const [prodi, setProdi] = useState("");

  // State untuk Ubah Password
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      setLoading(true);
      const { data: { user } } = await db.auth.getUser();
      if (!user) router.push("/login"); 
      else {
        setUser(user);
        setAvatarUrl(user.user_metadata?.avatar_url || null);
        setProfileForm({
          full_name: user.user_metadata?.full_name || "",
          email: user.email || "",
          nim: user.user_metadata?.nim || "",
          bio: user.user_metadata?.bio || ""
        });
        setHearing(hearingStatusOf(user));
        setKampus(user.user_metadata?.university || "");
        setProdi(user.user_metadata?.study_program || "");
      }
      setLoading(false);
    };
    getUser();
  }, [router]);

  // --- FUNGSI UPLOAD FOTO ---
  const handleUploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) return;

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      // 1. Upload ke local storage (db.storage)
      const { error: uploadError } = await db.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Ambil Public URL
      const { data: { publicUrl } } = db.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // 3. Update User Metadata
      const { error: updateError } = await db.auth.updateUser({
        data: { avatar_url: publicUrl }
      });

      if (updateError) throw updateError;

      // 4. Update Database Profile Table
      const { error: dbError } = await db
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (dbError) throw dbError;

      // 5. Dispatch Event to notify Sidebar / header to update immediately
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("avatar-updated"));
      }

      setAvatarUrl(publicUrl);
      toast.success("Foto profil berhasil diperbarui!");
    } catch (error: any) {
      toast.error("Gagal upload: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  // --- FUNGSI SIMPAN PROFIL ---
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    
    const { error: metaError } = await db.auth.updateUser({
      data: { 
        full_name: profileForm.full_name,
        nim: profileForm.nim,
        bio: profileForm.bio
      }
    });

    if (metaError) {
      toast.error(metaError.message);
      setProfileSaving(false);
      return;
    }

    if (profileForm.email !== user.email) {
      const { error: emailError } = await db.auth.updateUser({ email: profileForm.email });
      if (emailError) toast.error("Gagal update email: " + emailError.message);
      else toast.success("Silakan cek email baru Anda untuk konfirmasi.");
    }

    await db.from('profiles').update({ name: profileForm.full_name }).eq('id', user.id);

    // Status pendengaran, kampus, dan prodi lewat endpoint terpisah — bukan
    // /api/db. Yang generik meneruskan kolom apa pun dari klien, jadi memakainya
    // di sini berarti jalur "sunting profil" ikut membawa kemampuan menimpa
    // `role`. Lihat app/api/profile/update/route.ts.
    try {
      const sesiStr = localStorage.getItem("db_mock_session");
      const token = sesiStr ? JSON.parse(sesiStr)?.access_token : null;
      const muatan: Record<string, unknown> = {
        university: kampus,
        study_program: prodi,
        // Bio ikut ke database. Sebelumnya ia hanya tersimpan di user_metadata
        // (localStorage), jadi tidak pernah bisa dibaca orang lain — padahal
        // dibaca orang lain itulah satu-satunya guna sebuah bio.
        bio: profileForm.bio,
      };
      if (hearing) muatan.hearing_status = hearing;

      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(muatan),
      });
      const hasil = await res.json();
      if (!res.ok || hasil.error) throw new Error(hasil?.error?.message || "Gagal menyimpan profil.");
      await db.auth.updateUser({ data: hasil.data });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan asal kampus & status.");
    }

    if (typeof window !== "undefined") window.dispatchEvent(new Event("avatar-updated"));
    toast.success("Informasi profil berhasil diperbarui!");
    setProfileSaving(false);
  };

  // --- FUNGSI UBAH PASSWORD ---
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) return toast.error("Password tidak cocok");
    
    setPasswordChangeLoading(true);

    const { error: signInError } = await db.auth.signInWithPassword({
      email: user.email,
      password: oldPassword,
    });

    if (signInError) {
      toast.error("Password lama salah!");
      setPasswordChangeLoading(false);
      return;
    }

    const { error } = await db.auth.updateUser({ password: newPassword });

    if (error) toast.error(error.message);
    else {
      toast.success("Password berhasil diubah!");
      setOldPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    }
    setPasswordChangeLoading(false);
  };

  if (loading) return <LoadingScreen />;
  if (!user) return <LoadingScreen />;

  return (
    <div className="flex min-h-screen bg-white text-slate-900 antialiased overflow-hidden font-sans">
      <Sidebar role={user.user_metadata.role} userName={user.user_metadata.full_name} />

      <main className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden pb-20 lg:pb-0">

        {/* Sidebar kanan (kalender + timeline) DIBUANG dari halaman ini: isinya
            tidak berhubungan sama sekali dengan mengatur akun, dan ia memakan
            320px yang justru dibutuhkan formulir profil. Tanpa aside itu, <main>
            yang flex-1 otomatis memenuhi sisa lebar layar. Gulir tetap satu:
            <main> mengunci tinggi & menahan overflow, wadah di bawah ini yang
            menggulir. */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-24 lg:pb-10 space-y-10">
          <h1 className="pl-12 lg:pl-0 text-3xl font-black text-slate-900 uppercase tracking-tight">Pengaturan Akun</h1>

          <div className="flex flex-col md:flex-row gap-8">
            <nav className="flex-none w-full md:w-64 space-y-2">
              <button onClick={() => setActiveTab("profile")} className={`w-full flex items-center gap-3 px-5 py-3 rounded-2xl font-bold transition-all ${activeTab === "profile" ? "bg-slate-900 text-white shadow-xl" : "text-slate-500 hover:bg-slate-50"}`}>
                <User size={18} /> Profil
              </button>
              <button onClick={() => setActiveTab("security")} className={`w-full flex items-center gap-3 px-5 py-3 rounded-2xl font-bold transition-all ${activeTab === "security" ? "bg-slate-900 text-white shadow-xl" : "text-slate-500 hover:bg-slate-50"}`}>
                <Shield size={18} /> Keamanan
              </button>
              <button onClick={() => setActiveTab("notifications")} className={`w-full flex items-center gap-3 px-5 py-3 rounded-2xl font-bold transition-all ${activeTab === "notifications" ? "bg-slate-900 text-white shadow-xl" : "text-slate-500 hover:bg-slate-50"}`}>
                <Bell size={18} /> Notifikasi
              </button>
              <button onClick={() => setActiveTab("appearance")} className={`w-full flex items-center gap-3 px-5 py-3 rounded-2xl font-bold transition-all ${activeTab === "appearance" ? "bg-slate-900 text-white shadow-xl" : "text-slate-500 hover:bg-slate-50"}`}>
                <Palette size={18} /> Tampilan
              </button>
            </nav>

            {/* Tab Content */}
            <div className="flex-1 bg-slate-50/50 border border-slate-100 rounded-[2.5rem] p-10 shadow-inner">
              
              {activeTab === "profile" && (
                <form onSubmit={handleSaveProfile} className="space-y-10">
                  <h2 className="text-xl font-black uppercase text-indigo-600 border-b border-indigo-100 pb-4">Informasi Profil</h2>
                  
                  <div className="flex flex-col md:flex-row items-start gap-12">
                    {/* Preview Foto */}
                    <div className="relative group shrink-0 flex flex-col items-center">
                      <div className="w-40 h-40 rounded-full border-4 border-white shadow-2xl overflow-hidden bg-slate-200 flex items-center justify-center relative">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" onError={() => setAvatarUrl(null)} />
                        ) : (
                          <User size={64} className="text-slate-400" />
                        )}
                        {uploading && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="animate-spin text-white" />
                          </div>
                        )}
                      </div>
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute top-28 right-0 bg-indigo-600 text-white p-3 rounded-full shadow-xl hover:scale-110 transition-transform border-4 border-white"
                      >
                        <Camera size={20} />
                      </button>
                      <input type="file" ref={fileInputRef} onChange={handleUploadPhoto} accept="image/*" className="hidden" />
                      
                      <div className="mt-8 text-center w-full space-y-2">
                         <span className="inline-block px-5 py-2 bg-indigo-100 text-indigo-600 rounded-xl text-xs font-black uppercase tracking-widest">{LABEL_ROLE[roleOf(user)]}</span>
                         {/* Status verifikasi dosen ditampilkan di sini, bukan
                             disembunyikan: dosen yang fiturnya terkunci harus
                             tahu alasannya tanpa harus bertanya. */}
                         {dosenStatusOf(user) && roleOf(user) === "DOSEN" && (
                           <span className={`block mx-auto w-max px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                             dosenStatusOf(user) === "APPROVED" ? "bg-emerald-50 text-emerald-600"
                             : dosenStatusOf(user) === "REJECTED" ? "bg-rose-50 text-rose-600"
                             : "bg-amber-50 text-amber-600"
                           }`}>
                             {LABEL_DOSEN_STATUS[dosenStatusOf(user)!]}
                           </span>
                         )}
                      </div>
                    </div>

                    <div className="space-y-6 flex-1 w-full">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nama Lengkap</label>
                          <input type="text" value={profileForm.full_name} onChange={e => setProfileForm({...profileForm, full_name: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 font-bold" required />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">NIM / NIP</label>
                          <input type="text" value={profileForm.nim} onChange={e => setProfileForm({...profileForm, nim: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 font-bold" placeholder={user.user_metadata.role === 'DOSEN' ? "Nomor Induk Pegawai" : "Nomor Induk Mahasiswa"} />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Alamat Email</label>
                        <input type="email" value={profileForm.email} onChange={e => setProfileForm({...profileForm, email: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 font-bold" required />
                      </div>

                      {/* Status pendengaran. Bisa diubah kapan saja — sebagian
                          orang baru nyaman menyatakannya setelah memakai VERO
                          beberapa waktu, dan mengunci pilihan pertama akan
                          membuat datanya justru kurang jujur. */}
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Saya adalah</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {(["TEMAN_TULI", "TEMAN_DENGAR"] as const).map((opsi) => (
                            <button
                              key={opsi}
                              type="button"
                              onClick={() => setHearing(opsi)}
                              className={`p-4 rounded-2xl border-2 text-center transition-all ${
                                hearing === opsi
                                  ? "bg-indigo-50 border-indigo-600"
                                  : "bg-white border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              <span className={`block text-sm font-black ${hearing === opsi ? "text-indigo-700" : "text-slate-700"}`}>
                                {LABEL_HEARING[opsi]}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Asal kampus & prodi. Ketikan bebas — lihat
                          lib/universitas.ts untuk alasan tidak memakai daftar
                          tertutup. */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Asal Kampus</label>
                          <SearchSelect
                            value={kampus}
                            onChange={setKampus}
                            options={UNIVERSITAS}
                            placeholder="mis. Universitas Brawijaya"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Program Studi</label>
                          <SearchSelect
                            value={prodi}
                            onChange={setProdi}
                            options={PROGRAM_STUDI}
                            placeholder="mis. Teknik Informatika"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Bio / Deskripsi Singkat</label>
                        <textarea rows={3} value={profileForm.bio} onChange={e => setProfileForm({...profileForm, bio: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 font-bold" placeholder="Tuliskan sesuatu tentang diri Anda..." />
                      </div>

                      <div className="pt-4">
                        <button type="submit" disabled={profileSaving} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-200 transition-all uppercase tracking-widest text-xs">
                          {profileSaving ? "Menyimpan..." : "Simpan Perubahan"}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              )}

              {activeTab === "security" && (
                <div className="max-w-md space-y-8">
                  <h2 className="text-xl font-black uppercase text-indigo-600 border-b border-indigo-100 pb-4">Ubah Password</h2>
                  <form onSubmit={handleChangePassword} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Password Lama</label>
                      <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 font-bold" placeholder="••••••••" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Password Baru</label>
                      <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 font-bold" placeholder="••••••••" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Konfirmasi Password Baru</label>
                      <input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 font-bold" placeholder="••••••••" required />
                    </div>
                    <button type="submit" disabled={passwordChangeLoading} className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-indigo-600 transition-all uppercase tracking-widest text-xs">
                      {passwordChangeLoading ? "Sedang Memproses..." : "Update Password"}
                    </button>
                  </form>
                </div>
              )}

              {activeTab === "notifications" && (
                <div className="max-w-2xl space-y-8">
                  <h2 className="text-xl font-black uppercase text-indigo-600 border-b border-indigo-100 pb-4">Preferensi Notifikasi</h2>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                      <div>
                        <h3 className="font-bold text-slate-900">Email Pemberitahuan Tugas</h3>
                        <p className="text-sm text-slate-500 mt-1">Kirim email setiap ada tugas baru di kelas.</p>
                      </div>
                      <div className="w-12 h-6 bg-indigo-600 rounded-full flex items-center p-1 cursor-pointer">
                        <div className="w-4 h-4 bg-white rounded-full translate-x-6 shadow-sm transition-transform"></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                      <div>
                        <h3 className="font-bold text-slate-900">Pengingat Deadline</h3>
                        <p className="text-sm text-slate-500 mt-1">Ingatkan H-1 sebelum tenggat waktu pengumpulan.</p>
                      </div>
                      <div className="w-12 h-6 bg-indigo-600 rounded-full flex items-center p-1 cursor-pointer">
                        <div className="w-4 h-4 bg-white rounded-full translate-x-6 shadow-sm transition-transform"></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                      <div>
                        <h3 className="font-bold text-slate-900">Pengumuman Kelas</h3>
                        <p className="text-sm text-slate-500 mt-1">Pemberitahuan instan via push notification.</p>
                      </div>
                      <div className="w-12 h-6 bg-slate-300 rounded-full flex items-center p-1 cursor-pointer">
                        <div className="w-4 h-4 bg-white rounded-full shadow-sm transition-transform"></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "appearance" && (
                <div className="max-w-2xl space-y-8">
                  <h2 className="text-xl font-black uppercase text-indigo-600 border-b border-indigo-100 pb-4">Tampilan Aplikasi</h2>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                      <div>
                        <h3 className="font-bold text-slate-900">Tema Gelap (Dark Mode)</h3>
                        <p className="text-sm text-slate-500 mt-1">Sesuaikan kenyamanan layar untuk mata Anda.</p>
                      </div>
                      <div className="flex items-center">
                        <ThemeToggle variant="icon" className="shadow-none border border-slate-200" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}