import type { Metadata } from "next";
import ProfileGuard from "@/components/ProfileGuard";
import PresenceHeartbeat from "@/components/PresenceHeartbeat";
import DashboardDesktopGate from "@/components/DashboardDesktopGate";

// Seluruh isi dashboard ada di balik login. Beri noindex agar tidak ada URL
// dashboard yang nyangkut di hasil pencarian sebagai halaman kosong "Memuat…".
// Ini melengkapi larangan di app/robots.ts: robots.txt mencegah perayapan,
// noindex mencegah pengindeksan URL yang terlanjur ditemukan dari tautan lain.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Satu titik pasang untuk SELURUH dashboard. Halaman baru otomatis ikut
          terjaga tanpa perlu mengingat apa pun. */}
      {/* Gerbang layar besar untuk SELURUH aplikasi. Membungkus, bukan
          bersebelahan: selama layarnya terlalu kecil, isi di dalamnya tidak
          pernah dipasang sama sekali — jadi tidak ada kamera yang sempat menyala
          di perangkat yang justru tidak kita izinkan memakainya.

          Penjaga profil dan denyut kehadiran ikut di dalam, bukan di luar.
          Keduanya tidak ada gunanya bagi orang yang aplikasinya belum terbuka:
          yang satu akan melemparnya ke halaman lengkapi-profil yang tetap tidak
          bisa ia lanjutkan, yang satu lagi mencatatnya "sedang aktif" padahal
          ia justru sedang ditolak masuk. */}
      <DashboardDesktopGate>
        <ProfileGuard />
        {/* Dipasang di layout supaya kehadiran tercatat di seluruh dashboard,
            bukan hanya di halaman yang kebetulan diingat. */}
        <PresenceHeartbeat />
        {children}
      </DashboardDesktopGate>
    </>
  );
}
