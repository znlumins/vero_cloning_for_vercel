"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Sidebar from "@/components/Sidebar";
import LoadingScreen from "@/components/LoadingScreen";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import ConfirmModal from "@/components/ConfirmModal";
import { isAdmin as cekAdmin, roleOf } from "@/lib/access";
import { bacaMode, BERANDA_ADMIN } from "@/lib/adminMode";
import { format, isWithinInterval, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Megaphone, ChevronRight, Plus, Trash2, Edit,
  Calendar, CheckCircle,
} from "lucide-react";

// Tag Color Styles
const TAG_COLORS: Record<string, string> = {
  blue: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
  yellow: 'bg-amber-50 text-amber-700 border border-amber-100',
  red: 'bg-rose-50 text-rose-600 border border-rose-100',
};

// Warna garis aksen di sisi kiri tiap pengumuman — sepadan dengan TAG_COLORS.
const ACCENT_COLORS: Record<string, string> = {
  blue: 'bg-indigo-500',
  yellow: 'bg-amber-500',
  red: 'bg-rose-500',
};

interface Announcement {
  id: string;
  title: string;
  tag: string;
  tag_color: string;
  created_at: string;
  user_id: string;
}

interface Stat {
  label: string;
  value: string | number;
  note: string;
}

/**
 * Baris statistik: TIGA kolom sejajar di dalam SATU kartu, dipisah garis tegak.
 *
 * Sebelumnya ini tiga kartu terpisah dengan ikon besar di tiap kartu, dan di
 * layar lebar ketiganya tidak pernah cukup mengisi barisnya — sisanya jadi ruang
 * kosong yang membuat halaman terlihat setengah jadi. Satu kartu yang dibagi
 * membentang penuh berapa pun lebarnya.
 *
 * Di bawah md pemisahnya berubah jadi garis mendatar, karena kolomnya menumpuk.
 */
