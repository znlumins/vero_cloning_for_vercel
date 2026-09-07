"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import RightSidebar from "@/components/RightSidebar";
import LoadingScreen from "@/components/LoadingScreen";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import { ChevronRight, CalendarCheck, CheckCircle2, XCircle, AlertCircle, Play, Square, User2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface ClassData {
  id: string;
  class_name: string;
  class_code: string;
  creator_user_id: string;
}

interface AttendanceSession {
  id: string;
  class_id: string;
  is_open: boolean;
  created_at: string;
}

interface AttendanceRecord {
  id: string;
  session_id: string;
  user_id: string;
  status: string;
  created_at: string;
  users?: { name: string, email: string }; // joined data if supported by our mock, otherwise fetch separately
}

export default function AbsensiPage() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string>("MAHASISWA");
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  
  // Dosen State
  const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null);
  const [classMembers, setClassMembers] = useState<any[]>([]);
  const [sessionRecords, setSessionRecords] = useState<AttendanceRecord[]>([]);

  // Mahasiswa State
  const [mhsActiveSessions, setMhsActiveSessions] = useState<(AttendanceSession & { class_name: string })[]>([]);
  const [mhsSummary, setMhsSummary] = useState<{class_id: string, class_name: string, percentage: number}[]>([]);

  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await db.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);
      
      const userRole = (user.user_metadata?.role || "MAHASISWA").toUpperCase();
      setRole(userRole);

      if (userRole === "DOSEN") {
        await loadDosenData(user.id);
      } else {
        await loadMahasiswaData(user.id);
      }
      setLoading(false);
    };
    init();
  }, [router]);

  // --- DOSEN LOGIC ---
  const loadDosenData = async (userId: string) => {
    const { data } = await db.from("classes").select("*").eq("creator_user_id", userId);
    setClasses(data || []);
  };

  const selectDosenClass = async (classId: string) => {
    setSelectedClassId(classId);
    // Fetch members
    const { data: enrollments } = await db.from("enrollments").select("user_id").eq("class_id", classId);
    if (enrollments && enrollments.length > 0) {
      const userIds = enrollments.map((e: any) => e.user_id);
      // We do manual join since the mock db might not support deep relations well
      const membersData: any[] = [];
      for (const uid of userIds) {
        const { data: u } = await db.from("users").select("id, name, email").eq("id", uid).single();
        if (u) membersData.push(u);
      }
      setClassMembers(membersData);
    } else {
      setClassMembers([]);
    }

    // Check active session
    const { data: session } = await db.from("attendance_sessions")
      .select("*")
      .eq("class_id", classId)
      .eq("is_open", true)
      .order("created_at", { ascending: false });
      
    if (session && session.length > 0) {
      setCurrentSession(session[0]);
      await loadSessionRecords(session[0].id);
    } else {
      setCurrentSession(null);
      setSessionRecords([]);
    }
  };

  const loadSessionRecords = async (sessionId: string) => {
    const { data } = await db.from("attendance_records").select("*").eq("session_id", sessionId);
    setSessionRecords(data || []);
  };

  const openSession = async () => {
    if (!selectedClassId) return;
    const { data, error } = await db.from("attendance_sessions").insert({
      class_id: selectedClassId,
      is_open: true
    });
    if (error) {
      toast.error("Gagal membuka presensi");
      return;
    }
    toast.success("Sesi Presensi Dibuka!");
    // The mock db returns an array for inserts usually
    const newSession = Array.isArray(data) ? data[0] : data;
    setCurrentSession(newSession || { class_id: selectedClassId, is_open: true, id: 'temp-id' });
    setSessionRecords([]);
  };

  const closeSession = async () => {
    if (!currentSession) return;
    const { error } = await db.from("attendance_sessions").update({ is_open: false }).eq("id", currentSession.id);
    if (!error) {
      toast.info("Sesi Presensi Ditutup");
      setCurrentSession(null);
    }
  };

  // --- MAHASISWA LOGIC ---
  const loadMahasiswaData = async (userId: string) => {
    // 1. Dapatkan semua kelas yang diikuti
    const { data: enrollments } = await db.from("enrollments").select("class_id").eq("user_id", userId);
    if (!enrollments || enrollments.length === 0) return;
    
    const classIds = enrollments.map((e: any) => e.class_id);
    
    // 2. Fetch data kelas
    const { data: myClasses } = await db.from("classes").select("*").in("id", classIds);
    setClasses(myClasses || []);

    // 3. Cek apakah ada sesi terbuka di kelas-kelas tersebut
    const active: (AttendanceSession & { class_name: string })[] = [];
    for (const cls of (myClasses || [])) {
      const { data: session } = await db.from("attendance_sessions")
        .select("*")
        .eq("class_id", cls.id)
        .eq("is_open", true);
      
      if (session && session.length > 0) {
        // Cek apakah mahasiswa ini sudah absen di sesi ini
        const { data: record } = await db.from("attendance_records")
          .select("id")
          .eq("session_id", session[0].id)
          .eq("user_id", userId);
          
        if (!record || record.length === 0) {
           // Belum absen!
           active.push({ ...session[0], class_name: cls.class_name });
        }
      }
    }
    setMhsActiveSessions(active);

    // 4. Hitung ringkasan per kelas (Rata-rata kehadiran)
    const summary = [];
    for (const cls of (myClasses || [])) {
       // Total sesi yang pernah dibuka untuk kelas ini
       const { data: allSessions } = await db.from("attendance_sessions").select("id").eq("class_id", cls.id);
       const totalSessions = allSessions ? allSessions.length : 0;
       
       if (totalSessions === 0) {
         summary.push({ class_id: cls.id, class_name: cls.class_name, percentage: 100 });
         continue;
       }

       // Total hadir mahasiswa ini di kelas ini
       let hadirCount = 0;
       for (const s of allSessions) {
         const { data: rec } = await db.from("attendance_records").select("status").eq("session_id", s.id).eq("user_id", userId);
         if (rec && rec.length > 0 && (rec[0].status === "HADIR_LURING" || rec[0].status === "HADIR_DARING")) {
           hadirCount++;
         }
       }
       
       const percentage = Math.round((hadirCount / totalSessions) * 100);
       summary.push({ class_id: cls.id, class_name: cls.class_name, percentage });
    }
    setMhsSummary(summary);
  };

  const submitAttendance = async (sessionId: string, status: string) => {
    const { error } = await db.from("attendance_records").insert({
      session_id: sessionId,
      user_id: user.id,
      status: status
    });
    
    if (error) {
      toast.error("Gagal mengirim presensi");
      return;
    }
    
    toast.success("Berhasil melakukan presensi: " + status);
    
    // Hapus sesi aktif dari UI
    setMhsActiveSessions(prev => prev.filter(s => s.id !== sessionId));
    // Refresh rekap
    loadMahasiswaData(user.id);
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans selection:bg-indigo-100 selection:text-indigo-700">
      <Sidebar role={role} userName={user?.user_metadata?.full_name || "User"} />

      <main className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden pb-20 lg:pb-0 relative">
        <header className="h-16 border-b border-slate-100 pl-16 pr-4 md:pr-10 lg:pl-10 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-40 shrink-0">
          <GlobalSearch />
          <NotificationBell />
        </header>

        <div className="p-8 pb-24 md:pb-8 max-w-5xl mx-auto w-full overflow-y-auto h-full">
          <div className="mb-10 flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <CalendarCheck size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Hub Absensi</h1>
              <p className="text-slate-500 font-medium">Kelola dan pantau kehadiran kelas secara real-time.</p>
            </div>
          </div>

          {role === "DOSEN" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Sidebar Daftar Kelas Dosen */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Pilih Kelas</h2>
                <div className="space-y-3">
                  {classes.map(cls => (
                    <button 
                      key={cls.id}
                      onClick={() => selectDosenClass(cls.id)}
                      className={`w-full text-left p-4 rounded-2xl transition-all border ${
                        selectedClassId === cls.id 
                          ? "bg-indigo-50 border-indigo-200 shadow-sm" 
                          : "bg-slate-50 border-transparent hover:bg-slate-100"
                      }`}
                    >
                      <p className={`font-bold ${selectedClassId === cls.id ? "text-indigo-700" : "text-slate-700"}`}>{cls.class_name}</p>
                      <p className="text-xs text-slate-400 font-bold tracking-widest mt-1">{cls.class_code}</p>
                    </button>
                  ))}
                  {classes.length === 0 && (
                     <p className="text-sm text-slate-400 text-center py-4">Belum ada kelas yang dibuat.</p>
                  )}
                </div>
              </div>

              {/* Panel Kelola Presensi */}
              <div className="lg:col-span-2 space-y-6">
                {!selectedClassId ? (
                   <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 flex flex-col items-center justify-center text-center text-slate-400">
                     <CalendarCheck size={48} className="mb-4 text-slate-200" />
                     <p className="font-bold text-lg">Pilih kelas di samping</p>
                     <p className="text-sm mt-1">Untuk mulai mengelola sesi absensi.</p>
                   </div>
                ) : (
                   <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                     <div className="flex justify-between items-start mb-8">
                        <div>
                          <h2 className="text-2xl font-black text-slate-900">{classes.find(c => c.id === selectedClassId)?.class_name}</h2>
                          <p className="text-slate-500 text-sm mt-1">Total Mahasiswa: {classMembers.length}</p>
                        </div>
                        
                        {currentSession ? (
                          <button onClick={closeSession} className="flex items-center gap-2 px-6 py-3 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl font-black text-sm uppercase tracking-widest transition-all">
                            <Square size={18} /> Tutup Presensi
                          </button>
                        ) : (
                          <button onClick={openSession} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-200 font-black text-sm uppercase tracking-widest transition-all">
                            <Play size={18} fill="currentColor" /> Buka Presensi
                          </button>
                        )}
                     </div>

                     {currentSession && (
                       <div className="mb-8 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-700">
                         <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                         <p className="font-bold text-sm">Sesi Presensi sedang Aktif. Menunggu mahasiswa merespons...</p>
                         <button onClick={() => loadSessionRecords(currentSession.id)} className="ml-auto text-xs font-bold underline">Refresh Data</button>
                       </div>
                     )}

                     <div className="space-y-3">
                       {classMembers.map(member => {
                         const record = sessionRecords.find(r => r.user_id === member.id);
                         return (
                           <div key={member.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                             <div className="flex items-center gap-4">
                               <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-400 font-bold">
                                 {member.name?.charAt(0) || <User2 size={16} />}
                               </div>
                               <div>
                                 <p className="font-bold text-slate-900 text-sm">{member.name}</p>
                                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{member.email}</p>
                               </div>
                             </div>
                             
                             <div>
                               {!currentSession ? (
                                 <span className="text-xs font-bold text-slate-400 bg-slate-200 px-3 py-1 rounded-lg">Sesi Tutup</span>
                               ) : !record ? (
                                 <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1 rounded-lg flex items-center gap-1">
                                   <AlertCircle size={14}/> Belum Absen
                                 </span>
                               ) : (
                                 <span className={`text-xs font-bold px-3 py-1 rounded-lg border flex items-center gap-1 ${
                                   record.status.includes('HADIR') ? 'text-emerald-600 bg-emerald-50 border-emerald-100' :
                                   record.status === 'IZIN' ? 'text-blue-600 bg-blue-50 border-blue-100' :
                                   'text-rose-600 bg-rose-50 border-rose-100'
                                 }`}>
                                   <CheckCircle2 size={14}/> {record.status.replace('_', ' ')}
                                 </span>
                               )}
                             </div>
                           </div>
                         )
                       })}
                       {classMembers.length === 0 && (
                         <p className="text-center text-slate-400 text-sm py-4">Belum ada mahasiswa terdaftar di kelas ini.</p>
                       )}
                     </div>
                   </div>
                )}
              </div>
            </div>
          )}

          {role === "MAHASISWA" && (
            <div className="space-y-8">
              {/* Banner Presensi Aktif */}
              {mhsActiveSessions.length > 0 && (
                <div className="space-y-4">
                  {mhsActiveSessions.map(session => (
                    <div key={session.id} className="bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-3xl p-8 text-white shadow-2xl shadow-indigo-200 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2.5 h-2.5 bg-rose-400 rounded-full animate-pulse"></div>
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-200">Live Attendance</p>
                        </div>
                        <h2 className="text-2xl font-black mb-1">Presensi Dibuka!</h2>
                        <p className="text-indigo-100 text-sm font-medium">Dosen kelas <strong className="text-white">{session.class_name}</strong> sedang membuka sesi presensi. Segera konfirmasi kehadiran Anda.</p>
                      </div>
                      <div className="flex flex-wrap gap-3 shrink-0">
                        <button onClick={() => submitAttendance(session.id, 'HADIR_LURING')} className="px-5 py-3 bg-white text-indigo-900 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-50 transition-all shadow-lg">Hadir Luring</button>
                        <button onClick={() => submitAttendance(session.id, 'HADIR_DARING')} className="px-5 py-3 bg-indigo-500/30 text-white border border-indigo-400 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-500/50 transition-all">Hadir Daring</button>
                        <button onClick={() => submitAttendance(session.id, 'IZIN')} className="px-5 py-3 bg-indigo-900/40 text-indigo-200 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-900/60 transition-all">Izin / Sakit</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Rapor Kehadiran */}
              <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-6">Rapor Kehadiran</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {mhsSummary.map(stat => (
                    <div key={stat.class_id} className="p-6 bg-slate-50 border border-slate-100 rounded-3xl">
                      <p className="font-bold text-slate-900 truncate mb-4">{stat.class_name}</p>
                      <div className="flex items-end gap-3">
                        <h3 className={`text-4xl font-black ${
                          stat.percentage >= 80 ? 'text-emerald-500' :
                          stat.percentage >= 50 ? 'text-amber-500' : 'text-rose-500'
                        }`}>{stat.percentage}%</h3>
                        <p className="text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-widest">Kehadiran</p>
                      </div>
                    </div>
                  ))}
                  {mhsSummary.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-3xl">
                       <CalendarCheck size={48} className="mx-auto mb-4 text-slate-200" />
                       <p className="font-bold">Belum ada data kelas.</p>
                       <p className="text-sm mt-1">Bergabunglah dengan kelas di menu Jelajahi.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      
      <RightSidebar userId={user?.id} />
    </div>
  );
}
