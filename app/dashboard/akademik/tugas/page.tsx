"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import RightSidebar from "@/components/RightSidebar";
import LoadingScreen from "@/components/LoadingScreen";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import DosenStatusBanner from "@/components/DosenStatusBanner";
import { bolehMengajar } from "@/lib/access";
import { 
  ChevronRight, FileText, Edit, Trash2, Plus, 
  Calendar, UploadCloud, User2, Clock, CheckCircle, X, Search
} from "lucide-react";
import { format, isPast, parseISO, isToday, isTomorrow } from "date-fns";
import { id } from "date-fns/locale";
import { toast } from "sonner";
import ConfirmModal from "@/components/ConfirmModal";

interface ClassData {
  id: string;
  class_name: string;
}

interface TaskData {
  id: string;
  user_id: string; 
  class_id: string;
  title: string;
  subject: string; 
  deadline: string;
  class?: { class_name: string }; 
}

export default function TugasPage() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState("MAHASISWA");
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [dosenClasses, setDosenClasses] = useState<ClassData[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // State Modal (Khusus Dosen)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskData | null>(null);
  const [form, setForm] = useState({
    title: "",
    class_id: "",
    deadline: "",
  });

  // State Submission (Mahasiswa)
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submittingTask, setSubmittingTask] = useState<TaskData | null>(null);
  const [submitForm, setSubmitForm] = useState({ note: "", file_url: "" });
  const [isUploading, setIsUploading] = useState(false);
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
  const [mySubmissions, setMySubmissions] = useState<string[]>([]);

  // State ConfirmModal
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; action: () => void; taskId: string; creatorId: string }>(
    { open: false, action: () => {}, taskId: "", creatorId: "" }
  );

  // --- FETCH DATA ---
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      const { data: { user } } = await db.auth.getUser();
      if (!user) { router.push("/login"); return; }
      
      setUser(user);
      const userRole = (user.user_metadata?.role || "MAHASISWA").toUpperCase();
      setRole(userRole);

      await fetchTasksAndClasses(user.id, userRole);
      await fetchSubmissions(user.id, userRole);
      setLoading(false);
    };
    initData();
  }, [router]);

  const fetchTasksAndClasses = async (userId: string, userRole: string) => {
    const taskQuery = db.from('tasks').select('*, class:classes(class_name)').order('deadline', { ascending: true });

    if (userRole === "DOSEN") {
      // Fetch dosen's classes
      const { data: classes } = await db.from('classes').select('id, class_name').eq('creator_user_id', userId);
      setDosenClasses(classes || []);
      // Dosen only sees their own tasks
      const { data } = await taskQuery.eq('user_id', userId);
      setTasks(data || []);
    } else {
      // Mahasiswa: Only fetch tasks for enrolled classes
      const { data: enrollments } = await db.from('enrollments').select('class_id').eq('user_id', userId);
      if (enrollments && enrollments.length > 0) {
        const classIds = enrollments.map((e: any) => e.class_id);
        const { data } = await taskQuery.in('class_id', classIds);
        setTasks(data || []);
      } else {
        setTasks([]);
      }
    }
  };

  const fetchSubmissions = async (userId: string, userRole: string) => {
    if (userRole === "DOSEN") {
      const { data } = await db.from('task_submissions').select('task_id');
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((s: any) => {
          counts[s.task_id] = (counts[s.task_id] || 0) + 1;
        });
        setSubmissionCounts(counts);
      }
    } else {
      const { data } = await db.from('task_submissions').select('task_id').eq('user_id', userId);
      if (data) setMySubmissions(data.map((s: any) => s.task_id));
    }
  };

  // --- CRUD HANDLERS (DOSEN) ---
  const handleOpenCreate = () => {
    if (!bolehMengajar(user)) return;
    setEditingTask(null);
    setForm({ title: "", class_id: dosenClasses.length > 0 ? dosenClasses[0].id : "", deadline: "" });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (task: TaskData) => {
    if (!bolehMengajar(user) || task.user_id !== user?.id) return;
    setEditingTask(task);
    const formattedDeadline = task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : "";
    setForm({
      title: task.title,
      class_id: task.class_id,
      deadline: formattedDeadline,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bolehMengajar(user)) return;

    if (!form.class_id) {
      toast.error("Harap pilih kelas terlebih dahulu!");
      return;
    }

    const isoDeadline = new Date(form.deadline).toISOString();
    const selectedClass = dosenClasses.find(c => c.id === form.class_id);

    if (editingTask) {
      const { error } = await db.from('tasks')
        .update({ 
          title: form.title, 
          class_id: form.class_id, 
          subject: selectedClass?.class_name, // Optional caching
          deadline: isoDeadline 
        })
        .eq('id', editingTask.id);
      
      if (!error) {
        setIsModalOpen(false);
        fetchTasksAndClasses(user.id, role);
        toast.success("Tugas berhasil diperbarui!");
      } else toast.error("Gagal update tugas");
    } else {
      const { error } = await db.from('tasks')
        .insert([{ 
          title: form.title, 
          class_id: form.class_id,
          subject: selectedClass?.class_name,
          deadline: isoDeadline, 
          user_id: user.id
        }]);
      
      if (!error) {
        setIsModalOpen(false);
        fetchTasksAndClasses(user.id, role);
        toast.success("Tugas berhasil dibuat!");
      } else toast.error("Gagal buat tugas");
    }
  };

  const handleDelete = async (id: string, creatorId: string) => {
    if (!bolehMengajar(user) || creatorId !== user?.id) return;
    setConfirmModal({
      open: true,
      taskId: id,
      creatorId: creatorId,
      action: async () => {
        const { error } = await db.from('tasks').delete().eq('id', id).eq('user_id', user.id);
        if (!error) {
          toast.success("Tugas berhasil dihapus");
          fetchTasksAndClasses(user.id, role);
        } else toast.error("Gagal menghapus tugas");
        setConfirmModal({ open: false, action: () => {}, taskId: "", creatorId: "" });
      }
    });
  };

  // --- SUBMISSION HANDLERS (MAHASISWA) ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    // Real upload to local API
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) {
         setSubmitForm({ ...submitForm, file_url: data.url });
         toast.success("File siap dilampirkan");
      } else {
         toast.error("Gagal upload file");
      }
    } catch (err) {
      toast.error("Error upload file");
    }
    setIsUploading(false);
  };

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingTask || role !== "MAHASISWA") return;

    const { error } = await db.from('task_submissions').insert([{
      task_id: submittingTask.id,
      user_id: user.id,
      user_name: user.user_metadata?.full_name,
      note: submitForm.note,
      file_url: submitForm.file_url
    }]);

    if (!error) {
      setIsSubmitModalOpen(false);
      setMySubmissions([...mySubmissions, submittingTask.id]);
      toast.success("Tugas berhasil dikumpulkan!");
    } else {
      toast.error("Gagal mengumpulkan tugas: " + error.message);
    }
  };

  // --- HELPERS ---
  const getDeadlineStatus = (deadlineStr: string) => {
    const deadline = parseISO(deadlineStr);
    if (isPast(deadline)) return { label: "Terlewat", color: "text-rose-600 bg-rose-50 border-rose-200" };
    if (isToday(deadline)) return { label: "Hari ini", color: "text-amber-600 bg-amber-50 border-amber-200" };
    if (isTomorrow(deadline)) return { label: "Besok", color: "text-indigo-600 bg-indigo-50 border-indigo-200" };
    return { label: format(deadline, "dd MMM", { locale: id }), color: "text-slate-600 bg-slate-50 border-slate-200" };
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

        <div className="p-4 sm:p-8 pb-24 md:pb-8 max-w-5xl mx-auto w-full overflow-y-auto h-full">
          <DosenStatusBanner user={user} className="mb-8" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <FileText size={28} />
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Tugas & Project</h1>
                <p className="text-slate-500 font-medium">Kelola penugasan dan evaluasi akademik.</p>
              </div>
            </div>
            {/* bolehMengajar(), bukan role === "DOSEN": dosen yang pengajuannya
                masih menunggu belum boleh membuat tugas. Alasannya dijelaskan
                oleh DosenStatusBanner di atas, bukan dibiarkan menebak. */}
            {bolehMengajar(user) && (
              <button
                onClick={handleOpenCreate}
                className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-xl hover:shadow-indigo-200"
              >
                <Plus size={18} /> Buat Tugas Baru
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4">
            {tasks.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center">
                <FileText size={48} className="text-slate-300 mb-4" strokeWidth={1.5} />
                <h3 className="text-xl font-black text-slate-700 mb-2">Belum Ada Tugas</h3>
                <p className="text-slate-400">
                  {role === "DOSEN" ? "Klik tombol 'Buat Tugas Baru' untuk mulai memberi penugasan." : "Belum ada tugas dari kelas yang Anda ikuti."}
                </p>
              </div>
            ) : (
              tasks.map((task) => {
                const status = getDeadlineStatus(task.deadline);
                const isSubmitted = role === "MAHASISWA" && mySubmissions.includes(task.id);

                return (
                  <div key={task.id} className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all group">
                    <div className="flex items-start gap-6">
                      <div className="hidden md:flex w-12 h-12 bg-slate-50 rounded-2xl border border-slate-100 items-center justify-center text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-colors">
                        <FileText size={24} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                            {task.class?.class_name || task.subject || 'Kelas Umum'}
                          </span>
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md border ${status.color}`}>
                            {status.label}
                          </span>
                          {isSubmitted && (
                             <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-md flex items-center gap-1">
                               <CheckCircle size={10} /> Selesai
                             </span>
                          )}
                        </div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight leading-tight mb-2">{task.title}</h3>
                        <div className="flex items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-wide">
                          <div className="flex items-center gap-1.5"><Calendar size={14} /> {format(parseISO(task.deadline), 'dd MMMM yyyy • HH:mm', { locale: id })}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                      {role === "DOSEN" ? (
                        <>
                          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl mr-2">
                            <User2 size={16} className="text-slate-400"/>
                            <span className="text-xs font-black text-slate-700">{submissionCounts[task.id] || 0} Terkumpul</span>
                          </div>
                          <button onClick={() => handleOpenEdit(task)} className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                            <Edit size={20} />
                          </button>
                          <button onClick={() => handleDelete(task.id, task.user_id)} className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                            <Trash2 size={20} />
                          </button>
                        </>
                      ) : (
                        <button 
                          disabled={isSubmitted}
                          onClick={() => {
                            if (!isSubmitted) {
                              setSubmittingTask(task);
                              setSubmitForm({ note: "", file_url: "" });
                              setIsSubmitModalOpen(true);
                            }
                          }}
                          className={`w-full md:w-auto px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                            isSubmitted 
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'
                          }`}
                        >
                          {isSubmitted ? 'Telah Dikumpulkan' : 'Kumpulkan Tugas'}
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
      
      <RightSidebar userId={user?.id} />

      {/* Modal Form Tugas (Dosen) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-900"><X size={24} /></button>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-6">
              {editingTask ? "Edit Tugas" : "Buat Tugas Baru"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Judul Tugas</label>
                <input required type="text" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Misal: Makalah Akhir Semester" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Pilih Kelas</label>
                <select required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  value={form.class_id} onChange={e => setForm({...form, class_id: e.target.value})}>
                  <option value="" disabled>-- Pilih Kelas --</option>
                  {dosenClasses.map(c => (
                    <option key={c.id} value={c.id}>{c.class_name}</option>
                  ))}
                </select>
                {dosenClasses.length === 0 && (
                   <p className="text-[10px] text-rose-500 mt-1 font-bold">Anda belum membuat kelas. Buat kelas di menu Kelasku dulu.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Tenggat Waktu (Deadline)</label>
                <input required type="datetime-local" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})} />
              </div>
              <button disabled={dosenClasses.length === 0} type="submit" className="w-full py-4 mt-4 bg-indigo-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50">
                {editingTask ? "Simpan Perubahan" : "Publikasikan Tugas"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Kumpulkan Tugas (Mahasiswa) */}
      {isSubmitModalOpen && submittingTask && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button onClick={() => setIsSubmitModalOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-900"><X size={24} /></button>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Kumpulkan Tugas</h2>
            <p className="text-sm font-bold text-indigo-600 mb-6">{submittingTask.title}</p>
            
            <form onSubmit={handleSubmitTask} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Catatan Tambahan</label>
                <textarea rows={3} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-indigo-600 resize-none"
                  value={submitForm.note} onChange={e => setSubmitForm({...submitForm, note: e.target.value})} placeholder="Pesan untuk dosen..." />
              </div>
              
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Lampiran File (PDF/ZIP)</label>
                <div className="relative group cursor-pointer border-2 border-dashed border-slate-300 rounded-xl p-8 hover:bg-indigo-50 hover:border-indigo-400 transition-all text-center">
                  <input type="file" onChange={handleFileUpload} disabled={isUploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <UploadCloud size={32} className={`mx-auto mb-3 ${isUploading ? 'text-indigo-400 animate-bounce' : 'text-slate-400 group-hover:text-indigo-500'}`} />
                  <p className="text-sm font-bold text-slate-700">
                    {isUploading ? "Mengunggah..." : submitForm.file_url ? "File Berhasil Dilampirkan!" : "Klik atau seret file ke sini"}
                  </p>
                  {submitForm.file_url && <p className="text-xs text-emerald-600 mt-1 font-bold">Siap dikirim</p>}
                </div>
              </div>

              <button type="submit" disabled={!submitForm.file_url || isUploading} className="w-full py-4 mt-4 bg-indigo-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                Kumpulkan Sekarang
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal 
        isOpen={confirmModal.open}
        title="Hapus Tugas?"
        message="Apakah Anda yakin ingin menghapus tugas ini? Data yang sudah dikumpulkan mahasiswa juga akan hilang."
        confirmLabel="Ya, Hapus"
        cancelLabel="Batal"
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal({ ...confirmModal, open: false })}
      />
    </div>
  );
}