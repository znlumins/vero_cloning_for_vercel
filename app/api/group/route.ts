import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { userIdDariRequest } from "@/lib/authToken";

// Pengelolaan grup diskusi: ganti nama, ganti foto, bubarkan, keluar.
//
// KENAPA TIDAK LEWAT /api/db
// --------------------------
// /api/db adalah CRUD generik — ia meneruskan tabel, kolom, dan filter apa pun
// yang dikirim browser. Dipakai untuk ini, artinya siapa pun yang sudah login
// bisa mengirim satu permintaan untuk mengganti nama grup orang lain, atau
// menghapus baris `groups` mana pun yang id-nya ia tahu. Menyembunyikan tombol
// "Bubarkan Grup" di UI tidak menutup itu sama sekali.
//
// Di sini setiap aksi memeriksa lebih dulu: siapa pemanggilnya (dari token
// bertanda tangan, bukan dari body), dan apakah ia memang pembuat grup yang
// bersangkutan.

type Aksi = "rename" | "setAvatar" | "disband" | "leave";

const MAKS_NAMA = 60;

/** Ambil grup sekaligus pastikan pemanggilnya pembuatnya. */
async function pastikanPemilik(groupId: string, userId: string) {
  const grup = await prisma.group.findUnique({ where: { id: groupId } });
  if (!grup) {
    return NextResponse.json(
      { data: null, error: { message: "Grup tidak ditemukan." } },
      { status: 404 },
    );
  }
  if (grup.creatorId !== userId) {
    return NextResponse.json(
      { data: null, error: { message: "Hanya pembuat grup yang boleh melakukan ini." } },
      { status: 403 },
    );
  }
  return grup;
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
    const aksi: Aksi = body?.action;
    const groupId = String(body?.groupId || "");
    if (!groupId) {
      return NextResponse.json(
        { data: null, error: { message: "Grup tidak disebutkan." } },
        { status: 400 },
      );
    }

    switch (aksi) {
      // ---------------------------------------------------------------- rename
      case "rename": {
        const grup = await pastikanPemilik(groupId, userId);
        if (grup instanceof NextResponse) return grup;

        const nama = typeof body?.name === "string" ? body.name.trim() : "";
        if (!nama) {
          return NextResponse.json(
            { data: null, error: { message: "Nama grup tidak boleh kosong." } },
            { status: 400 },
          );
        }
        // Dipotong, bukan ditolak, kalau kepanjangan: batasnya soal muat di
        // kolom VarChar(255) dan di sidebar, bukan soal benar-salah.
        const bersih = nama.slice(0, MAKS_NAMA);

        const hasil = await prisma.group.update({
          where: { id: groupId },
          data: { name: bersih },
        });
        return NextResponse.json({ data: { id: hasil.id, name: hasil.name }, error: null });
      }

      // ------------------------------------------------------------- setAvatar
      case "setAvatar": {
        const grup = await pastikanPemilik(groupId, userId);
        if (grup instanceof NextResponse) return grup;

        const url = typeof body?.avatarUrl === "string" ? body.avatarUrl.trim() : "";
        // URL hanya boleh menunjuk ke berkas yang diunggah lewat /api/upload.
        // Tanpa pagar ini, kolom ini jadi tempat menitipkan URL sembarangan yang
        // akan dimuat browser semua anggota grup.
        if (url && !url.startsWith("/uploads/")) {
          return NextResponse.json(
            { data: null, error: { message: "Sumber foto tidak dikenali." } },
            { status: 400 },
          );
        }

        const hasil = await prisma.group.update({
          where: { id: groupId },
          data: { avatarUrl: url || null },
        });
        return NextResponse.json({ data: { id: hasil.id, avatar_url: hasil.avatarUrl }, error: null });
      }

      // --------------------------------------------------------------- disband
      case "disband": {
        const grup = await pastikanPemilik(groupId, userId);
        if (grup instanceof NextResponse) return grup;

        // Nama grup harus diketik ulang. Ini bukan formalitas: membubarkan grup
        // menghapus seluruh riwayat percakapannya untuk SEMUA anggota, dan tidak
        // ada jalan mengembalikannya. Konfirmasinya diperiksa di sini juga —
        // kalau hanya di UI, ia bukan pengaman, cuma dekorasi.
        const konfirmasi = typeof body?.confirmName === "string" ? body.confirmName.trim() : "";
        if (konfirmasi.toLowerCase() !== grup.name.trim().toLowerCase()) {
          return NextResponse.json(
            { data: null, error: { message: "Nama grup yang diketik tidak cocok." } },
            { status: 400 },
          );
        }

        // Pesan grup DIHAPUS TERSENDIRI. Message.groupId hanyalah kolom biasa,
        // bukan relasi berkaskade — jadi menghapus grupnya saja akan meninggalkan
        // pesan yatim yang menunjuk grup yang sudah tidak ada. Keanggotaan ikut
        // terhapus otomatis karena GroupMember memang berkaskade ke Group.
        await prisma.$transaction([
          prisma.message.deleteMany({ where: { groupId } }),
          prisma.group.delete({ where: { id: groupId } }),
        ]);

        return NextResponse.json({ data: { ok: true }, error: null });
      }

      // ----------------------------------------------------------------- leave
      case "leave": {
        const grup = await prisma.group.findUnique({ where: { id: groupId } });
        if (!grup) {
          return NextResponse.json(
            { data: null, error: { message: "Grup tidak ditemukan." } },
            { status: 404 },
          );
        }
        // Pembuat grup tidak bisa sekadar keluar: kalau ia pergi, grupnya tidak
        // punya seorang pun yang berwenang mengurusnya lagi — nama dan foto tak
        // bisa diubah, dan tak ada yang bisa membubarkannya. Jadi ia harus
        // memilih: bubarkan, atau tetap tinggal.
        if (grup.creatorId === userId) {
          return NextResponse.json(
            { data: null, error: { message: "Pembuat grup tidak bisa keluar. Bubarkan grup kalau memang sudah selesai." } },
            { status: 400 },
          );
        }

        await prisma.groupMember.deleteMany({ where: { groupId, userId } });
        return NextResponse.json({ data: { ok: true }, error: null });
      }

      default:
        return NextResponse.json(
          { data: null, error: { message: `Aksi "${aksi}" tidak dikenali.` } },
          { status: 400 },
        );
    }
  } catch (e) {
    console.error("Group API error:", e);
    return NextResponse.json(
      { data: null, error: { message: "Terjadi kesalahan di server. Coba lagi." } },
      { status: 500 },
    );
  }
}
