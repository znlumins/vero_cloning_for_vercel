// Halaman publik fitur penerjemah isyarat.
//
// Kenapa ada halaman ini padahal fiturnya sudah ada di /dashboard/studio/translate:
// halaman dashboard berada di balik login dan isinya dirender di sisi klien, jadi
// yang diterima mesin pencari hanya cangkang kosong bertuliskan "Memuat VeroApp".
// Halaman inilah versi yang bisa dibaca tanpa login — isinya nyata di HTML, dan
// inilah yang didaftarkan ke sitemap.
//
// SENGAJA BUKAN "use client". Seluruh isinya harus ada di HTML balasan pertama;
// begitu berkas ini jadi komponen klien, nilainya untuk pencarian hilang.
//
// Aturan isi yang tidak boleh dilanggar saat menyunting:
// 1. Yang boleh disebut bisa dikenali HANYA yang punya model di
//    lib/signModes.ts. Sejak 17 Agustus 2026 keempatnya ada (abjad & kata,
//    BISINDO & SIBI); sebelum itu kata SIBI memang belum ada dan tidak boleh
//    diklaim. Periksa signModes.ts dulu, jangan menyalin kalimat lama.
// 2. Jangan mencantumkan angka akurasi. Angka tanpa syarat pengujiannya
//    menyesatkan dan akan ditanyakan saat penjurian. Ini bukan aturan hiasan:
//    model kata SIBI dilatih dari rekaman SATU penanda dalam satu sesi, jadi
//    angka apa pun yang terdengar tinggi akan menyesatkan.
// 3. Daftar huruf/kata di bawah diambil dari public/models/*/label_map.json.
//    Kalau modelnya berubah, perbarui juga di sini.

import type { Metadata } from "next";
import Link from "next/link";
import { Hand, Camera, Cpu, ShieldCheck } from "lucide-react";
import LandingNavbar from "@/components/LandingNavbar";
import LandingFooter from "@/components/LandingFooter";

export const metadata: Metadata = {
  title: "Penerjemah Bahasa Isyarat BISINDO & SIBI",
  description:
    "Terjemahkan bahasa isyarat BISINDO dan SIBI menjadi teks langsung dari kamera. Gratis, jalan di browser, tanpa memasang aplikasi.",
  alternates: { canonical: "/terjemah" },
  openGraph: {
    url: "https://www.verolearn.web.id/terjemah",
    title: "Penerjemah Bahasa Isyarat BISINDO & SIBI — VERO Learning",
    description:
      "Terjemahkan bahasa isyarat BISINDO dan SIBI menjadi teks langsung dari kamera. Gratis, jalan di browser, tanpa memasang aplikasi.",
  },
};

// 12 kata BISINDO yang dikenali model, sesuai public/models/kata/label_map.json.
// Dua belas kata yang sama dipakai BISINDO dan SIBI — modelnya berbeda, daftar
// katanya sengaja seragam supaya pengguna tidak perlu menghafal dua daftar.
const KATA = [
  "saya",
  "nama",
  "perkenalkan",
  "selamat pagi",
  "mohon maaf",
  "izin",
  "terlambat",
  "bertanya",
  "menjawab",
  "mahasiswa",
  "bapak dosen",
  "ibu dosen",
];

