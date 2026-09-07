"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid, Box, Users, MessagesSquare, Settings, LogOut,
  ChevronLeft, ChevronRight, Languages, PenTool, Mic, Presentation,
  Compass, MonitorPlay, FileText, Archive, CalendarCheck, Menu, X, ShieldCheck,
  BarChart3, GraduationCap, School, UserCog
} from "lucide-react";
import { db } from "@/lib/db";
import { signOut as nextAuthSignOut } from "next-auth/react";
import {
  bacaMode, simpanMode, ruteMilikAdmin, rutaBagian,
  BERANDA_ADMIN, BERANDA_PENGGUNA, PERISTIWA_MODE,
  type ModeTampilan,
} from "@/lib/adminMode";


// Menus defined statically outside the component to preserve reference integrity

// Menu Mode Admin. Menggantikan baris tab horizontal yang dulu ada di dalam
// halaman panel admin — lihat alasannya di app/dashboard/admin/[bagian]/page.tsx.
const adminMenu = [
  { name: "Ringkasan", href: rutaBagian("ringkasan"), icon: BarChart3 },
  { name: "Pengguna", href: rutaBagian("pengguna"), icon: Users },
  { name: "Dosen", href: rutaBagian("dosen"), icon: GraduationCap },
  { name: "Kelas", href: rutaBagian("kelas"), icon: School },
];
const studioSubMenu = [
  { name: "Translate Gesture", href: "/dashboard/studio/translate", icon: Languages, desc: "Penerjemah Bahasa Isyarat AI (BISINDO/SIBI)" },
  { name: "Whiteboard", href: "/dashboard/studio/whiteboard", icon: PenTool, desc: "Papan Tulis Visual Komunikasi" },
  { name: "Speech to Text", href: "/dashboard/studio/speech", icon: Mic, desc: "Ubah Suara ke Teks Real-time (Bantu Dengar)" },
  { name: "Presentasi", href: "/dashboard/studio/presentasi", icon: Presentation, desc: "Presentasi Interaktif dengan Isyarat Tangan" },
];

const mhsAkademikMenu = [
  { name: "Jelajahi", href: "/dashboard/akademik/jelajahi", icon: Compass, color: "text-red-500" },
  { name: "Kelasku", href: "/dashboard/akademik/kelasku", icon: MonitorPlay, color: "text-slate-700" },
  { name: "Absensi", href: "/dashboard/akademik/absensi", icon: CalendarCheck, color: "text-slate-700" },
  { name: "Tugas & Project", href: "/dashboard/akademik/tugas", icon: FileText, color: "text-slate-700" },
  { name: "Arsip Belajar", href: "/dashboard/akademik/arsip", icon: Archive, color: "text-slate-700" },
];

interface SidebarProps {
  role: string;
  userName: string;
}

/**
 * Pemilih Mode Admin / Mode Pengguna.
 *
 * Dibuat sebagai dua <button> di dalam satu grup ber-`role="group"`, BUKAN
 * sebagai sakelar geser. Sakelar hanya punya dua keadaan "nyala/mati" yang tidak
 * menyebut namanya sendiri; di sini keduanya adalah pilihan setara yang
 * masing-masing perlu punya label. Bentuk ini juga otomatis bisa di-Tab dan
 * ditekan Enter/Spasi tanpa penanganan keyboard tambahan.
 *
 * Keadaan aktif dibawa `aria-pressed` DAN — saat tidak terlipat — oleh teks
 * yang menebal, jadi tidak pernah bergantung pada warna saja.
 */
