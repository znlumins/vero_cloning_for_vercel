import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import { Toaster } from "sonner";
import Script from "next/script";
import "./globals.css";
import { NextAuthProvider } from "./providers";
import SiennaDraggable from "@/components/SiennaDraggable";
import JsonLd from "@/components/JsonLd";

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
});

// Metadata situs. Satu hal yang harus dijaga di seluruh berkas ini: NAMA MEREK.
// Sebelumnya title menulis "Vero Learning Management System" sementara
// description menulis "VeroApp", dan profil sosial memakai "verolearn.kc" —
// empat ejaan untuk satu produk. Mesin pencari membangun entitas dari nama yang
// konsisten; empat nama berarti empat entitas lemah, dan itulah sebabnya
// pencarian "vero learn" tidak menemukan situs ini. Nama resminya:
// VERO Learning. Ejaan lain didaftarkan sebagai alternateName di JsonLd.tsx,
// bukan dipakai bergantian di sini.
export const metadata: Metadata = {
  metadataBase: new URL("https://verolearning.my.id"),
  title: {
    default: "VERO Learning — Belajar & Terjemah Bahasa Isyarat",
    template: "%s | VERO Learning",
  },
  description:
    "VERO Learning: platform belajar inklusif yang menerjemahkan bahasa isyarat BISINDO & SIBI langsung dari kamera. Gratis, jalan di browser.",
  applicationName: "VERO Learning",
  keywords: [
    "VERO Learning",
    "Vero Learn",
    "bahasa isyarat",
    "BISINDO",
    "SIBI",
    "belajar bahasa isyarat online",
    "penerjemah bahasa isyarat",
    "Teman Tuli",
    "LMS inklusif",
  ],
  authors: [{ name: "Tim PKM-KC Universitas Brawijaya" }],
  creator: "Tim PKM-KC Universitas Brawijaya",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: "https://verolearning.my.id",
    siteName: "VERO Learning",
    title: "VERO Learning — Belajar & Terjemah Bahasa Isyarat",
    description:
      "Terjemahkan bahasa isyarat BISINDO & SIBI langsung dari kamera. Platform belajar inklusif buatan mahasiswa Universitas Brawijaya.",
  },
  twitter: {
    card: "summary_large_image",
    site: "@verolearn_kc",
    creator: "@verolearn_kc",
    title: "VERO Learning — Belajar & Terjemah Bahasa Isyarat",
    description:
      "Terjemahkan bahasa isyarat BISINDO & SIBI langsung dari kamera. Gratis, jalan di browser.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: ekstensi browser (Grammarly, Dark Reader) dan
    // widget aksesibilitas menempelkan atribut ke <html>/<body> sebelum React
    // hydrate. Ini menekan peringatan mismatch satu-level untuk atribut yang
    // memang di luar kendali kita.
    <html lang="id" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${nunitoSans.variable} font-sans antialiased bg-slate-50 text-slate-900`}
      >
        {/*
          Anti-FOUC: set class .dark SEBELUM konten tampil, dari localStorage
          atau preferensi sistem. Skrip ini hanya menoggle class pada <html>
          (yang sudah suppressHydrationWarning), jadi tidak memicu hydration
          mismatch. Dijalankan inline agar tidak ada kedip tema saat load.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
        <JsonLd />
        <NextAuthProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </NextAuthProvider>
        {/*
          Widget aksesibilitas Vero (pojok kanan bawah).

          WAJIB "lazyOnload", BUKAN "beforeInteractive": saat init, widget
          memindai elemen teks dan menstempel inline style ke heading. Kalau
          jalan sebelum React hydrate, DOM tak lagi cocok dengan HTML server
          -> Hydration Mismatch. lazyOnload menjalankannya SETELAH hydrate
          & load, sehingga mutasi DOM-nya tak pernah bertabrakan dengan
          hydration.

          Posisi kanan-bawah dijamin oleh CSS .vero-menu-btn di globals.css,
          jadi tak bergantung pada terbacanya data-vero-position.
        */}
        <Script
          src="https://unpkg.com/vero-accessibility"
          strategy="lazyOnload"
          data-vero-position="bottom-right"
          data-vero-offset="20,20"
        />
        {/*
          Membuat tombol widget bisa digeser. Dipisah ke komponen klien sendiri
          karena widget menyuntikkan tombolnya dari CDN — markup-nya tidak bisa
          kita susun, jadi komponen ini menunggu elemennya muncul lalu menempel
          ke situ. Posisi bawaannya menutupi tombol kirim chat dan kontrol
          meeting di layar kecil.
        */}
        <SiennaDraggable />
      </body>
    </html>
  );
}
