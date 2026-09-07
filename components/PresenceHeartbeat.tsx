"use client";
// Denyut kehadiran. Tidak menampilkan apa pun — dipasang sekali di
// app/dashboard/layout.tsx supaya SETIAP halaman dashboard ikut berdenyut tanpa
// perlu ada yang mengingatnya saat menambah halaman baru.
//
// Arti "daring" ditentukan di lib/presence.ts; di sini hanya soal kapan
// mengirimnya.

import { useEffect } from "react";
import { JEDA_DENYUT_MS } from "@/lib/presence";

function ambilToken(): string | null {
  try {
    const s = localStorage.getItem("db_mock_session");
    return s ? JSON.parse(s)?.access_token || null : null;
  } catch {
    return null;
  }
}

export default function PresenceHeartbeat() {
  useEffect(() => {
    let hidup = true;

    const denyut = () => {
      const token = ambilToken();
      if (!token) return;
      // Tab yang tersembunyi (di latar) tidak dihitung hadir. Kalau tetap
      // berdenyut, sepuluh tab yang lupa ditutup membuat orangnya tampak daring
      // berhari-hari padahal laptopnya tertutup.
      if (document.visibilityState !== "visible") return;
      fetch("/api/presence", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(() => {
        // Denyut yang meleset tidak perlu dilaporkan ke pengguna: yang berikutnya
        // 30 detik lagi, dan ambang daring memang dibuat lebih longgar dari itu.
      });
    };

    denyut();
    const timer = setInterval(() => { if (hidup) denyut(); }, JEDA_DENYUT_MS);

    // Kembali ke tab → langsung berdenyut, jangan menunggu giliran berikutnya.
    const saatTampil = () => { if (document.visibilityState === "visible") denyut(); };
    document.addEventListener("visibilitychange", saatTampil);

    // Denyut terakhir saat halaman ditinggalkan. Inilah cap waktu yang nanti
    // dibaca sebagai "Terakhir aktif ...", jadi ia harus terkirim walau tab
    // sudah ditutup — dan hanya sendBeacon yang dijamin sampai pada saat itu.
    // Ia tidak bisa membawa header, jadi tokennya ikut di body (lihat catatan di
    // app/api/presence/route.ts).
    const saatPergi = () => {
      const token = ambilToken();
      if (!token) return;
      navigator.sendBeacon?.(
        "/api/presence",
        new Blob([JSON.stringify({ token })], { type: "application/json" }),
      );
    };
    window.addEventListener("pagehide", saatPergi);

    return () => {
      hidup = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", saatTampil);
      window.removeEventListener("pagehide", saatPergi);
      saatPergi();
    };
  }, []);

  return null;
}
