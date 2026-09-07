// Daftar bantu untuk isian asal kampus & program studi.
//
// BUKAN DAFTAR LENGKAP — DAN MEMANG TIDAK BOLEH DIPERLAKUKAN BEGITU
// -----------------------------------------------------------------
// Indonesia punya sekitar 4.500 perguruan tinggi, dan daftarnya berubah tiap
// tahun: kampus bergabung, berganti nama, berubah status dari sekolah tinggi
// jadi universitas. Menyalin semuanya ke berkas ini berarti menanam data yang
// pasti basi, sekaligus membengkakkan bundel yang dikirim ke tiap pengguna.
//
// Isinya: seluruh PTN besar di 34 provinsi, PTKIN utama, dan PTS yang paling
// banyak mahasiswanya. Itu menutup sebagian besar kasus nyata tanpa berpura-pura
// lengkap.
//
// Karena itu isian di UI WAJIB tetap menerima ketikan bebas. Daftar ini hanya
// mempercepat pengetikan dan menjaga ejaan seragam — bukan pembatas. Kampus yang
// tidak ada di sini tetap harus bisa didaftarkan; menolaknya berarti menutup
// pintu bagi pengguna hanya karena kami belum sempat memperbarui berkas.

export const UNIVERSITAS: string[] = [
  // --- PTN Jawa Timur ---
  "Universitas Brawijaya",
  "Universitas Negeri Malang",
  "Universitas Airlangga",
  "Universitas Negeri Surabaya",
  "Institut Teknologi Sepuluh Nopember",
  "Universitas Jember",
  "Universitas Trunojoyo Madura",
  "UPN Veteran Jawa Timur",
  "UIN Sunan Ampel Surabaya",
  "UIN Maulana Malik Ibrahim Malang",
  "Politeknik Negeri Malang",
  "Politeknik Elektronika Negeri Surabaya",
  "Politeknik Perkapalan Negeri Surabaya",

  // --- PTN Jawa Tengah & DIY ---
  "Universitas Gadjah Mada",
  "Universitas Diponegoro",
  "Universitas Sebelas Maret",
  "Universitas Negeri Semarang",
  "Universitas Negeri Yogyakarta",
  "Universitas Jenderal Soedirman",
  "Universitas Tidar",
  "UIN Sunan Kalijaga Yogyakarta",
  "UIN Walisongo Semarang",
  "UIN Raden Mas Said Surakarta",
  "Politeknik Negeri Semarang",
  "UPN Veteran Yogyakarta",

  // --- PTN Jakarta, Jawa Barat & Banten ---
  "Universitas Indonesia",
  "Institut Teknologi Bandung",
  "Universitas Padjadjaran",
  "Institut Pertanian Bogor",
  "Universitas Negeri Jakarta",
  "Universitas Pendidikan Indonesia",
  "Universitas Sultan Ageng Tirtayasa",
  "Universitas Singaperbangsa Karawang",
  "Universitas Siliwangi",
  "UIN Syarif Hidayatullah Jakarta",
  "UIN Sunan Gunung Djati Bandung",
  "UPN Veteran Jakarta",
  "Politeknik Negeri Jakarta",
  "Politeknik Negeri Bandung",
  "Universitas Terbuka",

  // --- PTN Sumatera ---
  "Universitas Sumatera Utara",
  "Universitas Negeri Medan",
  "Universitas Andalas",
  "Universitas Negeri Padang",
  "Universitas Riau",
  "Universitas Islam Negeri Sultan Syarif Kasim Riau",
  "Universitas Sriwijaya",
  "Universitas Lampung",
  "Universitas Syiah Kuala",
  "Universitas Negeri Bengkulu",
  "Universitas Jambi",
  "Universitas Bangka Belitung",
  "Universitas Maritim Raja Ali Haji",
  "UIN Sumatera Utara",
  "UIN Raden Fatah Palembang",
  "Politeknik Negeri Sriwijaya",
  "Politeknik Negeri Medan",

  // --- PTN Kalimantan ---
  "Universitas Lambung Mangkurat",
  "Universitas Mulawarman",
  "Universitas Tanjungpura",
  "Universitas Palangka Raya",
  "Universitas Borneo Tarakan",
  "Institut Teknologi Kalimantan",
  "UIN Antasari Banjarmasin",

  // --- PTN Sulawesi ---
  "Universitas Hasanuddin",
  "Universitas Negeri Makassar",
  "Universitas Sam Ratulangi",
  "Universitas Negeri Manado",
  "Universitas Tadulako",
  "Universitas Halu Oleo",
  "Universitas Negeri Gorontalo",
  "UIN Alauddin Makassar",

  // --- PTN Bali, NTB, NTT ---
  "Universitas Udayana",
  "Universitas Pendidikan Ganesha",
  "Universitas Mataram",
  "Universitas Nusa Cendana",
  "Politeknik Negeri Bali",

  // --- PTN Maluku & Papua ---
  "Universitas Pattimura",
  "Universitas Khairun",
  "Universitas Cenderawasih",
  "Universitas Papua",
  "Universitas Musamus Merauke",

  // --- PTS besar ---
  "Universitas Bina Nusantara",
  "Universitas Muhammadiyah Malang",
  "Universitas Muhammadiyah Surakarta",
  "Universitas Muhammadiyah Yogyakarta",
  "Universitas Muhammadiyah Sidoarjo",
  "Universitas Muhammadiyah Jakarta",
  "Universitas Muhammadiyah Prof. Dr. Hamka",
  "Universitas Ahmad Dahlan",
  "Universitas Islam Indonesia",
  "Universitas Telkom",
  "Universitas Gunadarma",
  "Universitas Mercu Buana",
  "Universitas Trisakti",
  "Universitas Atma Jaya Yogyakarta",
  "Universitas Katolik Atma Jaya",
  "Universitas Katolik Parahyangan",
  "Universitas Kristen Petra",
  "Universitas Kristen Satya Wacana",
  "Universitas Surabaya",
  "Universitas Ciputra",
  "Universitas Pelita Harapan",
  "Universitas Dian Nuswantoro",
  "Universitas Islam Malang",
  "Universitas Islam Sultan Agung",
  "Universitas Pancasila",
  "Universitas Pasundan",
  "Universitas Widyatama",
  "Universitas Nusantara PGRI Kediri",
  "Universitas PGRI Adi Buana Surabaya",
  "Universitas PGRI Semarang",
  "Institut Teknologi Nasional Bandung",
  "Institut Teknologi Nasional Malang",
  "Institut Teknologi Telkom Purwokerto",
  "Universitas Bina Sarana Informatika",
  "Universitas Amikom Yogyakarta",
  "Universitas Esa Unggul",
  "Universitas Sanata Dharma",
  "Universitas Tarumanagara",
  "Universitas Al Azhar Indonesia",
  "Universitas Nahdlatul Ulama Surabaya",
];

