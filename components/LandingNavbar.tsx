"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

// /terjemah ikut di sini bukan sekadar demi navigasi: halaman yang hanya ada di
// sitemap tanpa satu pun tautan masuk (halaman yatim) jauh lebih lambat
// ditemukan dan dinilai lemah oleh mesin pencari.
const NAV_LINKS = [
  { href: "/terjemah", label: "Terjemah" },
  { href: "/fitur", label: "Fitur" },
  { href: "/tentang", label: "Tentang" },
  { href: "/tim", label: "Tim Kami" },
];

export default function LandingNavbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Padatkan navbar begitu di-scroll ATAU saat menu mobile terbuka (biar ada latar).
  const solid = isScrolled || menuOpen;

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        solid
          ? "bg-white/80 backdrop-blur-md py-4 border-b border-slate-100 shadow-sm"
          : "bg-transparent py-6 md:py-8"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex justify-between items-center">
        <Link href="/" onClick={() => setMenuOpen(false)}>
          <Image
            src="/vero-logo.svg"
            alt="Vero Logo"
            width={120}
            height={48}
            className="w-auto h-8 sm:h-10 cursor-pointer"
          />
        </Link>

        {/* Link tengah — hanya desktop */}
        <div className="hidden md:flex items-center gap-8 lg:gap-10 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-indigo-600 transition-colors">
              {l.label}
            </Link>
          ))}
        </div>

        {/* Aksi kanan — desktop */}
        <div className="hidden md:flex items-center gap-3 lg:gap-4">
          <ThemeToggle />
          <Link
            href="/login"
            className="text-sm font-black uppercase tracking-widest text-slate-900 hover:text-indigo-600 transition-colors"
          >
            Masuk
          </Link>
          <Link
            href="/register"
            className="px-6 lg:px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-200"
          >
            Daftar
          </Link>
        </div>

        {/* Aksi kanan — mobile (toggle tema + hamburger) */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
            aria-expanded={menuOpen}
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Panel menu mobile */}
      {menuOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-md border-t border-slate-100 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="py-3 px-2 text-sm font-black uppercase tracking-widest text-slate-700 hover:text-indigo-600 border-b border-slate-50"
              >
                {l.label}
              </Link>
            ))}
            <div className="flex items-center gap-3 pt-3">
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="flex-1 text-center py-3 rounded-xl border border-slate-200 text-sm font-black uppercase tracking-widest text-slate-900"
              >
                Masuk
              </Link>
              <Link
                href="/register"
                onClick={() => setMenuOpen(false)}
                className="flex-1 text-center py-3 rounded-xl bg-indigo-600 text-white text-sm font-black uppercase tracking-widest shadow-lg shadow-indigo-200"
              >
                Daftar
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
