"use client";
// Dashboard admin — kendali pengguna, dosen, dan kelas.
//
// Halaman ini HANYA menampilkan. Setiap tindakan di sini memanggil /api/admin,
// yang memverifikasi ulang peran pemanggil dari database. Pemeriksaan isAdmin()
// di bawah cuma menghindari menampilkan panel kosong kepada orang yang tidak
// berwenang — bukan yang menahannya. Lihat catatan di app/api/admin/route.ts.

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ShieldCheck, Search, Trash2, Check, X,
  Loader2, RefreshCw, AlertTriangle, ArrowRight, Merge,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import Sidebar from "@/components/Sidebar";
import LoadingScreen from "@/components/LoadingScreen";
import ConfirmModal from "@/components/ConfirmModal";
import DonutChart from "@/components/DonutChart";
import { db } from "@/lib/db";
import {
  isAdmin, LABEL_HEARING, LABEL_ROLE, LABEL_DOSEN_STATUS,
  type Role, type DosenStatus, type SessionUser,
} from "@/lib/access";
import {
  adalahBagianAdmin, rutaBagian, BERANDA_ADMIN, simpanMode,
  type BagianAdmin,
} from "@/lib/adminMode";

interface BarisUser {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  hearing_status: string | null;
  dosen_status: string | null;
  created_at: string | null;
  university: string | null;
  study_program: string | null;
}

interface BarisKelas {
  id: string;
  class_name: string;
  class_code: string;
  lecturer_name: string | null;
  creator_name: string | null;
  creator_email: string | null;
  jumlah_peserta: number;
  jumlah_tugas: number;
}

interface BarisKampus {
  /** Ejaan yang ditampilkan — yang pertama ditemui untuk kunci ini. */
  nama: string;
  /** Bentuk ternormalkan; dipakai sebagai identitas saat menggabungkan duplikat. */
  kunci: string;
  total: number;
  tuli: number;
  dengar: number;
  /** Persen profil kampus ini yang sudah mengisi status pendengaran & prodi. */
  kelengkapan: number;
}

interface Statistik {
  totalUser: number; mahasiswa: number; dosen: number; admin: number;
  temanTuli: number; temanDengar: number; belumIsiStatus: number;
  dosenPending: number;
  totalKelas: number; totalPesan: number; totalGrup: number; totalPengumuman: number;
  penggunaBaru7Hari: number;
  rataPesertaKelas: number;
  grupAktif: number;
  pengumumanTerakhir: string | null;
  kelasCampur: number;
  kelasDinilai: number;
  pesanLintas: number;
  pesanTerklasifikasi: number;
  kampus: BarisKampus[];
}

interface Aktivitas {
  id: string;
  jenis: string;
  judul: string;
  oleh: string | null;
  waktu: string | null;
}

// Palet satu-rumpun hijau, dipisahkan oleh LIGHTNESS, bukan oleh rona. Dua warna
// yang cuma beda rona (mis. ungu vs hijau) runtuh jadi satu bagi sebagian besar
// buta warna; dua hijau yang jarak terangnya jauh tetap terbaca oleh siapa pun,
// juga di cetakan hitam-putih. Slot ketiga sengaja abu netral tanpa chroma:
// "belum mengisi" bukan kategori setara, melainkan ketiadaan data.
//
// Isian dan teks dipisah karena syaratnya memang berbeda. Bidang warna cuma
// perlu terlihat; angka berwarna harus lolos kontras 4.5:1 terhadap putih —
// dan WARNA_DENGAR (~1.9:1) jauh dari cukup untuk itu.
const WARNA_TULI = "#065f46";
const WARNA_DENGAR = "#34d399";
const WARNA_BELUM = "#e2e8f0";

const TEKS_TULI = "#065f46";   // 8.6:1 di atas putih
const TEKS_DENGAR = "#047857"; // 5.9:1 di atas putih

const JUDUL_BAGIAN: Record<BagianAdmin, string> = {
  ringkasan: "Ringkasan",
  pengguna: "Pengguna",
  dosen: "Dosen",
  kelas: "Kelas",
};