/**
 * Program studi yang paling umum. Sama seperti daftar kampus: membantu
 * mengetik, bukan membatasi. Nama prodi sangat beragam antarkampus ("Teknik
 * Informatika" vs "Informatika" vs "Ilmu Komputer" untuk isi yang mirip), jadi
 * memaksakan pilihan dari daftar justru membuat orang memilih yang salah.
 */
export const PROGRAM_STUDI: string[] = [
  // Komputer & teknik
  "Teknik Informatika",
  "Sistem Informasi",
  "Ilmu Komputer",
  "Teknologi Informasi",
  "Teknik Komputer",
  "Rekayasa Perangkat Lunak",
  "Teknik Elektro",
  "Teknik Mesin",
  "Teknik Sipil",
  "Teknik Industri",
  "Teknik Kimia",
  "Teknik Lingkungan",
  "Arsitektur",
  "Perencanaan Wilayah dan Kota",
  "Teknik Biomedis",
  "Teknik Geologi",
  "Teknik Pertambangan",
  "Teknik Perkapalan",
  "Teknik Penerbangan",

  // MIPA
  "Matematika",
  "Fisika",
  "Kimia",
  "Biologi",
  "Statistika",
  "Aktuaria",
  "Geografi",

  // Pendidikan
  "Pendidikan Luar Biasa",
  "Pendidikan Guru Sekolah Dasar",
  "Pendidikan Guru PAUD",
  "Pendidikan Bahasa Indonesia",
  "Pendidikan Bahasa Inggris",
  "Pendidikan Matematika",
  "Pendidikan Fisika",
  "Pendidikan Kimia",
  "Pendidikan Biologi",
  "Pendidikan Teknik Informatika",
  "Pendidikan Jasmani dan Kesehatan",
  "Teknologi Pendidikan",
  "Bimbingan dan Konseling",
  "Pendidikan Seni Rupa",
  "Pendidikan Sejarah",
  "Pendidikan Ekonomi",

  // Kesehatan
  "Kedokteran",
  "Kedokteran Gigi",
  "Keperawatan",
  "Kebidanan",
  "Farmasi",
  "Kesehatan Masyarakat",
  "Gizi",
  "Fisioterapi",
  "Terapi Wicara",
  "Analis Kesehatan",
  "Psikologi",

  // Ekonomi & bisnis
  "Manajemen",
  "Akuntansi",
  "Ekonomi Pembangunan",
  "Ekonomi Islam",
  "Bisnis Digital",
  "Kewirausahaan",
  "Perbankan Syariah",

  // Sosial & humaniora
  "Ilmu Komunikasi",
  "Ilmu Hukum",
  "Ilmu Politik",
  "Hubungan Internasional",
  "Administrasi Publik",
  "Administrasi Bisnis",
  "Sosiologi",
  "Antropologi",
  "Sastra Indonesia",
  "Sastra Inggris",
  "Sastra Jepang",
  "Ilmu Perpustakaan",
  "Ilmu Sejarah",
  "Desain Komunikasi Visual",
  "Desain Produk",
  "Seni Musik",
  "Seni Tari",
  "Film dan Televisi",

  // Pertanian & lainnya
  "Agroteknologi",
  "Agribisnis",
  "Peternakan",
  "Kehutanan",
  "Perikanan",
  "Teknologi Pangan",
  "Ilmu Kelautan",
];

/**
 * Normalisasi ringan untuk MEMBANDINGKAN dua nama kampus.
 *
 * Karena isiannya teks bebas, "UB", "universitas brawijaya", dan "Universitas
 * Brawijaya " adalah tiga string berbeda yang menunjuk satu kampus. Fungsi ini
 * memangkas spasi berlebih dan huruf besar-kecil supaya pengelompokan tidak
 * pecah karena hal sepele.
 *
 * Sengaja TIDAK mencoba menebak singkatan ("UB" -> "Universitas Brawijaya"):
 * tebakan semacam itu akan salah pada kampus yang singkatannya bertabrakan, dan
 * salah mengelompokkan lebih buruk daripada tidak mengelompokkan.
 */
export function normalkanKampus(nama: string | null | undefined): string {
  if (!nama) return "";
  return nama.trim().toLowerCase().replace(/\s+/g, " ");
}
