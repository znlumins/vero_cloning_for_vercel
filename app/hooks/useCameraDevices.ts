"use client";
// Daftar kamera + pilihan yang tersimpan, siap dipakai komponen.
// Logika murninya ada di lib/cameraDevices.ts — lihat di sana untuk alasan
// kenapa pemilih kamera ini perlu ada sama sekali.

import { useCallback, useEffect, useState } from "react";
import {
  listCameras,
  readSavedCameraId,
  saveCameraId,
  type CameraDevice,
} from "@/lib/cameraDevices";

export interface CameraDevices {
  devices: CameraDevice[];
  /** null = pakai kamera bawaan browser. */
  selectedId: string | null;
  select: (id: string | null) => void;
  /** Baca ulang daftar — panggil setelah izin kamera diberikan agar nama asli muncul. */
  refresh: () => Promise<void>;
}

export function useCameraDevices(): CameraDevices {
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(readSavedCameraId());
  }, []);

  const refresh = useCallback(async () => {
    setDevices(await listCameras());
  }, []);

  useEffect(() => {
    refresh();

    // Alat VERO dicolok/dicabut saat halaman terbuka -> daftar berubah tanpa
    // reload. Tanpa pendengar ini, kamera yang baru ditancapkan tidak akan
    // muncul di dropdown sampai halaman disegarkan.
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.addEventListener) return;
    const onChange = () => {
      refresh();
    };
    md.addEventListener("devicechange", onChange);
    return () => md.removeEventListener("devicechange", onChange);
  }, [refresh]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    saveCameraId(id);
  }, []);

  return { devices, selectedId, select, refresh };
}