// Satu sumber untuk FAQ: dipakai sekaligus oleh tampilan halaman DAN JSON-LD.
// Google hanya menampilkan rich result FAQ bila tanya-jawabnya benar-benar
// terlihat di halaman — menyatukannya di sini membuat keduanya mustahil beda.
const FAQ: { q: string; a: string }[] = [
  {
    q: "Apa itu VERO Learning?",
    a: "VERO Learning adalah platform pembelajaran inklusif yang menerjemahkan gerakan bahasa isyarat menjadi teks secara langsung lewat kamera. Dikembangkan oleh tim mahasiswa Universitas Brawijaya melalui program PKM-KC.",
  },
  {
    q: "Bahasa isyarat apa saja yang bisa dikenali?",
    a: "Saat ini VERO mengenali abjad BISINDO (A sampai Z), abjad SIBI (A sampai Z), serta 12 kata seputar percakapan perkuliahan dalam BISINDO maupun SIBI. Daftar katanya sama untuk kedua sistem, dengan model yang terpisah karena bentuk isyaratnya berbeda.",
  },
  {
    q: "Apa bedanya BISINDO dan SIBI?",
    a: "BISINDO (Bahasa Isyarat Indonesia) tumbuh alami dari komunitas Tuli Indonesia dan umumnya memakai dua tangan. SIBI (Sistem Isyarat Bahasa Indonesia) disusun mengikuti struktur bahasa Indonesia, umumnya memakai satu tangan, dan dipakai untuk pengajaran di banyak Sekolah Luar Biasa.",
  },
  {
    q: "Apakah VERO gratis?",
    a: "Ya. VERO Learning dapat digunakan tanpa biaya. Kamu hanya perlu mendaftar akun untuk masuk ke ruang belajarnya.",
  },
  {
    q: "Apakah perlu memasang aplikasi?",
    a: "Tidak perlu. VERO berjalan langsung di browser. Kamu cukup membuka situsnya dan mengizinkan akses kamera.",
  },
  {
    q: "Apakah video saya dikirim ke server?",
    a: "Tidak. Pengenalan isyarat diproses di dalam browser pada perangkatmu sendiri menggunakan TensorFlow.js, sehingga rekaman kameramu tidak perlu dikirim ke server untuk dikenali.",
  },
  {
    q: "Perangkat apa yang dibutuhkan?",
    a: "Laptop atau ponsel yang punya kamera, dengan browser modern seperti Chrome, Edge, atau Firefox. Perangkat yang kurang bertenaga tetap bisa dipakai lewat Mode Ringan yang menurunkan beban pemrosesan.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function TerjemahPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-700 flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <LandingNavbar />

      <main className="pt-32 pb-24 flex-grow">
        {/* Hero */}
        <section className="px-6 py-12">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-indigo-600 mb-6">
              Penerjemah Isyarat
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter leading-[1.05] mb-8">
              Terjemahkan Bahasa Isyarat{" "}
              <span className="text-indigo-600">Langsung dari Kamera</span>
            </h1>
            <p className="text-base sm:text-lg text-slate-500 font-medium leading-relaxed max-w-2xl mx-auto mb-10">
              VERO mengubah gerakan tangan BISINDO dan SIBI menjadi teks secara
              langsung. Tidak perlu memasang aplikasi — cukup buka di browser,
              izinkan kamera, lalu mulai berisyarat.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="px-10 py-4 bg-slate-900 text-white font-black rounded-2xl shadow-2xl hover:bg-indigo-600 transition-all uppercase tracking-widest text-sm"
              >
                Coba Gratis
              </Link>
              <Link
                href="/fitur"
                className="px-10 py-4 bg-white text-slate-900 font-black rounded-2xl border border-slate-200 hover:border-indigo-600 hover:text-indigo-600 transition-all uppercase tracking-widest text-sm"
              >
                Lihat Fitur Lain
              </Link>
            </div>
          </div>
        </section>

        {/* Yang bisa dikenali */}
        <section className="px-6 py-16">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl font-black uppercase text-center mb-4">
              Yang Bisa Dikenali VERO
            </h2>
            <div className="w-20 h-1.5 bg-indigo-600 mx-auto rounded-full mb-16" />

            {/* Empat kartu (dulu tiga): 2 kolom membaginya rata, sedangkan 3
                kolom menyisakan satu kartu sendirian di baris kedua. */}
            <div className="grid md:grid-cols-2 gap-8">
              <article className="p-10 bg-white rounded-[40px] border border-slate-200">
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                  <Hand size={28} />
                </div>
                <h3 className="text-lg font-black uppercase mb-3">
                  Abjad BISINDO
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Seluruh huruf A sampai Z dalam Bahasa Isyarat Indonesia, sistem
                  yang tumbuh alami dari komunitas Tuli dan umumnya memakai dua
                  tangan.
                </p>
              </article>

              <article className="p-10 bg-white rounded-[40px] border border-slate-200">
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                  <Hand size={28} />
                </div>
                <h3 className="text-lg font-black uppercase mb-3">
                  Abjad SIBI
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Seluruh huruf A sampai Z dalam Sistem Isyarat Bahasa Indonesia,
                  sistem yang dipakai untuk pengajaran di banyak Sekolah Luar
                  Biasa dan umumnya memakai satu tangan.
                </p>
              </article>

              <article className="p-10 bg-white rounded-[40px] border border-slate-200">
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                  <Hand size={28} />
                </div>
                <h3 className="text-lg font-black uppercase mb-3">
                  Kata BISINDO
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-4">
                  Dua belas kata seputar percakapan perkuliahan — isyarat
                  bergerak, bukan sekadar bentuk tangan diam:
                </p>
                <ul className="flex flex-wrap gap-2">
                  {KATA.map((kata) => (
                    <li
                      key={kata}
                      className="px-3 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold"
                    >
                      {kata}
                    </li>
                  ))}
                </ul>
              </article>

              <article className="p-10 bg-white rounded-[40px] border border-slate-200">
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                  <Hand size={28} />
                </div>
                <h3 className="text-lg font-black uppercase mb-3">Kata SIBI</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-4">
                  Dua belas kata yang sama, dalam bentuk isyarat SIBI — dikenali
                  oleh model tersendiri karena gerakannya berbeda dari BISINDO:
                </p>
                <ul className="flex flex-wrap gap-2">
                  {KATA.map((kata) => (
                    <li
                      key={`sibi-${kata}`}
                      className="px-3 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold"
                    >
                      {kata}
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            {/* Kejujuran soal batasnya. Dulu blok ini menyatakan kata SIBI belum
                ada; sekarang modelnya ada, tapi batas yang sebenarnya bergeser
                bukan hilang — dan menyembunyikannya justru membuat pengguna
                mengira aplikasinya rusak saat isyaratnya tidak terbaca. */}
            <p className="mt-10 max-w-3xl mx-auto text-center text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4 leading-relaxed">
              <strong className="font-black uppercase">Perlu diketahui:</strong>{" "}
              pengenalan kata masih terbatas pada dua belas kata di atas, dan
              model kata SIBI dilatih dari rekaman satu penanda. Isyarat di luar
              daftar itu tidak akan dikenali, dan gaya berisyarat yang jauh
              berbeda bisa menurunkan hasilnya.
            </p>
          </div>
        </section>

        {/* Cara kerja */}
        <section className="px-6 py-16 bg-white">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl font-black uppercase text-center mb-4">
              Bagaimana Cara Kerjanya
            </h2>
            <div className="w-20 h-1.5 bg-indigo-600 mx-auto rounded-full mb-16" />

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8">
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                  <Camera size={28} />
                </div>
                <h3 className="text-lg font-black uppercase mb-3">
                  1. Kamera Membaca Gerakan
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Kamera menangkap posisi tangan dan tubuhmu, lalu mengubahnya
                  menjadi titik-titik koordinat — bukan menyimpan gambarnya.
                </p>
              </div>

              <div className="p-8">
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                  <Cpu size={28} />
                </div>
                <h3 className="text-lg font-black uppercase mb-3">
                  2. Model AI Menebak Isyaratnya
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Rangkaian titik itu dibaca model kecerdasan buatan yang dilatih
                  dari ribuan rekaman isyarat, lalu diterjemahkan menjadi huruf
                  atau kata.
                </p>
              </div>

              <div className="p-8">
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                  <ShieldCheck size={28} />
                </div>
                <h3 className="text-lg font-black uppercase mb-3">
                  3. Semua di Perangkatmu
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Seluruh proses berjalan di dalam browser lewat TensorFlow.js.
                  Rekaman kameramu tidak perlu dikirim ke server untuk dikenali.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* BISINDO vs SIBI */}
        <section className="px-6 py-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-black uppercase text-center mb-4">
              BISINDO atau SIBI?
            </h2>
            <div className="w-20 h-1.5 bg-indigo-600 mx-auto rounded-full mb-10" />
            <p className="text-slate-500 text-sm leading-relaxed text-center mb-10 max-w-2xl mx-auto">
              Keduanya dipakai di Indonesia dan keduanya didukung VERO. Perbedaan
              singkatnya seperti ini:
            </p>

            <div className="overflow-x-auto">
              <table className="w-full bg-white rounded-[32px] border border-slate-200 overflow-hidden text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="p-5 font-black uppercase text-[11px] tracking-widest text-slate-400">
                      Aspek
                    </th>
                    <th className="p-5 font-black uppercase text-[11px] tracking-widest text-slate-400">
                      BISINDO
                    </th>
                    <th className="p-5 font-black uppercase text-[11px] tracking-widest text-slate-400">
                      SIBI
                    </th>
                  </tr>
                </thead>
                <tbody className="text-slate-600">
                  <tr className="border-t border-slate-100">
                    <td className="p-5 font-bold text-slate-900">Asal</td>
                    <td className="p-5">Tumbuh alami dari komunitas Tuli</td>
                    <td className="p-5">Disusun mengikuti bahasa Indonesia</td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="p-5 font-bold text-slate-900">Tangan</td>
                    <td className="p-5">Umumnya dua tangan</td>
                    <td className="p-5">Umumnya satu tangan</td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="p-5 font-bold text-slate-900">Banyak dipakai</td>
                    <td className="p-5">Percakapan sehari-hari antar Teman Tuli</td>
                    <td className="p-5">Pengajaran di Sekolah Luar Biasa</td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="p-5 font-bold text-slate-900">Di VERO</td>
                    <td className="p-5">Abjad A–Z dan 12 kata</td>
                    <td className="p-5">Abjad A–Z</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="px-6 py-16">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-black uppercase text-center mb-4">
              Pertanyaan yang Sering Diajukan
            </h2>
            <div className="w-20 h-1.5 bg-indigo-600 mx-auto rounded-full mb-12" />

            <div className="space-y-4">
              {FAQ.map((item) => (
                <details
                  key={item.q}
                  className="group bg-white rounded-[28px] border border-slate-200 px-7 py-5"
                >
                  <summary className="cursor-pointer list-none font-black text-slate-900 text-sm flex items-center justify-between gap-4">
                    {item.q}
                    <span className="text-indigo-600 text-xl leading-none shrink-0 group-open:rotate-45 transition-transform">
                      +
                    </span>
                  </summary>
                  <p className="mt-4 text-slate-500 text-sm leading-relaxed">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA penutup */}
        <section className="px-6 py-16">
          <div className="max-w-4xl mx-auto text-center bg-slate-900 rounded-[40px] px-8 py-16">
            <h2 className="text-3xl sm:text-4xl font-black uppercase text-white mb-6 tracking-tighter">
              Mulai Sekarang, Gratis
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xl mx-auto mb-10">
              Buat akun, izinkan kamera, dan langsung coba penerjemah isyaratnya.
              Tidak ada aplikasi yang perlu dipasang.
            </p>
            <Link
              href="/register"
              className="inline-block px-10 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-500 transition-all uppercase tracking-widest text-sm shadow-2xl"
            >
              Daftar Gratis
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
