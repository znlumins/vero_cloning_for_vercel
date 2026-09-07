import type { Metadata } from "next";

// noindex: halaman masuk tidak punya nilai bagi pencari, dan kalau ikut
// terindeks ia bersaing dengan beranda untuk kata kunci merek sendiri.
export const metadata: Metadata = {
  title: "Masuk",
  robots: { index: false, follow: false },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
