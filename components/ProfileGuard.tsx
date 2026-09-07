"use client";
// Mengarahkan pengguna berprofil belum lengkap ke /lengkapi-profil.
//
// Dipasang SEKALI di app/dashboard/layout.tsx, bukan disalin ke tiap halaman.
// Menyalinnya ke ~14 halaman berarti setiap halaman baru harus ingat
// memasangnya — dan yang lupa akan jadi celah diam-diam, persis seperti yang
// sudah terjadi pada pemeriksaan role sebelum lib/access.ts ada.
//
// Ini BUKAN pertahanan keamanan: pemeriksaannya membaca localStorage yang bisa
// disunting siapa pun. Tujuannya memandu pengguna, bukan menahan penyerang.
// Yang menegakkan aturan sesungguhnya adalah /api/profile/complete dan
// /api/admin di sisi server.

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { db } from "@/lib/db";
import { profilBelumLengkap } from "@/lib/access";

export default function ProfileGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let batal = false;
    (async () => {
      const { data: { user } } = await db.auth.getUser();
      if (batal) return;
      // Belum login bukan urusan komponen ini — tiap halaman sudah punya
      // pemeriksaannya sendiri dan akan mengarahkan ke /login.
      if (!user) return;
      if (profilBelumLengkap(user)) {
        router.replace("/lengkapi-profil");
      }
    })();
    return () => {
      batal = true;
    };
    // pathname ikut jadi dependency supaya pemeriksaan berjalan lagi tiap kali
    // pengguna berpindah halaman dashboard, bukan hanya saat muat pertama.
  }, [router, pathname]);

  return null;
}