function PemilihMode({
  mode, ciut, onGanti,
}: {
  mode: ModeTampilan;
  ciut: boolean;
  onGanti: (m: ModeTampilan) => void;
}) {
  const pilihan: { id: ModeTampilan; label: string; ikon: typeof ShieldCheck }[] = [
    { id: "admin", label: "Mode Admin", ikon: ShieldCheck },
    { id: "pengguna", label: "Mode Pengguna", ikon: UserCog },
  ];

  return (
    <div
      role="group"
      aria-label="Mode tampilan"
      className={`mb-6 ${ciut ? "space-y-1.5" : "p-1 bg-slate-100 rounded-2xl flex gap-1"}`}
    >
      {pilihan.map((p) => {
        const aktif = mode === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onGanti(p.id)}
            aria-pressed={aktif}
            title={p.label}
            className={
              ciut
                ? `w-full h-10 rounded-xl flex items-center justify-center transition-all ${
                    aktif
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                  }`
                : `flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[11px] transition-all ${
                    aktif
                      ? "bg-white text-emerald-700 font-black shadow-sm"
                      : "text-slate-500 font-semibold hover:text-slate-700"
                  }`
            }
          >
            <p.ikon size={ciut ? 18 : 13} strokeWidth={aktif ? 2.5 : 2} />
            {!ciut && <span className="truncate">{p.id === "admin" ? "Admin" : "Pengguna"}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isAkademikOpen, setIsAkademikOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // Laci menu untuk layar < lg. Sidebar desktop disembunyikan di sana, dan
  // bottom-nav hanya memuat 5 tautan teratas — submenu Studio & Akademik sama
  // sekali tidak bisa dijangkau tanpa laci ini.
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // --- MODE TAMPILAN (khusus akun ADMIN) ---
  //
  // Nilai awalnya SELALU "pengguna", bukan hasil bacaMode(). localStorage tidak
  // ada saat render di server, jadi membacanya di useState akan membuat markup
  // server berbeda dari markup klien — dan React akan mengeluh soal hidrasi.
  // Nilai sebenarnya dipasang di effect di bawah, setelah komponen hidup.
  const [mode, setMode] = useState<ModeTampilan>("pengguna");
  const bolehModeAdmin = role === "ADMIN";
  // Route panel admin SELALU berarti Mode Admin, apa pun isi localStorage —
  // supaya sidebar tidak pernah berselisih dengan isi halaman.
  const modeEfektif: ModeTampilan =
    bolehModeAdmin && (ruteMilikAdmin(pathname) || mode === "admin") ? "admin" : "pengguna";

  useEffect(() => {
    if (!bolehModeAdmin) return;
    const segarkan = () => setMode(bacaMode());
    segarkan();
    // Halaman panel admin ikut menulis mode saat dibuka lewat tautan langsung;
    // peristiwa ini yang membuat sidebar tahu tanpa perlu dimuat ulang.
    window.addEventListener(PERISTIWA_MODE, segarkan);
    return () => window.removeEventListener(PERISTIWA_MODE, segarkan);
  }, [bolehModeAdmin]);

  const gantiMode = (tujuan: ModeTampilan) => {
    if (tujuan === modeEfektif) return;
    setMode(tujuan);
    simpanMode(tujuan);
    setIsDrawerOpen(false);
    // Pindah mode = pindah halaman, bukan sekadar mengganti menu. Kalau hanya
    // menunya yang berubah, admin akan berdiri di halaman panel admin sambil
    // melihat sidebar pengguna — dan menyegarkan halaman akan mengembalikannya
    // ke mode yang sudah ia tinggalkan.
    router.push(tujuan === "admin" ? BERANDA_ADMIN : BERANDA_PENGGUNA);
  };

  useEffect(() => {
    const fetchUserAvatar = async () => {
      try {
        const { data: { user } } = await db.auth.getUser();
        if (user && user.user_metadata?.avatar_url) {
          setAvatarUrl(user.user_metadata.avatar_url);
        }
      } catch (err) {
        console.error("Error fetching avatar in Sidebar:", err);
      }
    };
    fetchUserAvatar();

    if (typeof window !== "undefined") {
      window.addEventListener("avatar-updated", fetchUserAvatar);
      return () => window.removeEventListener("avatar-updated", fetchUserAvatar);
    }
  }, []);

  const akademikSubMenu = useMemo(() => {
    return role === "DOSEN" 
      ? mhsAkademikMenu.filter(m => m.name !== "Jelajahi") 
      : mhsAkademikMenu;
  }, [role]);

  // Auto-expand/collapse active submenus purely when page pathname changes
  useEffect(() => {
    if (isCollapsed) return;

    const isActiveInStudio = studioSubMenu.some(item => pathname.startsWith(item.href));
    const isActiveInAkademik = akademikSubMenu.some(item => pathname.startsWith(item.href));

    setTimeout(() => {
      if (isActiveInStudio) {
        setIsStudioOpen(true);
        setIsAkademikOpen(false);
      } else if (isActiveInAkademik) {
        setIsAkademikOpen(true);
        setIsStudioOpen(false);
      } else {
        setIsStudioOpen(false);
        setIsAkademikOpen(false);
      }
    }, 0);
  }, [pathname, isCollapsed, akademikSubMenu]);

  // Laci ditutup lewat onClick di setiap tautannya, BUKAN lewat effect yang
  // mengawasi pathname: menutup di effect berarti satu render tambahan tiap kali
  // halaman berganti, termasuk saat laci memang sudah tertutup.

  // Escape menutup laci, dan selama laci terbuka halaman di belakangnya dikunci
  // agar sentuhan menggulir tidak menembus ke konten di baliknya.
  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsDrawerOpen(false);
    };
    const sebelumnya = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = sebelumnya;
      window.removeEventListener("keydown", onKey);
    };
  }, [isDrawerOpen]);

  const handleLogout = async () => {
    await db.auth.signOut();
    // Also clear the NextAuth (Google) session cookie so Google logins fully sign out.
    // redirect:false — we handle navigation ourselves below.
    try {
      await nextAuthSignOut({ redirect: false });
    } catch {
      // NextAuth session may not exist for email/password users; ignore.
    }
    router.push("/login");
  };

  const menuClass = (path: string) => `
    flex items-center gap-4 p-3 rounded-xl text-sm font-semibold transition-all duration-200
    ${pathname === path || (!isCollapsed && path !== "/dashboard" && pathname.startsWith(path)) 
      ? "bg-indigo-600 text-white shadow-sm" 
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}
    ${isCollapsed ? "justify-center" : ""}
  `;

  // Gaya satu baris menu di dalam laci. Terpisah dari menuClass() milik sidebar
  // desktop karena laci tidak punya keadaan "ciut", dan status aktifnya dihitung
  // di tempat pemanggilan (sebagian cocok persis, sebagian cukup awalan path).
  const drawerItemClass = (path: string, aktif: boolean) => `
    flex items-center gap-3 p-3 rounded-xl text-sm font-semibold transition-all
    ${aktif ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}
  `;

  // Manual toggle functions do not trigger infinite rendering resets
  const toggleStudio = () => {
    if (isCollapsed) setIsCollapsed(false);
    
    if (!isStudioOpen && isAkademikOpen) {
      setIsAkademikOpen(false);
    }
    setIsStudioOpen(!isStudioOpen);
  };

  const toggleAkademik = () => {
    if (isCollapsed) setIsCollapsed(false);
    
    if (!isAkademikOpen && isStudioOpen) {
      setIsStudioOpen(false);
    }
    setIsAkademikOpen(!isAkademikOpen);
  };

  const handleToggleCollapse = () => {
    const nextCollapsed = !isCollapsed;
    setIsCollapsed(nextCollapsed);
    if (nextCollapsed) {
      setIsStudioOpen(false);
      setIsAkademikOpen(false);
    } else {
      const isActiveInStudio = studioSubMenu.some(item => pathname.startsWith(item.href));
      const isActiveInAkademik = akademikSubMenu.some(item => pathname.startsWith(item.href));
      if (isActiveInStudio) setIsStudioOpen(true);
      if (isActiveInAkademik) setIsAkademikOpen(true);
    }
  };

  const userInitial = userName?.charAt(0)?.toUpperCase() || 'U';
  const roleInitial = role?.charAt(0)?.toUpperCase() || 'R';

  return (
    <>
    <aside 
      className={`hidden lg:flex relative min-h-screen bg-white border-r border-slate-100 flex-col p-6 transition-all duration-300 ease-in-out ${isCollapsed ? "w-24" : "w-72"} shrink-0 z-20 shadow-sm`}
    >
      {/* Collapse Toggle Button */}
      <button 
        onClick={handleToggleCollapse}
        className="absolute -right-4 top-12 w-8 h-8 bg-white rounded-full flex items-center justify-center border border-slate-200 shadow-sm hover:shadow-md hover:scale-110 transition-all z-30"
        aria-label={isCollapsed ? "Perlebar Sidebar" : "Ciutkan Sidebar"}
        title={isCollapsed ? "Perlebar Sidebar" : "Ciutkan Sidebar"}
      >
        <ChevronLeft size={16} className={`text-slate-600 transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`} />
      </button>

      {/* Brand Logo */}
      <div className={`flex items-center mb-10 transition-all duration-300 ${isCollapsed ? "justify-center" : "px-2"}`}>
        <Link href="/dashboard" className="relative">
          <Image
            src="/vero-logo.svg" 
            alt="VeroApp Logo"
            width={isCollapsed ? 45 : 130} 
            height={40}
            priority
            style={{ height: "auto" }}
            className="transition-all duration-300 object-contain"
          />
        </Link>
      </div>

      {/* User Badge */}
      <div className={`mb-6 p-3 bg-slate-50 rounded-2xl border border-slate-100 transition-all duration-300 ${isCollapsed ? "flex flex-col items-center justify-center py-4" : ""}`}>
        {isCollapsed ? (
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold leading-none mb-1 overflow-hidden relative shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" onError={() => setAvatarUrl(null)} />
              ) : (
                userInitial
              )}
            </div>
            <p className="text-[9px] font-bold text-slate-800 leading-none">{roleInitial}</p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden relative">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" onError={() => setAvatarUrl(null)} />
              ) : (
                userInitial
              )}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-800 truncate">{userName}</p>
              <p className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md inline-block mt-0.5">
                {role}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Pemilih mode — hanya untuk akun ADMIN, dan diletakkan tepat di bawah
          kartu identitas karena keduanya menjawab pertanyaan yang sama:
          "sekarang saya siapa, dan sedang melihat apa?" */}
      {bolehModeAdmin && (
        <PemilihMode mode={modeEfektif} ciut={isCollapsed} onGanti={gantiMode} />
      )}

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1.5 overflow-y-auto no-scrollbar">
        {modeEfektif === "admin" ? (
          /* MODE ADMIN — menu vertikal biasa, gayanya sama persis dengan menu
             mode pengguna supaya perpindahan mode tidak terasa seperti pindah
             aplikasi. */
          adminMenu.map((m) => (
            <Link key={m.href} href={m.href} className={menuClass(m.href)} title={m.name}>
              <m.icon size={20} strokeWidth={2} />
              {!isCollapsed && <span>{m.name}</span>}
            </Link>
          ))
        ) : (
        <>
        <Link href="/dashboard" className={menuClass("/dashboard")} title="Beranda (Halaman Utama)">
          <LayoutGrid size={20} strokeWidth={2} />
          {!isCollapsed && <span>Beranda</span>}
        </Link>

        {/* Dropdown Studio */}
        <div>
          <button 
            onClick={toggleStudio} 
            title="Studio Pembelajaran Aksesibilitas (Bantu Dengar/Bicara)"
            className={`w-full flex items-center ${isCollapsed ? "justify-center" : "justify-between"} p-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-xl transition-all`}
          >
            <div className="flex items-center gap-4">
              <Box size={20} strokeWidth={2} /> 
              {!isCollapsed && <span>Studio</span>}
            </div>
            {!isCollapsed && (
              <ChevronRight size={14} className={`transition-transform duration-200 ${isStudioOpen ? "rotate-90" : ""}`} />
            )}
          </button>
          
          <AnimatePresence initial={false}>
            {isStudioOpen && !isCollapsed && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden ml-6 mt-1 border-l-2 border-slate-100 pl-4 space-y-1"
              >
                {studioSubMenu.map((sub) => (
                  <Link 
                    key={sub.name} 
                    href={sub.href} 
                    title={`${sub.name} - ${sub.desc}`}
                    className={`flex items-center gap-2.5 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${pathname.startsWith(sub.href) ? "bg-indigo-50/50 text-indigo-600 font-bold" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50/50"}`}
                  >
                    <sub.icon size={15} className={pathname.startsWith(sub.href) ? "text-indigo-600" : "text-slate-400"} />
                    <span>{sub.name}</span>
                  </Link>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Dropdown Akademik */}
        <div>
          <button 
            onClick={toggleAkademik} 
            title="Layanan Akademik Mahasiswa"
            className={`w-full flex items-center ${isCollapsed ? "justify-center" : "justify-between"} p-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-xl transition-all`}
          >
            <div className="flex items-center gap-4">
              <Users size={20} strokeWidth={2} /> 
              {!isCollapsed && <span>Akademik</span>}
            </div>
            {!isCollapsed && (
              <ChevronRight size={14} className={`transition-transform duration-200 ${isAkademikOpen ? "rotate-90" : ""}`} />
            )}
          </button>
          
          <AnimatePresence initial={false}>
            {isAkademikOpen && !isCollapsed && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden ml-6 mt-1 border-l-2 border-slate-100 pl-4 space-y-1"
              >
                {akademikSubMenu.map((sub) => (
                  <Link 
                    key={sub.name} 
                    href={sub.href} 
                    title={sub.name}
                    className={`flex items-center gap-2.5 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${pathname.startsWith(sub.href) ? "bg-indigo-50/50 text-indigo-600 font-bold" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50/50"}`}
                  >
                    <sub.icon size={15} className={pathname.startsWith(sub.href) ? "text-indigo-600" : "text-slate-400"} />
                    <span>{sub.name}</span>
                  </Link>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Link href="/dashboard/diskusi" className={menuClass("/dashboard/diskusi")} title="Diskusi Kelas & DM Chat (Saluran Visual Terenkripsi)">
          <MessagesSquare size={20} strokeWidth={2} />
          {!isCollapsed && <span>Diskusi & Grup</span>}
        </Link>

        {/* Tautan "Panel Admin" DIHAPUS dari daftar ini — fungsinya sudah
            diambil alih pemilih mode di atas. Menyisakannya berarti ada dua
            jalan menuju tempat yang sama, dan yang satu tidak mengubah mode. */}
        </>
        )}
      </nav>

      {/* Footer Actions */}
      <div className="mt-auto pt-6 border-t border-slate-100 space-y-1">
        <Link href="/dashboard/settings"
          title="Pengaturan Akun & Profil"
          className={`flex items-center gap-4 p-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-all ${isCollapsed ? "justify-center" : ""}`}
        >
          <Settings size={20} strokeWidth={2} />
          {!isCollapsed && <span className="font-semibold text-sm">Pengaturan</span>}
        </Link>
        <button 
          onClick={handleLogout} 
          title="Keluar dari Aplikasi"
          className={`w-full flex items-center gap-4 p-3 rounded-xl text-red-500 hover:bg-red-50 transition-all ${isCollapsed ? "justify-center" : ""}`}
        >
          <LogOut size={20} strokeWidth={2} /> 
          {!isCollapsed && <span className="font-semibold text-sm">Keluar</span>}
        </button>
      </div>
    </aside>

    {/* ================= LACI MENU (< lg) =================
        Tombol pemicunya melayang di pojok kiri atas — posisi yang sama dengan
        sidebar desktop, jadi arah munculnya (dari kiri) terasa masuk akal.
        z-index-nya di atas header halaman yang sticky (z-40 pada beberapa
        halaman), tapi di bawah panel lacinya sendiri. */}
    <button
      onClick={() => setIsDrawerOpen(true)}
      aria-label="Buka menu"
      aria-expanded={isDrawerOpen}
      className="lg:hidden fixed top-3 left-3 z-[45] w-11 h-11 rounded-2xl bg-white border border-slate-200 shadow-lg flex items-center justify-center text-slate-700 active:scale-95 transition-transform"
    >
      <Menu size={20} />
    </button>

    <AnimatePresence>
      {isDrawerOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsDrawerOpen(false)}
            className="lg:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[55]"
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            className="lg:hidden fixed top-0 left-0 bottom-0 w-[280px] max-w-[85vw] bg-white z-[60] flex flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <Image
                src="/vero-logo.svg"
                alt="VeroApp Logo"
                width={110}
                height={34}
                style={{ height: "auto" }}
                className="object-contain"
              />
              <button
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Tutup menu"
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 pb-3 shrink-0">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" onError={() => setAvatarUrl(null)} />
                  ) : (
                    userInitial
                  )}
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-slate-800 truncate">{userName}</p>
                  <p className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md inline-block mt-0.5">
                    {role}
                  </p>
                </div>
              </div>
            </div>

            {/* Pemilih mode ikut masuk laci — di layar kecil, laci inilah
                satu-satunya jalan ke seluruh menu. */}
            {bolehModeAdmin && (
              <div className="px-5 pb-2 shrink-0">
                <PemilihMode mode={modeEfektif} ciut={false} onGanti={gantiMode} />
              </div>
            )}

            {/* Submenu SENGAJA ditampilkan datar, bukan sebagai akordeon seperti
                di desktop: tujuan laci ini justru agar seluruh menu terlihat
                sekaligus, tanpa ketukan tambahan untuk membukanya. */}
            <nav className="flex-1 overflow-y-auto px-5 pb-5 space-y-1">
              {modeEfektif === "admin" ? (
                <>
                  {adminMenu.map((m) => (
                    <Link key={m.href} href={m.href} onClick={() => setIsDrawerOpen(false)} className={drawerItemClass(m.href, pathname === m.href)}>
                      <m.icon size={18} /> <span>{m.name}</span>
                    </Link>
                  ))}
                  <p className="pt-4 pb-1 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Lainnya
                  </p>
                  <Link href="/dashboard/settings" onClick={() => setIsDrawerOpen(false)} className={drawerItemClass("/dashboard/settings", pathname.startsWith("/dashboard/settings"))}>
                    <Settings size={18} /> <span>Pengaturan</span>
                  </Link>
                </>
              ) : (
              <>
              <Link href="/dashboard" onClick={() => setIsDrawerOpen(false)} className={drawerItemClass("/dashboard", pathname === "/dashboard")}>
                <LayoutGrid size={18} /> <span>Beranda</span>
              </Link>

              <p className="pt-4 pb-1 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Box size={12} /> Studio
              </p>
              {studioSubMenu.map((sub) => (
                <Link key={sub.name} href={sub.href} onClick={() => setIsDrawerOpen(false)} className={drawerItemClass(sub.href, pathname.startsWith(sub.href))}>
                  <sub.icon size={18} /> <span>{sub.name}</span>
                </Link>
              ))}

              <p className="pt-4 pb-1 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Users size={12} /> Akademik
              </p>
              {akademikSubMenu.map((sub) => (
                <Link key={sub.name} href={sub.href} onClick={() => setIsDrawerOpen(false)} className={drawerItemClass(sub.href, pathname.startsWith(sub.href))}>
                  <sub.icon size={18} /> <span>{sub.name}</span>
                </Link>
              ))}

              <p className="pt-4 pb-1 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <MessagesSquare size={12} /> Lainnya
              </p>
              <Link href="/dashboard/diskusi" onClick={() => setIsDrawerOpen(false)} className={drawerItemClass("/dashboard/diskusi", pathname.startsWith("/dashboard/diskusi"))}>
                <MessagesSquare size={18} /> <span>Diskusi &amp; Grup</span>
              </Link>
              <Link href="/dashboard/settings" onClick={() => setIsDrawerOpen(false)} className={drawerItemClass("/dashboard/settings", pathname.startsWith("/dashboard/settings"))}>
                <Settings size={18} /> <span>Pengaturan</span>
              </Link>
              </>
              )}
            </nav>

            <div className="p-5 pt-3 border-t border-slate-100 shrink-0 space-y-1">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-semibold text-sm"
              >
                <LogOut size={18} /> <span>Keluar</span>
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>

    {/* Mobile Bottom Navigation.
        Isinya ikut mode: di Mode Admin, lima tautan ke halaman pengguna tidak
        ada gunanya dan justru menarik admin keluar dari mode yang sedang ia
        pakai tanpa ia sadari. */}
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 flex justify-around items-center px-2 py-3 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      {modeEfektif === "admin" ? (
        <>
          {adminMenu.map((m) => (
            <Link key={m.href} href={m.href} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${pathname === m.href ? "text-indigo-600 bg-indigo-50" : "text-slate-400"}`}>
              <m.icon size={20} />
              <span className="text-[10px] font-bold">{m.name}</span>
            </Link>
          ))}
          <Link href="/dashboard/settings" className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${pathname.includes("/dashboard/settings") ? "text-indigo-600 bg-indigo-50" : "text-slate-400"}`}>
            <Settings size={20} />
            <span className="text-[10px] font-bold">Profil</span>
          </Link>
        </>
      ) : (
        <>
          <Link href="/dashboard" className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${pathname === "/dashboard" ? "text-indigo-600 bg-indigo-50" : "text-slate-400"}`}>
            <LayoutGrid size={20} />
            <span className="text-[10px] font-bold">Home</span>
          </Link>
          <Link href="/dashboard/akademik/kelasku" className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${pathname.includes("/dashboard/akademik") ? "text-indigo-600 bg-indigo-50" : "text-slate-400"}`}>
            <MonitorPlay size={20} />
            <span className="text-[10px] font-bold">Akademik</span>
          </Link>
          <Link href="/dashboard/studio/translate" className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${pathname.includes("/dashboard/studio") ? "text-indigo-600 bg-indigo-50" : "text-slate-400"}`}>
            <PenTool size={20} />
            <span className="text-[10px] font-bold">Studio</span>
          </Link>
          <Link href="/dashboard/diskusi" className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${pathname.includes("/dashboard/diskusi") ? "text-indigo-600 bg-indigo-50" : "text-slate-400"}`}>
            <MessagesSquare size={20} />
            <span className="text-[10px] font-bold">Pesan</span>
          </Link>
          <Link href="/dashboard/settings" className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${pathname.includes("/dashboard/settings") ? "text-indigo-600 bg-indigo-50" : "text-slate-400"}`}>
            <Settings size={20} />
            <span className="text-[10px] font-bold">Profil</span>
          </Link>
        </>
      )}
    </nav>
    </>
  );
} 