import type { Metadata } from "next";

// Halaman ini "use client", dan komponen klien tidak boleh mengekspor metadata.
// Layout tipis inilah tempatnya. Tanpa ini semua halaman memakai judul yang
// sama persis dengan beranda — bagi mesin pencari itu terbaca seperti halaman
// duplikat, dan tak satu pun judulnya menyebut "bahasa isyarat".
export const metadata: Metadata = {
  title: "Fitur VERO: Terjemah Isyarat, Teks & Suara",
  description:
    "Kenali fitur VERO Learning: pengenalan abjad BISINDO & SIBI, kata BISINDO, speech-to-text, dan kelas daring yang ramah Teman Tuli.",
  alternates: { canonical: "/fitur" },
  openGraph: {
    url: "https://verolearning.my.id/fitur",
    title: "Fitur VERO: Terjemah Isyarat, Teks & Suara",
    description:
      "Kenali fitur VERO Learning: pengenalan abjad BISINDO & SIBI, kata BISINDO, speech-to-text, dan kelas daring yang ramah Teman Tuli.",
  },
};

export default function FiturLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
