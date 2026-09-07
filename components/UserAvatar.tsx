"use client";
// Avatar pengguna dengan cadangan berlapis.
//
// Urutan tampil: foto profil -> huruf awal nama -> ikon orang. Foto profil bisa
// gagal dimuat (URL kedaluwarsa, file terhapus, penyedia OAuth memblokir hotlink),
// dan tanpa penanganan itu yang tersisa cuma kotak kosong. Karena itu kegagalan
// muat ditangkap dan diturunkan ke inisial, bukan dibiarkan.

import { useEffect, useState } from "react";
import { User } from "lucide-react";

interface UserAvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  /** Ukuran ikon cadangan; ukuran kotaknya sendiri diatur lewat className. */
  iconSize?: number;
  className?: string;
}

export default function UserAvatar({
  name,
  avatarUrl,
  iconSize = 24,
  className = "",
}: UserAvatarProps) {
  const [gagalMuat, setGagalMuat] = useState(false);

  // Reset saat pindah orang — tanpa ini, satu foto yang gagal membuat avatar
  // pengguna berikutnya ikut tidak pernah dicoba.
  useEffect(() => {
    setGagalMuat(false);
  }, [avatarUrl]);

  const inisial = name?.trim()?.charAt(0)?.toUpperCase();
  const tampilkanFoto = !!avatarUrl && !gagalMuat;

  return (
    <div
      className={`flex items-center justify-center overflow-hidden font-black shrink-0 ${className}`}
    >
      {tampilkanFoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl as string}
          alt={name ? `Foto profil ${name}` : "Foto profil"}
          className="w-full h-full object-cover"
          onError={() => setGagalMuat(true)}
        />
      ) : inisial ? (
        <span>{inisial}</span>
      ) : (
        <User size={iconSize} />
      )}
    </div>
  );
}
