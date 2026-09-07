import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { userIdDariRequest } from "@/lib/authToken";

// Melengkapi profil: status pendengaran (wajib) dan role (opsional).
//
// KENAPA ENDPOINT SENDIRI, BUKAN LEWAT /api/db
// --------------------------------------------
// /api/db adalah CRUD generik — ia meneruskan kolom apa pun yang dikirim klien
// ke Prisma. Kalau perubahan role lewat sana, siapa pun yang sudah login bisa
// mengirim `{ role: "ADMIN" }` ke tabel profiles dan mengangkat dirinya sendiri.
// Endpoint ini menutup itu dengan daftar-putih yang tidak memuat ADMIN, dan
// memaksa role DOSEN selalu lahir sebagai PENDING.
//
// Perubahan role sengaja hanya diizinkan SEKALI, yaitu saat profil belum
// lengkap. Setelah itu role hanya bisa diubah admin — kalau tidak, seorang
// dosen yang sudah ditolak tinggal mengosongkan profilnya lalu mendaftar ulang
// sebagai dosen tanpa batas.

export async function POST(req: Request) {
  try {
    const userId = userIdDariRequest(req);
    if (!userId) {
      return NextResponse.json(
        { data: null, error: { message: "Tidak terautentikasi." } },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));

    const hearing = body?.hearing_status;
    if (hearing !== "TEMAN_TULI" && hearing !== "TEMAN_DENGAR") {
      return NextResponse.json(
        { data: null, error: { message: "Status pendengaran wajib dipilih." } },
        { status: 400 },
      );
    }

    const profilSekarang = await prisma.profile.findUnique({ where: { id: userId } });
    if (!profilSekarang) {
      return NextResponse.json(
        { data: null, error: { message: "Profil tidak ditemukan." } },
        { status: 404 },
      );
    }

    // Daftar-putih. ADMIN tidak ada di sini — satu-satunya jalan jadi admin
    // adalah `npm run make-admin`, yang menuntut akses server.
    const rolePermintaan = body?.role;
    const roleDiminta = rolePermintaan === "DOSEN" ? "DOSEN" : "MAHASISWA";

    // Admin yang kebetulan belum mengisi status pendengaran TIDAK boleh
    // kehilangan rolenya hanya karena melewati halaman ini.
    const bolehUbahRole =
      profilSekarang.role !== "ADMIN" && profilSekarang.hearingStatus === null;

    const roleFinal = bolehUbahRole ? roleDiminta : profilSekarang.role;

    let dosenStatusFinal = profilSekarang.dosenStatus;
    if (bolehUbahRole) {
      // Dosen selalu mulai dari PENDING; berpindah ke mahasiswa membuang
      // statusnya sama sekali supaya tidak ada sisa yang membingungkan.
      dosenStatusFinal = roleFinal === "DOSEN" ? "PENDING" : null;
    }

    // Kampus & prodi: teks bebas, tapi dipangkas dan dibatasi panjangnya supaya
    // tidak ada yang menjejalkan satu paragraf ke kolom VarChar(255) dan
    // membuat Prisma menolak seluruh permintaan.
    const bersihkan = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, 255) : null;
    const university = bersihkan(body?.university);
    const studyProgram = bersihkan(body?.study_program);

    const profil = await prisma.$transaction(async (tx) => {
      const p = await tx.profile.update({
        where: { id: userId },
        data: {
          hearingStatus: hearing,
          role: roleFinal,
          dosenStatus: dosenStatusFinal,
          university,
          studyProgram,
        },
      });

      // Mahasiswa perlu baris statistik akademik. Akun Google lama dibuat
      // sebagai MAHASISWA dan sudah punya barisnya, tapi pengguna yang baru
      // berpindah ke MAHASISWA di sini belum — tanpa ini dashboardnya kosong.
      if (roleFinal === "MAHASISWA") {
        const ada = await tx.academicStat.findFirst({ where: { userId } });
        if (!ada) {
          await tx.academicStat.create({ data: { userId, presensi: 100 } });
        }
      }

      return p;
    });

    return NextResponse.json({
      data: {
        full_name: profil.name,
        role: profil.role,
        avatar_url: profil.avatarUrl,
        hearing_status: profil.hearingStatus,
        dosen_status: profil.dosenStatus,
        university: profil.university,
        study_program: profil.studyProgram,
      },
      error: null,
    });
  } catch (e) {
    console.error("Gagal melengkapi profil:", e);
    return NextResponse.json(
      { data: null, error: { message: "Gagal menyimpan profil." } },
      { status: 500 },
    );
  }
}
