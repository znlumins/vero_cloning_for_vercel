"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/db";
import LoadingScreen from "@/components/LoadingScreen";
import { toast } from "sonner";
import { profilBelumLengkap } from "@/lib/access";

export default function AuthSyncPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated" || !session?.user) {
      toast.error("Otentikasi Google gagal.");
      router.push("/login");
      return;
    }

    if (status === "authenticated" && session.user) {
      (async () => {
        try {
          const userData = {
            id: (session.user as any).id,
            email: session.user!.email,
            user_metadata: {
              full_name: (session.user as any).full_name || session.user!.name,
              role: (session.user as any).role || "MAHASISWA",
              // snake_case agar konsisten dengan yang dibaca Sidebar & settings
              // (user.user_metadata?.avatar_url).
              avatar_url:
                (session.user as any).avatarUrl || session.user!.image || null,
              // `?? null`, BUKAN `|| null`: keduanya memang bisa null, dan yang
              // null itulah sinyalnya — hearing_status null berarti profil belum
              // lengkap dan pengguna harus diarahkan melengkapinya.
              hearing_status: (session.user as any).hearingStatus ?? null,
              dosen_status: (session.user as any).dosenStatus ?? null,
              university: (session.user as any).university ?? null,
              study_program: (session.user as any).studyProgram ?? null,
            },
          };

          // Ambil token BERTANDA TANGAN dari server (berdasarkan sesi Google yang
          // sudah diverifikasi). Tanpa ini, /api/db menolak (401) dan pengguna
          // ter-logout saat berpindah halaman.
          const res = await fetch("/api/auth/token");
          const data = await res.json();
          if (!res.ok || !data.token) {
            throw new Error(data?.error?.message || "Gagal menerbitkan token sesi.");
          }

          const mockSession = { access_token: data.token, user: userData };
          localStorage.setItem("db_mock_session", JSON.stringify(mockSession));
          localStorage.setItem("db_mock_user", JSON.stringify(userData));

          // Akun Google yang baru dibuat belum pernah ditanyai peran maupun
          // status pendengarannya, jadi diarahkan melengkapi profil lebih dulu.
          // Diarahkan dari sini, bukan menunggu ProfileGuard di dashboard,
          // supaya tidak ada kedipan dashboard kosong sebelum berpindah.
          if (profilBelumLengkap(userData)) {
            toast.success("Berhasil masuk dengan Google — lengkapi profil dulu ya.");
            router.push("/lengkapi-profil");
            return;
          }

          toast.success("Berhasil masuk dengan Google!");
          router.push("/dashboard");
        } catch (err) {
          console.error("Gagal sinkronisasi sesi:", err);
          setError(true);
        }
      })();
    }
  }, [session, status, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-slate-900">
        <p>Terjadi kesalahan saat memproses login Anda.</p>
      </div>
    );
  }

  return <LoadingScreen />;
}
