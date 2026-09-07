import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { userIdDariRequest } from "@/lib/authToken";

// Menyunting profil sendiri dari halaman Pengaturan: status Teman Tuli/Dengar,
// asal kampus, dan program studi.
//
// KENAPA BUKAN /api/db
// --------------------
// /api/db adalah CRUD generik — ia meneruskan kolom apa pun yang dikirim klien
// ke Prisma. Memakainya di sini berarti jalur "sunting profil" ikut membawa
// kemampuan menimpa `role`, sehingga mahasiswa mana pun yang sudah login bisa
// mengangkat dirinya jadi admin lewat satu permintaan biasa.
//
// Di sini kolom yang boleh disentuh ditulis satu per satu, dan barisnya dipatok
// ke pemilik token. Tidak ada cara mengubah profil orang lain lewat sini, dan
// tidak ada cara menyentuh role, dosenStatus, maupun kolom lain.
//
// KENAPA TERPISAH DARI /api/profile/complete
// Kewenangannya berbeda: yang ini boleh dipakai berulang kali, sedangkan yang
// itu juga menetapkan peran dan hanya boleh dipakai sekali (saat profil belum
// lengkap). Menggabungkan keduanya berarti jalur harian ikut membawa kemampuan
// mengubah peran.

/** Teks bebas: dipangkas, dan dipotong agar muat di VarChar(255). */
function bersihkan(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 255) : null;
}

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

    // Setiap kolom hanya disentuh kalau memang dikirim. Halaman Pengaturan
    // mengirim ketiganya sekaligus, tapi pemanggil lain boleh mengirim sebagian
    // — dan yang tidak dikirim tidak boleh terhapus jadi null diam-diam.
    const data: {
      hearingStatus?: "TEMAN_TULI" | "TEMAN_DENGAR";
      university?: string | null;
      studyProgram?: string | null;
      bio?: string | null;
    } = {};

    if (body?.hearing_status !== undefined) {
      const h = body.hearing_status;
      if (h !== "TEMAN_TULI" && h !== "TEMAN_DENGAR") {
        return NextResponse.json(
          { data: null, error: { message: "Status pendengaran tidak dikenali." } },
          { status: 400 },
        );
      }
      data.hearingStatus = h;
    }
    if (body?.university !== undefined) data.university = bersihkan(body.university);
    if (body?.study_program !== undefined) data.studyProgram = bersihkan(body.study_program);
    // Bio ikut ke database (bukan cuma user_metadata di localStorage) karena
    // pembacanya adalah ORANG LAIN — lihat panel profil di halaman Diskusi.
    // Kolomnya TEXT, jadi batasnya lebih longgar daripada bersihkan() yang
    // memotong di 255 untuk VarChar.
    if (body?.bio !== undefined) {
      data.bio = typeof body.bio === "string" && body.bio.trim() ? body.bio.trim().slice(0, 2000) : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { data: null, error: { message: "Tidak ada yang diubah." } },
        { status: 400 },
      );
    }

    const profil = await prisma.profile.update({ where: { id: userId }, data });

    return NextResponse.json({
      data: {
        hearing_status: profil.hearingStatus,
        university: profil.university,
        study_program: profil.studyProgram,
        bio: profil.bio,
      },
      error: null,
    });
  } catch (e) {
    console.error("Gagal menyunting profil:", e);
    return NextResponse.json(
      { data: null, error: { message: "Gagal menyimpan profil." } },
      { status: 500 },
    );
  }
}
