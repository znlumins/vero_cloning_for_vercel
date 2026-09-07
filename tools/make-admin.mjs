/**
 * Menjadikan sebuah akun sebagai ADMIN.
 *
 * KENAPA LEWAT SKRIP, BUKAN LEWAT UI
 * ----------------------------------
 * Admin pertama tidak bisa dibuat dari dalam aplikasi: kalau ada tombol
 * "jadikan saya admin", siapa pun yang mendaftar bisa menekannya. Dan kalau
 * pembuatannya lewat halaman admin, tidak akan pernah ada admin pertama yang
 * bisa membukanya.
 *
 * Jalan keluarnya: satu-satunya cara menjadi admin adalah punya akses ke server
 * — akses yang, kalau seseorang sudah memilikinya, admin panel bukan lagi
 * pertahanan yang berarti. /api/auth menolak role ADMIN secara eksplisit, jadi
 * tidak ada jalan lain masuk.
 *
 * Pakai:
 *   node tools/make-admin.mjs orang@contoh.com
 *   npm run make-admin -- orang@contoh.com
 *
 * Menurunkan kembali jadi mahasiswa:
 *   node tools/make-admin.mjs orang@contoh.com --turunkan
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const email = argv.find((a) => !a.startsWith("--"));
const turunkan = argv.includes("--turunkan");

if (!email) {
  console.error("Pemakaian: node tools/make-admin.mjs <email> [--turunkan]");
  process.exit(1);
}

const user = await prisma.user.findUnique({
  where: { email },
  include: { profile: true },
});

if (!user) {
  console.error(`Tidak ada akun dengan email "${email}".`);
  console.error("Daftar dulu lewat halaman /register, baru jalankan skrip ini.");
  await prisma.$disconnect();
  process.exit(1);
}

if (!user.profile) {
  console.error(`Akun "${email}" tidak punya profil — datanya tidak utuh.`);
  await prisma.$disconnect();
  process.exit(1);
}

const roleBaru = turunkan ? "MAHASISWA" : "ADMIN";

await prisma.profile.update({
  where: { id: user.id },
  data: {
    role: roleBaru,
    // dosenStatus hanya berlaku untuk DOSEN. Meninggalkannya terisi pada akun
    // yang sudah jadi admin membuat dashboard menampilkan "menunggu verifikasi"
    // pada orang yang justru bertugas memverifikasi.
    dosenStatus: null,
  },
});

console.log(`"${email}" sekarang ${roleBaru}.`);
if (!turunkan) {
  if (!user.profile.hearingStatus) {
    console.log(
      "Catatan: status Teman Tuli/Dengar belum diisi — saat login nanti akan\n" +
        "diminta melengkapi profil lebih dulu. Itu normal.",
    );
  }
  console.log("Keluar lalu masuk lagi supaya sesi di browser ikut terbarui.");
}

await prisma.$disconnect();
