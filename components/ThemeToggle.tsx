"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

/**
 * Tombol ganti tema terang/gelap.
 *
 * Menoggle class `.dark` pada <html> dan menyimpannya ke localStorage. Nilai awal
 * tema sudah dipasang oleh skrip anti-FOUC di layout SEBELUM React hydrate, jadi
 * komponen ini hanya menyelaraskan tampilannya setelah mount (pola `mounted`
 * mencegah hydration mismatch — server tidak tahu tema pengguna).
 */
interface Props {
  className?: string;
  /** "icon" = tombol kotak (navbar); "row" = baris penuh + label (sidebar). */
  variant?: "icon" | "row";
  /** Sembunyikan label pada variant "row" (mis. saat sidebar diciutkan). */
  collapsed?: boolean;
}

export default function ThemeToggle({ className = "", variant = "icon", collapsed = false }: Props) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  const toggle = () => {
    const el = document.documentElement;
    // Aktifkan transisi halus hanya saat pengguna menekan tombol.
    el.classList.add("theme-anim");
    const next = !el.classList.contains("dark");
    el.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    setIsDark(next);
    window.setTimeout(() => el.classList.remove("theme-anim"), 300);
  };

  if (variant === "row") {
    // Sebelum mount: render baris netral agar tak menggeser layout / mismatch.
    const label = !mounted ? "Tema" : isDark ? "Mode Terang" : "Mode Gelap";
    return (
      <button
        type="button"
        onClick={toggle}
        title="Ganti tema terang/gelap"
        aria-label={label}
        className={`w-full flex items-center gap-4 p-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-all ${collapsed ? "justify-center" : ""} ${className}`}
      >
        {mounted && isDark ? <Sun size={20} strokeWidth={2} /> : <Moon size={20} strokeWidth={2} />}
        {!collapsed && <span className="font-semibold text-sm">{label}</span>}
      </button>
    );
  }

  // Sebelum mount: placeholder berukuran sama agar layout tidak bergeser.
  if (!mounted) {
    return <span aria-hidden className={`inline-flex w-10 h-10 rounded-xl border border-slate-200 ${className}`} />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
      title={isDark ? "Mode terang" : "Mode gelap"}
      className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-colors ${className}`}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
