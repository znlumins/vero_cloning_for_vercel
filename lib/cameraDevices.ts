"use client";
// Pemilihan kamera untuk seluruh fitur AI.
//
// KENAPA ADA: sampai sekarang getUserMedia dipanggil tanpa menyebut kamera mana
// yang diinginkan, jadi browser memberikan kamera BAWAAN — hampir selalu webcam
// internal laptop. Begitu ada kamera lain yang ditancapkan (mis. modul kamera
// alat VERO lewat USB), alat itu dikenali Windows dan lampunya menyala, tapi
// aplikasi ini tetap memakai webcam laptop dan pengguna tidak punya cara
// menggantinya dari dalam aplikasi.
//
// Pilihan disimpan di localStorage supaya berlaku di semua halaman AI: pilih
// sekali di halaman terjemah, halaman meeting dan presentasi ikut memakainya.

export const CAMERA_STORAGE_KEY = "vero.cameraDeviceId";

export interface CameraDevice {
  deviceId: string;
  label: string;
}

/**
 * Daftar kamera yang terpasang.
 *
 * Catatan penting: `label` baru terisi SETELAH izin kamera diberikan. Sebelum
 * itu browser sengaja mengosongkannya (mencegah sidik jari perangkat), jadi
 * daftar sebelum izin cuma berisi nama pengganti "Kamera 1", "Kamera 2".
 * Karena itu daftar perlu disegarkan sekali lagi setelah stream pertama
 * berhasil dibuka — barulah nama aslinya muncul.
 */
export async function listCameras(): Promise<CameraDevice[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const semua = await navigator.mediaDevices.enumerateDevices();
    return semua
      .filter((d) => d.kind === "videoinput")
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Kamera ${i + 1}`,
      }));
  } catch (e) {
    console.warn("Gagal membaca daftar kamera:", e);
    return [];
  }
}

/** Baca pilihan tersimpan tanpa hook — untuk halaman yang tidak punya UI pemilih. */
export function readSavedCameraId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CAMERA_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveCameraId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(CAMERA_STORAGE_KEY, id);
    else window.localStorage.removeItem(CAMERA_STORAGE_KEY);
  } catch {
    // localStorage bisa diblokir (mode privat / kebijakan situs). Bukan alasan
    // untuk menggagalkan pemilihan kamera pada sesi yang sedang berjalan.
  }
}

/**
 * Buka stream kamera, hormati pilihan tersimpan, dan JANGAN gagal total kalau
 * kamera itu sudah tidak ada.
 *
 * `deviceId: { exact }` melempar OverconstrainedError bila perangkatnya hilang —
 * dan deviceId memang berubah/hilang setiap kali alat dicabut, ganti port, atau
 * browser dimuat ulang di profil berbeda. Tanpa jaring pengaman di bawah,
 * mencabut alat VERO membuat kamera TIDAK MENYALA SAMA SEKALI, bukan sekadar
 * kembali ke webcam laptop. Maka: coba yang diminta, kalau gagal mundur ke
 * kamera bawaan.
 */
export async function openCameraStream(
  video: MediaTrackConstraints,
  deviceId?: string | null,
  audio: boolean = false
): Promise<MediaStream> {
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { ...video, deviceId: { exact: deviceId } },
        audio,
      });
    } catch (e) {
      console.warn("Kamera pilihan tidak tersedia, memakai kamera bawaan:", e);
    }
  }
  return navigator.mediaDevices.getUserMedia({ video, audio });
}
