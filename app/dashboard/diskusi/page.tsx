"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import LoadingScreen from "@/components/LoadingScreen";
import UserAvatar from "@/components/UserAvatar";
import ChatProfilePanel from "@/components/ChatProfilePanel";
import ConfirmModal from "@/components/ConfirmModal";
import MessageActionMenu, { type AnchorMenu } from "@/components/MessageActionMenu";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import {
  Send, Video, Search,
  Users, X, Hash, Check, UserPlus,
  MoreVertical, ChevronLeft, Ban, Loader2
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { sedangDaring, labelKehadiran, JEDA_DENYUT_MS } from "@/lib/presence";

export default function DiskusiPage() {
  const [user, setUser] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]); 
  const [groupsList, setGroupsList] = useState<any[]>([]); 
  const [selectedTarget, setSelectedTarget] = useState<{type: 'umum' | 'dm' | 'group', data: any}>({type: 'umum', data: null});
  // Master-detail untuk layar < lg. Dua panel berdampingan butuh ~1000px; di
  // bawah itu hanya SATU yang ditampilkan — daftar percakapan dulu, lalu ruang
  // obrolan setelah salah satunya dipilih. Di lg ke atas state ini diabaikan
  // karena kedua panel memang ditampilkan bersamaan.
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [cariKontak, setCariKontak] = useState("");

  // Ringkasan obrolan (waktu pesan terakhir & jumlah belum dibaca) untuk tiap room
  const [chatSummaries, setChatSummaries] = useState<Record<string, { lastTime: string; unreadCount: number }>>({});
  // Menyimpan waktu last_read sebelum ruang chat dibuka, agar divider "Pesan Belum Dibaca" bisa ditaruh dengan tepat
  const [lastReadSebelumnya, setLastReadSebelumnya] = useState<string | null>(null);

  // Helper pemformat pembatas hari
  const formatDayDivider = (dateInput: string) => {
    try {
      const d = new Date(dateInput);
      if (isToday(d)) return "Hari Ini";
      if (isYesterday(d)) return "Kemarin";
      return format(d, 'EEEE, dd MMMM yyyy', { locale: idLocale });
    } catch {
      return dateInput;
    }
  };

  // Semua pemilihan percakapan lewat satu pintu ini supaya tidak ada tombol yang
  // lupa memindahkan tampilan mobile ke ruang obrolan.
  const pilihPercakapan = (target: {type: 'umum' | 'dm' | 'group', data: any}) => {
    if (user) {
      const targetId = target.type === 'umum' ? 'umum' : target.data?.id;
      const key = `last_read_${user.id}_${target.type}_${targetId}`;
      const readLama = localStorage.getItem(key) || "1970-01-01T00:00:00.000Z";
      setLastReadSebelumnya(readLama);

      // Perbarui waktu buka terakhir sekarang
      localStorage.setItem(key, new Date().toISOString());
    }
    setSelectedTarget(target);
    setMobileView('chat');
  };
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  
  // State Modal & Pilihan Anggota
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]); // Menyimpan ID anggota grup baru
  const [membuatGrup, setMembuatGrup] = useState(false);
  const [galatGrup, setGalatGrup] = useState("");
  
  // Sunting & hapus pesan
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  // Menu aksi pesan: satu menu untuk seluruh daftar, diportal ke <body> dan
  // diposisikan terhadap gelembung yang memicunya. Sebelumnya tiap gelembung
  // merender menunya sendiri secara `absolute`, dan menu itu terpotong oleh
  // daftar pesan yang meng-clip overflow — lihat components/MessageActionMenu.tsx.
  const [menuAksi, setMenuAksi] = useState<{ msg: any; anchor: AnchorMenu } | null>(null);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<any>(null);

  // Panel profil di kanan area obrolan + daftar anggota grup yang sedang dibuka.
  const [panelProfilTerbuka, setPanelProfilTerbuka] = useState(false);
  const [anggotaGrup, setAnggotaGrup] = useState<any[]>([]);
  const [galatAnggota, setGalatAnggota] = useState(false);
  /** Daftar grup sudah pernah berhasil diambil sekali. Lihat pemakaiannya. */
  const [directorySiap, setDirectorySiap] = useState(false);
  // Penghitung yang dinaikkan setelah grup diubah dari panel, semata untuk
  // memaksa pengambilan ulang daftar anggota tanpa harus pindah percakapan.
  const [penyegarGrup, setPenyegarGrup] = useState(0);
  // Tekan-lama di ponsel. Di sana tidak ada hover, jadi menu aksi butuh gerakan
  // pembuka tersendiri selain tombol titik tiga.
  const tekanLamaRef = useRef<any>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  /**
   * Ringkasan isi daftar pesan untuk mendeteksi perubahan nyata.
   * Menyertakan edited_at DAN deleted_at supaya suntingan maupun penghapusan
   * oleh orang lain ikut terdeteksi — keduanya tidak mengubah jumlah pesan
   * (hapus kini bersifat lunak), jadi tanpa ini perubahannya tak akan pernah
   * terlihat di layar lawan bicara.
   */
  const tandaTangan = (arr: any[]) =>
    arr.map((m) => `${m.id}:${m.edited_at || ''}:${m.deleted_at || ''}`).join('|');

  // Pengambilan data DIPISAH jadi dua.
  //
  // Sebelumnya satu fungsi fetchData mengambil pesan + daftar user + keanggotaan
  // grup + daftar grup sekaligus — EMPAT query — dan fungsi itulah yang dipanggil
  // tiap kali polling. Karena mahal, interval polling dinaikkan ke 10 detik untuk
  // menekan beban server. Akibatnya pesan lawan bicara baru muncul sampai 10
  // detik kemudian, dan itu yang terasa seperti "chat tidak masuk".
  //
  // Dengan dipisah, polling cukup menarik SATU query (pesan saja). Beban server
  // per detik tetap sama seperti sebelumnya, tapi pesan datang 4x lebih cepat.

  /** Hanya pesan pada percakapan yang sedang dibuka — ringan, aman di-poll. */
  const fetchMessages = useCallback(async () => {
    if (!user) return;

    let query = db.from('messages').select('*');
    if (selectedTarget.type === 'dm') {
      query = query.or(`and(user_id.eq.${user.id},receiver_id.eq.${selectedTarget.data.id}),and(user_id.eq.${selectedTarget.data.id},receiver_id.eq.${user.id})`);
    } else if (selectedTarget.type === 'group') {
      query = query.eq('group_id', selectedTarget.data.id);
    } else {
      query = query.is('receiver_id', null).is('group_id', null);
    }
    const { data: msgData, error } = await query.order('created_at', { ascending: true });
    if (error) {
      console.error("Gagal memuat pesan:", error, "target:", selectedTarget.type);
      return;
    }
    const next = msgData || [];

    // Ganti state HANYA kalau isinya memang berubah. Tanpa penjaga ini, tiap
    // polling membuat array baru -> render ulang -> efek auto-scroll ikut jalan
    // dan menyentak tampilan ke bawah, padahal pengguna mungkin sedang membaca
    // riwayat di atas.
    //
    // Tanda tangan memuat edited_at, BUKAN sekadar jumlah pesan & id terakhir.
    // Versi sebelumnya hanya membandingkan keduanya, jadi penyuntingan oleh
    // lawan bicara — yang tidak mengubah jumlah maupun urutan — tidak pernah
    // terdeteksi dan isi lamanya menempel di layar selamanya.
    setMessages((prev) => (tandaTangan(prev) === tandaTangan(next) ? prev : next));
  }, [user, selectedTarget]);

  /** Daftar user & grup untuk sidebar — mengambil data dan mengurutkan berdasarkan pesan terakhir */
  const fetchDirectory = useCallback(async () => {
    if (!user) return;

    const { data: profiles } = await db.from('profiles').select('*').neq('id', user.id);
    const listKontak = profiles || [];

    const { data: myGroups } = await db.from('group_members').select('group_id').eq('user_id', user.id);
    let listGrup: any[] = [];
    if (myGroups && myGroups.length > 0) {
      const gIds = myGroups.map((mg: any) => mg.group_id);
      const { data: groups } = await db.from('groups').select('*').in('id', gIds);
      listGrup = groups || [];
    }

    // Ambil ringkasan seluruh pesan untuk menghitung urutan chat & badge belum dibaca
    const { data: allMsgs } = await db.from('messages').select('*');
    const msgs = allMsgs || [];

    const summaries: Record<string, { lastTime: string; unreadCount: number }> = {};

    listKontak.forEach((u: any) => {
      summaries[`dm_${u.id}`] = { lastTime: "1970-01-01T00:00:00.000Z", unreadCount: 0 };
    });
    listGrup.forEach((g: any) => {
      summaries[`group_${g.id}`] = { lastTime: g.created_at || "1970-01-01T00:00:00.000Z", unreadCount: 0 };
    });
    summaries[`umum_umum`] = { lastTime: "1970-01-01T00:00:00.000Z", unreadCount: 0 };

    msgs.forEach((m: any) => {
      const time = m.created_at || "1970-01-01T00:00:00.000Z";
      const isMine = m.user_id === user.id;

      if (m.group_id) {
        const key = `group_${m.group_id}`;
        if (summaries[key]) {
          if (new Date(time) > new Date(summaries[key].lastTime)) {
            summaries[key].lastTime = time;
          }
          if (!isMine && !m.is_deleted) {
            const lastRead = localStorage.getItem(`last_read_${user.id}_group_${m.group_id}`) || "1970-01-01T00:00:00.000Z";
            if (new Date(time) > new Date(lastRead)) {
              summaries[key].unreadCount += 1;
            }
          }
        }
      } else if (m.receiver_id) {
        const lawanId = isMine ? m.receiver_id : m.user_id;
        const key = `dm_${lawanId}`;
        if (summaries[key]) {
          if (new Date(time) > new Date(summaries[key].lastTime)) {
            summaries[key].lastTime = time;
          }
          if (!isMine && !m.is_deleted) {
            const lastRead = localStorage.getItem(`last_read_${user.id}_dm_${lawanId}`) || "1970-01-01T00:00:00.000Z";
            if (new Date(time) > new Date(lastRead)) {
              summaries[key].unreadCount += 1;
            }
          }
        }
      } else {
        const key = `umum_umum`;
        if (new Date(time) > new Date(summaries[key].lastTime)) {
          summaries[key].lastTime = time;
        }
        if (!isMine && !m.is_deleted) {
          const lastRead = localStorage.getItem(`last_read_${user.id}_umum_umum`) || "1970-01-01T00:00:00.000Z";
          if (new Date(time) > new Date(lastRead)) {
            summaries[key].unreadCount += 1;
          }
        }
      }
    });

    setChatSummaries(summaries);

    // Urutkan grup dan kontak berdasarkan waktu pesan terakhir (paling baru di atas)
    const sortedGrup = [...listGrup].sort((a, b) => {
      const timeA = summaries[`group_${a.id}`]?.lastTime || a.created_at || "1970-01-01T00:00:00.000Z";
      const timeB = summaries[`group_${b.id}`]?.lastTime || b.created_at || "1970-01-01T00:00:00.000Z";
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });

    const sortedKontak = [...listKontak].sort((a, b) => {
      const timeA = summaries[`dm_${a.id}`]?.lastTime || "1970-01-01T00:00:00.000Z";
      const timeB = summaries[`dm_${b.id}`]?.lastTime || "1970-01-01T00:00:00.000Z";
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });

    setGroupsList(sortedGrup);
    setUsersList(sortedKontak);
    setDirectorySiap(true);
  }, [user]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await db.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);
    };
    init();
  }, [router]);

  // Polling pesan. Memperbarui ruang chat yang dibuka sekaligus ringkasan obrolan di sidebar
  useEffect(() => {
    if (!user) return;
    const channel = db.channel('chat-main').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
      fetchMessages();
      fetchDirectory();
    }).subscribe();
    return () => { db.removeChannel(channel); };
  }, [fetchMessages, fetchDirectory, user]);

  // Daftar user & grup diambil saat user siap / setelah buat grup baru
  useEffect(() => { fetchDirectory(); }, [fetchDirectory]);

  useEffect(() => { fetchMessages(); }, [selectedTarget, fetchMessages]);

  // Update last_read ketika pesan berubah di chat yang aktif
  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;

    if (user && selectedTarget) {
      const targetId = selectedTarget.type === 'umum' ? 'umum' : selectedTarget.data?.id;
      if (targetId) {
        localStorage.setItem(`last_read_${user.id}_${selectedTarget.type}_${targetId}`, new Date().toISOString());
      }
    }
  }, [messages, user, selectedTarget]);

  // Kehadiran (last_seen) berubah terus-menerus, sementara fetchDirectory hanya
  // jalan sekali. Tanpa penyegaran ini, titik hijau membeku pada keadaan saat
  // halaman dibuka dan tidak pernah berubah lagi selama tab dibiarkan terbuka.
  // Yang ditarik hanya tabel profiles — satu kueri, sama seperti polling pesan.
  useEffect(() => {
    if (!user) return;
    const segarkan = async () => {
      const { data: profiles } = await db.from('profiles').select('*').neq('id', user.id);
      if (profiles) setUsersList(profiles);
      // Daftar grup ikut disegarkan di denyut yang sama. Tanpa ini, grup yang
      // dibubarkan pembuatnya tetap menggantung di sidebar anggota lain sampai
      // mereka memuat ulang halaman — dan mengetuknya membuka ruang yang
      // percakapannya sudah tidak ada.
      fetchDirectory();
    };
    const t = setInterval(segarkan, JEDA_DENYUT_MS);
    return () => clearInterval(t);
  }, [user, fetchDirectory]);

  // Anggota grup yang sedang dibuka — dipakai panel info grup untuk menghitung
  // "berapa yang sedang aktif". Hanya diambil saat grupnya berganti.
  useEffect(() => {
    const ambilAnggota = async () => {
      setGalatAnggota(false);
      if (selectedTarget.type !== 'group' || !selectedTarget.data?.id) {
        setAnggotaGrup([]);
        return;
      }
      const { data: rows, error: galatKeanggotaan } = await db.from('group_members').select('user_id').eq('group_id', selectedTarget.data.id);
      // Kegagalan DITANDAI, bukan disamarkan jadi daftar kosong. "Belum ada
      // anggota" dan "gagal dimuat" adalah dua keadaan yang sangat berbeda, dan
      // pengguna berhak tahu ia sedang melihat yang mana.
      if (galatKeanggotaan) {
        console.error("Gagal memuat keanggotaan grup:", galatKeanggotaan);
        setAnggotaGrup([]);
        setGalatAnggota(true);
        return;
      }
      const ids = (rows || []).map((r: any) => r.user_id);
      if (ids.length === 0) { setAnggotaGrup([]); return; }
      const { data: profiles, error: galatProfil } = await db.from('profiles').select('*').in('id', ids);
      if (galatProfil) {
        console.error("Gagal memuat profil anggota grup:", galatProfil);
        setAnggotaGrup([]);
        setGalatAnggota(true);
        return;
      }
      setAnggotaGrup(profiles || []);
    };
    ambilAnggota();
  }, [selectedTarget, penyegarGrup]);

  // Panel profil ditutup saat pindah percakapan — kalau dibiarkan terbuka, ia
  // akan menampilkan profil orang yang sudah tidak sedang diajak bicara.
  useEffect(() => { setPanelProfilTerbuka(false); }, [selectedTarget]);

  // Grup yang sedang dibuka bisa lenyap di tengah jalan — dibubarkan pembuatnya,
  // atau kita dikeluarkan. Begitu ia tidak ada lagi di daftar keanggotaan,
  // percakapannya ditutup dan pengguna diberi tahu, alih-alih dibiarkan menatap
  // ruang kosong yang pesannya tidak pernah datang.
  useEffect(() => {
    // Jangan menghakimi sebelum daftarnya pernah berhasil diambil sama sekali:
    // pada render pertama groupsList masih kosong, dan tanpa penjaga ini setiap
    // grup yang dibuka lewat tautan langsung akan dianggap sudah dibubarkan.
    if (!directorySiap) return;
    if (selectedTarget.type !== 'group' || !selectedTarget.data?.id) return;
    if (groupsList.some((g) => g.id === selectedTarget.data.id)) return;
    setSelectedTarget({ type: 'umum', data: null });
    setPanelProfilTerbuka(false);
    toast.info("Grup ini sudah tidak tersedia.");
  }, [groupsList, selectedTarget, directorySiap]);

  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [messages]);

  // Pendengar "klik di mana pun untuk menutup" DIPINDAH ke MessageActionMenu,
  // bersama pendengar Escape, gulir, dan ubah-ukuran — semuanya urusan menu itu
  // sendiri, bukan urusan halaman ini.

  /** Buka menu aksi, berlabuh pada elemen yang memicunya. */
  const bukaMenuAksi = (el: HTMLElement | null, msg: any, rataKanan: boolean) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuAksi({
      msg,
      anchor: { rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right }, rataKanan },
    });
  };

  const tutupMenuAksi = useCallback(() => setMenuAksi(null), []);

  // Handler Pilih/Hapus Anggota di Modal
  const toggleUserSelection = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  // Handler Buat Grup & Masukkan Anggota
  //
  // AKAR BUG "tombol Selesaikan & Buat Grup tidak merespons": bukan tombolnya —
  // handler-nyalah yang selalu gagal di tengah jalan, tanpa satu pun tanda di
  // layar. Versi lama memanggil
  //
  //     db.from('groups').insert([{...}]).select().single()
  //
  // dengan payload BERBENTUK ARRAY. Di app/api/db/route.ts, payload array
  // dijalankan lewat createMany(), lalu hasilnya diambil dengan findMany() —
  // artinya yang kembali adalah SELURUH baris tabel groups, bukan satu grup yang
  // baru dibuat (`.single()` hanya berlaku untuk action 'select', diabaikan pada
  // insert). Jadi `group` berisi array; `group.id` undefined; anggota disisipkan
  // dengan group_id undefined dan gagal. Grupnya sungguh tercipta di database,
  // tapi TANPA seorang anggota pun — dan karena sidebar mendaftar grup lewat
  // keanggotaan, grup itu tidak pernah muncul. Persis seperti tombol mati.
  //
  // Perbaikannya: kirim OBJEK tunggal supaya server memakai create() dan
  // mengembalikan satu baris beserta id-nya.
  //
  // SUSULAN: separuh keduanya ternyata masih patah. Penyisipan anggota di
  // langkah 2 memang mengirim array — dan memang seharusnya begitu — tapi
  // cabang array di /api/db mengambil hasilnya dengan `orderBy: { createdAt }`
  // yang dipatok untuk tabel apa pun, padahal GroupMember mencatat waktunya
  // sebagai `joinedAt`. Prisma menolak seluruh permintaan, dan galat mentahnya
  // muncul di modal. Sudah diperbaiki di app/api/db/route.ts.
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (membuatGrup) return;

    const nama = newGroupName.trim();
    // Validasi ditampilkan INLINE, bukan didiamkan. `return` telanjang seperti
    // versi lama tidak bisa dibedakan pengguna dari tombol yang rusak.
    if (!nama) {
      setGalatGrup("Nama grup belum diisi.");
      return;
    }
    if (selectedUserIds.length === 0) {
      setGalatGrup("Pilih minimal satu anggota untuk diundang.");
      return;
    }

    setGalatGrup("");
    setMembuatGrup(true);
    try {
      // 1. Buat Grup — objek tunggal, bukan array (lihat catatan di atas).
      const { data: group, error: groupError } = await db.from('groups').insert(
        { name: nama, creator_id: user.id }
      );

      if (groupError || !group?.id) {
        // Detail teknisnya ke console; ke layar cukup kalimat yang bisa
        // ditindaklanjuti. Sebelum ini, galat Prisma mentah dari server tampil
        // apa adanya di dalam modal.
        console.error("Grup gagal dibuat:", groupError);
        setGalatGrup("Grup gagal dibuat. Coba lagi sebentar lagi.");
        return;
      }

      // 2. Tambahkan Anggota (Termasuk diri sendiri)
      const membersToInsert = [...selectedUserIds, user.id].map(uid => ({
        group_id: group.id,
        user_id: uid
      }));

      const { error: memberError } = await db.from('group_members').insert(membersToInsert);

      if (memberError) {
        console.error("Anggota grup gagal disisipkan:", memberError);
        setGalatGrup("Grup dibuat, tapi anggotanya gagal dimasukkan. Coba buat ulang.");
        return;
      }

      toast.success(`Grup ${nama} siap digunakan!`);
      setIsModalOpen(false);
      setNewGroupName("");
      setSelectedUserIds([]);
      // Masukkan ke daftar SEKARANG, jangan tunggu fetchDirectory selesai.
      // Penjaga "grup sudah tidak tersedia" membandingkan percakapan yang dibuka
      // dengan daftar ini; kalau grup barunya belum sempat masuk, penjaga itu
      // akan langsung menendang pembuatnya keluar dari grup yang baru saja ia buat.
      setGroupsList((prev) => [group, ...prev]);
      pilihPercakapan({type: 'group', data: group});
      // Grup baru dibuat → sidebar perlu disegarkan, bukan cuma pesannya.
      fetchDirectory();
      fetchMessages();
    } catch (err) {
      console.error("Gagal membuat grup:", err);
      setGalatGrup("Terjadi kesalahan tak terduga. Coba lagi sebentar lagi.");
    } finally {
      setMembuatGrup(false);
    }
  };

  /**
   * Menyalin isi pesan. Tersedia untuk pesan SIAPA PUN — menyalin tidak mengubah
   * apa-apa, jadi tidak ada alasan menguncinya ke pemilik pesan.
   */
  const handleCopyMessage = async (msg: any) => {
    tutupMenuAksi();
    const isi = msg?.content || "";
    if (!isi) return;
    try {
      await navigator.clipboard.writeText(isi);
      toast.success("Pesan disalin.");
    } catch {
      // clipboard API butuh konteks aman (https/localhost) dan izin. Kalau
      // ditolak, jangan diam — beri tahu alih-alih pura-pura berhasil.
      toast.error("Browser menolak akses papan klip.");
    }
  };

  /**
   * Hapus pesan — LUNAK (soft delete).
   *
   * Barisnya tidak dibuang dari database; server menandainya `is_deleted` dan
   * mengosongkan isinya, lalu gelembungnya berubah jadi "Pesan ini telah
   * dihapus". Alasannya: menghilangkan pesan sepenuhnya dari tengah percakapan
   * membuat urutan bacaan jadi tidak masuk akal bagi lawan bicara yang sudah
   * terlanjur membacanya. Nisan yang jujur lebih baik daripada lubang.
   */
  const handleDeleteMessage = async (msg: any) => {
    setKonfirmasiHapus(null);
    tutupMenuAksi();

    // Terapkan dulu di layar, konfirmasi ke server belakangan. Menunggu jawaban
    // server membuat pesan seolah "tidak terhapus" selama satu putaran jaringan.
    // Kalau server menolak, daftar dikembalikan seperti semula.
    const sebelum = messages;
    const capWaktu = new Date().toISOString();
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, content: "", is_deleted: true, deleted_at: capWaktu } : m))
    );

    const { error } = await db.from('messages').delete().eq('id', msg.id);
    if (error) {
      setMessages(sebelum);
      console.error("Pesan gagal dihapus:", error);
      toast.error(error.message || "Pesan gagal dihapus. Coba lagi.");
      return;
    }
    toast.success("Pesan dihapus untuk semua orang.");
    fetchMessages();
  };

  const startEditMessage = (msg: any) => {
    tutupMenuAksi();
    setEditingId(msg.id);
    setEditingText(msg.content || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const saveEditMessage = async () => {
    const isi = editingText.trim();
    const idTarget = editingId;
    if (!idTarget) return;
    if (!isi) {
      toast.error("Isi pesan tidak boleh kosong.");
      return;
    }

    // Tampilkan hasil suntingan SEKARANG, jangan tunggu putaran jaringan atau
    // denyut polling berikutnya. Salin dulu daftar lama untuk dikembalikan
    // kalau server menolak.
    const sebelum = messages;
    const capWaktu = new Date().toISOString();
    setMessages((prev) =>
      prev.map((m) => (m.id === idTarget ? { ...m, content: isi, is_edited: true, edited_at: capWaktu } : m))
    );
    cancelEdit();

    const { error } = await db.from('messages').update({ content: isi }).eq('id', idTarget);
    if (error) {
      setMessages(sebelum);
      toast.error(error.message || "Pesan gagal diedit.");
      return;
    }
    // Selaraskan dengan cap waktu sungguhan dari server (yang tadi hanya tebakan
    // lokal supaya tampilan langsung berubah).
    fetchMessages();
  };

  /**
   * ID ruang meeting untuk percakapan yang sedang dibuka.
   *
   * BUG YANG DIPERBAIKI: sebelumnya ruang DM memakai `selectedTarget.data.id`,
   * yaitu id LAWAN BICARA. Jadi kalau A membuka DM ke B, ruangnya bernama "B";
   * saat B membuka DM ke A, ruangnya bernama "A". Dua ruang berbeda — keduanya
   * menekan Start Meeting lalu duduk di ruang masing-masing tanpa pernah
   * bertemu. Nama ruang DM harus SIMETRIS, jadi id kedua pihak diurutkan supaya
   * menghasilkan nama yang sama dari sisi mana pun.
   *
   * Grup diberi awalan tersendiri agar id grup tidak pernah bentrok dengan id
   * pengguna.
   */
  const buildRoomId = () => {
    if (selectedTarget.type === 'dm' && user && selectedTarget.data?.id) {
      const pair = [String(user.id), String(selectedTarget.data.id)].sort();
      return `dm-${pair[0]}--${pair[1]}`;
    }
    if (selectedTarget.type === 'group' && selectedTarget.data?.id) {
      return `grup-${selectedTarget.data.id}`;
    }
    return 'GLOBAL';
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user) return;
    const payload: any = { user_id: user.id, user_name: user.user_metadata.full_name, content: newMessage.trim() };
    if (selectedTarget.type === 'dm') payload.receiver_id = selectedTarget.data.id;
    if (selectedTarget.type === 'group') payload.group_id = selectedTarget.data.id;
    const { error } = await db.from('messages').insert(payload);

    // Kegagalan kirim TIDAK BOLEH senyap. Sebelumnya blok ini hanya `if (!error)`
    // tanpa cabang else: kalau insert gagal, tidak ada pesan galat, tidak ada log,
    // teks tetap tergantung di kotak input — dari sisi pengguna terlihat seperti
    // tombol kirim tidak berfungsi. Itu sebabnya bug DM ini tidak bisa
    // didiagnosis siapa pun. Sekarang penyebab aslinya ditampilkan.
    if (error) {
      console.error("Gagal mengirim pesan:", error, "payload:", payload);
      toast.error(`Pesan gagal terkirim: ${error.message || "penyebab tidak diketahui"}`);
      return;
    }

    {
      // Trigger Notifikasi DM Baru
      if (selectedTarget.type === 'dm') {
        try {
          await db.from('notifications').insert({
            user_id: selectedTarget.data.id,
            title: "Pesan Baru",
            body: `${user.user_metadata.full_name}: "${newMessage.trim().slice(0, 50)}${newMessage.trim().length > 50 ? '...' : ''}"`,
            type: "message",
            link: "/dashboard/diskusi",
            is_read: false
          });
        } catch (err) {
          console.error("Error trigger DM notification:", err);
        }
      }
      setNewMessage("");
      fetchMessages(); 
    }
  };

  // Penyaringan dilakukan di klien atas daftar yang SUDAH diambil, bukan lewat
  // query baru tiap ketikan. Daftarnya sekali ambil dan berukuran wajar, jadi
  // menembak server tiap huruf hanya menambah beban tanpa hasil lebih baik.
  //
  // Pencocokan menyertakan asal kampus: pada satu platform lintas kampus, nama
  // saja sering tidak cukup — "Rafi" bisa ada di UB dan di UNESA sekaligus.
  // Pencarian pengirim untuk foto di gelembung chat. Pesan hanya menyimpan
  // user_id dan user_name, tidak menyimpan foto — dan memang tidak boleh:
  // menyalin URL foto ke tiap pesan berarti foto lama membeku di riwayat saat
  // orangnya berganti foto. Jadi fotonya dicari dari daftar profil saat render.
  const petaPengguna = new Map<string, any>(usersList.map((u) => [u.id, u]));

  // Profil lawan bicara diambil ULANG dari daftar yang disegarkan, bukan dari
  // `selectedTarget.data`. Yang tersimpan di selectedTarget adalah potret saat
  // percakapan dipilih; last_seen di dalamnya membeku di detik itu, sehingga
  // titik hijaunya tidak akan pernah berubah selama percakapan dibuka.
  const profilLawanBicara =
    selectedTarget.type === 'dm'
      ? petaPengguna.get(selectedTarget.data?.id) || selectedTarget.data
      : null;
  const lawanBicaraDaring = sedangDaring(profilLawanBicara?.last_seen);

  // Alasan yang sama untuk anggota grup: yang dipakai adalah profil termutakhir.
  // Diri sendiri tidak ada di petaPengguna (daftar itu memang mengecualikannya),
  // jadi ia dihitung selalu hadir — memang begitu kenyataannya.
  const anggotaGrupTermutakhir = anggotaGrup.map((a) =>
    a.id === user?.id ? a : petaPengguna.get(a.id) || a,
  );
  const anggotaGrupDaring = anggotaGrupTermutakhir.filter(
    (a) => a.id === user?.id || sedangDaring(a.last_seen),
  ).length;

  const kunciCari = cariKontak.trim().toLowerCase();
  const kontakTersaring = kunciCari
    ? usersList.filter((u) =>
        [u.name, u.university, u.study_program]
          .filter(Boolean)
          .some((v: string) => v.toLowerCase().includes(kunciCari)),
      )
    : usersList;
  const grupTersaring = kunciCari
    ? groupsList.filter((g) => g.name?.toLowerCase().includes(kunciCari))
    : groupsList;

  if (!user) return <LoadingScreen />;

  return (
    <div className="flex min-h-screen bg-white text-slate-900 antialiased overflow-hidden font-sans">
      <Sidebar role={user.user_metadata.role} userName={user.user_metadata.full_name} />
      
      {/* Tinggi DIPATOK setinggi layar, juga di ponsel. Dengan `min-h-screen`,
          daftar pesan memanjang mengikuti isinya alih-alih menggulir di
          dalamnya — sehingga kolom tulis pesan terdorong makin jauh ke bawah
          layar setiap kali percakapan bertambah panjang. dvh, bukan vh, supaya
          bilah alamat browser ponsel yang muncul-hilang tidak memotong kolom
          tulis pesan. */}
      <main className="flex-1 flex flex-row h-[100dvh] overflow-hidden pb-20 lg:pb-0">
        {/* PANEL KIRI — daftar percakapan.
            Di bawah lg panel ini memenuhi layar dan bergantian dengan panel
            kanan; di lg ke atas ia kembali jadi kolom tetap 320px. */}
        <div className={`${mobileView === 'chat' ? 'hidden' : 'flex'} lg:flex w-full lg:w-80 border-r border-slate-100 flex-col bg-slate-50/50 shrink-0`}>
          {/* pl-16 di bawah lg: tombol menu melayang di pojok kiri atas
              (fixed, left-3, lebar 44px) dan tanpa ruang ini ia menutupi judul
              "Diskusi". Di lg tombolnya tidak ada, jadi padding kembali normal. */}
          <div className="pl-16 pr-4 py-5 lg:p-6 border-b border-slate-100 bg-white flex justify-between items-center gap-3">
            <h2 className="text-xl font-black uppercase tracking-tighter text-indigo-600 truncate">Diskusi</h2>
            <button onClick={() => { setGalatGrup(""); setIsModalOpen(true); }} title="Buat grup baru" className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100 shrink-0">
              <UserPlus size={18} strokeWidth={3} />
            </button>
          </div>
          {/* Pencarian orang & grup. Daftar kontak memuat SELURUH pengguna
              platform — lintas kampus — jadi menggulir mencari satu nama tidak
              lagi masuk akal begitu penggunanya lebih dari beberapa puluh. */}
          <div className="px-4 pt-4 pb-1 bg-slate-50/50">
            <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 focus-within:ring-4 focus-within:ring-indigo-50 focus-within:border-indigo-400 transition-all">
              <Search size={15} className="text-slate-400 shrink-0" />
              <input
                value={cariKontak}
                onChange={(e) => setCariKontak(e.target.value)}
                placeholder="Cari nama, kampus, atau grup..."
                className="bg-transparent outline-none text-sm font-bold w-full placeholder:text-slate-400 placeholder:font-semibold"
              />
              {cariKontak && (
                <button
                  onClick={() => setCariKontak("")}
                  aria-label="Hapus pencarian"
                  className="text-slate-400 hover:text-slate-600 shrink-0"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 min-h-0">
            {cariKontak.trim() && grupTersaring.length === 0 && kontakTersaring.length === 0 && (
              <p className="text-center text-xs font-bold text-slate-400 py-10 px-4 leading-relaxed">
                Tidak ada yang cocok dengan &quot;{cariKontak.trim()}&quot;.
              </p>
            )}

            <div className={grupTersaring.length === 0 && cariKontak.trim() ? "hidden" : ""}>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-3 mb-3">Grup Saya</p>
              <div className="space-y-1">
                {/* Grup Umum disembunyikan saat mencari — ia tidak punya nama
                    yang bisa dicocokkan, dan menampilkannya di tiap hasil
                    pencarian hanya menambah derau. */}
                {!cariKontak.trim() && (
                  <button onClick={() => pilihPercakapan({type: 'umum', data: null})} className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all ${selectedTarget.type === 'umum' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-white text-slate-600'}`}>
                    <div className="flex items-center gap-3">
                      <Hash size={18} /> <span className="text-sm font-bold uppercase">Grup Umum</span>
                    </div>
                    {chatSummaries['umum_umum']?.unreadCount > 0 && selectedTarget.type !== 'umum' && (
                      <span className="bg-rose-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-sm">
                        {chatSummaries['umum_umum'].unreadCount}
                      </span>
                    )}
                  </button>
                )}
                {grupTersaring.map((g) => {
                  const aktif = selectedTarget.type === 'group' && selectedTarget.data?.id === g.id;
                  const count = chatSummaries[`group_${g.id}`]?.unreadCount || 0;
                  return (
                    <button key={g.id} onClick={() => pilihPercakapan({type: 'group', data: g})} className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all ${aktif ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-white text-slate-600'}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Foto grup dipakai kalau ada; kalau tidak, huruf awal
                            namanya — sama seperti perlakuan foto profil orang. */}
                        <UserAvatar
                          name={g.name}
                          avatarUrl={g.avatar_url}
                          iconSize={14}
                          className="w-8 h-8 rounded-lg bg-slate-200 text-slate-500 text-xs shrink-0"
                        />
                        <span className="text-sm font-bold truncate uppercase min-w-0">{g.name}</span>
                      </div>
                      {count > 0 && !aktif && (
                        <span className="bg-rose-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-sm ml-2">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={kontakTersaring.length === 0 && cariKontak.trim() ? "hidden" : ""}>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-3 mb-3">
                Kontak{cariKontak.trim() ? ` (${kontakTersaring.length})` : ""}
              </p>
              <div className="space-y-1">
                {kontakTersaring.map((u) => {
                  const aktif = selectedTarget.type === 'dm' && selectedTarget.data?.id === u.id;
                  const count = chatSummaries[`dm_${u.id}`]?.unreadCount || 0;
                  return (
                    <button key={u.id} onClick={() => pilihPercakapan({type: 'dm', data: u})} className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all ${aktif ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-white text-slate-600'}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar
                          name={u.name}
                          avatarUrl={u.avatar_url}
                          iconSize={14}
                          className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-xs shrink-0"
                        />
                        {/* Kampus ditampilkan di bawah nama: karena satu platform
                            dipakai lintas kampus, nama saja sering tidak cukup
                            membedakan dua orang. */}
                        <span className="min-w-0 text-left">
                          <span className={`block text-sm font-bold truncate uppercase ${count > 0 && !aktif ? 'text-slate-900' : ''}`}>{u.name}</span>
                          {u.university && (
                            <span className={`block text-[10px] font-bold truncate ${aktif ? 'text-indigo-100' : count > 0 ? 'text-slate-500' : 'text-slate-400'}`}>
                              {u.university}
                            </span>
                          )}
                        </span>
                      </div>
                      {count > 0 && !aktif && (
                        <span className="bg-indigo-600 text-white text-[10px] font-black px-1.5 min-w-[20px] h-5 rounded-full flex items-center justify-center shrink-0 shadow-sm ml-2">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* PANEL KANAN — ruang obrolan.
            `relative` supaya panel profil (absolute inset-0 / right-0) menutupi
            HANYA area obrolan, bukan seluruh layar termasuk daftar percakapan. */}
        <div className={`${mobileView === 'list' ? 'hidden' : 'flex'} lg:flex flex-1 flex-col bg-white min-w-0 relative`}>
          {/* pl-4 di bawah lg: tombol "kembali" mengambil alih peran penunjuk
              posisi, sementara tombol menu global tetap melayang di pojok. */}
          <header className="h-20 border-b border-slate-100 pl-16 pr-4 md:pr-8 lg:pl-8 flex items-center justify-between bg-white/80 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <button
                onClick={() => setMobileView('list')}
                aria-label="Kembali ke daftar percakapan"
                className="lg:hidden p-2 -ml-1 rounded-xl text-slate-500 hover:bg-slate-100 transition-all shrink-0"
              >
                <ChevronLeft size={20} />
              </button>
              {/* Percakapan personal menampilkan foto profil lawan bicara;
                  grup & saluran umum tetap memakai ikon. */}
              {/* Avatar disembunyikan di layar tersempit: bersama tombol menu,
                  tombol kembali, dan tombol meeting, ia mendorong nama
                  percakapan sampai tak tersisa ruang untuk dibaca. */}
              {/* Kepala percakapan sekarang BISA DIKLIK — membuka panel profil
                  di kanan. Dibungkus <button> supaya keyboard & pembaca layar
                  ikut kebagian, bukan cuma onClick di atas <div>. */}
              <button
                type="button"
                onClick={() => setPanelProfilTerbuka(true)}
                aria-label={selectedTarget.type === 'dm' ? "Lihat profil lawan bicara" : "Lihat info grup"}
                className="flex items-center gap-2 sm:gap-4 min-w-0 text-left rounded-2xl px-1 py-1 -mx-1 hover:bg-slate-50 transition-all"
              >
                {selectedTarget.type === 'dm' ? (
                  <span className="relative hidden sm:block shrink-0">
                    <UserAvatar
                      name={profilLawanBicara?.name}
                      avatarUrl={profilLawanBicara?.avatar_url}
                      className="flex w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 text-lg"
                    />
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${lawanBicaraDaring ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  </span>
                ) : selectedTarget.type === 'group' && selectedTarget.data?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedTarget.data.avatar_url}
                    alt={`Foto grup ${selectedTarget.data?.name || ''}`}
                    className="hidden sm:block w-12 h-12 rounded-2xl border border-indigo-100 object-cover shrink-0"
                  />
                ) : (
                  <span className="hidden sm:flex w-12 h-12 bg-indigo-50 text-indigo-600 items-center justify-center font-black rounded-2xl border border-indigo-100 shrink-0">
                    <Users size={24}/>
                  </span>
                )}
                <span className="min-w-0 block">
                  <span className="block font-black text-slate-900 uppercase tracking-tight text-base sm:text-lg leading-none truncate">
                    {selectedTarget.type === 'umum' ? "Grup Umum" : selectedTarget.data?.name}
                  </span>
                  {/* "SALURAN TERENKRIPSI" DIBUANG. Selain tidak benar — tidak
                      ada enkripsi ujung-ke-ujung di sini — baris itu tidak
                      menjawab apa pun yang ingin diketahui orang saat membuka
                      percakapan. Yang dicari: orangnya sedang ada atau tidak. */}
                  {selectedTarget.type === 'dm' ? (
                    <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase mt-2 tracking-widest truncate ${lawanBicaraDaring ? 'text-emerald-500' : 'text-slate-400'}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${lawanBicaraDaring ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className="truncate normal-case tracking-normal font-bold">{labelKehadiran(profilLawanBicara?.last_seen)}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mt-2 truncate">
                      {selectedTarget.type === 'group'
                        ? <>{anggotaGrup.length} anggota · <span className="text-emerald-600">{anggotaGrupDaring} aktif</span></>
                        : <>Saluran terbuka untuk semua pengguna VERO</>}
                    </span>
                  )}
                </span>
              </button>
            </div>
            <button onClick={() => router.push(`/dashboard/diskusi/meeting?roomID=${buildRoomId()}`)} className="bg-slate-900 text-white px-3 sm:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg shrink-0">
              <Video size={16} className="inline sm:mr-2" /> <span className="hidden sm:inline">Start Meeting</span>
            </button>
          </header>

          <div ref={chatContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 custom-scrollbar">
            {(() => {
              let unreadDividerRendered = false;
              return messages.map((msg, i) => {
                const punyaSaya = msg.user_id === user.id;
                const sedangDisunting = editingId === msg.id;
                // Pesan terhapus tetap menempati tempatnya di percakapan, tapi
                // isinya sudah tidak ada — jadi tidak ada yang bisa disunting,
                // dihapus lagi, maupun disalin darinya.
                const sudahDihapus = !!msg.is_deleted;
                // Pesan beruntun dari orang yang sama dirapatkan dan nama
                // pengirimnya tidak diulang — seperti WhatsApp. Ekor gelembung
                // (sudut lancip) hanya dipasang di pesan pertama tiap rentetan.
                const sebelumnya = messages[i - 1];
                const lanjutan = !!sebelumnya && sebelumnya.user_id === msg.user_id;

                // Foto pengirim hanya di percakapan BANYAK ORANG.
                const chatBanyakOrang = selectedTarget.type !== 'dm';
                const pengirim = petaPengguna.get(msg.user_id);

                const msgDate = new Date(msg.created_at);
                const showDayDivider = !sebelumnya || new Date(sebelumnya.created_at).toDateString() !== msgDate.toDateString();

                // Deteksi pesan belum dibaca pertama
                const isUnread = !punyaSaya && lastReadSebelumnya && msgDate > new Date(lastReadSebelumnya);
                const showUnreadDivider = isUnread && !unreadDividerRendered && !sudahDihapus;
                if (showUnreadDivider) {
                  unreadDividerRendered = true;
                }

                return (
                <div key={msg.id || i}>
                  {showDayDivider && (
                    <div className="w-full flex justify-center my-4 sticky top-2 z-10">
                      <span className="bg-slate-200/90 backdrop-blur-sm text-slate-600 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-sm">
                        {formatDayDivider(msg.created_at)}
                      </span>
                    </div>
                  )}

                  {showUnreadDivider && (
                    <div className="w-full flex justify-center my-4">
                      <span className="bg-indigo-100 text-indigo-600 border border-indigo-200 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-sm">
                        {chatSummaries[
                          selectedTarget.type === 'umum' ? 'umum_umum' :
                          selectedTarget.type === 'dm' ? `dm_${selectedTarget.data?.id}` :
                          `group_${selectedTarget.data?.id}`
                        ]?.unreadCount || 0} PESAN BELUM DIBACA
                      </span>
                    </div>
                  )}

                  <div className={`flex group items-end gap-2 ${lanjutan ? 'mt-0.5' : 'mt-3 first:mt-0'} ${punyaSaya ? 'justify-end' : 'justify-start'}`}>
                    {/* Foto dipasang hanya di pesan PERTAMA tiap rentetan; pesan
                        lanjutan mendapat ruang kosong selebar foto supaya
                        gelembungnya tetap sejajar dan tidak bergeser-geser. */}
                    {chatBanyakOrang && !punyaSaya && (
                      lanjutan ? (
                        <div className="w-8 shrink-0" aria-hidden="true" />
                      ) : (
                        <UserAvatar
                          name={pengirim?.name || msg.user_name}
                          avatarUrl={pengirim?.avatar_url}
                          iconSize={14}
                          className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-xs shrink-0 self-end"
                        />
                      )
                    )}

                    {/* w-fit + max-w responsif: gelembung mengikuti panjang teks,
                        pesan pendek tidak lagi jadi kotak besar. */}
                    <div
                      onTouchStart={(e) => {
                        if (sedangDisunting || sudahDihapus) return;
                        // Tekan-lama ~500ms membuka menu aksi. Timer dibatalkan
                        // begitu jari diangkat atau digeser, supaya menggulir
                        // percakapan tidak salah dikira menekan lama.
                        const el = e.currentTarget as HTMLElement;
                        tekanLamaRef.current = setTimeout(() => bukaMenuAksi(el, msg, punyaSaya), 500);
                      }}
                      onTouchEnd={() => clearTimeout(tekanLamaRef.current)}
                      onTouchMove={() => clearTimeout(tekanLamaRef.current)}
                      onContextMenu={(e) => {
                        if (sedangDisunting || sudahDihapus) return;
                        e.preventDefault();
                        bukaMenuAksi(e.currentTarget as HTMLElement, msg, punyaSaya);
                      }}
                      className={`relative w-fit max-w-[85%] sm:max-w-[75%] md:max-w-[65%] px-3 py-2 shadow-sm ${punyaSaya ? 'bg-indigo-600 text-white' : 'bg-white text-slate-800'} ${lanjutan ? 'rounded-2xl' : punyaSaya ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl rounded-tl-sm'}`}
                    >
                      {!punyaSaya && !lanjutan && <p className="text-[10px] font-black text-indigo-600 uppercase mb-0.5">{msg.user_name}</p>}

                      {sedangDisunting ? (
                        <div className="space-y-3">
                          <input
                            autoFocus
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditMessage();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            className="w-full bg-white/95 text-slate-800 rounded-xl px-3 py-2 text-sm font-medium outline-none border-2 border-white/60"
                          />
                          <div className="flex gap-2 justify-end">
                            <button onClick={cancelEdit} className="px-3 py-1.5 rounded-lg bg-white/20 text-[10px] font-black uppercase tracking-widest hover:bg-white/30">Batal</button>
                            <button onClick={saveEditMessage} className="px-3 py-1.5 rounded-lg bg-white text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100">Simpan</button>
                          </div>
                          <p className="text-[9px] font-bold opacity-60">Enter untuk simpan · Esc untuk batal</p>
                        </div>
                      ) : (
                        /* flex-wrap: pesan pendek berbagi satu baris dengan jam
                           ("oke  12:30"), pesan panjang mendorong jam turun ke
                           kanan bawah. Persis perilaku WhatsApp, tanpa float. */
                        <div className="flex flex-wrap items-end justify-end gap-x-2">
                          {sudahDihapus ? (
                            <p className="flex items-center gap-1.5 text-sm font-medium italic leading-snug opacity-60 min-w-0">
                              <Ban size={13} className="shrink-0" /> Pesan ini telah dihapus
                            </p>
                          ) : (
                            <p className="text-sm font-medium leading-snug whitespace-pre-wrap break-words min-w-0">{msg.content}</p>
                          )}
                          {/* Penanda suntingan — penerima berhak tahu isi pesan
                              sempat berubah setelah dikirim. Tidak ditampilkan pada
                              pesan terhapus: di sana tidak ada lagi isi yang bisa
                              dibandingkan, jadi "diedit" cuma jadi derau. */}
                          <p className="text-[9px] font-bold uppercase opacity-50 shrink-0 leading-none pb-0.5">
                            {!sudahDihapus && (msg.is_edited || msg.edited_at) && <span className="italic normal-case mr-1">diedit ·</span>}
                            {format(new Date(msg.created_at), 'HH:mm')}
                          </p>
                        </div>
                      )}

                      {sedangDisunting && (
                        <p className="text-[9px] mt-2 font-bold uppercase opacity-50 text-right">
                          {format(new Date(msg.created_at), 'HH:mm')}
                        </p>
                      )}

                      {/* Tombol pembuka menu aksi.
                          - Desktop: muncul saat hover (opacity-0 → group-hover).
                          - Ponsel: SELALU terlihat, karena hover tidak ada di sana —
                            di layar sentuh, aksi yang hanya bisa dicapai lewat hover
                            sama saja dengan tidak ada.
                          Sisi tombol mengikuti sisi gelembung supaya tidak pernah
                          menimpa teks: kiri untuk pesan sendiri (yang rata kanan),
                          kanan untuk pesan orang lain. */}
                      {!sedangDisunting && !sudahDihapus && (
                        <div className={`absolute ${punyaSaya ? '-left-9' : '-right-9'} top-1/2 -translate-y-1/2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-within:opacity-100 transition-opacity`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Toggle: klik kedua pada tombol yang sama menutup menu.
                              if (menuAksi?.msg?.id === msg.id) tutupMenuAksi();
                              else bukaMenuAksi(e.currentTarget as HTMLElement, msg, punyaSaya);
                            }}
                            className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow text-slate-500 hover:text-indigo-600 flex items-center justify-center"
                            title="Opsi pesan"
                            aria-label="Opsi pesan"
                          >
                            <MoreVertical size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                );
              });
            })()}
          </div>

          {/* pb-24 DIBUANG. <main> sudah menyisakan pb-20 untuk bottom-nav,
              jadi menambah 96px lagi di sini membuat kolom pesan melayang ~176px
              di atas tepi layar. Cukup satu tempat yang mencadangkan ruang itu. */}
          <div className="p-4 lg:p-6 bg-white border-t border-slate-100 shrink-0">
            <div className="flex gap-4 bg-slate-100 p-2 rounded-2xl border-2 border-slate-200 focus-within:border-indigo-600 transition-all">
              <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Tulis pesan..." className="flex-1 bg-transparent outline-none px-4 text-sm font-bold text-slate-700" />
              <button onClick={handleSendMessage} className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 shadow-xl transition-all"><Send size={20} /></button>
            </div>
          </div>

          {/* Panel profil / info grup. Saluran umum tidak punya profil siapa pun
              untuk ditampilkan, jadi di sana panelnya tidak pernah dibuka. */}
          <ChatProfilePanel
            terbuka={panelProfilTerbuka && selectedTarget.type !== 'umum'}
            onTutup={() => setPanelProfilTerbuka(false)}
            profil={selectedTarget.type === 'dm' ? profilLawanBicara : undefined}
            grup={
              selectedTarget.type === 'group' && selectedTarget.data?.id
                ? {
                    id: selectedTarget.data.id,
                    nama: selectedTarget.data?.name || "Grup",
                    avatarUrl: selectedTarget.data?.avatar_url ?? null,
                    anggota: anggotaGrupTermutakhir,
                    // Hak kelola dibaca dari creator_id grup. Ini HANYA untuk
                    // menentukan tombol mana yang ditampilkan — app/api/group
                    // memeriksanya lagi dan menolak siapa pun yang bukan pembuat,
                    // apa pun yang dikirim browser.
                    bisaKelola: selectedTarget.data?.creator_id === user.id,
                    galatAnggota,
                  }
                : null
            }
            onGrupBerubah={(patch) => {
              // Perbarui percakapan yang sedang dibuka supaya header & panel
              // langsung ikut berubah, lalu segarkan daftar grup di sidebar.
              setSelectedTarget((prev) =>
                prev.type === 'group' ? { ...prev, data: { ...prev.data, ...patch } } : prev,
              );
              fetchDirectory();
              setPenyegarGrup((n) => n + 1);
            }}
            onGrupHilang={() => {
              setPanelProfilTerbuka(false);
              // Kembali ke tampilan default: grupnya sudah tidak ada, jadi tidak
              // ada percakapan yang bisa ditampilkan di sini.
              setSelectedTarget({ type: 'umum', data: null });
              setMobileView('list');
              fetchDirectory();
            }}
          />
        </div>
      </main>

      {/* MODAL BUAT GRUP & PILIH ANGGOTA */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 font-sans">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl border-4 border-white flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-8 shrink-0">
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Konfigurasi Grup</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-900"><X /></button>
              </div>
              <form onSubmit={handleCreateGroup} className="space-y-6 flex-1 flex flex-col overflow-hidden">
                <div className="shrink-0">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block ml-1">Nama Grup</label>
                  {/* `required` DIBUANG: validasi bawaan browser memblokir submit
                      dengan gelembung yang mudah terlewat, dan itulah yang bikin
                      tombol terasa "tidak merespons". Sekarang pesan galatnya
                      tampil di dalam modal. */}
                  <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-600 font-bold text-lg" placeholder="MISAL: KELOMPOK 1" value={newGroupName} onChange={(e) => { setNewGroupName(e.target.value.toUpperCase()); if (galatGrup) setGalatGrup(""); }} />
                </div>

                <div className="flex-1 flex flex-col overflow-hidden">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block ml-1">Undang Anggota ({selectedUserIds.length})</label>
                  <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar border-t border-b border-slate-100 py-4">
                    {usersList.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => { toggleUserSelection(u.id); if (galatGrup) setGalatGrup(""); }}
                        className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all border-2 ${selectedUserIds.includes(u.id) ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50 border-transparent'}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Dulu di sini ada kotak inisial buatan sendiri, jadi
                              orang yang fotonya tampil rapi di daftar kontak
                              mendadak jadi huruf kosong begitu masuk modal ini.
                              Sekarang memakai komponen yang SAMA dengan chat —
                              satu tempat yang tahu cara menampilkan foto profil,
                              lengkap dengan cadangan inisial/ikonnya. */}
                          <UserAvatar
                            name={u.name}
                            avatarUrl={u.avatar_url}
                            iconSize={18}
                            className="w-10 h-10 rounded-full bg-slate-200 text-slate-500"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-slate-800 uppercase truncate">{u.name}</span>
                            {u.university && (
                              <span className="block text-[10px] font-bold text-slate-400 truncate">{u.university}</span>
                            )}
                          </span>
                        </div>
                        <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedUserIds.includes(u.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                          {selectedUserIds.includes(u.id) && <Check size={14} className="text-white" strokeWidth={4} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {galatGrup && (
                  <p role="alert" className="shrink-0 -mb-2 text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 leading-relaxed">
                    {galatGrup}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={membuatGrup}
                  className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-2xl hover:bg-indigo-600 transition-all uppercase tracking-widest text-xs shrink-0 mt-4 disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {membuatGrup ? (<><Loader2 size={14} className="animate-spin" /> Membuat Grup…</>) : "Selesaikan & Buat Grup"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SATU menu untuk seluruh daftar pesan, diportal ke <body>. Dirender di
          luar <main> supaya tidak ikut terpotong oleh wadah mana pun. */}
      <MessageActionMenu
        anchor={menuAksi?.anchor ?? null}
        punyaSaya={menuAksi?.msg?.user_id === user.id}
        onSalin={() => handleCopyMessage(menuAksi!.msg)}
        onEdit={() => startEditMessage(menuAksi!.msg)}
        onHapus={() => { const m = menuAksi!.msg; tutupMenuAksi(); setKonfirmasiHapus(m); }}
        onTutup={tutupMenuAksi}
      />

      {/* Konfirmasi sebelum menghapus. Hapus tidak bisa dibatalkan dan terlihat
          oleh semua peserta, jadi ia tidak boleh terjadi hanya karena satu
          ketukan yang meleset di menu. */}
      <ConfirmModal
        isOpen={!!konfirmasiHapus}
        title="Hapus pesan ini?"
        message="Pesan akan diganti menjadi “Pesan ini telah dihapus” untuk semua peserta percakapan. Isinya tidak bisa dikembalikan."
        confirmLabel="Ya, Hapus"
        onConfirm={() => handleDeleteMessage(konfirmasiHapus)}
        onCancel={() => setKonfirmasiHapus(null)}
      />
    </div>
  );
}