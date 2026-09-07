"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import RightSidebar from "@/components/RightSidebar";
import LoadingScreen from "@/components/LoadingScreen";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import { 
  ChevronRight, Archive, FileText, Download, Edit, Trash2, Plus, 
  File, Video, MonitorPlay, Link as LinkIcon 
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import { toast } from "sonner";
import ConfirmModal from "@/components/ConfirmModal";

interface ArchiveData {
  id: string;
  user_id: string;
  title: string;
  file_url: string;
  file_type: string;
  description: string;
  created_at: string;
}

export default function ArsipPage() {
  const [user, setUser] = useState<any>(null);
  const [archives, setArchives] = useState<ArchiveData[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // State Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ArchiveData | null>(null);
  const [form, setForm] = useState({ title: "", file_url: "", file_type: "PDF", description: "" });

  // --- FETCH DATA ---
  const fetchArchives = async () => {
    // Ambil SEMUA data arsip (public repository concept)
    const { data, error } = await db
      .from('archive_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) console.error("Error fetching archives:", error);
    else setArchives(data || []);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await db.auth.getUser();
      if (!user) { router.push("/login"); return; }
      
      setUser(user);
      await fetchArchives();
      setLoading(false);
    };
    init();
  }, [router]);

  // --- CRUD HANDLERS (HANYA DOSEN) ---
  const handleOpenCreate = () => {
    if (user?.user_metadata?.role !== "DOSEN") return;
    setEditingItem(null);
    setForm({ title: "", file_url: "", file_type: "PDF", description: "" });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: ArchiveData) => {
    // Dosen hanya bisa edit punya sendiri
    if (user?.user_metadata?.role !== "DOSEN" || item.user_id !== user.id) {
      toast.error("Anda hanya bisa mengedit materi yang Anda upload sendiri.");
      return;
    }
    setEditingItem(item);
    setForm({ 
      title: item.title, 
      file_url: item.file_url || "", 
      file_type: item.file_type, 
      description: item.description || "" 
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.user_metadata.role !== "DOSEN") return;

    if (editingItem) {
      // UPDATE
      const { error } = await db
        .from('archive_items')
        .update(form)
        .eq('id', editingItem.id)
        .eq('user_id', user.id); // Security check
      
      if (!error) { setIsModalOpen(false); fetchArchives(); toast.success("Materi diperbarui!"); }
      else toast.error(error.message);
    } else {
      // CREATE
      const { error } = await db
        .from('archive_items')
        .insert([{ ...form, user_id: user.id }]);
      
      if (!error) { setIsModalOpen(false); fetchArchives(); toast.success("Materi berhasil diupload!"); }
      else toast.error(error.message);
    }
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (id: string, creatorId: string) => {
    if (user?.user_metadata?.role !== "DOSEN" || creatorId !== user.id) return;
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    const { error } = await db
      .from('archive_items')
      .delete()
      .eq('id', confirmDeleteId)
      .eq('user_id', user.id);
    
    if (!error) { fetchArchives(); toast.success("Materi dihapus."); }
    else toast.error(error.message);
    setConfirmDeleteId(null);
  };

  // Helper untuk Icon File
  const getFileIcon = (type: string) => {
    switch (type) {
      case "PDF": return <FileText size={24} />;
      case "PPT": return <MonitorPlay size={24} />;
      case "VIDEO": return <Video size={24} />;
      case "LINK": return <LinkIcon size={24} />;
      default: return <File size={24} />;
    }
  };

  if (loading) return <LoadingScreen />;
  if (!user) return <LoadingScreen />;

  const isDosen = user.user_metadata?.role === "DOSEN";

  return (
    <div className="flex min-h-screen bg-white text-slate-900 antialiased overflow-hidden">
      <Sidebar role={user.user_metadata.role} userName={user.user_metadata.full_name} />
      
      <main className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden pb-20 lg:pb-0">
        {/* Header */}
        <header className="h-16 border-b border-slate-100 pl-16 pr-4 md:pr-10 lg:pl-10 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <GlobalSearch />
          <NotificationBell />
        </header>
        
        {/* Konten Utama */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-24 lg:pb-10 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase ">Arsip Digital</h1>
              <p className="text-slate-500 font-medium mt-2 max-w-xl">
                Kumpulan dokumen, materi kuliah, dan referensi belajar dari seluruh mata kuliah.
              </p>
            </div>
            {isDosen && (
              <button 
                onClick={handleOpenCreate} 
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-indigo-200 transition-all shrink-0"
              >
                <Plus size={18} strokeWidth={3} /> UPLOAD MATERI BARU
              </button>
            )}
          </div>

          <div className="space-y-4">
            {archives.length === 0 ? (
              <div className="p-12 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400">
                <Archive size={48} className="mx-auto mb-4 text-slate-300" strokeWidth={1.5} />
                <p className="font-bold text-lg">Belum ada materi diunggah.</p>
              </div>
            ) : (
              archives.map((item) => (
                <div key={item.id} className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-600 hover:shadow-md transition-all">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    
                    {/* Info File */}
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        item.file_type === 'PDF' ? 'bg-red-50 text-red-600' :
                        item.file_type === 'PPT' ? 'bg-orange-50 text-orange-600' :
                        item.file_type === 'VIDEO' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-600'
                      }`}>
                        {getFileIcon(item.file_type)}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {item.title}
                        </h3>
                        <div className="flex items-center gap-3 mt-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          <span className="bg-slate-100 px-2 py-0.5 rounded">{item.file_type}</span>
                          <span>•</span>
                          <span>{item.created_at && !isNaN(new Date(item.created_at).getTime()) ? format(parseISO(item.created_at), 'dd MMM yyyy', { locale: id }) : '-'}</span>
                        </div>
                        {item.description && <p className="text-sm text-slate-500 mt-2 line-clamp-2">{item.description}</p>}
                      </div>
                    </div>

                    {/* Tombol Aksi */}
                    <div className="flex items-center gap-3 self-end md:self-center">
                      {item.file_url && (
                        <a 
                          href={item.file_url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-indigo-600 transition-colors shadow-md"
                        >
                          <Download size={16} /> Unduh
                        </a>
                      )}
                      
                      {/* Edit/Hapus hanya untuk Dosen Pemilik */}
                      {isDosen && item.user_id === user.id && (
                        <div className="flex gap-2 border-l border-slate-100 pl-3 ml-1">
                          <button onClick={() => handleOpenEdit(item)} className="p-2 bg-slate-50 hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors">
                            <Edit size={16}/>
                          </button>
                          <button onClick={() => handleDelete(item.id, item.user_id)} className="p-2 bg-slate-50 hover:bg-red-100 text-slate-400 hover:text-red-600 rounded-lg transition-colors">
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <RightSidebar userId={user.id} />

      {/* --- MODAL FORM --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
            <h2 className="text-2xl font-black text-slate-900 mb-6 tracking-tight">
              {editingItem ? "Edit Materi" : "Upload Materi Baru"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Judul Dokumen</label>
                <input 
                  placeholder="Contoh: Modul Pertemuan 1" 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900" 
                  value={form.title} 
                  onChange={e => setForm({...form, title: e.target.value})} 
                  required 
                />
              </div>
              
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Link File (URL)</label>
                <input 
                  placeholder="https://drive.google.com/..." 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium" 
                  value={form.file_url} 
                  onChange={e => setForm({...form, file_url: e.target.value})} 
                />
                <p className="text-[10px] text-slate-400 mt-1 ">*Masukkan link Google Drive, Dropbox, atau direct link PDF.</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Tipe File</label>
                <select 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer"
                  value={form.file_type} 
                  onChange={e => setForm({...form, file_type: e.target.value})}
                >
                  <option value="PDF">PDF Dokumen</option>
                  <option value="PPT">Presentasi (PPT)</option>
                  <option value="DOC">Word Document</option>
                  <option value="VIDEO">Video / Rekaman</option>
                  <option value="LINK">Link Website</option>
                  <option value="OTHER">Lainnya</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Deskripsi</label>
                <textarea 
                  placeholder="Keterangan tambahan..." 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium resize-none h-24"
                  value={form.description} 
                  onChange={e => setForm({...form, description: e.target.value})} 
                />
              </div>
              
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Batal</button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all">Simpan Materi</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        title="Hapus Materi?"
        message="Materi arsip ini akan dihapus secara permanen dan tidak dapat dikembalikan."
        confirmLabel="Ya, Hapus"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

// Icon Helper Component (agar tidak error)
const PresentationIcon = ({ size }: { size: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>
);