function BarisStatistik({ stats }: { stats: Stat[] }) {
  return (
    <section className="bg-white border border-slate-200 rounded-3xl shadow-sm grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
      {stats.map((s) => (
        <div key={s.label} className="p-6 md:p-8">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{s.label}</p>
          <div className="flex items-baseline gap-3 mt-3 flex-wrap">
            <h3 className="text-4xl font-black text-slate-900 leading-none">{s.value}</h3>
            <span className="text-[11px] font-bold text-emerald-600 leading-snug">{s.note}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

/** Kepala seksi: judul di kiri, tautan "lihat semua" di kanan. */
function KepalaSeksi({ judul, aksiLabel, onAksi }: { judul: string; aksiLabel?: string; onAksi?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <h2 className="text-lg font-black text-slate-900 tracking-tight">{judul}</h2>
      {aksiLabel && onAksi && (
        <button onClick={onAksi} className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-[0.2em] flex items-center gap-1 shrink-0">
          {aksiLabel} <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<any[]>([]);
  const [jadwalHariIni, setJadwalHariIni] = useState<any[]>([]);
  // Peta id kelas -> data kelas, dipakai jadwal untuk menyebut ruang & pengajar.
  const [petaKelas, setPetaKelas] = useState<Record<string, any>>({});

  // Role stats
  const [statMahasiswa, setStatMahasiswa] = useState({ presensi: 100, kelasDiikuti: 0 });
  const [dosenStats, setDosenStats] = useState({ classesCount: 0, tasksCount: 0, studentsCount: 0 });
  const [adminStats, setAdminStats] = useState({ usersCount: 0, classesCount: 0, announcementsCount: 0 });

  const [loading, setLoading] = useState(true);
  // Denyut per menit supaya badge "BERLANGSUNG" pada jadwal berpindah sendiri
  // saat kelasnya dimulai/berakhir, tanpa perlu halaman dimuat ulang.
  const [sekarang, setSekarang] = useState(() => new Date());
  const router = useRouter();

  // CRUD Announcement state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", tag: "Akademik", tag_color: "blue" });

  useEffect(() => {
    const t = setInterval(() => setSekarang(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await db.auth.getUser();
      if (!user) { router.push("/login"); return; }

      // Admin yang terakhir kali memakai Mode Admin dikembalikan ke sana.
      //
      // Tanpa ini, "beranda" bagi admin selalu berarti beranda pengguna: tiap
      // kali ia masuk aplikasi, ia mendarat di Mode Pengguna lalu harus menekan
      // toggle lagi — mode terakhirnya tidak benar-benar diingat.
      //
      // Ini murni soal ke mana orang diarahkan. Yang menahan data admin tetap
      // /api/admin, yang memverifikasi peran dari database tiap permintaan.
      if (roleOf(user) === "ADMIN" && bacaMode() === "admin") {
        router.replace(BERANDA_ADMIN);
        return;
      }
      setUser(user);

      const role = roleOf(user);

      // 1. Fetch announcements
      await fetchAnnouncements();

      // 2. Jadwal hari ini + daftar kelas (dipakai semua role).
      try {
        const awalHari = new Date(); awalHari.setHours(0, 0, 0, 0);
        const akhirHari = new Date(); akhirHari.setHours(23, 59, 59, 999);
        const { data: jadwal } = await db
          .from('schedules').select('*')
          .gte('start_time', awalHari.toISOString())
          .lte('start_time', akhirHari.toISOString())
          .order('start_time', { ascending: true });
        setJadwalHariIni(jadwal || []);

        const { data: semuaKelas } = await db.from('classes').select('*');
        const peta: Record<string, any> = {};
        (semuaKelas || []).forEach((k: any) => { peta[k.id] = k; });
        setPetaKelas(peta);

        // 3. Fetch based on role
        if (role === "MAHASISWA") {
          const { data: enrollments } = await db.from("enrollments").select("class_id").eq("user_id", user.id);
          let totalSessions = 0;
          let totalHadir = 0;

          if (enrollments && enrollments.length > 0) {
            const classIds = enrollments.map((e: any) => e.class_id);
            for (const cid of classIds) {
              const { data: sessions } = await db.from("attendance_sessions").select("id").eq("class_id", cid);
              if (sessions && sessions.length > 0) {
                totalSessions += sessions.length;
                for (const s of sessions) {
                  const { data: rec } = await db.from("attendance_records").select("status").eq("session_id", s.id).eq("user_id", user.id);
                  if (rec && rec.length > 0 && (rec[0].status === "HADIR_LURING" || rec[0].status === "HADIR_DARING")) {
                    totalHadir++;
                  }
                }
              }
            }
          }
          const presensiPercent = totalSessions === 0 ? 100 : Math.round((totalHadir / totalSessions) * 100);
          setStatMahasiswa({ presensi: presensiPercent, kelasDiikuti: enrollments?.length || 0 });

          // Get upcoming tasks - fetch only tasks for enrolled classes
          if (enrollments && enrollments.length > 0) {
            const classIds = enrollments.map((e: any) => e.class_id);
            const { data: tasks } = await db.from('tasks').select('*').in('class_id', classIds).order('deadline', { ascending: true });
            setUpcomingTasks(tasks || []);
          } else {
            setUpcomingTasks([]);
          }
        } else if (role === "DOSEN") {
          const { data: classes } = await db.from('classes').select('*').eq('creator_user_id', user.id);
          const { data: tasks } = await db.from('tasks').select('*').eq('user_id', user.id).order('deadline', { ascending: true });

          // Jumlah mahasiswa DIHITUNG dari pendaftaran nyata di kelas-kelas dosen
          // ini. Sebelumnya angkanya dipatok 0 dengan komentar "tidak pakai
          // dummy lagi" — jujur, tapi tetap salah: kartu itu selalu menampilkan
          // nol walau kelasnya penuh.
          let jumlahMahasiswa = 0;
          const idKelas = (classes || []).map((c: any) => c.id);
          if (idKelas.length > 0) {
            const { data: pendaftaran } = await db.from('enrollments').select('user_id').in('class_id', idKelas);
            jumlahMahasiswa = new Set((pendaftaran || []).map((p: any) => p.user_id)).size;
          }

          setDosenStats({
            classesCount: classes?.length || 0,
            tasksCount: tasks?.length || 0,
            studentsCount: jumlahMahasiswa,
          });
          setUpcomingTasks(tasks || []);
        } else if (role === "ADMIN") {
          const { data: allUsers } = await db.from('users').select('*');
          const { data: allAnnouncements } = await db.from('announcements').select('id');
          setAdminStats({
            usersCount: allUsers?.length || 0,
            classesCount: semuaKelas?.length || 0,
            announcementsCount: allAnnouncements?.length || 0
          });
          const { data: semuaTugas } = await db.from('tasks').select('*').order('deadline', { ascending: true });
          setUpcomingTasks(semuaTugas || []);
        }
      } catch (err) {
        console.error("Gagal memuat stats dashboard: ", err);
      }

      setLoading(false);
    };
    init();
  }, [router]);

  const fetchAnnouncements = async () => {
    const { data } = await db.from('announcements').select('*').order('created_at', { ascending: false });
    setAnnouncements(data || []);
  };

  // Dibaca lewat lib/access.ts, bukan dibandingkan sendiri di sini. Versi lama
  // memakai `role === "ADMIN"` padahal ADMIN belum ada di enum Role sama sekali
  // — syarat yang mustahil benar, dan akibatnya CRUD pengumuman di bawah
  // terkunci tanpa ada seorang pun yang bisa membukanya.
  const isAdmin = cekAdmin(user);
  const role = roleOf(user);

  const handleOpenCreate = () => {
    if (!isAdmin) return;
    setEditingId(null);
    setForm({ title: "", tag: "Akademik", tag_color: "blue" });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: Announcement) => {
    setEditingId(item.id);
    setForm({ title: item.title, tag: item.tag, tag_color: item.tag_color });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      const { error } = await db.from('announcements').update(form).eq('id', editingId);
      if (!error) toast.success("Pengumuman diperbarui");
    } else {
      const { error } = await db.from('announcements').insert([{ ...form, user_id: user.id }]);
      if (!error) toast.success("Pengumuman resmi diposting");
    }
    setIsModalOpen(false);
    fetchAnnouncements();
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    const { error } = await db.from('announcements').delete().eq('id', confirmDeleteId);
    if (!error) {
      toast.success("Pengumuman dihapus");
      fetchAnnouncements();
    }
    setConfirmDeleteId(null);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "-";
      return format(d, "d MMM yyyy", { locale: idLocale });
    } catch {
      return "-";
    }
  };

  if (loading) return <LoadingScreen />;

  // --- Isi tiap seksi disusun PER ROLE, bukan dikeraskan di JSX ---
  const STAT_PER_ROLE: Record<string, Stat[]> = {
    ADMIN: [
      { label: "Pengguna Terdaftar", value: adminStats.usersCount, note: "mahasiswa & dosen" },
      { label: "Kelas Terbuat", value: adminStats.classesCount, note: "seluruh kelas akademik" },
      { label: "Pengumuman Terpasang", value: adminStats.announcementsCount, note: "publikasi resmi pusat" },
    ],
    DOSEN: [
      { label: "Kelas Diajar", value: dosenStats.classesCount, note: "aktif semester ini" },
      { label: "Tugas Diberikan", value: dosenStats.tasksCount, note: "perlu diperiksa" },
      { label: "Total Mahasiswa", value: dosenStats.studentsCount, note: "terdaftar di kelas Anda" },
    ],
    MAHASISWA: [
      {
        label: "Presensi Kelas",
        value: `${statMahasiswa.presensi}%`,
        note: statMahasiswa.presensi >= 80 ? "sangat baik" : statMahasiswa.presensi >= 50 ? "masih cukup" : "perlu diperbaiki",
      },
      { label: "Tugas Aktif", value: upcomingTasks.length, note: upcomingTasks.length > 0 ? "menunggu dikerjakan" : "semua beres" },
      { label: "Kelas Diikuti", value: statMahasiswa.kelasDiikuti, note: "sedang berjalan" },
    ],
  };

  const JUDUL_TUGAS = role === "MAHASISWA" ? "Tugas mendatang" : "Tugas terbaru";

  // Jadwal terdekat = yang sedang berlangsung, atau kalau tidak ada, yang paling
  // dekat akan dimulai. Hanya SATU yang diberi badge — kalau semuanya diberi,
  // penandanya berhenti berarti apa-apa.
  const jadwalValid = jadwalHariIni.filter((j) => j.start_time && j.end_time);
  const indeksTerdekat = (() => {
    const berlangsung = jadwalValid.findIndex((j) =>
      isWithinInterval(sekarang, { start: parseISO(j.start_time), end: parseISO(j.end_time) }),
    );
    if (berlangsung !== -1) return berlangsung;
    return jadwalValid.findIndex((j) => parseISO(j.start_time) > sekarang);
  })();

  return (
    <div className="flex min-h-screen bg-white text-slate-900 antialiased overflow-hidden font-sans">
      <Sidebar role={role} userName={user.user_metadata.full_name} />

      {/* Sidebar kanan (kalender + timeline) DIBUANG dari Beranda. Dua alasan:
          ia menyita 320px yang membuat kolom isi tidak pernah penuh — itulah
          ruang kosong di kanan-bawah — dan isinya kini sudah ada di dalam
          halaman sebagai seksi "Jadwal hari ini", jadi mempertahankannya berarti
          menampilkan jadwal yang sama dua kali di satu layar. */}
      <main className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden pb-20 lg:pb-0">
        <header className="h-16 border-b border-slate-100 pl-16 pr-4 md:pr-10 lg:pl-10 flex items-center justify-between shrink-0 bg-white sticky top-0 z-10">
          <GlobalSearch />
          <NotificationBell />
        </header>

        {/* Lebar penuh dengan padding kiri-kanan yang sama; tanpa max-width yang
            menyisakan kolom kosong di layar lebar. */}
        <div className="flex-1 overflow-y-auto px-6 md:px-10 py-8 md:py-10 pb-24 lg:pb-10">
          <div className="w-full space-y-10">

            {/* SAPAAN */}
            <section>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">
                {format(sekarang, "EEEE, d MMMM", { locale: idLocale }).toUpperCase()}
              </p>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mt-2">
                Halo, {user.user_metadata.full_name || "Sahabat VERO"} 👋
              </h1>
            </section>

            {/* STATISTIK */}
            <BarisStatistik stats={STAT_PER_ROLE[role] ?? STAT_PER_ROLE.MAHASISWA} />

            {/* TUGAS */}
            <section>
              <KepalaSeksi
                judul={JUDUL_TUGAS}
                aksiLabel="Lihat semua"
                onAksi={() => router.push('/dashboard/akademik/tugas')}
              />

              {upcomingTasks.length === 0 ? (
                <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-3xl px-6 py-5 shadow-sm">
                  <span className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <CheckCircle size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900">Tidak ada tugas menunggu</span>
                    <span className="block text-xs font-medium text-slate-400 mt-0.5">
                      {role === "MAHASISWA" ? "Semua tugas sudah beres. Pertahankan." : "Belum ada tugas yang tercatat di sini."}
                    </span>
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingTasks.slice(0, 4).map((task) => (
                    <div key={task.id} className="bg-white border border-slate-200 rounded-3xl px-6 py-5 shadow-sm hover:border-indigo-500 hover:-translate-y-0.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-black uppercase bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">{task.subject || "Matakuliah"}</span>
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-1 rounded-lg">
                            Tenggat {formatDate(task.deadline)}
                          </span>
                        </div>
                        <h4 className="text-slate-900 font-bold text-base mt-3 tracking-tight truncate">{task.title}</h4>
                      </div>
                      <button onClick={() => router.push('/dashboard/akademik/tugas')} className="shrink-0 bg-white hover:bg-slate-900 hover:text-white text-slate-800 border border-slate-200 px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all">
                        {role === "MAHASISWA" ? "Kumpulkan" : "Kelola"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* JADWAL HARI INI */}
            <section>
              <KepalaSeksi
                judul="Jadwal hari ini"
                aksiLabel="Lihat kelas"
                onAksi={() => router.push('/dashboard/akademik/kelasku')}
              />

              {jadwalValid.length === 0 ? (
                <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-3xl px-6 py-5 shadow-sm">
                  <span className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                    <Calendar size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900">Hari ini kosong</span>
                    <span className="block text-xs font-medium text-slate-400 mt-0.5">Tidak ada kelas terjadwal.</span>
                  </span>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-3xl shadow-sm divide-y divide-slate-100">
                  {jadwalValid.map((j, i) => {
                    const mulai = parseISO(j.start_time);
                    const selesai = parseISO(j.end_time);
                    const berlangsung = isWithinInterval(sekarang, { start: mulai, end: selesai });
                    const kelas = j.class_id ? petaKelas[j.class_id] : null;
                    const keterangan = [j.location || kelas?.room_location, kelas?.lecturer_name].filter(Boolean).join(" · ");

                    return (
                      <div key={j.id} className="flex items-center gap-4 md:gap-6 px-6 py-5">
                        {/* Jam pakai font monospace supaya digitnya sejajar
                            antarbaris — angka proporsional membuat kolom waktu
                            bergerigi dan sulit dipindai cepat. */}
                        <span className="font-mono text-sm font-bold text-emerald-600 shrink-0 tabular-nums">
                          {format(mulai, "HH:mm")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-slate-900 truncate">{j.subject_name || kelas?.class_name || "Kelas"}</span>
                          {keterangan && <span className="block text-xs font-medium text-slate-400 mt-0.5 truncate">{keterangan}</span>}
                        </span>
                        {i === indeksTerdekat && (
                          <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg ${berlangsung ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}>
                            {berlangsung ? "Berlangsung" : "Berikutnya"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* PENGUMUMAN */}
            <section>
              <div className="flex items-center justify-between gap-4 mb-5">
                <h2 className="text-lg font-black text-slate-900 tracking-tight">Pengumuman</h2>
                {isAdmin && (
                  <button onClick={handleOpenCreate} className="bg-slate-900 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shrink-0">
                    <Plus size={13} /> Tambah
                  </button>
                )}
              </div>

              {announcements.length === 0 ? (
                <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-3xl px-6 py-5 shadow-sm">
                  <span className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                    <Megaphone size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900">Belum ada pengumuman</span>
                    <span className="block text-xs font-medium text-slate-400 mt-0.5">Pengumuman pusat akan tampil di sini.</span>
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {announcements.map((news) => (
                    /* Garis aksen tegak di sisi kiri tiap item — penanda kategori
                       yang bisa ditangkap sekilas tanpa harus membaca tag-nya. */
                    <div key={news.id} className="group relative bg-white border border-slate-200 rounded-3xl pl-7 pr-6 py-5 shadow-sm hover:border-indigo-500 hover:-translate-y-0.5 transition-all overflow-hidden">
                      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${ACCENT_COLORS[news.tag_color] ?? 'bg-slate-300'}`} />
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${TAG_COLORS[news.tag_color] ?? 'bg-slate-50 text-slate-600 border border-slate-100'}`}>
                          {news.tag}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 shrink-0">{formatDate(news.created_at)}</span>
                      </div>
                      <h4 className="text-slate-900 font-bold text-sm tracking-tight mt-3 leading-snug">{news.title}</h4>

                      {isAdmin && (
                        <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button onClick={() => handleOpenEdit(news)} aria-label="Sunting pengumuman" className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"><Edit size={13} /></button>
                          <button onClick={() => handleDelete(news.id)} aria-label="Hapus pengumuman" className="p-1 text-slate-400 hover:text-rose-600 transition-colors"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* MODAL KHUSUS ADMIN CRUD */}
      {isModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl border border-slate-200">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-6">Kelola Pengumuman</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Konten Pengumuman</label>
                <textarea rows={3} className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-100 font-semibold text-slate-700 text-sm placeholder:text-slate-400" placeholder="Tulis pengumuman resmi..." value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Kategori Tag</label>
                  <select className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none text-slate-700 focus:ring-4 focus:ring-indigo-100" value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value })}>
                    <option>Akademik</option>
                    <option>Update</option>
                    <option>Penting</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Warna Aksen</label>
                  <select className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none text-slate-700 focus:ring-4 focus:ring-indigo-100" value={form.tag_color} onChange={e => setForm({ ...form, tag_color: e.target.value })}>
                    <option value="blue">Biru Indigo</option>
                    <option value="yellow">Kuning Emas</option>
                    <option value="red">Merah Rose</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 text-slate-400 hover:text-slate-600 font-extrabold text-xs uppercase rounded-2xl transition-all">Batal</button>
                <button type="submit" className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs uppercase rounded-2xl shadow-lg shadow-indigo-600/10 active:scale-95 transition-all">Publikasikan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDeleteId}
        title="Hapus Pengumuman?"
        message="Pengumuman resmi ini akan dihapus secara permanen dari sistem."
        confirmLabel="Ya, Hapus"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
