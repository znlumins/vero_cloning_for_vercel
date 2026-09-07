import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { userIdDariRequest, verifikasiToken } from "@/lib/authToken";

// Denyut kehadiran: menandai bahwa pemilik token masih membuka VERO.
//
// KENAPA BUKAN LEWAT /api/db
// --------------------------
// /api/db meneruskan kolom apa pun yang dikirim klien ke tabel profiles —
// termasuk `role`. Denyut ini berjalan otomatis tiap setengah menit di setiap
// tab dashboard, jadi ia adalah jalur yang paling sering dilewati di seluruh
// aplikasi; ia tidak boleh membawa kewenangan lebih dari satu hal yang memang
// dikerjakannya. Di sini tidak ada muatan sama sekali: baris yang disentuh
// ditentukan token, kolom yang ditulis dipatok satu.

async function tandaiHadir(userId: string) {
  // updateMany, bukan update: akun yang barisnya di tabel profiles belum ada
  // (mis. dibuat sebelum kolom profil dipisah) tidak boleh melempar galat hanya
  // karena denyut kehadiran — ini fungsi latar, bukan aksi pengguna.
  await prisma.profile.updateMany({
    where: { id: userId },
    data: { lastSeen: new Date() },
  });
}

export async function POST(req: Request) {
  try {
    // sendBeacon() TIDAK BISA menyertakan header Authorization, sedangkan
    // denyut terakhir saat halaman ditutup justru dikirim lewat sendBeacon —
    // itulah cap waktu yang menentukan "terakhir aktif". Jadi token juga
    // diterima dari body untuk jalur itu. Tanda tangannya tetap diverifikasi
    // dengan cara yang sama; tidak ada pintu belakang di sini.
    let uid = userIdDariRequest(req);
    if (!uid) {
      const body = await req.json().catch(() => null);
      if (body?.token) uid = verifikasiToken(String(body.token));
    }

    if (!uid) {
      return NextResponse.json(
        { data: null, error: { message: "Tidak terautentikasi." } },
        { status: 401 },
      );
    }

    await tandaiHadir(uid);
    return NextResponse.json({ data: { ok: true }, error: null });
  } catch (e) {
    console.error("Gagal menyimpan denyut kehadiran:", e);
    return NextResponse.json(
      { data: null, error: { message: "Gagal menyimpan kehadiran." } },
      { status: 500 },
    );
  }
}
