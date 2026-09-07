"use client";
import { useState, useRef, useEffect } from "react";
import { Bell, Info, Calendar, MessageSquare, CheckCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { db } from "@/lib/db";
import Link from "next/link";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // 1. Ambil data awal & dengerin perubahan Real-time
  useEffect(() => {
    // Store channel reference outside async for proper cleanup
    let channelRef: ReturnType<typeof db.channel> | null = null;

    const fetchAndSubscribe = async () => {
      const { data: { user } } = await db.auth.getUser();
      if (!user) return;

      // Ambil notifikasi dari database
      const { data } = await db
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      setNotifications(data || []);

      // Subscribe ke perubahan Real-time
      const channel = db
        .channel("realtime-notifications")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const newNotif = payload.new as Notification;
              if (newNotif && newNotif.id && newNotif.title) {
                setNotifications((prev) => [newNotif, ...prev]);
              }
            } else if (payload.eventType === "UPDATE") {
              setNotifications((prev) =>
                prev.map((n) => (n.id === payload.new.id ? (payload.new as Notification) : n))
              );
            }
          }
        )
        .subscribe();

      channelRef = channel;
    };

    fetchAndSubscribe();

    // Return cleanup to React so the subscription is properly unsubscribed on unmount
    return () => {
      if (channelRef) db.removeChannel(channelRef);
    };
  }, []);

  // 2. Fungsi Tandai Semua Dibaca
  const markAllAsRead = async () => {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

    await db
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    // Update state lokal biar instan
    setNotifications(notifications.map((n) => ({ ...n, is_read: true })));
  };

  // 3. Menutup dropdown jika klik di luar
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case "class": return <Calendar size={16} className="text-indigo-600" />;
      case "task": return <Calendar size={16} className="text-amber-600" />;
      case "message": return <MessageSquare size={16} className="text-emerald-600" />;
      default: return <Info size={16} className="text-slate-500" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2.5 rounded-xl transition-all duration-200 ${
          isOpen ? "bg-indigo-50 text-indigo-600 ring-2 ring-indigo-100" : "text-slate-400 hover:bg-slate-50 hover:text-slate-900"
        }`}
      >
        <Bell size={20} strokeWidth={2.5} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black flex items-center justify-center rounded-full border-2 border-white shadow-sm">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-3 w-80 md:w-96 bg-white border border-slate-200 shadow-md rounded-2xl overflow-hidden z-50 origin-top-right"
          >
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Notifikasi</h3>
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="text-[10px] font-bold text-indigo-600 hover:underline uppercase">
                  Tandai dibaca
                </button>
              )}
            </div>

            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              {notifications.length > 0 ? (
                notifications.map((notif) => (
                  <div key={notif.id} className={`p-4 border-b border-slate-50 flex gap-4 transition-colors ${!notif.is_read ? "bg-indigo-50/30" : "hover:bg-slate-50"}`}>
                    <div className={`mt-1 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${!notif.is_read ? "bg-white shadow-sm" : "bg-slate-100"}`}>
                      {getIcon(notif.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <h4 className={`text-sm leading-tight mb-1 ${!notif.is_read ? "font-bold text-slate-900" : "text-slate-600"}`}>{notif.title}</h4>
                        {!notif.is_read && <span className="w-2 h-2 bg-indigo-600 rounded-full mt-1" />}
                      </div>
                      <p className="text-xs text-slate-500 mb-2">{notif.body}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        {notif.created_at && !isNaN(new Date(notif.created_at).getTime())
                          ? format(new Date(notif.created_at), "HH:mm • dd MMM")
                          : format(new Date(), "HH:mm • dd MMM")}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-10 text-center text-slate-400 ">Tidak ada notifikasi</div>
              )}
            </div>
            <Link href="/dashboard/notifications" className="block p-4 text-center text-xs font-black text-slate-900 uppercase bg-slate-50 hover:bg-slate-100 border-t">
              Lihat Semua Aktivitas
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}