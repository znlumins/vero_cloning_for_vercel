"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import RightSidebar from "@/components/RightSidebar";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import LoadingScreen from "@/components/LoadingScreen";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import {
  Bell, BellOff, Check, CheckCheck,
  BookOpen, FileText, MessageSquare, Info, Trash2
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import ConfirmModal from "@/components/ConfirmModal";

interface NotificationData {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  class: <BookOpen size={20} />,
  task: <FileText size={20} />,
  message: <MessageSquare size={20} />,
  info: <Info size={20} />,
};

const COLOR_MAP: Record<string, string> = {
  class: "bg-indigo-100 text-indigo-600",
  task: "bg-amber-100 text-amber-600",
  message: "bg-green-100 text-green-600",
  info: "bg-slate-100 text-slate-500",
};

export default function NotificationsPage() {
  const [user, setUser] = useState<any>(null);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean; action: () => void;
  }>({ open: false, action: () => {} });
  const router = useRouter();

  const fetchNotifications = async (userId: string) => {
    const { data, error } = await db
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error) setNotifications(data || []);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await db.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);
      await fetchNotifications(user.id);
      setLoading(false);
    };
    init();
  }, [router]);

  const markAsRead = async (notifId: string) => {
    await db.from("notifications").update({ is_read: true }).eq("id", notifId);
    setNotifications(prev =>
      prev.map(n => n.id === notifId ? { ...n, is_read: true } : n)
    );
  };

  const markAllAsRead = async () => {
    if (!user) return;
    await db.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    toast.success("Semua notifikasi ditandai sudah dibaca");
  };

  const deleteAll = async () => {
    if (!user) return;
    await db.from("notifications").delete().eq("user_id", user.id);
    setNotifications([]);
    setConfirmModal({ open: false, action: () => {} });
    toast.success("Semua notifikasi dihapus");
  };

  const handleNotificationClick = (notif: NotificationData) => {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.link) router.push(notif.link);
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) return <LoadingScreen />;
  if (!user) return <LoadingScreen />;

  return (
    <div className="flex min-h-screen bg-white text-slate-900 antialiased overflow-hidden font-sans">
      <Sidebar role={user.user_metadata?.role} userName={user.user_metadata?.full_name} />

      <main className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden pb-20 lg:pb-0">
        <header className="h-16 border-b border-slate-100 pl-16 pr-4 md:pr-10 lg:pl-10 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          {/* Remah-remah jejak ("Beranda › Notifikasi") DIHAPUS. Sidebar kiri
              sudah menandai halaman aktif, jadi remah-remah hanya mengulang
              informasi yang sama sambil merebut lebar header — dan ia toh sudah
              disembunyikan di bawah xl karena tidak muat. */}
          <div className="flex items-center gap-6 min-w-0">
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Teks tombol disembunyikan di layar sempit, ikonnya tetap.
                `title` dipertahankan supaya maksudnya tidak hilang. */}
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                title="Tandai semua sudah dibaca"
                className="px-2.5 sm:px-4 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all flex items-center gap-2 shrink-0"
              >
                <CheckCheck size={14} />
                <span className="hidden md:inline">Tandai Semua Dibaca</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={() => setConfirmModal({ open: true, action: deleteAll })}
                title="Hapus semua notifikasi"
                className="px-2.5 sm:px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-all flex items-center gap-2 shrink-0"
              >
                <Trash2 size={14} />
                <span className="hidden md:inline">Hapus Semua</span>
              </button>
            )}
            <NotificationBell />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-10 pb-24 lg:pb-10 space-y-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight uppercase">
              Notifikasi
            </h1>
            <p className="text-slate-500 font-medium mt-2">
              {unreadCount > 0
                ? `${unreadCount} notifikasi belum dibaca`
                : "Semua notifikasi sudah dibaca"}
            </p>
          </div>

          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-8 md:p-16 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400">
              <BellOff size={48} strokeWidth={1} className="mb-4 text-slate-300" />
              <p className="font-bold text-lg">Belum ada notifikasi</p>
              <p className="text-sm mt-2">
                Notifikasi akan muncul saat ada aktivitas baru di kelas atau tugas Anda.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`w-full text-left p-4 sm:p-5 rounded-2xl border transition-all hover:shadow-md group flex items-start gap-3 sm:gap-4 ${
                    notif.is_read
                      ? "bg-white border-slate-100 hover:border-slate-200"
                      : "bg-indigo-50/50 border-indigo-100 hover:border-indigo-200"
                  }`}
                >
                  <div className={`p-3 rounded-xl shrink-0 ${COLOR_MAP[notif.type] || COLOR_MAP.info}`}>
                    {ICON_MAP[notif.type] || ICON_MAP.info}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {!notif.is_read && (
                        <div className="w-2 h-2 bg-indigo-600 rounded-full shrink-0" />
                      )}
                      <h3 className={`font-bold text-sm truncate ${
                        notif.is_read ? "text-slate-700" : "text-slate-900"
                      }`}>
                        {notif.title}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 font-medium line-clamp-2">
                      {notif.body}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase tracking-wider">
                      {notif.created_at && !isNaN(new Date(notif.created_at).getTime())
                        ? format(new Date(notif.created_at), "dd MMM yyyy, HH:mm", { locale: id })
                        : ""}
                    </p>
                  </div>

                  {!notif.is_read && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(notif.id);
                      }}
                      /* Perangkat sentuh tidak punya hover, jadi `opacity-0`
                         tanpa syarat membuat tombol ini MUSTAHIL dilihat maupun
                         ditekan di ponsel — satu-satunya cara menandai satu
                         notifikasi hilang sama sekali di sana. Selalu tampak di
                         bawah lg; perilaku muncul-saat-hover dipertahankan hanya
                         untuk desktop yang memang punya penunjuk. */
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all shrink-0"
                      title="Tandai sudah dibaca"
                    >
                      <Check size={16} />
                    </button>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      <ConfirmModal
        isOpen={confirmModal.open}
        title="Hapus Semua Notifikasi?"
        message="Semua notifikasi akan dihapus secara permanen dan tidak dapat dikembalikan."
        confirmLabel="Ya, Hapus Semua"
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal({ open: false, action: () => {} })}
      />
    </div>
  );
}
