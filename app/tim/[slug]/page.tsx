import Link from "next/link";
import Image from "next/image";
import { User, X } from "lucide-react";
import LandingFooter from "@/components/LandingFooter";

const teamMembers = [
  { 
    name: "Dr. Arif Widyatama, SE., MSA.", 
    major: "DOSEN PEMBIMBING", 
    slug: "arif-widyatama",
    bio: [
      "Dr. Arif Widyatama, S.E., M.S.A., adalah dosen pembimbing utama sekaligus pakar di balik perumusan ekosistem VERO. Menyelesaikan pendidikan Doktoral (S3) Akuntansi di Universitas Airlangga, beliau memiliki wawasan luas dalam mengawinkan ilmu manajerial dengan adopsi teknologi tepat guna.",
      "Sebagai akademisi Universitas Brawijaya yang aktif di bidang Tri Dharma Perguruan Tinggi, beliau sering memimpin riset dan inovasi yang mendapatkan pendanaan hibah mandiri. Kepakarannya dalam Teknologi Keuangan (seperti penciptaan Aplikasi FINVOKS yang terdaftar HKI) menjadi fondasi krusial untuk menjamin model inovasi VERO yang kredibel, terstruktur, dan siap diimplementasikan secara riil di dunia pendidikan."
    ]
  },
  { 
    name: "Daffa Ahmad Al Attas", 
    major: "TEKNOLOGI INFORMASI", 
    slug: "daffa-ahmad",
    bio: [
      "Daffa Ahmad Al Attas adalah mahasiswa berprestasi dan visioner dari Program Studi Teknologi Informasi asal Malang.",
      "Ia memiliki rekam jejak organisasi yang sangat cemerlang. Daffa aktif mengabdi di BEM Fakultas Vokasi Universitas Brawijaya, merintis karir dari Staf Magang hingga dipercaya sebagai Staf Ahli di Kementerian Kominfo. Selain itu, dedikasinya juga tertuang di Himpunan Mahasiswa Prodi Teknologi Informasi, di mana ia pernah menjabat di Departemen Puskominfo hingga memegang kendali di Komisi Pengawas dan Standarisasi Organisasi.",
      "Berbekal kepemimpinan dan wawasannya yang tajam di bidang teknologi, Daffa menjadi pilar krusial (Koordinator Tim) di balik perancangan arsitektur ekosistem VERO. Fokus utamanya adalah merumuskan infrastruktur perangkat lunak maupun keras yang tangguh, modern, dan scalable."
    ]
  },
  { 
    name: "Rafif Nabiha", 
    major: "TEKNOLOGI INFORMASI", 
    slug: "rafif-nabiha",
    bio: [
      "Rafif Nabiha merupakan talenta muda berbakat asal Blitar dari Program Studi Teknologi Informasi. Prestasinya diakui luas melalui gelar Juara 3 Cyber Security tingkat Universitas Brawijaya serta penghargaan sebagai Staf Magang Terbaik di Kementerian Puskominfo EM UB.",
      "Selain kecerdasannya di bidang akademik, Rafif adalah motor penggerak di berbagai organisasi. Ia dipercaya mengemban amanah sebagai Wakil Ketua Departemen Riset dan Teknologi di Himpunan Mahasiswanya, serta aktif berkiprah di Eksekutif Mahasiswa (EM) UB. Di proyek VERO, kemampuan teknisnya dialokasikan sepenuhnya untuk merancang dan merakit arsitektur perangkat keras serta firmware sistem agar berjalan tanpa cela."
    ]
  },
  { 
    name: "Maqrodza Najwa Putri Fadilah", 
    major: "KEUANGAN DAN PERBANKAN", 
    slug: "maqrodza-najwa",
    bio: [
      "Berasal dari Sidoarjo, Maqrodza Najwa Putri Fadilah membawa ketajaman analisis luar biasa dari Program Studi Keuangan dan Perbankan. Keandalannya terbukti lewat pengalaman profesional magangnya di institusi besar seperti PT BRI Danareksa Sekuritas.",
      "Maqrodza memiliki portofolio kepemimpinan yang sangat padat. Mulai dari Ketua Pelaksana proker HMPS, Staf Humas \"Vokasi Mengajar\" BEM FV UB, hingga menjadi Liasion Officer (LO) Juri Olimpiade Vokasi Indonesia. Pengalamannya dalam memimpin dan meramu strategi public relations menjadikan Maqrodza kunci utama dalam dokumentasi proyek dan strategi peluncuran produk VERO."
    ]
  },
  { 
    name: "Naurah Wasyilah", 
    major: "KEUANGAN DAN PERBANKAN", 
    slug: "naurah-wasyilah",
    bio: [
      "Naurah Wasyilah asal Jambi, adalah penggerak strategis VERO yang berlatar belakang Keuangan dan Perbankan. Kompetensinya di bidang teknologi masa depan dibuktikan lewat peraihan Sertifikasi AI Ignition Training dari PT Kumpul Kreatif Indonesia.",
      "Di kancah organisasi kampus, Naurah memiliki pengaruh yang signifikan. Ia pernah bertindak sebagai Presidium di Kongres Mahasiswa Fakultas Vokasi UB, menjabat sebagai Bendahara strategis di himpunannya, serta menjadi wajah penyambung dalam Olimpiade Vokasi Indonesia. Integritas inilah yang menjadikannya pilar pengelola stabilitas manajemen operasional VERO."
    ]
  },
  { 
    name: "Amanda Aulia Gusetya", 
    major: "PENDIDIKAN KEDOKTERAN GIGI", 
    slug: "amanda-aulia",
    bio: [
      "Amanda Aulia Gusetya hadir memberikan sentuhan desain yang inklusif dan humanis dari sudut pandang rumpun medis, mewakili Program Studi Pendidikan Dokter Gigi. Dara cerdas asal Gresik ini adalah peraih Juara 3 PKM PM Workshop tingkat Fakultas Kedokteran Gigi UB.",
      "Aktif di jajaran Staf Ahli Kementerian Admin BEM FKG UB dan FORMAPI UB, Amanda memadukan keterampilan organisasi dengan wawasan saintifiknya untuk memastikan platform VERO tidak hanya mutakhir secara sistem, tetapi juga memenuhi standar adaptivitas tertinggi bagi penyandang disabilitas sensorik."
    ]
  },
];

