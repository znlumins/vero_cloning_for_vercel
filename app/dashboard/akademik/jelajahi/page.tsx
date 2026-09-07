"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import RightSidebar from "@/components/RightSidebar";
import LoadingScreen from "@/components/LoadingScreen";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import { ChevronRight, Search, BookOpen, User, PlusCircle, Check, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";

interface ClassData {
  id: string;
  creator_user_id: string;
  class_name: string;
  class_code: string;
  lecturer_name: string;
  schedule_time: string;
  room_location: string;
  is_private: boolean;
}

export default function JelajahiPage() {
  const [user, setUser] = useState<any>(null);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [enrolledClassIds, setEnrolledClassIds] = useState<string[]>([]); // ID kelas yang sudah diikuti
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const router = useRouter();

  // --- FETCH DATA ---
  const fetchData = async (userId: string) => {
    try {
      // 1. Ambil semua kelas yang PUBLIK (is_private = false)
      const { data: publicClasses, error: classError } = await db
        .from('classes')
        .select('*')
        .eq('is_private', false) // <--- Filter Penting!
        .order('created_at', { ascending: false });
      
      if (classError) console.error("Error fetching classes:", classError);

      // 2. Ambil data enrollment user ini (untuk cek apakah sudah gabung)
      const { data: myEnrollments, error: enrollError } = await db
        .from('enrollments')
        .select('class_id')
        .eq('user_id', userId);
      
      if (enrollError) console.error("Error fetching enrollments:", enrollError);

      if (myEnrollments) {
        setEnrolledClassIds(myEnrollments.map((e: any) => e.class_id));
      }
      setClasses(publicClasses || []);

    } catch (error) {
      console.error("Unexpected error:", error);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await db.auth.getUser();
      if (!user) { router.push("/login"); return; }
      
      setUser(user);
      await fetchData(user.id);
      setLoading(false);
    };
    init();
  }, [router]);

  // --- HANDLE ENROLL ---
  const handleEnroll = async (classId: string) => {
    if (enrolledClassIds.includes(classId)) return; // Cegah double klik

    const { error } = await db.from('enrollments').insert({
      user_id: user.id,
      class_id: classId
    });

    if (error) {
      toast.error("Gagal bergabung: " + error.message);
    } else {
      // Update state lokal agar UI langsung berubah tanpa refresh
      setEnrolledClassIds((prev) => [...prev, classId]);
      toast.success("Berhasil bergabung ke kelas! Cek menu Kelasku.");

      // Trigger Notifikasi ke Dosen
      try {
        const { data: classData } = await db.from('classes').select('class_name, creator_user_id').eq('id', classId).single();
        if (classData && classData.creator_user_id) {
          await db.from('notifications').insert({
            user_id: classData.creator_user_id,
            title: "Mahasiswa Baru Bergabung",
            body: `${user.user_metadata?.full_name || 'Seorang mahasiswa'} telah bergabung dengan kelas Anda: ${classData.class_name}`,
            type: "class",
            link: `/dashboard/akademik/kelasku/${classId}`,
            is_read: false
          });
        }
      } catch (err) {
        console.error("Error trigger join notification:", err);
      }
    }
  };

  // --- SEARCH FILTER ---
  const filteredClasses = classes.filter(c => 
    c.class_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.lecturer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.class_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <LoadingScreen />;
  if (!user) return <LoadingScreen />;

  const isMahasiswa = user.user_metadata.role === "MAHASISWA";

  return (
    <div className="flex min-h-screen bg-white text-slate-900 antialiased overflow-hidden">
      <Sidebar role={user.user_metadata.role} userName={user.user_metadata.full_name} />
      
      <main className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden pb-20 lg:pb-0">
        {/* HEADER */}
        <header className="h-16 border-b border-slate-100 pl-16 pr-4 md:pr-10 lg:pl-10 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <GlobalSearch />
          <NotificationBell />
        </header>
        
        {/* KONTEN UTAMA */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-24 lg:pb-10 bg-slate-50/50">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2 uppercase ">Kelas Publik Tersedia</h1>
              <p className="text-slate-500 font-medium max-w-xl">
                Temukan dan bergabung dengan kelas-kelas menarik dari berbagai dosen.
              </p>
            </div>
            {/* Search Bar Spesifik */}
            <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200 w-full md:w-72 shadow-sm focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
              <Search size={18} className="text-slate-400" />
              <input 
                type="text" 
                placeholder="Cari kelas atau dosen..." 
                className="bg-transparent text-sm outline-none w-full font-bold text-slate-900 placeholder:text-slate-400" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClasses.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">
                <BookOpen size={48} strokeWidth={1} className="mb-4 text-slate-300" />
                <p className="font-bold text-lg">Tidak ada kelas publik ditemukan.</p>
                <p className="text-sm mt-2">Dosen mungkin belum membuat kelas publik atau kata kunci pencarian tidak cocok.</p>
              </div>
            ) : (
              filteredClasses.map(cls => {
                const isEnrolled = enrolledClassIds.includes(cls.id);
                const isMyClass = cls.creator_user_id === user.id;

                return (
                  <div key={cls.id} className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col h-full relative overflow-hidden">
                    
                    {/* Header Card dengan Icon Inisial */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0 font-black text-xl shadow-sm">
                        {cls.class_name.charAt(0)}
                      </div>
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-lg uppercase tracking-wider border border-slate-200">
                        {cls.class_code}
                      </span>
                    </div>

                    <h3 className="text-xl font-black text-slate-900 mb-2 line-clamp-2 leading-tight group-hover:text-indigo-600 transition-colors">
                      {cls.class_name}
                    </h3>

                    {/* Info Kelas */}
                    <div className="space-y-2 mb-6">
                      <p className="text-sm text-slate-500 font-bold flex items-center gap-2">
                        <User size={16} className="text-indigo-400"/> {cls.lecturer_name}
                      </p>
                      <div className="flex gap-3 text-xs text-slate-400 font-medium">
                        <span className="flex items-center gap-1"><Clock size={12}/> {cls.schedule_time}</span>
                        <span className="flex items-center gap-1"><MapPin size={12}/> {cls.room_location}</span>
                      </div>
                    </div>
                    
                    {/* Tombol Aksi (Sticky di Bawah Card) */}
                    <div className="mt-auto">
                      {isMahasiswa ? (
                        isEnrolled ? (
                          <button disabled className="w-full py-3 rounded-xl font-bold text-sm bg-green-50 text-green-600 border border-green-200 flex items-center justify-center gap-2 cursor-default opacity-80">
                            <Check size={18} /> Sudah Terdaftar
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleEnroll(cls.id)} 
                            className="w-full py-3 rounded-xl font-bold text-sm bg-slate-900 text-white hover:bg-indigo-600 transition-colors shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
                          >
                            <PlusCircle size={18} /> Gabung Kelas
                          </button>
                        )
                      ) : (
                        // Tampilan untuk Dosen (Read Only)
                        <button disabled className={`w-full py-3 rounded-xl font-bold text-sm border cursor-default ${isMyClass ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-slate-50 text-slate-400 border-slate-200"}`}>
                          {isMyClass ? "Kelas Milik Anda" : "Milik Dosen Lain"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      <RightSidebar userId={user.id} />
    </div>
  );
}