"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import RightSidebar from "@/components/RightSidebar";
import LoadingScreen from "@/components/LoadingScreen";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import DosenStatusBanner from "@/components/DosenStatusBanner";
import { bolehMengajar } from "@/lib/access";
import { 
  ChevronRight, BookOpen, Clock, User2, Edit, Trash2, Plus, MapPin, KeyRound, 
  Lock, Globe
} from "lucide-react";
import { toast } from "sonner";
import ConfirmModal from "@/components/ConfirmModal";

interface ClassData {
  id: string;
  creator_user_id: string;
  class_name: string;
  class_code: string;
  lecturer_name: string;
  schedule_time: string;
  room_location: string;
  is_private: boolean; // Tambahkan ini
}

export default function KelaskuPage() {
  // ... (State user, classes, loading, router TETAP SAMA)
  const [user, setUser] = useState<any>(null);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // State Modal Dosen
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassData | null>(null);
  // Tambahkan is_private ke form
  const [form, setForm] = useState({ 
    class_name: "", 
    class_code: "", 
    lecturer_name: "", 
    schedule_time: "", 
    room_location: "",
    is_private: false 
  });

  // State Modal Join (Mahasiswa) TETAP SAMA
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  // ... (fetchClasses TETAP SAMA)
  const fetchClasses = async (userId: string, userRole: string) => {
    try {
      if (userRole === "DOSEN") {
        const { data } = await db.from('classes').select('*').eq('creator_user_id', userId).order('created_at', { ascending: false });
        setClasses(data || []);
      } else {
        const { data: enrollments } = await db.from('enrollments').select('class_id').eq('user_id', userId);
        if (enrollments && enrollments.length > 0) {
          const classIds = enrollments.map((e: any) => e.class_id);
          const { data: classData } = await db.from('classes').select('*').in('id', classIds);
          setClasses(classData || []);
        } else {
          setClasses([]);
        }
      }
    } catch (error) { console.error(error); }
  };

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      const { data: { user } } = await db.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);
      await fetchClasses(user.id, user.user_metadata?.role || "MAHASISWA");
      setLoading(false);
    };
    initData();
  }, [router]);

  // ... (generateCode TETAP SAMA)
  const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  // Update handleOpenCreate
  const handleOpenCreate = () => {
    setEditingClass(null);
    setForm({ 
      class_name: "", 
      class_code: generateCode(), 
      lecturer_name: user.user_metadata.full_name || "", 
      schedule_time: "", 
      room_location: "",
      is_private: false // Default Public
    });
    setIsModalOpen(true);
  };

  // Update handleOpenEdit
  const handleOpenEdit = (cls: ClassData) => {
    setEditingClass(cls);
    setForm({
      class_name: cls.class_name,
      class_code: cls.class_code,
      lecturer_name: cls.lecturer_name,
      schedule_time: cls.schedule_time,
      room_location: cls.room_location,
      is_private: cls.is_private // Load status privacy
    });
    setIsModalOpen(true);
  };

  // ... (handleSubmit & handleDelete & handleJoinClass TETAP SAMA)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClass) {
      await db.from('classes').update(form).eq('id', editingClass.id);
    } else {
      await db.from('classes').insert([{ ...form, creator_user_id: user.id }]);
    }
    setIsModalOpen(false);
    fetchClasses(user.id, user.user_metadata.role);
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    await db.from('classes').delete().eq('id', confirmDeleteId);
    fetchClasses(user.id, user.user_metadata.role);
    toast.success("Kelas berhasil dihapus.");
    setConfirmDeleteId(null);
  };

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    // Logic join tidak berubah, karena join by code tetap bisa masuk ke private class
    const { data: classData, error } = await db.from('classes').select('id, class_name, is_private, creator_user_id').eq('class_code', joinCode).single();
    
    if (error || !classData) { toast.error("Kode kelas tidak ditemukan!"); return; }

    const { data: existing } = await db.from('enrollments').select('*').eq('user_id', user.id).eq('class_id', classData.id).single();
    if (existing) { toast.error("Anda sudah tergabung di kelas ini."); return; }

    const { error: joinError } = await db.from('enrollments').insert({ user_id: user.id, class_id: classData.id });

    if (joinError) toast.error("Gagal bergabung.");
    else {
      toast.success(`Berhasil bergabung! ${classData.is_private ? '(Kelas Privat)' : ''}`);
      setIsJoinModalOpen(false);
      setJoinCode("");
      fetchClasses(user.id, "MAHASISWA");

      // Trigger Notifikasi ke Dosen
      try {
        if (classData.creator_user_id) {
          await db.from('notifications').insert({
            user_id: classData.creator_user_id,
            title: "Mahasiswa Baru Bergabung",
            body: `${user.user_metadata?.full_name || 'Seorang mahasiswa'} telah bergabung dengan kelas Anda: ${classData.class_name}`,
            type: "class",
            link: `/dashboard/akademik/kelasku/${classData.id}`,
            is_read: false
          });
        }
      } catch (err) {
        console.error("Error trigger join notification:", err);
      }
    }
  };

  if (loading) return <LoadingScreen />;
  if (!user) return <LoadingScreen />;

  // bolehMengajar(), bukan sekadar role DOSEN: dosen yang pengajuannya masih
  // menunggu (atau ditolak) belum boleh membuat kelas. Admin ikut masuk karena
  // ia mengelola seluruh platform.
  const isDosen = bolehMengajar(user);

  return (
    <div className="flex min-h-screen bg-white text-slate-900 antialiased overflow-hidden">
      <Sidebar role={user.user_metadata.role} userName={user.user_metadata.full_name} />
      
      <main className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden pb-20 lg:pb-0">
        {/* Header */}
        <header className="h-16 border-b border-slate-100 pl-16 pr-4 md:pr-10 lg:pl-10 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <GlobalSearch />
          <NotificationBell />
        </header>
        
        <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-24 lg:pb-10 space-y-8">
          <DosenStatusBanner user={user} />
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase ">Daftar Kelas Saya</h1>
              <p className="text-slate-500 font-medium mt-2">
                {isDosen ? "Kelola kelas yang Anda ajar." : "Kelas yang Anda ikuti."}
              </p>
            </div>
            {isDosen ? (
              <button onClick={handleOpenCreate} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-indigo-200 transition-all shrink-0">
                <Plus size={18} strokeWidth={3} /> BUAT KELAS BARU
              </button>
            ) : (
              <button onClick={() => setIsJoinModalOpen(true)} className="px-6 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white font-black rounded-xl text-sm flex items-center gap-2 transition-all shrink-0 border border-indigo-100">
                <KeyRound size={18} strokeWidth={3} /> GABUNG VIA KODE
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {classes.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">
                <BookOpen size={48} strokeWidth={1} className="mb-4 text-slate-300" />
                <p className="font-bold text-lg">Anda belum memiliki kelas.</p>
                {!isDosen && <p className="text-sm mt-2">Cari kelas di menu <Link href="/dashboard/akademik/jelajahi" className="text-indigo-600 underline">Jelajahi</Link> atau masukkan kode kelas.</p>}
              </div>
            ) : (
              classes.map((cls) => (
                <div key={cls.id} className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:border-indigo-500 hover:shadow-xl hover:-translate-y-1 transition-all relative">
                  <Link href={`/dashboard/akademik/kelasku/${cls.id}`} className="absolute inset-0 z-0 rounded-3xl" />

                  <div className="flex justify-between items-start mb-4 relative pointer-events-none">
                    <div className="flex gap-2">
                      <div className="bg-indigo-50 text-indigo-700 font-black px-3 py-1 rounded-lg text-xs tracking-wider uppercase pointer-events-auto" title="Kode Kelas">
                        {cls.class_code}
                      </div>
                      {/* Indikator Private/Public */}
                      {cls.is_private && (
                        <div className="bg-slate-100 text-slate-500 px-2 py-1 rounded-lg flex items-center gap-1 text-[10px] font-bold uppercase border border-slate-200" title="Kelas Privat">
                          <Lock size={12} /> Privat
                        </div>
                      )}
                    </div>

                    {isDosen && (
                      <div className="flex gap-2 relative z-10 pointer-events-auto">
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(cls.id); }} className="p-2 hover:bg-red-100 text-slate-400 hover:text-red-600 rounded-full transition-colors"><Trash2 size={16}/></button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenEdit(cls); }} className="p-2 hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded-full transition-colors"><Edit size={16}/></button>
                      </div>
                    )}
                  </div>
                  
                  <h3 className="text-2xl font-bold text-slate-900 mb-2 group-hover:text-indigo-700 transition-colors relative pointer-events-none">{cls.class_name}</h3>
                  
                  <div className="space-y-3 mt-6 border-t border-slate-50 pt-4 relative pointer-events-none">
                    <p className="text-sm text-slate-600 font-medium flex items-center gap-3"><User2 size={18} className="text-indigo-400" /> {cls.lecturer_name}</p>
                    <div className="flex gap-4">
                      <p className="text-xs text-slate-500 flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-md"><Clock size={14} /> {cls.schedule_time}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-md"><MapPin size={14} /> {cls.room_location}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <RightSidebar userId={user.id} />

      {/* MODAL BUAT KELAS */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold mb-4">{editingClass ? "Edit Kelas" : "Buat Kelas Baru"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input placeholder="Nama Mata Kuliah" className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={form.class_name} onChange={e => setForm({...form, class_name: e.target.value})} required />
              
              <div className="flex gap-2 items-center">
                <input readOnly className="w-full p-3 border rounded-xl bg-slate-100 font-mono text-center tracking-widest font-bold" value={form.class_code} />
                <button type="button" onClick={() => setForm({...form, class_code: generateCode()})} className="p-3 bg-slate-200 rounded-xl hover:bg-slate-300">↻</button>
              </div>

              {/* TOGGLE PRIVATE CLASS */}
              <div className="flex items-center justify-between p-3 border rounded-xl bg-slate-50 cursor-pointer" onClick={() => setForm({...form, is_private: !form.is_private})}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${form.is_private ? "bg-slate-800 text-white" : "bg-indigo-100 text-indigo-600"}`}>
                    {form.is_private ? <Lock size={20} /> : <Globe size={20} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{form.is_private ? "Kelas Privat" : "Kelas Publik"}</p>
                    <p className="text-[10px] text-slate-500">{form.is_private ? "Hanya via kode, tidak muncul di Jelajahi" : "Muncul di menu Jelajahi"}</p>
                  </div>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${form.is_private ? "border-indigo-600 bg-indigo-600" : "border-slate-300"}`}>
                  {form.is_private && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
              </div>

              <input placeholder="Nama Dosen" className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={form.lecturer_name} onChange={e => setForm({...form, lecturer_name: e.target.value})} required />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input placeholder="Jadwal" className="w-full p-3 border rounded-xl" value={form.schedule_time} onChange={e => setForm({...form, schedule_time: e.target.value})} required />
                <input placeholder="Ruangan" className="w-full p-3 border rounded-xl" value={form.room_location} onChange={e => setForm({...form, room_location: e.target.value})} required />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-500 font-bold">Batal</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL JOIN (Tetap Sama) */}
      {isJoinModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-3xl w-full max-w-sm shadow-2xl text-center">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4"><KeyRound size={24} /></div>
            <h2 className="text-xl font-bold mb-2">Gabung Kelas</h2>
            <p className="text-sm text-slate-500 mb-6">Masukkan 6 digit kode kelas dari dosen Anda.</p>
            <form onSubmit={handleJoinClass}>
              <input 
                placeholder="X7B29A" 
                className="w-full p-4 border-2 border-slate-200 rounded-xl text-center font-mono text-2xl font-bold uppercase tracking-[0.2em] focus:border-indigo-500 outline-none mb-6" 
                value={joinCode} 
                onChange={e => setJoinCode(e.target.value.toUpperCase())} 
                maxLength={6}
                required
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsJoinModalOpen(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Batal</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg">Gabung</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDeleteId}
        title="Hapus Kelas?"
        message="Kelas ini akan dihapus secara permanen beserta semua data yang terkait."
        confirmLabel="Ya, Hapus"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}