export default function AdminPage({ params }: { params: Promise<{ bagian: string }> }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [memuat, setMemuat] = useState(true);

  // BAGIAN AKTIF DATANG DARI URL, bukan dari state komponen.
  //
  // Sebelumnya ini `useState<Tab>` yang digerakkan baris tab horizontal, dan
  // akibatnya bagian yang sedang dibuka tidak punya alamat sendiri: menyegarkan
  // halaman selalu kembali ke Ringkasan, tombol kembali melompati panel admin
  // seluruhnya, dan tidak ada cara mengirim tautan ke "daftar dosen". Dengan
  // bagian dibaca dari route, keempatnya beres sekaligus — dan sidebar bisa
  // menandai menu aktif hanya dengan membaca pathname.
  const bagianMentah = use(params).bagian;
  const tab: BagianAdmin = adalahBagianAdmin(bagianMentah) ? bagianMentah : "ringkasan";

  /** Berpindah bagian = berpindah alamat. */
  const setTab = useCallback((b: BagianAdmin) => router.push(rutaBagian(b)), [router]);

  const [stats, setStats] = useState<Statistik | null>(null);
  const [aktivitas, setAktivitas] = useState<Aktivitas[] | null>(null);
  const [users, setUsers] = useState<BarisUser[]>([]);
  const [kelas, setKelas] = useState<BarisKelas[]>([]);
  const [cari, setCari] = useState("");
  const [sibuk, setSibuk] = useState(false);

  // Modal gabungkan duplikat kampus.
  const [modalGabung, setModalGabung] = useState(false);
  const [sumberGabung, setSumberGabung] = useState<string[]>([]);
  const [tujuanGabung, setTujuanGabung] = useState("");
  const [menggabung, setMenggabung] = useState(false);

  const [konfirmasi, setKonfirmasi] = useState<{
    judul: string; pesan: string; aksi: () => void;
  } | null>(null);

  /** Satu pintu ke /api/admin — token & penanganan galatnya tidak diulang-ulang. */
  const panggil = useCallback(async (payload: Record<string, unknown>) => {
    const sesiStr = localStorage.getItem("db_mock_session");
    const token = sesiStr ? JSON.parse(sesiStr)?.access_token : null;
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const hasil = await res.json();
    if (!res.ok || hasil.error) {
      throw new Error(hasil?.error?.message || "Permintaan gagal.");
    }
    return hasil.data;
  }, []);

  const muatSemua = useCallback(async (q = "") => {
    setSibuk(true);
    try {
      const [s, u, k, a] = await Promise.all([
        panggil({ action: "stats" }),
        panggil({ action: "listUsers", q }),
        panggil({ action: "listClasses" }),
        panggil({ action: "listActivity" }),
      ]);
      setStats(s);
      setUsers(u);
      setKelas(k);
      setAktivitas(a);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat data admin.");
    } finally {
      setSibuk(false);
    }
  }, [panggil]);

  // Segmen route yang tidak dikenali (mis. /dashboard/admin/entahapa) diluruskan
  // ke Ringkasan, bukan dibiarkan menampilkan halaman kosong tanpa penjelasan.
  useEffect(() => {
    if (!adalahBagianAdmin(bagianMentah)) router.replace(BERANDA_ADMIN);
  }, [bagianMentah, router]);

  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await db.auth.getUser();
      if (!u) {
        router.replace("/login");
        return;
      }
      if (!isAdmin(u)) {
        toast.error("Halaman ini khusus admin.");
        router.replace("/dashboard");
        return;
      }
      // Berada di route ini BERARTI sedang di Mode Admin. Dicatat supaya halaman
      // yang dipakai kedua mode — Pengaturan — tahu sidebar mana yang harus
      // ditampilkan, dan supaya admin kembali ke sini saat login berikutnya.
      simpanMode("admin");
      setUser(u);
      setMemuat(false);
      muatSemua();
    })();
  }, [router, muatSemua]);

  const ubahRole = async (target: BarisUser, role: Role) => {
    try {
      await panggil({ action: "setRole", userId: target.id, role });
      toast.success(`${target.full_name || target.email} sekarang ${LABEL_ROLE[role]}.`);
      muatSemua(cari);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengubah peran.");
    }
  };

  const ubahDosenStatus = async (target: BarisUser, status: DosenStatus) => {
    try {
      await panggil({ action: "setDosenStatus", userId: target.id, status });
      toast.success(
        status === "APPROVED"
          ? `${target.full_name || target.email} disetujui sebagai dosen.`
          : `Pengajuan ${target.full_name || target.email} ditolak.`,
      );
      muatSemua(cari);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengubah status.");
    }
  };

  const hapusUser = (target: BarisUser) => {
    setKonfirmasi({
      judul: "Hapus akun ini?",
      pesan: `Seluruh data ${target.full_name || target.email} ikut terhapus — kelas yang ia buat, pesan, tugas, dan arsipnya. Tindakan ini TIDAK bisa dibatalkan.`,
      aksi: async () => {
        try {
          await panggil({ action: "deleteUser", userId: target.id });
          toast.success("Akun dihapus.");
          muatSemua(cari);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Gagal menghapus akun.");
        } finally {
          setKonfirmasi(null);
        }
      },
    });
  };

  const hapusKelas = (k: BarisKelas) => {
    setKonfirmasi({
      judul: "Hapus kelas ini?",
      pesan: `Kelas "${k.class_name}" beserta tugas, postingan, dan data kehadirannya akan hilang permanen.`,
      aksi: async () => {
        try {
          await panggil({ action: "deleteClass", classId: k.id });
          toast.success("Kelas dihapus.");
          muatSemua(cari);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Gagal menghapus kelas.");
        } finally {
          setKonfirmasi(null);
        }
      },
    });
  };

  const gabungkanKampus = async () => {
    const tujuan = tujuanGabung.trim();
    if (sumberGabung.length < 2 || !tujuan) return;
    setMenggabung(true);
    try {
      const hasil = await panggil({
        action: "mergeUniversities",
        sources: sumberGabung,
        target: tujuan,
      });
      toast.success(`${hasil?.diubah ?? 0} profil diperbarui jadi "${tujuan}".`);
      setModalGabung(false);
      setSumberGabung([]);
      setTujuanGabung("");
      muatSemua(cari);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menggabungkan kampus.");
    } finally {
      setMenggabung(false);
    }
  };

  if (memuat || !user) return <LoadingScreen />;

  const dosenMenunggu = users.filter(
    (u) => u.role === "DOSEN" && u.dosen_status === "PENDING",
  );

  return (
    <div className="flex min-h-screen bg-white text-slate-900 antialiased overflow-hidden">
      <Sidebar role={user.user_metadata?.role || "ADMIN"} userName={user.user_metadata?.full_name || "Admin"} />

      <main className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden pb-20 lg:pb-0">
        <header className="h-16 border-b border-slate-100 pl-16 pr-4 md:pr-10 lg:pl-10 flex items-center justify-between bg-white sticky top-0 z-10 shrink-0">
          {/* Judul menyebut BAGIAN yang sedang dibuka, bukan cuma "Panel Admin".
              Karena tab horizontalnya sudah hilang, tanpa ini tidak ada apa pun
              di badan halaman yang memberi tahu admin ia sedang di mana. */}
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck size={18} className="text-indigo-600 shrink-0" />
            <h1 className="text-sm font-black uppercase tracking-widest text-slate-900 truncate">
              <span className="text-indigo-600">Mode Admin</span>
              <span className="text-slate-300 mx-2">/</span>
              {JUDUL_BAGIAN[tab]}
            </h1>
          </div>
          <button
            onClick={() => muatSemua(cari)}
            disabled={sibuk}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-slate-200 text-xs font-black text-slate-600 hover:border-indigo-500 hover:text-indigo-600 transition-all disabled:opacity-50 shrink-0"
          >
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span className="hidden sm:inline">Muat ulang</span>
          </button>
        </header>

        {/* Latar abu sangat muda. Kartu putih di atas putih hanya terpisah oleh
            garis 1px; di atas abu, tiap kartu jadi bidang yang berdiri sendiri
            tanpa perlu border tebal atau bayangan berat. */}
        {/* space-y-6 — SATU jarak vertikal untuk seluruh halaman, sama dengan
            jarak antar section di dalam tab Ringkasan. Sebelumnya di luar 8 dan
            di dalam 6, jadi celah antar kartu berubah-ubah tergantung kartunya
            kebetulan bersaudara di tingkat mana. */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-10 pb-24 lg:pb-10 space-y-6">

          {/* Pengajuan dosen yang menunggu — ditaruh paling atas, di luar tab.
              Ini satu-satunya hal di panel ini yang menahan orang lain bekerja,
              jadi tidak boleh perlu dicari dulu. */}
          {dosenMenunggu.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 flex items-center gap-2">
                <AlertTriangle size={14} /> {dosenMenunggu.length} pengajuan dosen menunggu
              </p>
              <div className="mt-4 space-y-2">
                {dosenMenunggu.map((d) => (
                  <div key={d.id} className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{d.full_name || "Tanpa nama"}</p>
                      <p className="text-[11px] font-bold text-slate-400 truncate">{d.email}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => ubahDosenStatus(d, "APPROVED")}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition-all"
                      >
                        <Check size={14} /> Setujui
                      </button>
                      <button
                        onClick={() => ubahDosenStatus(d, "REJECTED")}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-black hover:border-rose-500 hover:text-rose-600 transition-all"
                      >
                        <X size={14} /> Tolak
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Baris tab horizontal DIHAPUS — navigasinya pindah ke sidebar.
              Dua lapis navigasi untuk satu aplikasi memaksa admin melompat
              bolak-balik antara menu kiri dan tab atas; sekarang semuanya di
              satu tempat, dan tiap bagian punya alamatnya sendiri. */}

          {/* ------------------------------------------------------ RINGKASAN */}
          {tab === "ringkasan" && (!stats ? <KerangkaRingkasan /> : (
            <div className="space-y-6">

              {/* 1) BARIS KPI — empat kolom dalam SATU kartu, dipisah garis tegak.
                     Empat kartu terpisah membuat mata membaca empat objek yang
                     tidak berhubungan; satu kartu berdivider membacanya sebagai
                     satu ringkasan yang memang saling melengkapi. */}
              <section className="bg-white border border-slate-200 rounded-3xl shadow-sm grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                <KolomKpi
                  posisi={0}
                  label="Total Pengguna"
                  nilai={stats.totalUser}
                  delta={stats.penggunaBaru7Hari > 0 ? `+${stats.penggunaBaru7Hari} / 7 hari` : null}
                  konteks={`${stats.mahasiswa} mahasiswa · ${stats.dosen} dosen · ${stats.admin} admin`}
                />
                <KolomKpi
                  posisi={1}
                  label="Kelas Akademik"
                  nilai={stats.totalKelas}
                  konteks={
                    stats.totalKelas === 0
                      ? "Belum ada kelas dibuat"
                      : `Rata-rata ${stats.rataPesertaKelas} peserta / kelas`
                  }
                />
                <KolomKpi
                  posisi={2}
                  label="Pesan Terkirim"
                  nilai={stats.totalPesan}
                  konteks={
                    stats.totalGrup === 0
                      ? "Belum ada grup diskusi"
                      : `${stats.grupAktif} dari ${stats.totalGrup} grup diskusi aktif`
                  }
                />
                <KolomKpi
                  posisi={3}
                  label="Pengumuman"
                  nilai={stats.totalPengumuman}
                  konteks={
                    stats.pengumumanTerakhir
                      ? `Publikasi terakhir ${formatTanggal(stats.pengumumanTerakhir)}`
                      : "Belum ada publikasi resmi"
                  }
                />
              </section>

              {/* 2) DUA KOLOM — bukti pemakaian (lebar) + aktivitas (sempit) */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

                {/* KIRI — bukti pemakaian bersama */}
                <section className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl shadow-sm p-6 md:p-8">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
                        Bukti pemakaian bersama
                      </p>
                      <h2 className="text-xl font-black text-slate-900 tracking-tight mt-2 leading-snug">
                        Teman Tuli dan Teman Dengar memakai VERO bersama
                      </h2>
                      <p className="text-xs font-medium text-slate-500 leading-relaxed mt-2 max-w-lg">
                        Bukan sekadar jumlah pengguna — angka ini menunjukkan komposisi orang
                        yang benar-benar saling berkirim pesan di kelas yang sama.
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-3xl font-black text-slate-900 leading-none tabular-nums">
                        {rasioTuliDengar(stats.temanTuli, stats.temanDengar)}
                      </p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1.5">
                        Tuli : Dengar
                      </p>
                    </div>
                  </div>

                  {stats.totalUser === 0 ? (
                    <p className="text-sm font-bold text-slate-400 py-12 text-center">
                      Belum ada pengguna terdaftar.
                    </p>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center gap-8 mt-8">
                      <DonutChart
                        potongan={[
                          { label: "Teman Tuli", value: stats.temanTuli, color: WARNA_TULI },
                          { label: "Teman Dengar", value: stats.temanDengar, color: WARNA_DENGAR },
                          { label: "Belum mengisi", value: stats.belumIsiStatus, color: WARNA_BELUM },
                        ]}
                        nilaiTengah={stats.temanTuli + stats.temanDengar}
                        labelTengah="sudah mengisi"
                      />

                      {/* Legenda selalu ada dan selalu membawa label + jumlah +
                          persentase dalam bentuk teks — jadi identitas tiap
                          potongan tidak pernah bergantung pada warna saja. */}
                      <ul className="flex-1 w-full space-y-3.5">
                        {[
                          { label: "Teman Tuli", nilai: stats.temanTuli, warna: WARNA_TULI },
                          { label: "Teman Dengar", nilai: stats.temanDengar, warna: WARNA_DENGAR },
                          { label: "Belum mengisi", nilai: stats.belumIsiStatus, warna: WARNA_BELUM },
                        ].map((b) => (
                          <li key={b.label} className="flex items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                              style={{ backgroundColor: b.warna }}
                            />
                            <span className="text-sm font-bold text-slate-800 min-w-0 truncate">{b.label}</span>
                            {/* Jumlah & persen dirapatkan ke labelnya, bukan didorong ke
                                tepi kanan: ketiganya satu keterangan tentang satu potongan,
                                dan jarak jauh membuatnya terbaca seperti dua kolom terpisah. */}
                            <span className="text-sm font-bold text-slate-400 tabular-nums shrink-0 ml-1.5">
                              {b.nilai} <span className="text-slate-300">·</span> {persen(b.nilai, stats.totalUser)}%
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Definisi tiap angka pindah ke `title` — masih bisa dibaca saat
                      dibutuhkan, tapi tidak lagi memakan tiga baris di depan mata
                      setiap kali panel dibuka. */}
                  <div className="border-t border-slate-100 mt-8 pt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div title="Kelas yang pesertanya memuat Teman Tuli dan Teman Dengar sekaligus.">
                      <p className="text-xs font-medium text-slate-500">Kelas dengan komposisi campur</p>
                      <p className="text-base font-black text-slate-900 mt-1.5 tabular-nums">
                        {stats.kelasCampur} dari {stats.kelasDinilai} kelas
                      </p>
                    </div>
                    <div title="Percakapan personal antar kelompok berbeda, ditambah pesan di grup yang isinya campur. Saluran umum tidak dihitung.">
                      <p className="text-xs font-medium text-slate-500">Pesan lintas kelompok</p>
                      <p className="text-base font-black text-slate-900 mt-1.5 tabular-nums">
                        {stats.pesanLintas} dari {stats.pesanTerklasifikasi} pesan
                      </p>
                    </div>
                  </div>
                </section>

                {/* KANAN — aktivitas terakhir */}
                {/* Kartu aktivitas TIDAK boleh tumbuh mengikuti jumlah datanya.
                    Sebelumnya lini masanya dirender utuh, jadi kartu ini menjadi
                    yang tertinggi di barisnya — dan karena tinggi baris grid
                    mengikuti isi tertinggi, ruang kosong sebesar selisihnya
                    menganga di bawah kartu kiri, sekaligus mendorong "Sebaran
                    kampus" turun sampai perlu digulir jauh untuk melihatnya.

                    Yang dibatasi tingginya adalah AREA DAFTARNYA, bukan kartunya:
                    dengan begitu judul tetap di atas dan tautan tetap di dasar,
                    hanya isinya yang menggulir. */}
                <section className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl shadow-sm p-6 md:p-8 flex flex-col">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 shrink-0">
                    Aktivitas terakhir
                  </p>

                  {aktivitas === null ? (
                    <KerangkaBaris jumlah={4} />
                  ) : aktivitas.length === 0 ? (
                    <p className="text-sm font-bold text-slate-400 py-10 text-center leading-relaxed">
                      Belum ada aktivitas tercatat.
                    </p>
                  ) : (
                    <div className="relative mt-6 min-h-0">
                      {/* max-h ±5–6 butir. pr-1 menyisakan ruang untuk bilah
                          gulir supaya teksnya tidak tertimpa. */}
                      <ol className="relative max-h-[21rem] overflow-y-auto pr-1 custom-scrollbar">
                        {aktivitas.map((a, i) => (
                          <li key={a.id} className="relative pl-6 pb-5 last:pb-0">
                            {/* Garis penghubung antar titik, tidak digambar pada
                                butir terakhir supaya lini masanya berakhir tegas. */}
                            {i < aktivitas.length - 1 && (
                              <span className="absolute left-[3.5px] top-3 bottom-0 w-px bg-slate-100" aria-hidden="true" />
                            )}
                            <span
                              aria-hidden="true"
                              className={`absolute left-0 top-1.5 w-2 h-2 rounded-full ${i === 0 ? "bg-emerald-500" : "bg-slate-300"}`}
                            />
                            <p className="text-sm font-bold text-slate-800 leading-snug">{a.judul}</p>
                            <p className="text-[11px] font-medium text-slate-400 mt-1">
                              {waktuRelatif(a.waktu)}
                              {a.oleh ? ` · oleh ${a.oleh}` : ""}
                            </p>
                          </li>
                        ))}
                      </ol>

                      {/* Pudar di tepi bawah — petunjuk bahwa daftarnya belum
                          habis. Hanya dipasang kalau isinya memang melebihi
                          ruang yang ada; kalau tidak, ia justru berbohong.
                          pointer-events-none supaya tidak menghalangi gulir. */}
                      {aktivitas.length > 5 && (
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent"
                        />
                      )}
                    </div>
                  )}

                  {/* mt-auto: tautan menempel di dasar kartu, di LUAR area yang
                      menggulir — jadi ia tidak pernah ikut hanyut ke atas. */}
                  <button
                    onClick={() => setTab("pengguna")}
                    className="mt-auto pt-5 text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 group shrink-0 w-max"
                  >
                    Lihat semua aktivitas
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                </section>
              </div>

              {/* 3) SEBARAN KAMPUS */}
              <section className="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 md:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                      Sebaran kampus
                    </p>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight mt-2">
                      {stats.kampus.length} kampus terdaftar
                    </h2>
                    <p className="text-xs font-medium text-slate-500 leading-relaxed mt-2 max-w-2xl">
                      Ejaan dinormalkan seadanya: beda huruf besar-kecil disatukan, tapi
                      singkatan seperti &quot;UB&quot; masih terhitung terpisah dari nama
                      panjangnya.
                    </p>
                  </div>
                  {stats.kampus.length > 1 && (
                    <button
                      onClick={() => { setSumberGabung([]); setTujuanGabung(""); setModalGabung(true); }}
                      className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 hover:border-indigo-500 hover:text-indigo-600 transition-all"
                    >
                      <Merge size={14} /> Gabungkan duplikat
                    </button>
                  )}
                </div>

                {stats.kampus.length === 0 ? (
                  <p className="text-sm font-bold text-slate-400 py-10 text-center">
                    Belum ada yang mengisi asal kampus.
                  </p>
                ) : (
                  /* Tabel lebar digulir di dalam wadahnya sendiri — halaman tidak
                     pernah ikut bergeser mendatar di layar sempit. */
                  <div className="overflow-x-auto -mx-6 md:-mx-8 px-6 md:px-8">
                    <table className="w-full min-w-[640px] border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pb-3">Kampus</th>
                          <th className="text-right text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pb-3 w-24">Pengguna</th>
                          <th className="text-right text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pb-3 w-20">Tuli</th>
                          <th className="text-right text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pb-3 w-20">Dengar</th>
                          <th className="text-left text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pb-3 w-56 pl-8">Kelengkapan data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.kampus.map((k) => (
                          <tr key={k.kunci} className="border-b border-slate-50 last:border-0">
                            <td className="py-3.5 text-sm font-bold text-slate-800 pr-4">{k.nama}</td>
                            <td className="py-3.5 text-sm font-black text-slate-900 text-right tabular-nums">{k.total}</td>
                            <td className="py-3.5 text-sm font-black text-right tabular-nums" style={{ color: TEKS_TULI }}>{k.tuli}</td>
                            <td className="py-3.5 text-sm font-black text-right tabular-nums" style={{ color: TEKS_DENGAR }}>{k.dengar}</td>
                            <td className="py-3.5 pl-8">
                              <div className="flex items-center gap-3">
                                <div
                                  className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"
                                  role="progressbar"
                                  aria-valuenow={k.kelengkapan}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-label={`Kelengkapan data ${k.nama}: ${k.kelengkapan} persen`}
                                >
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${k.kelengkapan}%`, backgroundColor: TEKS_DENGAR }}
                                  />
                                </div>
                                <span className="text-xs font-bold text-slate-500 tabular-nums w-10 text-right shrink-0">
                                  {k.kelengkapan}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ))}

          {/* ------------------------------------------------------- PENGGUNA */}
          {(tab === "pengguna" || tab === "dosen") && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-white border border-slate-200 shadow-sm rounded-2xl px-4 py-3">
                <Search size={16} className="text-slate-400 shrink-0" />
                <input
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") muatSemua(cari); }}
                  placeholder="Cari nama atau email, lalu tekan Enter..."
                  className="bg-transparent outline-none text-sm font-bold w-full"
                />
              </div>

              <div className="space-y-3">
                {users
                  .filter((u) => (tab === "dosen" ? u.role === "DOSEN" : true))
                  .map((u) => (
                    <div key={u.id} className="bg-white border border-slate-200 shadow-sm rounded-3xl p-4 hover:border-indigo-300 transition-all">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-slate-900 truncate">
                            {u.full_name || "Tanpa nama"}
                          </p>
                          <p className="text-[11px] font-bold text-slate-400 truncate">{u.email}</p>
                          {(u.university || u.study_program) && (
                            <p className="text-[11px] font-bold text-slate-500 truncate mt-0.5">
                              {[u.university, u.study_program].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-wider">
                              {u.role ? LABEL_ROLE[u.role as Role] : "—"}
                            </span>
                            {u.hearing_status ? (
                              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider">
                                {LABEL_HEARING[u.hearing_status as "TEMAN_TULI" | "TEMAN_DENGAR"]}
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-wider">
                                Status belum diisi
                              </span>
                            )}
                            {u.role === "DOSEN" && u.dosen_status && (
                              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                u.dosen_status === "APPROVED" ? "bg-emerald-50 text-emerald-600"
                                : u.dosen_status === "REJECTED" ? "bg-rose-50 text-rose-600"
                                : "bg-amber-50 text-amber-600"
                              }`}>
                                {LABEL_DOSEN_STATUS[u.dosen_status as DosenStatus]}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <select
                            value={u.role || "MAHASISWA"}
                            onChange={(e) => ubahRole(u, e.target.value as Role)}
                            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-black text-slate-600 outline-none focus:ring-4 focus:ring-indigo-50 bg-white"
                          >
                            <option value="MAHASISWA">Mahasiswa</option>
                            <option value="DOSEN">Dosen</option>
                            <option value="ADMIN">Admin</option>
                          </select>

                          {u.role === "DOSEN" && u.dosen_status !== "APPROVED" && (
                            <button
                              onClick={() => ubahDosenStatus(u, "APPROVED")}
                              title="Setujui sebagai dosen"
                              className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all"
                            >
                              <Check size={16} />
                            </button>
                          )}
                          {u.role === "DOSEN" && u.dosen_status === "APPROVED" && (
                            <button
                              onClick={() => ubahDosenStatus(u, "REJECTED")}
                              title="Cabut verifikasi dosen"
                              className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all"
                            >
                              <X size={16} />
                            </button>
                          )}

                          <button
                            onClick={() => hapusUser(u)}
                            title="Hapus akun"
                            className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                {users.filter((u) => (tab === "dosen" ? u.role === "DOSEN" : true)).length === 0 && (
                  <p className="text-center text-sm font-bold text-slate-400 py-12">
                    Tidak ada data yang cocok.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------- KELAS */}
          {tab === "kelas" && (
            <div className="space-y-3">
              {kelas.map((k) => (
                <div key={k.id} className="bg-white border border-slate-200 shadow-sm rounded-3xl p-4 flex flex-wrap items-start justify-between gap-3 hover:border-indigo-300 transition-all">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900 truncate">{k.class_name}</p>
                    <p className="text-[11px] font-bold text-slate-400 truncate">
                      Kode {k.class_code} · {k.creator_name || k.creator_email || "Tanpa pengajar"}
                    </p>
                    <div className="flex gap-1.5 mt-2">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider">
                        {k.jumlah_peserta} peserta
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider">
                        {k.jumlah_tugas} tugas
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => hapusKelas(k)}
                    title="Hapus kelas"
                    className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-all shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {kelas.length === 0 && (
                <p className="text-center text-sm font-bold text-slate-400 py-12">Belum ada kelas.</p>
              )}
            </div>
          )}
        </div>
      </main>

      {konfirmasi && (
        <ConfirmModal
          isOpen
          title={konfirmasi.judul}
          message={konfirmasi.pesan}
          confirmLabel="Ya, hapus"
          variant="danger"
          onConfirm={konfirmasi.aksi}
          onCancel={() => setKonfirmasi(null)}
        />
      )}

      {/* MODAL GABUNGKAN DUPLIKAT KAMPUS.
          Penggabungan menulis ulang kolom `university` milik orang lain, jadi
          yang dipilih dan hasilnya harus terlihat jelas SEBELUM tombolnya
          ditekan — termasuk berapa profil yang akan terpengaruh. */}
      {modalGabung && stats && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[120] p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-8 pb-4 shrink-0">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Gabungkan ejaan kampus</h3>
              <p className="text-xs font-medium text-slate-500 leading-relaxed mt-2">
                Pilih ejaan-ejaan yang sebenarnya merujuk kampus yang sama, lalu tentukan
                satu nama yang akan dipakai untuk semuanya.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-8 space-y-2 custom-scrollbar">
              {stats.kampus.map((k) => {
                const terpilih = sumberGabung.includes(k.kunci);
                return (
                  <button
                    key={k.kunci}
                    type="button"
                    onClick={() => {
                      setSumberGabung((prev) =>
                        terpilih ? prev.filter((x) => x !== k.kunci) : [...prev, k.kunci],
                      );
                      // Nama tujuan diisikan otomatis dari pilihan PERTAMA, tapi
                      // tetap bisa diketik ulang — sering kali ejaan yang benar
                      // justru bukan salah satu dari yang ada.
                      if (!terpilih && !tujuanGabung) setTujuanGabung(k.nama);
                    }}
                    className={`w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl border-2 text-left transition-all ${
                      terpilih ? "bg-indigo-50 border-indigo-200" : "border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-800 truncate">{k.nama}</span>
                      <span className="block text-[11px] font-bold text-slate-400">{k.total} pengguna</span>
                    </span>
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${terpilih ? "bg-indigo-600 border-indigo-600" : "border-slate-300"}`}>
                      {terpilih && <Check size={12} className="text-white" strokeWidth={4} />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="p-8 pt-4 shrink-0 border-t border-slate-100 mt-4">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                Nama yang dipakai
              </label>
              <input
                value={tujuanGabung}
                onChange={(e) => setTujuanGabung(e.target.value)}
                placeholder="mis. Universitas Brawijaya"
                className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl outline-none focus:border-indigo-600 font-bold text-slate-800"
              />
              <p className="text-[11px] font-medium text-slate-400 mt-2 leading-relaxed">
                {sumberGabung.length === 0
                  ? "Pilih minimal dua ejaan untuk digabungkan."
                  : `${jumlahTerpengaruh(stats.kampus, sumberGabung)} profil akan diperbarui.`}
              </p>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setModalGabung(false)}
                  disabled={menggabung}
                  className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={gabungkanKampus}
                  disabled={menggabung || sumberGabung.length < 2 || !tujuanGabung.trim()}
                  className="flex-1 py-3 font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  {menggabung ? <><Loader2 size={14} className="animate-spin" /> Menggabungkan…</> : "Gabungkan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- pembantu UI

/**
 * Garis pemisah tiap kolom KPI, ditulis UTUH per posisi.
 *
 * Tailwind memindai kode sebagai teks: nama kelas yang dirangkai saat berjalan
 * tidak pernah ikut ter-generate. Dan `divide-x` bawaan tidak bisa dipakai di
 * sini karena pada grid 2 kolom ia memberi garis kiri pada anak ke-3 — yang
 * justru berada di kolom PERTAMA baris kedua.
 *
 * Susunannya: menumpuk di ponsel (garis mendatar), 2x2 di tablet, satu baris
 * empat kolom di layar lebar (garis tegak).
 */
const GARIS_KPI = [
  "",
  "border-t sm:border-t-0 sm:border-l",
  "border-t xl:border-t-0 xl:border-l",
  "border-t sm:border-l xl:border-t-0 xl:border-l",
];

/** Satu kolom di baris KPI. */
function KolomKpi({
  posisi, label, nilai, delta, konteks,
}: {
  posisi: number;
  label: string;
  nilai: number;
  delta?: string | null;
  konteks: string;
}) {
  return (
    <div className={`p-6 md:p-7 border-slate-100 ${GARIS_KPI[posisi] ?? ""}`}>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{label}</p>
      <div className="flex items-baseline gap-2.5 mt-3 flex-wrap">
        <span className="text-4xl font-black text-slate-900 leading-none tabular-nums">{nilai}</span>
        {delta && <span className="text-[11px] font-bold text-emerald-600 leading-none">{delta}</span>}
      </div>
      <p className="text-[11px] font-medium text-slate-400 mt-3 leading-relaxed">{konteks}</p>
    </div>
  );
}

/** Kerangka muat untuk beberapa baris teks. */
function KerangkaBaris({ jumlah }: { jumlah: number }) {
  return (
    <div className="mt-6 space-y-4" aria-hidden="true">
      {Array.from({ length: jumlah }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-3.5 bg-slate-100 rounded-full animate-pulse" style={{ width: `${85 - i * 7}%` }} />
          <div className="h-2.5 bg-slate-50 rounded-full animate-pulse w-1/3" />
        </div>
      ))}
    </div>
  );
}

/**
 * Kerangka seluruh tab ringkasan.
 *
 * Bentuknya sengaja MENIRU tata letak yang akan menggantikannya — kartu KPI
 * empat kolom, dua kolom di bawahnya, lalu tabel. Kerangka yang bentuknya berbeda
 * membuat halaman melompat saat data tiba, dan lompatan itu lebih mengganggu
 * daripada menunggu.
 */
function KerangkaRingkasan() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="bg-white border border-slate-200 shadow-sm rounded-3xl grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 divide-slate-100">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-6 md:p-7 space-y-3">
            <div className="h-2.5 bg-slate-100 rounded-full animate-pulse w-2/3" />
            <div className="h-9 bg-slate-100 rounded-xl animate-pulse w-20" />
            <div className="h-2.5 bg-slate-50 rounded-full animate-pulse w-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white border border-slate-200 shadow-sm rounded-3xl p-8 h-80 flex items-center justify-center">
          <div className="w-44 h-44 rounded-full border-[22px] border-slate-100 animate-pulse" />
        </div>
        <div className="lg:col-span-2 bg-white border border-slate-200 shadow-sm rounded-3xl p-8">
          <KerangkaBaris jumlah={4} />
        </div>
      </div>
      <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8">
        <KerangkaBaris jumlah={3} />
      </div>
    </div>
  );
}

/** Persentase bulat; 0 kalau penyebutnya nol (bukan NaN). */
function persen(bagian: number, total: number): number {
  if (!total) return 0;
  return Math.round((bagian / total) * 100);
}

/**
 * Rasio Tuli : Dengar yang disederhanakan, mis. "1 : 2".
 *
 * Kalau salah satu sisi nol, rasio tidak punya arti — yang ditampilkan
 * keadaannya apa adanya, bukan "1 : 0" yang menyesatkan.
 */
function rasioTuliDengar(tuli: number, dengar: number): string {
  if (tuli === 0 && dengar === 0) return "—";
  if (tuli === 0) return `0 : ${dengar}`;
  if (dengar === 0) return `${tuli} : 0`;
  const kecil = Math.min(tuli, dengar);
  return `${Math.round((tuli / kecil) * 10) / 10} : ${Math.round((dengar / kecil) * 10) / 10}`;
}

function formatTanggal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "d MMM yyyy", { locale: idLocale });
}

/** "32 menit lalu", "2 jam lalu", lalu jatuh ke tanggal setelah seminggu. */
function waktuRelatif(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const selisih = Date.now() - d.getTime();
  const menit = Math.floor(selisih / 60000);
  if (menit < 1) return "Baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari < 7) return `${hari} hari lalu`;
  return format(d, "d MMM", { locale: idLocale });
}

function jumlahTerpengaruh(kampus: BarisKampus[], kunci: string[]): number {
  return kampus.filter((k) => kunci.includes(k.kunci)).reduce((s, k) => s + k.total, 0);
}