export default async function BiodataPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = teamMembers.find((m) => m.slug === slug);

  if (!member) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white text-slate-900">
        <h1 className="text-2xl font-black uppercase mb-4">Profil Tidak Ditemukan</h1>
        <Link href="/tim" className="text-indigo-600 hover:underline">Kembali ke Tim</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans selection:bg-indigo-100 selection:text-indigo-700">

      {/* HEADER DARK SECTION */}
      <section className="bg-[#111111] text-white relative pt-24 pb-16 px-6 border-b-4 border-indigo-600">
        {/* Close Button */}
        <div className="absolute top-8 left-8">
          <Link href="/tim" className="w-12 h-12 rounded-full border border-slate-800 flex items-center justify-center hover:bg-slate-800 hover:text-white transition-all duration-300 text-slate-500 hover:scale-105">
            <X size={24} />
          </Link>
        </div>

        <div className="max-w-6xl mx-auto flex flex-col-reverse md:flex-row items-center justify-between gap-16 md:gap-12 mt-8 md:mt-0">

          {/* Text Left */}
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 leading-[1.1]">
              {member.name}
            </h1>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-slate-400">
              {member.major}
            </p>
          </div>

          {/* Photo Right */}
          <div className="w-[280px] md:w-[360px] aspect-[4/5] bg-[#1a1a1a] flex items-center justify-center flex-shrink-0 border border-slate-800 relative overflow-hidden">
            <Image
              src={`/tim/${member.slug}.png`}
              alt={member.name}
              fill
              className="object-cover object-top"
            />
          </div>

        </div>
      </section>

      {/* BODY CONTENT SECTION */}
      <section className="py-24 px-6 flex-grow bg-white">
        <div className="max-w-3xl mx-auto text-slate-600 space-y-8 leading-loose text-sm md:text-base">
          {member.bio.map((paragraph, idx) => (
            <p key={idx}>{paragraph}</p>
          ))}
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
