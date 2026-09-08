import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tim Pengembang — Universitas Brawijaya",
  description:
    "Kenali mahasiswa Universitas Brawijaya di balik VERO Learning — tim PKM-KC yang membangun platform belajar bahasa isyarat berbasis AI.",
  alternates: { canonical: "/tim" },
  openGraph: {
    url: "https://www.verolearn.web.id/tim",
    title: "Tim Pengembang VERO Learning",
    description:
      "Kenali mahasiswa Universitas Brawijaya di balik VERO Learning — tim PKM-KC yang membangun platform belajar bahasa isyarat berbasis AI.",
  },
};

export default function TimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
