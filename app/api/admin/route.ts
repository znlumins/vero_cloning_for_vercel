import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { userIdDariRequest } from "@/lib/authToken";
import { normalkanKampus } from "@/lib/universitas";

// Seluruh operasi admin, di balik SATU gerbang.
//
// KENAPA SEMUA LEWAT SINI, BUKAN LEWAT /api/db
// --------------------------------------------
// Menyembunyikan tombol di UI bukan keamanan. lib/access.ts membaca metadata di
// localStorage yang bisa disunting siapa pun lewat DevTools — mengubah
// `role: "MAHASISWA"` jadi `"ADMIN"` di sana cukup untuk memunculkan seluruh
// panel admin. Yang membuat itu tidak berbahaya adalah berkas ini: setiap
// tindakan memverifikasi role dari DATABASE lebih dulu, memakai userId yang
// diambil dari token bertanda tangan, bukan dari apa pun yang dikirim browser.
//
// Kalau /api/db yang dipakai, hasilnya sebaliknya: ia CRUD generik yang
// meneruskan kolom apa pun ke Prisma, jadi mahasiswa mana pun yang sudah login
// bisa mengangkat dirinya jadi admin lewat satu permintaan.

type Aksi =
  | "stats"
  | "listUsers"
  | "setRole"
  | "setDosenStatus"
  | "deleteUser"
  | "listClasses"
  | "deleteClass"
  | "listActivity"
  | "mergeUniversities";

/** Selisih milidetik untuk jendela "7 hari terakhir". */
const TUJUH_HARI_MS = 7 * 24 * 60 * 60 * 1000;

/** Pastikan pemanggilnya benar-benar ADMIN menurut database. */
async function pastikanAdmin(req: Request): Promise<{ id: string } | NextResponse> {
  const userId = userIdDariRequest(req);
  if (!userId) {
    return NextResponse.json(
      { data: null, error: { message: "Tidak terautentikasi." } },
      { status: 401 },
    );
  }
  const profil = await prisma.profile.findUnique({ where: { id: userId } });
  if (!profil || profil.role !== "ADMIN") {
    // 403, bukan 404: pemanggilnya memang dikenali, tapi tidak berwenang.
    return NextResponse.json(
      { data: null, error: { message: "Butuh hak admin." } },
      { status: 403 },
    );
  }
  return { id: userId };
}

