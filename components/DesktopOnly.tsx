"use client";
// Gerbang "buka di laptop/PC" untuk halaman yang memang tidak muat di perangkat
// genggam.
//
// KENAPA MEMBLOKIR, BUKAN MEMBUAT RESPONSIVE
// ------------------------------------------
// Empat halaman VERO menjalankan MediaPipe + TensorFlow.js di atas video kamera
// 30fps secara terus-menerus. Ongkosnya bukan soal tata letak: ponsel dan tablet
// kehabisan tenaga, panas, lalu tab-nya dimatikan sistem. Menyusun ulang
// kolomnya agar "muat" justru menghasilkan halaman yang terlihat berfungsi tapi
// tidak bisa dipakai — itu lebih buruk daripada menolak dengan jujur. Pola yang
// sama dipakai Figma dan editor berbasis kanvas lain.
//
// KENAPA TABLET IKUT DIBLOKIR, DAN KENAPA LEBAR SAJA TIDAK CUKUP
// --------------------------------------------------------------
// Tablet dalam mode lanskap melewati ambang lebar apa pun yang masuk akal (iPad
// lanskap = 1024px, iPad Pro = 1366px), jadi memeriksa lebar saja akan
// meloloskannya. Karena itu ada tiga saringan yang harus dilewati sekaligus:
// lebar layar, user agent, dan jenis penunjuk. Yang terakhir yang paling sulit
// dipalsukan — layar sentuh tanpa tetikus melaporkan penunjuk kasar tanpa hover,
// sementara laptop layar sentuh tetap melaporkan penunjuk halus.
//
// TIDAK ADA JALAN KELUAR
// ----------------------
// Gerbang ini sengaja tidak punya tombol "tetap buka di perangkat ini". Selama
// jalan keluarnya ada, perangkat yang tidak sanggup tetap masuk dan yang
// terlihat adalah aplikasi yang rusak, bukan aplikasi yang menolak.

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Monitor, ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";

const LEBAR_MINIMUM = 1024;

const POLA_PERANGKAT_GENGGAM =
  /android|iphone|ipod|ipad|windows phone|blackberry|silk|kindle|playbook|tablet|mobile/i;

/** Semua saringan harus lolos; satu saja gagal berarti perangkatnya ditolak. */
function perangkatDiizinkan(): boolean {
  if (typeof window === "undefined") return false;

  if (window.innerWidth < LEBAR_MINIMUM) return false;

  const ua = navigator.userAgent;

  // iPadOS 13+ menyamar sebagai macOS. Satu-satunya yang membedakannya dari
  // MacBook adalah jumlah titik sentuh yang didukung.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return false;

  if (POLA_PERANGKAT_GENGGAM.test(ua)) return false;

  // Jaring terakhir untuk tablet yang UA-nya tidak menyebut dirinya tablet.
  const sentuhSaja =
    window.matchMedia("(pointer: coarse)").matches &&
    !window.matchMedia("(hover: hover)").matches;
  if (sentuhSaja) return false;

  return true;
}

interface Props {
  /** Nama fitur, mis. "Penerjemah Bahasa Isyarat". */
  fitur: string;
  /** Alasan spesifik fitur ini butuh laptop/PC. */
  alasan: string;
  /**
   * Ke mana tombol "kembali" mengarah.
   *
   * Default /dashboard cocok saat yang digerbang cuma satu halaman. Tapi ketika
   * SELURUH dashboard yang digerbang, tombol itu akan mengembalikan orang ke
   * gerbang yang sama — lingkaran tanpa jalan keluar. Di sana halaman depan
   * yang jadi tujuannya.
   */
  hrefKembali?: string;
  labelKembali?: string;
  children: React.ReactNode;
}

export default function DesktopOnly({
  fitur,
  alasan,
  hrefKembali = "/dashboard",
  labelKembali = "Kembali ke Beranda",
  children,
}: Props) {
  // `null` = belum diukur. Wajib, karena server tidak tahu perangkat apa yang
  // membuka; menebak salah satu nilai membuat React membuang seluruh pohon saat
  // hydrate.
  const [diizinkan, setDiizinkan] = useState<boolean | null>(null);

  useEffect(() => {
    const periksa = () => setDiizinkan(perangkatDiizinkan());
    periksa();
    // Jendela yang diubah ukurannya dan perangkat yang diputar sama-sama bisa
    // mengubah hasilnya, jadi hasilnya dihitung ulang, bukan disimpan sekali.
    window.addEventListener("resize", periksa);
    window.addEventListener("orientationchange", periksa);
    return () => {
      window.removeEventListener("resize", periksa);
      window.removeEventListener("orientationchange", periksa);
    };
  }, []);

  const salinTautan = () => {
    navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => toast.success("Tautan disalin — buka di laptop/PC"))
      .catch(() => toast.error("Gagal menyalin tautan"));
  };

  // Selama pengukuran belum selesai, jangan tampilkan apa pun. Menampilkan
  // konten dulu lalu menggantinya dengan gerbang membuat kamera sempat menyala
  // di perangkat yang justru tidak kita izinkan memakainya.
  if (diizinkan === null) return null;
  if (diizinkan) return <>{children}</>;

  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <Image
          src="/vero-logo.svg"
          alt="VERO"
          width={200}
          height={88}
          priority
          className="w-36 h-auto mx-auto mb-10"
        />

        <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-6">
          <Monitor size={30} />
        </div>

        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-3">
          Perlu laptop atau PC
        </p>
        <h1 className="text-2xl font-black text-slate-900 leading-snug mb-4">
          {fitur} hanya bisa dibuka di laptop atau PC
        </h1>
        <p className="text-sm font-bold text-slate-500 leading-relaxed mb-8">{alasan}</p>

        <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 text-left mb-8">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
            Yang dibutuhkan
          </p>
          <ul className="space-y-2 text-xs font-bold text-slate-600">
            <li>• Laptop atau PC — ponsel dan tablet belum didukung</li>
            <li>• Layar minimal {LEBAR_MINIMUM}px</li>
            <li>• Browser Google Chrome atau Microsoft Edge</li>
            <li>• Kamera yang bisa diakses browser</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
