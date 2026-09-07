"use client";
import { useEffect, useState, use } from "react";
import Sidebar from "@/components/Sidebar";
import RightSidebar from "@/components/RightSidebar";
import LoadingScreen from "@/components/LoadingScreen";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import { toast } from "sonner"; // Sekarang aman setelah instal di langkah 1
import { 
  ChevronRight, ArrowLeft, Send, FileText, 
  Download, Users, MessageSquare, Plus, Link as LinkIcon,
  Video, Clock, MoreHorizontal, Trash2, User2, ExternalLink
} from "lucide-react";
import { format, parseISO, isWithinInterval } from "date-fns";
import { id as idLocale } from "date-fns/locale";

// --- INTERFACES ---
interface ClassDetail {
  id: string;
  class_name: string;
  class_code: string;
  lecturer_name: string;
  room_location: string;
  schedule_time: string;
}

interface ClassPost {
  id: string;
  user_name: string;
  content: string;
  file_url?: string;
  file_type: string;
  created_at: string;
}

interface ClassSchedule {
  id: string;
  subject_name: string;
  start_time: string;
  end_time: string;
  room_id: string;
  is_online: boolean;
}

export default function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const classId = resolvedParams.id;

  const [user, setUser] = useState<any>(null);
  const [classInfo, setClassInfo] = useState<ClassDetail | null>(null);
  const [posts, setPosts] = useState<ClassPost[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("stream"); 
  
  const router = useRouter();

  const [newPostContent, setNewPostContent] = useState("");
  const [newPostLink, setNewPostLink] = useState("");
  const [isJadwalModalOpen, setIsJadwalModalOpen] = useState(false);
  const [jadwalForm, setJadwalForm] = useState({
    subject_name: "",
    start_time: "",
    end_time: "",
    is_online: true
  });

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      const { data: { user } } = await db.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);

      const { data: classData, error: classError } = await db
        .from('classes').select('*').eq('id', classId).single();
      
      if (classError) {
        toast.error("Kelas tidak ditemukan");
        router.push("/dashboard/akademik/kelasku");
        return;
      }
      setClassInfo(classData);

      await Promise.all([fetchPosts(), fetchSchedules(), fetchMembers()]);
      setLoading(false);
    };
    initData();
  }, [classId, router]);

  const fetchPosts = async () => {
    const { data } = await db.from('class_posts').select('*').eq('class_id', classId).order('created_at', { ascending: false });
    setPosts(data || []);
  };

  const fetchSchedules = async () => {
    const { data } = await db.from('schedules').select('*').eq('class_id', classId).order('start_time', { ascending: true });
    setSchedules(data || []);
  };

  const fetchMembers = async () => {
    const { data: enrollments } = await db.from('enrollments').select('*').eq('class_id', classId);
    if (enrollments && enrollments.length > 0) {
      const userIds = enrollments.map((e: any) => e.user_id);
      const { data: profiles } = await db.from('profiles').select('*').in('id', userIds);
      setMembers(profiles || []);
    } else {
      setMembers([]);
    }
  };

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent) return;

    const { error } = await db.from('class_posts').insert({
      class_id: classId,
      user_id: user.id,
      user_name: user.user_metadata.full_name,
      content: newPostContent,
      file_url: newPostLink || null,
      file_type: newPostLink ? "LINK" : "TEXT",
    });

    if (error) toast.error(error.message);
    else {
      toast.success("Berhasil memposting pengumuman");
      setNewPostContent("");
      setNewPostLink("");
      fetchPosts();
    }
  };

  const handleCreateJadwal = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await db.from('schedules').insert({
      class_id: classId,
      creator_id: user.id,
      subject_name: jadwalForm.subject_name,
      start_time: new Date(jadwalForm.start_time).toISOString(),
      end_time: new Date(jadwalForm.end_time).toISOString(),
      is_online: jadwalForm.is_online,
      room_id: classInfo?.class_code,
      location: jadwalForm.is_online ? "Online Meeting" : "Ruang Kelas"
    });

    if (error) toast.error(error.message);
    else {
      toast.success("Jadwal pertemuan berhasil dibuat");
      setIsJadwalModalOpen(false);
      fetchSchedules();
    }
  };

  if (loading) return <LoadingScreen />;
  if (!user || !classInfo) return <LoadingScreen />;

  const isDosen = user.user_metadata.role === "DOSEN";

  return (
    <div className="flex min-h-screen bg-white text-slate-900 antialiased overflow-hidden">
      <Sidebar role={user.user_metadata.role} userName={user.user_metadata.full_name} />
      
      <main className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden pb-20 lg:pb-0">
        <header className="h-16 border-b border-slate-100 pl-16 pr-4 md:pr-10 lg:pl-10 flex items-center justify-between sticky top-0 bg-white z-10 shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft size={20}/></button>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                <span className="text-indigo-600">Kelasku</span>
                <ChevronRight size={14} />
                <span className="text-slate-900 truncate max-w-50">{classInfo.class_name}</span>
              </div>
            </div>
            <GlobalSearch />
          </div>
          
          <div className="flex items-center gap-6">
            <nav className="flex bg-slate-100 p-1 rounded-xl">
              {["stream", "materials", "schedules", "people"].map((tab) => (
                <button 
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-1.5 text-xs font-black uppercase tracking-tight rounded-lg transition-all ${activeTab === tab ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {tab === 'stream' ? 'Forum' : tab === 'materials' ? 'Materi' : tab === 'schedules' ? 'Jadwal' : 'Anggota'}
                </button>
              ))}
            </nav>
            <NotificationBell />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-24 lg:pb-10 space-y-10">
          <div className="relative h-56 bg-slate-900 rounded-4xl p-12 flex flex-col justify-end text-white shadow-2xl overflow-hidden">
             <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600 rounded-full blur-[120px] opacity-20 -translate-y-1/2 translate-x-1/4"></div>
             <p className="text-indigo-400 font-black text-[10px] uppercase tracking-[0.4em] mb-4">Class Overview</p>
             <h1 className="text-4xl font-black tracking-tighter uppercase leading-none mb-2">{classInfo.class_name}</h1>
             <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{classInfo.class_code} • {classInfo.room_location} • {classInfo.schedule_time}</p>
          </div>

          <div className="max-w-4xl mx-auto pb-20">
            {activeTab === "stream" && (
              <div className="space-y-8">
                {isDosen && (
                  <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                    <form onSubmit={handlePostSubmit}>
                      <textarea 
                        placeholder="Umumkan sesuatu ke kelas Anda..." 
                        className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-indigo-100 resize-none h-28 font-medium"
                        value={newPostContent}
                        onChange={(e) => setNewPostContent(e.target.value)}
                      />
                      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100">
                        <div className="flex-1 flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                          <LinkIcon size={16} className="text-slate-400"/>
                          <input type="text" placeholder="Link materi (Opsional)" className="bg-transparent text-xs w-full outline-none" value={newPostLink} onChange={(e) => setNewPostLink(e.target.value)} />
                        </div>
                        <button type="submit" className="px-8 py-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">Kirim</button>
                      </div>
                    </form>
                  </div>
                )}
                <div className="space-y-6">
                  {posts.map((post) => (
                    <div key={post.id} className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm group">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 bg-slate-100 text-slate-900 rounded-2xl flex items-center justify-center font-black text-lg shadow-inner">{post.user_name.charAt(0)}</div>
                        <div>
                          <p className="font-black text-slate-900 uppercase text-sm tracking-tight">{post.user_name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{format(parseISO(post.created_at), 'dd MMM yyyy, HH:mm', { locale: idLocale })}</p>
                        </div>
                      </div>
                      <p className="text-slate-700 leading-relaxed font-medium mb-6">{post.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "schedules" && (
              <div className="space-y-6">
                {isDosen && (
                  <button onClick={() => setIsJadwalModalOpen(true)} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-3xl flex items-center justify-center gap-3 text-slate-400 font-bold hover:bg-slate-50 hover:border-indigo-600 hover:text-indigo-600 transition-all">
                    <Plus size={20}/> Buat Jadwal Pertemuan Baru
                  </button>
                )}
                <div className="grid grid-cols-1 gap-4">
                  {schedules.map((j) => {
                    const start = parseISO(j.start_time);
                    const end = parseISO(j.end_time);
                    const isLive = isWithinInterval(new Date(), { start, end });
                    return (
                      <div key={j.id} className={`p-8 rounded-4xl border-2 transition-all ${isLive ? 'border-indigo-600 bg-indigo-50/30' : 'bg-white border-slate-100 shadow-sm'}`}>
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-4">
                            <div className={`p-4 rounded-2xl ${isLive ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-100 text-slate-400'}`}><Video size={24}/></div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${isLive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{isLive ? 'Live' : 'Terjadwal'}</span>
                                <p className="text-xs font-bold text-slate-400">{format(start, "eeee, dd MMMM", { locale: idLocale })}</p>
                              </div>
                              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{j.subject_name}</h3>
                            </div>
                          </div>
                          {isLive && (
                            <button onClick={() => router.push(`/dashboard/diskusi/meeting?roomID=${j.room_id}`)} className="px-8 py-3 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-indigo-600 shadow-xl transition-all">Join Meeting</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "materials" && (
              <div className="space-y-6">
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Materi Kelas</h2>
                {posts.filter(p => p.file_url).length === 0 ? (
                  <div className="p-12 border-2 border-dashed border-slate-200 rounded-3xl text-center text-slate-400">
                    <FileText size={48} className="mx-auto mb-4 text-slate-300" strokeWidth={1.5} />
                    <p className="font-bold text-lg">Belum ada materi</p>
                    <p className="text-sm mt-2">Materi akan muncul saat dosen mengirim pengumuman dengan lampiran link.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {posts.filter(p => p.file_url).map((post) => (
                      <div key={post.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
                          {post.file_type === 'LINK' ? <ExternalLink size={20} /> : <FileText size={20} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 truncate">{post.content || 'Materi Kelas'}</p>
                          <p className="text-xs text-slate-400 font-medium mt-1">
                            Diposting oleh {post.user_name} • {format(parseISO(post.created_at), 'dd MMM yyyy', { locale: idLocale })}
                          </p>
                        </div>
                        <a
                          href={post.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shrink-0"
                        >
                          <Download size={14} /> Buka
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "people" && (
              <div className="space-y-6">
                {/* Dosen */}
                <div>
                  <h2 className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-4">Dosen Pengampu</h2>
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
                    <div className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center font-black text-lg">
                      {classInfo?.lecturer_name?.charAt(0) || 'D'}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{classInfo?.lecturer_name}</p>
                      <p className="text-xs text-slate-400 font-medium">Dosen</p>
                    </div>
                  </div>
                </div>

                {/* Mahasiswa */}
                <div>
                  <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
                    Mahasiswa Terdaftar ({members.length})
                  </h2>
                  {members.length === 0 ? (
                    <div className="p-12 border-2 border-dashed border-slate-200 rounded-3xl text-center text-slate-400">
                      <Users size={48} className="mx-auto mb-4 text-slate-300" strokeWidth={1.5} />
                      <p className="font-bold text-lg">Belum ada mahasiswa</p>
                      <p className="text-sm mt-2">Mahasiswa yang bergabung akan muncul di sini.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {members.map((member) => (
                        <div key={member.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4 hover:border-slate-200 transition-all">
                          <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center font-bold text-sm">
                            {member.name?.charAt(0) || <User2 size={16} />}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-slate-900">{member.name || 'Mahasiswa'}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{member.role || 'MAHASISWA'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <RightSidebar userId={user.id} />

      {isJadwalModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-100 p-4">
          <div className="bg-white p-10 rounded-4xl w-full max-w-md shadow-2xl border-4 border-white animate-in zoom-in duration-300">
             <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-6">Buat Jadwal Baru</h2>
             <form onSubmit={handleCreateJadwal} className="space-y-4">
                <input className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-100 font-bold" value={jadwalForm.subject_name} onChange={e => setJadwalForm({...jadwalForm, subject_name: e.target.value})} required placeholder="Judul Pertemuan" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input type="datetime-local" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-xs font-bold" value={jadwalForm.start_time} onChange={e => setJadwalForm({...jadwalForm, start_time: e.target.value})} required />
                  <input type="datetime-local" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-xs font-bold" value={jadwalForm.end_time} onChange={e => setJadwalForm({...jadwalForm, end_time: e.target.value})} required />
                </div>
                <div className="flex justify-end gap-3 mt-8">
                  <button type="button" onClick={() => setIsJadwalModalOpen(false)} className="px-6 py-3 text-slate-500 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-50">Batal</button>
                  <button type="submit" className="px-8 py-3 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-200">Simpan Jadwal</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}