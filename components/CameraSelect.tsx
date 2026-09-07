"use client";
// Pemilih kamera untuk halaman AI.
//
// Dibuat dari <select> bawaan, bukan dropdown kustom. Ini produk aksesibilitas:
// select bawaan sudah didukung penuh pembaca layar dan navigasi papan ketik di
// semua peramban, sesuatu yang harus dibangun ulang dari nol (dan mudah salah)
// kalau memakai daftar buatan sendiri.

import { Camera } from "lucide-react";
import type { CameraDevice } from "@/lib/cameraDevices";

interface CameraSelectProps {
  devices: CameraDevice[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Dikunci saat AI berjalan — ganti kamera perlu memulai ulang stream. */
  disabled?: boolean;
}

export default function CameraSelect({
  devices,
  selectedId,
  onSelect,
  disabled = false,
}: CameraSelectProps) {
  return (
    <div>
      <label
        htmlFor="vero-camera-select"
        className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2"
      >
        <Camera size={14} /> Kamera
      </label>
      <select
        id="vero-camera-select"
        value={selectedId ?? ""}
        disabled={disabled}
        onChange={(e) => onSelect(e.target.value || null)}
        className={`w-full px-4 py-3 rounded-2xl border bg-slate-50 border-slate-200 text-[11px] font-black text-slate-700 outline-none focus:border-indigo-400 ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        <option value="">Kamera bawaan perangkat</option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>

      {devices.length === 0 && (
        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
          Daftar kamera muncul setelah izin kamera diberikan. Aktifkan AI sekali,
          lalu daftar ini terisi dengan nama aslinya.
        </p>
      )}
    </div>
  );
}
