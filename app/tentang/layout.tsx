import type { Metadata } from "next";

// Judul sengaja pendek: layout induk menambahkan " | VERO Learning" lewat
// template, jadi judul panjang akan terpotong di hasil pencarian (batas ~60
// karakter) dan menyebut nama merek dua kali.
export const metadata: Metadata = {
  title: "Tentang VERO — PKM-KC Universitas Brawijaya",
  description:
    "VERO Learning lahir dari PKM-KC Universitas Brawijaya untuk membuka akses belajar bagi Teman Tuli lewat AI pengenalan bahasa isyarat.",
  alternates: { canonical: "/tentang" },
  openGraph: {
    url: "https://verolearning.my.id/tentang",
    title: "Tentang VERO — PKM-KC Universitas Brawijaya",
    description:
      "VERO Learning lahir dari PKM-KC Universitas Brawijaya untuk membuka akses belajar bagi Teman Tuli lewat AI pengenalan bahasa isyarat.",
  },
};

export default function TentangLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
