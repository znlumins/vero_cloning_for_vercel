import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daftar",
  robots: { index: false, follow: false },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