export async function POST(req: Request) {
  try {
    const penjaga = await pastikanAdmin(req);
    if (penjaga instanceof NextResponse) return penjaga;
    const adminId = penjaga.id;

    const body = await req.json().catch(() => ({}));
    const aksi: Aksi = body?.action;

    switch (aksi) {
      // ---------------------------------------------------------------- stats
      case "stats": {
        const [
          totalUser,
          mahasiswa,
          dosen,
          admin,
          temanTuli,
          temanDengar,
          belumIsiStatus,
          dosenPending,
          totalKelas,
          totalPesan,
          totalGrup,
          totalPengumuman,
        ] = await Promise.all([
          prisma.profile.count(),
          prisma.profile.count({ where: { role: "MAHASISWA" } }),
          prisma.profile.count({ where: { role: "DOSEN" } }),
          prisma.profile.count({ where: { role: "ADMIN" } }),
          prisma.profile.count({ where: { hearingStatus: "TEMAN_TULI" } }),
          prisma.profile.count({ where: { hearingStatus: "TEMAN_DENGAR" } }),
          prisma.profile.count({ where: { hearingStatus: null } }),
          prisma.profile.count({ where: { role: "DOSEN", dosenStatus: "PENDING" } }),
          prisma.class.count(),
          prisma.message.count(),
          prisma.group.count(),
          prisma.announcement.count(),
        ]);

        // Sebaran per kampus. Dikelompokkan di sini, bukan lewat groupBy SQL:
        // kolomnya teks bebas, jadi "UB" dan "Universitas Brawijaya" akan jadi
        // dua baris terpisah kalau dicocokkan mentah. normalkanKampus()
        // menyatukan beda spasi & huruf besar-kecil, sementara nama yang
        // ditampilkan diambil dari ejaan pertama yang ditemui.
        const semuaKampus = await prisma.profile.findMany({
          where: { university: { not: null } },
          select: { university: true, hearingStatus: true },
        });
        const petaKampus = new Map<
          string,
          { nama: string; total: number; tuli: number; dengar: number }
        >();
        for (const p of semuaKampus) {
          const kunci = normalkanKampus(p.university);
          if (!kunci) continue;
          const baris = petaKampus.get(kunci) ?? {
            nama: p.university!.trim(),
            total: 0, tuli: 0, dengar: 0,
          };
          baris.total += 1;
          if (p.hearingStatus === "TEMAN_TULI") baris.tuli += 1;
          if (p.hearingStatus === "TEMAN_DENGAR") baris.dengar += 1;
          petaKampus.set(kunci, baris);
        }
        // ---- Metrik tambahan, semuanya dihitung dari data nyata ----
        //
        // Beberapa di antaranya menuntut menggabungkan beberapa tabel di memori
        // alih-alih satu kueri agregat. Itu disengaja: kolom yang jadi dasarnya
        // (status pendengaran) boleh kosong, dan yang kosong itu harus terhitung
        // sebagai "tidak diketahui", bukan diam-diam masuk salah satu kelompok.

        const batas7Hari = new Date(Date.now() - TUJUH_HARI_MS);

        const [
          penggunaBaru7Hari,
          totalPendaftaran,
          pengumumanTerakhir,
          semuaProfil,
          keanggotaanGrup,
          pendaftaranKelas,
          pesanRingkas,
        ] = await Promise.all([
          prisma.user.count({ where: { createdAt: { gte: batas7Hari } } }),
          prisma.enrollment.count(),
          prisma.announcement.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
          prisma.profile.findMany({ select: { id: true, hearingStatus: true, university: true, studyProgram: true } }),
          prisma.groupMember.findMany({ select: { groupId: true, userId: true } }),
          prisma.enrollment.findMany({ select: { classId: true, userId: true } }),
          prisma.message.findMany({ select: { userId: true, receiverId: true, groupId: true } }),
        ]);

        const statusOrang = new Map(semuaProfil.map((p) => [p.id, p.hearingStatus]));

        /** Apakah sekumpulan orang memuat kedua kelompok sekaligus? */
        const komposisiCampur = (userIds: string[]) => {
          let tuli = false, dengar = false;
          for (const uid of userIds) {
            const s = statusOrang.get(uid);
            if (s === "TEMAN_TULI") tuli = true;
            else if (s === "TEMAN_DENGAR") dengar = true;
            if (tuli && dengar) return true;
          }
          return false;
        };

        // Kelas dengan komposisi campur.
        const anggotaPerKelas = new Map<string, string[]>();
        for (const e of pendaftaranKelas) {
          const arr = anggotaPerKelas.get(e.classId) ?? [];
          arr.push(e.userId);
          anggotaPerKelas.set(e.classId, arr);
        }
        let kelasCampur = 0;
        for (const anggota of anggotaPerKelas.values()) {
          if (komposisiCampur(anggota)) kelasCampur += 1;
        }

        // Komposisi tiap grup, dipakai untuk menilai pesan grup di bawah.
        const anggotaPerGrup = new Map<string, string[]>();
        for (const gm of keanggotaanGrup) {
          const arr = anggotaPerGrup.get(gm.groupId) ?? [];
          arr.push(gm.userId);
          anggotaPerGrup.set(gm.groupId, arr);
        }
        const grupCampur = new Set<string>();
        for (const [gid, anggota] of anggotaPerGrup) {
          if (komposisiCampur(anggota)) grupCampur.add(gid);
        }

        // PESAN LINTAS KELOMPOK.
        //
        // Definisinya harus ditulis terang-terangan karena tidak ada satu jawaban
        // yang jelas untuk pesan grup — sebuah pesan grup tidak punya satu
        // penerima yang bisa dibandingkan status pendengarannya.
        //
        //   - Percakapan personal: lintas kalau status pengirim dan penerima
        //     sama-sama terisi DAN berbeda.
        //   - Pesan grup: lintas kalau grupnya memuat Teman Tuli DAN Teman
        //     Dengar sekaligus — pesannya memang dibaca melintasi keduanya.
        //   - Saluran umum: TIDAK dihitung sama sekali. Penerimanya seluruh
        //     platform, jadi menyebutnya "lintas" tidak memberi tahu apa pun.
        //
        // Penyebutnya bukan total pesan, melainkan pesan yang BISA dinilai —
        // memasukkan pesan yang datanya tidak lengkap ke penyebut akan membuat
        // angkanya turun hanya karena ada yang belum mengisi profil.
        let pesanLintas = 0;
        let pesanTerklasifikasi = 0;
        for (const m of pesanRingkas) {
          if (m.groupId) {
            if (!anggotaPerGrup.has(m.groupId)) continue;
            pesanTerklasifikasi += 1;
            if (grupCampur.has(m.groupId)) pesanLintas += 1;
          } else if (m.receiverId) {
            const a = statusOrang.get(m.userId);
            const b = statusOrang.get(m.receiverId);
            if (!a || !b) continue;
            pesanTerklasifikasi += 1;
            if (a !== b) pesanLintas += 1;
          }
        }

        // Grup yang benar-benar dipakai — bukan sekadar dibuat lalu dibiarkan.
        const grupAktif = new Set(pesanRingkas.map((m) => m.groupId).filter(Boolean)).size;

        // Kelengkapan data per kampus: berapa persen profilnya sudah mengisi
        // status pendengaran DAN program studi. Dua kolom itu yang paling sering
        // dilewati, dan keduanya yang paling dibutuhkan analisis.
        const kelengkapanPerKampus = new Map<string, { lengkap: number; total: number }>();
        for (const p of semuaProfil) {
          const kunci = normalkanKampus(p.university);
          if (!kunci) continue;
          const b = kelengkapanPerKampus.get(kunci) ?? { lengkap: 0, total: 0 };
          b.total += 1;
          if (p.hearingStatus && p.studyProgram) b.lengkap += 1;
          kelengkapanPerKampus.set(kunci, b);
        }

        const kampus = [...petaKampus.entries()]
          .map(([kunci, baris]) => {
            const l = kelengkapanPerKampus.get(kunci);
            return {
              ...baris,
              kunci,
              kelengkapan: l && l.total > 0 ? Math.round((l.lengkap / l.total) * 100) : 0,
            };
          })
          .sort((a, b) => b.total - a.total);

        return NextResponse.json({
          data: {
            totalUser, mahasiswa, dosen, admin,
            temanTuli, temanDengar, belumIsiStatus,
            dosenPending,
            totalKelas, totalPesan, totalGrup, totalPengumuman,
            penggunaBaru7Hari,
            rataPesertaKelas: totalKelas > 0 ? Math.round((totalPendaftaran / totalKelas) * 10) / 10 : 0,
            grupAktif,
            pengumumanTerakhir: pengumumanTerakhir?.createdAt ?? null,
            kelasCampur,
            kelasDinilai: totalKelas,
            pesanLintas,
            pesanTerklasifikasi,
            kampus,
          },
          error: null,
        });
      }

      // ------------------------------------------------------------- aktivitas
      // Tidak ada tabel log kejadian di schema ini, jadi lini masa dirangkai
      // dari cap waktu yang MEMANG sudah ada di tabel-tabel biasa.
      //
      // Konsekuensi yang harus disadari: satu jenis kejadian yang diminta —
      // "pengguna melengkapi preferensi" — tidak bisa ditampilkan, karena
      // profiles hanya menyimpan hasil akhirnya tanpa kapan itu terjadi. Ia
      // sengaja DIHILANGKAN, bukan diisi tanggal karangan.
      case "listActivity": {
        const [pesan, pengumuman, penggunaBaru, kelasBaru] = await Promise.all([
          prisma.message.findMany({
            orderBy: { createdAt: "desc" }, take: 8,
            select: { id: true, createdAt: true, userName: true, groupId: true },
          }),
          prisma.announcement.findMany({
            orderBy: { createdAt: "desc" }, take: 5,
            include: { user: { include: { profile: true } } },
          }),
          prisma.user.findMany({
            orderBy: { createdAt: "desc" }, take: 5,
            include: { profile: true },
          }),
          prisma.class.findMany({
            orderBy: { createdAt: "desc" }, take: 5,
            include: { creator: { include: { profile: true } } },
          }),
        ]);

        const idGrup = [...new Set(pesan.map((m) => m.groupId).filter(Boolean) as string[])];
        const grup = idGrup.length
          ? await prisma.group.findMany({ where: { id: { in: idGrup } }, select: { id: true, name: true } })
          : [];
        const namaGrup = new Map(grup.map((g) => [g.id, g.name]));

        const item = [
          ...pesan.map((m) => ({
            id: `msg-${m.id}`,
            jenis: "pesan",
            judul: m.groupId
              ? `Pesan baru di grup ${namaGrup.get(m.groupId) || "tanpa nama"}`
              : "Pesan baru di saluran umum",
            oleh: m.userName ?? null,
            waktu: m.createdAt,
          })),
          ...pengumuman.map((a) => ({
            id: `ann-${a.id}`,
            jenis: "pengumuman",
            judul: "Pengumuman dipublikasikan",
            oleh: a.user?.profile?.name ?? a.user?.email ?? null,
            waktu: a.createdAt,
          })),
          ...penggunaBaru.map((u) => ({
            id: `usr-${u.id}`,
            jenis: "pengguna",
            judul: `${u.profile?.name || u.email || "Akun baru"} bergabung`,
            oleh: u.profile?.role ?? null,
            waktu: u.createdAt,
          })),
          ...kelasBaru.map((k) => ({
            id: `cls-${k.id}`,
            jenis: "kelas",
            judul: `Kelas ${k.className} dibuat`,
            oleh: k.creator?.profile?.name ?? null,
            waktu: k.createdAt,
          })),
        ]
          .filter((i) => !!i.waktu)
          .sort((a, b) => new Date(b.waktu!).getTime() - new Date(a.waktu!).getTime())
          .slice(0, 10);

        return NextResponse.json({ data: item, error: null });
      }

      // ----------------------------------------------------- mergeUniversities
      // Menggabungkan beberapa ejaan kampus jadi satu.
      //
      // Ini ada karena kolomnya memang teks bebas (lihat alasannya di
      // prisma/schema.prisma). normalkanKampus() menyatukan beda huruf besar-kecil
      // dan spasi, tapi "UB" dan "Universitas Brawijaya" tidak akan pernah
      // disatukan mesin mana pun tanpa seseorang menyatakan bahwa keduanya sama.
      // Jadi inilah tempat pernyataan itu dijalankan — sekali, oleh admin.
      case "mergeUniversities": {
        const sumber: string[] = Array.isArray(body?.sources) ? body.sources.map(String) : [];
        const tujuan = typeof body?.target === "string" ? body.target.trim() : "";
        if (!tujuan || sumber.length === 0) {
          return NextResponse.json(
            { data: null, error: { message: "Pilih minimal satu ejaan sumber dan satu nama tujuan." } },
            { status: 400 },
          );
        }

        // Pencocokan lewat bentuk ternormalkan, bukan string mentah — kalau tidak,
        // "universitas brawijaya" (huruf kecil) akan tertinggal.
        const kunciSumber = new Set(sumber.map((s) => normalkanKampus(s)).filter(Boolean));
        const kandidat = await prisma.profile.findMany({
          where: { university: { not: null } },
          select: { id: true, university: true },
        });
        const idDiubah = kandidat
          .filter((p) => kunciSumber.has(normalkanKampus(p.university)))
          .map((p) => p.id);

        if (idDiubah.length === 0) {
          return NextResponse.json({ data: { diubah: 0 }, error: null });
        }

        await prisma.profile.updateMany({
          where: { id: { in: idDiubah } },
          data: { university: tujuan.slice(0, 255) },
        });

        return NextResponse.json({ data: { diubah: idDiubah.length }, error: null });
      }

      // ------------------------------------------------------------ listUsers
      case "listUsers": {
        const cari = typeof body?.q === "string" ? body.q.trim() : "";
        const users = await prisma.user.findMany({
          where: cari
            ? {
                OR: [
                  { email: { contains: cari } },
                  { profile: { name: { contains: cari } } },
                ],
              }
            : undefined,
          include: { profile: true },
          orderBy: { createdAt: "desc" },
          take: 200,
        });

        return NextResponse.json({
          data: users.map((u) => ({
            id: u.id,
            email: u.email,
            created_at: u.createdAt,
            full_name: u.profile?.name ?? null,
            role: u.profile?.role ?? null,
            hearing_status: u.profile?.hearingStatus ?? null,
            dosen_status: u.profile?.dosenStatus ?? null,
            avatar_url: u.profile?.avatarUrl ?? null,
            university: u.profile?.university ?? null,
            study_program: u.profile?.studyProgram ?? null,
          })),
          error: null,
        });
      }

      // -------------------------------------------------------------- setRole
      case "setRole": {
        const target = String(body?.userId || "");
        const roleBaru = body?.role;
        if (!["MAHASISWA", "DOSEN", "ADMIN"].includes(roleBaru)) {
          return NextResponse.json(
            { data: null, error: { message: "Role tidak dikenali." } },
            { status: 400 },
          );
        }
        // Admin tidak boleh menurunkan dirinya sendiri. Kalau ia satu-satunya
        // admin, satu klik keliru akan mengunci SEMUA ORANG keluar dari panel
        // admin, dan pemulihannya hanya bisa lewat akses server.
        if (target === adminId && roleBaru !== "ADMIN") {
          return NextResponse.json(
            { data: null, error: { message: "Tidak bisa menurunkan peran akun Anda sendiri." } },
            { status: 400 },
          );
        }

        // Dosen yang diangkat admin langsung APPROVED — pengangkatan oleh admin
        // ITU SENDIRI adalah verifikasinya; menyisakan PENDING berarti admin
        // harus menyetujui apa yang baru saja ia tetapkan.
        const dosenStatus = roleBaru === "DOSEN" ? "APPROVED" : null;

        await prisma.profile.update({
          where: { id: target },
          data: { role: roleBaru, dosenStatus },
        });
        return NextResponse.json({ data: { ok: true }, error: null });
      }

      // ------------------------------------------------------- setDosenStatus
      case "setDosenStatus": {
        const target = String(body?.userId || "");
        const status = body?.status;
        if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
          return NextResponse.json(
            { data: null, error: { message: "Status tidak dikenali." } },
            { status: 400 },
          );
        }
        const profil = await prisma.profile.findUnique({ where: { id: target } });
        if (!profil || profil.role !== "DOSEN") {
          return NextResponse.json(
            { data: null, error: { message: "Akun ini bukan dosen." } },
            { status: 400 },
          );
        }
        await prisma.profile.update({ where: { id: target }, data: { dosenStatus: status } });
        return NextResponse.json({ data: { ok: true }, error: null });
      }

      // ----------------------------------------------------------- deleteUser
      case "deleteUser": {
        const target = String(body?.userId || "");
        if (target === adminId) {
          return NextResponse.json(
            { data: null, error: { message: "Tidak bisa menghapus akun Anda sendiri." } },
            { status: 400 },
          );
        }
        // Relasi memakai onDelete: Cascade, jadi menghapus user ikut membuang
        // profil, kelas yang ia buat, pesan, dan seterusnya. Ini TIDAK bisa
        // dibatalkan — peringatannya ada di UI.
        await prisma.user.delete({ where: { id: target } });
        return NextResponse.json({ data: { ok: true }, error: null });
      }

      // ---------------------------------------------------------- listClasses
      case "listClasses": {
        const kelas = await prisma.class.findMany({
          include: {
            creator: { include: { profile: true } },
            _count: { select: { enrollments: true, tasks: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        });
        return NextResponse.json({
          data: kelas.map((k) => ({
            id: k.id,
            class_name: k.className,
            class_code: k.classCode,
            lecturer_name: k.lecturerName,
            schedule_time: k.scheduleTime,
            created_at: k.createdAt,
            creator_name: k.creator?.profile?.name ?? null,
            creator_email: k.creator?.email ?? null,
            jumlah_peserta: k._count.enrollments,
            jumlah_tugas: k._count.tasks,
          })),
          error: null,
        });
      }

      // --------------------------------------------------------- deleteClass
      case "deleteClass": {
        const id = String(body?.classId || "");
        await prisma.class.delete({ where: { id } });
        return NextResponse.json({ data: { ok: true }, error: null });
      }

      default:
        return NextResponse.json(
          { data: null, error: { message: `Aksi "${aksi}" tidak dikenali.` } },
          { status: 400 },
        );
    }
  } catch (e) {
    console.error("Admin API error:", e);
    return NextResponse.json(
      { data: null, error: { message: "Terjadi kesalahan di server." } },
      { status: 500 },
    );
  }
}
