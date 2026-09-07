/**
 * Membuat akun untuk responden uji coba VERO.
 *
 * Sumbernya "Pendaftaran Responden VERO (Responses).xlsx" — formulir kesediaan
 * hadir pengujian di Universitas Brawijaya. Datanya disalin ke berkas ini apa
 * adanya, BUKAN dibaca langsung dari .xlsx, karena membaca xlsx menuntut
 * pustaka pembaca zip yang tidak ada di proyek ini. Menyalinnya juga membuat
 * isinya bisa ditinjau dan diperbaiki lewat riwayat git.
 *
 * KENAPA LEWAT SKRIP, BUKAN /register
 * -----------------------------------
 * /api/auth signUp TIDAK menyimpan university dan study_program — dua kolom itu
 * hanya diisi lewat /lengkapi-profil setelah login. Mendaftarkan 14 orang lewat
 * halaman daftar berarti 14 kali login manual hanya untuk mengisi kampus dan
 * prodi. Skrip ini menulis keduanya sekaligus dalam satu transaksi, persis
 * seperti yang dilakukan signUp + lengkapi-profil kalau dijalankan berurutan.
 *
 * Pakai:
 *   node tools/seed-responden.mjs                    # buat akun (sandi bawaan)
 *   node tools/seed-responden.mjs --sandi=rahasia123
 *   node tools/seed-responden.mjs --domain=vero.test # bukan gmail.com
 *   node tools/seed-responden.mjs --hapus            # buang lagi akun-akun ini
 *
 * Aman dijalankan berulang: email yang sudah ada TIDAK dibuat ulang, profilnya
 * saja yang disegarkan — sandi yang sudah dipakai orang tidak ditimpa.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const ambilOpsi = (nama, bawaan) => {
  const cocok = argv.find((a) => a.startsWith(`--${nama}=`));
  return cocok ? cocok.slice(nama.length + 3) : bawaan;
};

const SANDI = ambilOpsi("sandi", "vero12345");
const DOMAIN = ambilOpsi("domain", "gmail.com");
const HAPUS = argv.includes("--hapus");

// Semua responden berasal dari satu kampus. Ditulis penuh, bukan "UB":
// lib/universitas.ts sengaja tidak menebak singkatan, jadi "UB" akan terhitung
// sebagai kampus yang berbeda saat data dikelompokkan.
const KAMPUS = "Universitas Brawijaya";

/**
 * Responden, urut sesuai waktu pengisian formulir.
 *
 * `hearing` disalin dari kolom "Kategori Peserta" — ini bukan data pelengkap.
 * Seluruh alasan VERO ada adalah mempertemukan Teman Tuli dan Teman Dengar, dan
 * komposisi 5 : 9 inilah yang menjadi buktinya.
 *
 * Beberapa prodi (Desain Grafis, Keuangan dan Perbankan, Ilmu Keperawatan)
 * tidak ada di daftar bantu PROGRAM_STUDI. Itu dibiarkan apa adanya dengan
 * sengaja: kolomnya memang teks bebas, dan memaksa prodi Vokasi masuk ke nama
 * prodi terdekat di daftar berarti memalsukan data respondennya sendiri.
 */
const RESPONDEN = [
  { nama: "Daffa Ahmad Al Attas",              hearing: "TEMAN_DENGAR", prodi: "Teknologi Informasi" },
  // Mengisi formulir dua kali dengan NIM yang sama (baris 3 & 4 di berkas asal).
  // Ditulis sekali di sini; email diturunkan dari nama, jadi entri kembar akan
  // bertabrakan di kolom email yang unique.
  { nama: "Muhammad Alfath Irsyadul Huda",     hearing: "TEMAN_TULI",   prodi: "Teknik Komputer" },
  { nama: "Fitriatun Khasanah",                hearing: "TEMAN_DENGAR", prodi: "Ilmu Hukum" },
  { nama: "Moh. Fajrul Hakam Hidayat",         hearing: "TEMAN_TULI",   prodi: "Desain Grafis" },
  { nama: "Reza Abdul Latif",                  hearing: "TEMAN_TULI",   prodi: "Teknologi Informasi" },
  { nama: "Ravina Natasha",                    hearing: "TEMAN_TULI",   prodi: "Teknik Informatika" },
  { nama: "Frizi Al Husaini",                  hearing: "TEMAN_DENGAR", prodi: "Keuangan dan Perbankan" },
  { nama: "Surya Adiningrat",                  hearing: "TEMAN_TULI",   prodi: "Teknik Informatika" },
  { nama: "Ifadah Aulia Muhti Sinaga",         hearing: "TEMAN_DENGAR", prodi: "Teknologi Informasi" },
  { nama: "Daffa Rachel Putra",                hearing: "TEMAN_DENGAR", prodi: "Teknologi Informasi" },
  { nama: "Hana Zhafira Akmalia Purhadi",      hearing: "TEMAN_DENGAR", prodi: "Kedokteran Gigi" },
  { nama: "Aqeel Ihsan",                       hearing: "TEMAN_DENGAR", prodi: "Kedokteran" },
  { nama: "Fahima Ilma Ruhyanudin",            hearing: "TEMAN_DENGAR", prodi: "Ilmu Keperawatan" },
  { nama: "Mohammad Haryo Hammam Qolbudharma", hearing: "TEMAN_DENGAR", prodi: "Teknologi Informasi" },
];

