// app/api/auth/token/route.ts
// Menerbitkan token sesi bertanda tangan (lib/authToken) untuk pengguna yang
// login lewat Google (NextAuth).
//
// KENAPA PERLU: dashboard memakai `db_mock_session.access_token` untuk memanggil
// /api/db & /api/upload, dan endpoint itu kini menolak token yang tak
// bertanda tangan (gate keamanan). Login email/password sudah menerima token
// sah dari /api/auth signIn; login Google TIDAK — sebelumnya /auth/sync memakai
// string "google-oauth-<id>" yang gagal verifikasi -> 401 -> sesi dibersihkan
// -> pengguna ter-logout saat berpindah halaman. Endpoint ini menutup celah itu.
//
// AMAN: userId diambil dari sesi NextAuth yang diverifikasi SERVER (cookie
// bertanda tangan), bukan dari nilai yang dikirim browser -- jadi tidak bisa
// dipakai mengaku sebagai orang lain.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../[...nextauth]/route";
import { buatToken } from "@/lib/authToken";

export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;

  if (!session?.user || !uid) {
    return NextResponse.json(
      { token: null, error: { message: "Tidak terautentikasi." } },
      { status: 401 },
    );
  }

  return NextResponse.json({ token: buatToken(uid), userId: uid, error: null });
}