/**
 * Nama -> alamat email.
 *
 * Tanda baca dibuang lebih dulu: "Moh." menyisakan titik ganda kalau tidak,
 * dan alamat dengan ".." ditolak sebagian penyedia email.
 */
const emailDari = (nama) =>
  nama
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .join(".") + "@" + DOMAIN;

const daftar = RESPONDEN.map((r) => ({ ...r, email: emailDari(r.nama) }));

const kembar = daftar.filter((r, i) => daftar.findIndex((x) => x.email === r.email) !== i);
if (kembar.length) {
  console.error("Ada email kembar — dua responden menghasilkan alamat yang sama:");
  kembar.forEach((k) => console.error(`  ${k.nama} -> ${k.email}`));
  await prisma.$disconnect();
  process.exit(1);
}

if (HAPUS) {
  const korban = await prisma.user.findMany({
    where: { email: { in: daftar.map((r) => r.email) } },
    select: { id: true },
  });
  const idKorban = korban.map((u) => u.id);

  // academic_stats.user_id BOLEH NULL dan relasinya tidak memakai
  // onDelete: Cascade — untuk relasi opsional Prisma memilih SetNull. Artinya
  // menghapus penggunanya TIDAK ikut menghapus baris statistiknya; yang terjadi
  // user_id-nya dikosongkan dan barisnya tertinggal sebagai sampah yatim yang
  // tidak bisa ditelusuri lagi pemiliknya. Karena itu dibersihkan lebih dulu,
  // selagi kaitannya masih ada.
  const { count: statTerhapus } = await prisma.academicStat.deleteMany({
    where: { userId: { in: idKorban } },
  });

  const { count } = await prisma.user.deleteMany({ where: { id: { in: idKorban } } });

  console.log(`${count} akun responden dihapus (beserta ${statTerhapus} baris statistik akademik).`);
  await prisma.$disconnect();
  process.exit(0);
}

const sandiTerenkripsi = await bcrypt.hash(SANDI, 10);

let dibuat = 0;
let disegarkan = 0;

for (const r of daftar) {
  const adaSebelumnya = await prisma.user.findUnique({
    where: { email: r.email },
    include: { profile: true },
  });

  if (adaSebelumnya) {
    // Sandi SENGAJA tidak ditimpa. Kalau responden sudah pernah masuk dan
    // menggantinya, menjalankan ulang skrip ini akan mengunci dia dari akunnya
    // sendiri tepat di hari pengujian.
    await prisma.profile.upsert({
      where: { id: adaSebelumnya.id },
      update: {
        name: r.nama,
        hearingStatus: r.hearing,
        university: KAMPUS,
        studyProgram: r.prodi,
      },
      create: {
        id: adaSebelumnya.id,
        name: r.nama,
        role: "MAHASISWA",
        hearingStatus: r.hearing,
        university: KAMPUS,
        studyProgram: r.prodi,
      },
    });
    disegarkan++;
    console.log(`~ ${r.email.padEnd(42)} sudah ada — profil disegarkan`);
    continue;
  }

  await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { email: r.email, password: sandiTerenkripsi },
    });

    await tx.profile.create({
      data: {
        id: u.id,
        name: r.nama,
        role: "MAHASISWA",
        hearingStatus: r.hearing,
        // dosenStatus dibiarkan NULL — hanya berlaku untuk DOSEN.
        university: KAMPUS,
        studyProgram: r.prodi,
      },
    });

    // Sama seperti yang dilakukan /api/auth saat mendaftar mahasiswa. Tanpa
    // baris ini, dashboard menampilkan presensi kosong alih-alih 100%.
    await tx.academicStat.create({ data: { userId: u.id, presensi: 100 } });
  });

  dibuat++;
  console.log(`+ ${r.email.padEnd(42)} ${r.hearing === "TEMAN_TULI" ? "Teman Tuli " : "Teman Dengar"}  ${r.prodi}`);
}

const tuli = daftar.filter((r) => r.hearing === "TEMAN_TULI").length;

console.log("");
console.log(`Selesai. ${dibuat} akun dibuat, ${disegarkan} disegarkan.`);
console.log(`Komposisi: ${tuli} Teman Tuli, ${daftar.length - tuli} Teman Dengar — semuanya ${KAMPUS}.`);
if (dibuat > 0) console.log(`Sandi untuk akun yang baru dibuat: ${SANDI}`);

await prisma.$disconnect();
