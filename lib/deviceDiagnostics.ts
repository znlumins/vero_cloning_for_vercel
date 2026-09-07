"use client";
// Diagnostik perangkat pengguna.
//
// KENAPA BERKAS INI ADA
// ---------------------
// Fitur AI VERO berjalan SEPENUHNYA di perangkat pengguna: kamera, mikrofon,
// WebGL, dan CPU-nya sendiri. Artinya sebagian besar kegagalan yang dilaporkan
// ("kameranya nggak jalan", "nggak ada suaranya") bukan bug aplikasi melainkan
// izin yang ditolak, perangkat yang tidak ada, atau browser yang tidak
// mendukung. Tanpa pesan yang menyebut penyebabnya, keduanya terlihat sama
// persis di mata pengguna — dan aplikasinya yang disalahkan.
//
// Modul ini mengubah tebakan itu menjadi pernyataan yang bisa dikutip:
// "Mikrofon tidak terdeteksi di perangkat ini" berbeda dari "Akses mikrofon
// ditolak", dan keduanya berbeda dari "browser ini tidak mendukung".
//
// ATURAN SAAT MENYUNTING
// 1. Setiap issue WAJIB punya `fix` — langkah konkret yang bisa dilakukan
//    pengguna. Pesan tanpa jalan keluar cuma memindahkan frustrasi.
// 2. Jangan pernah menuduh perangkat tanpa memeriksa. Kalau sebuah pemeriksaan
//    tidak bisa dilakukan (API-nya tidak ada), diam — jangan melapor "rusak".
// 3. `severity: "fatal"` hanya untuk yang benar-benar membuat fitur mustahil
//    jalan. Sisanya "warning".

export type DeviceIssueId =
  | "insecure-context"
  | "offline"
  | "no-camera"
  | "camera-denied"
  | "no-microphone"
  | "microphone-denied"
  | "no-webgl"
  | "browser-unsupported"
  | "speech-unsupported"
  | "low-spec";

export interface DeviceIssue {
  id: DeviceIssueId;
  /** fatal = fitur mustahil jalan; warning = jalan tapi menurun. */
  severity: "fatal" | "warning";
  title: string;
  /** Apa yang terdeteksi, apa adanya. */
  detail: string;
  /** Langkah konkret untuk pengguna. */
  fix: string;
}

export interface DiagnosticsNeeds {
  camera?: boolean;
  microphone?: boolean;
  webgl?: boolean;
  /** Web Speech API untuk pengenalan suara (speech-to-text). */
  speechRecognition?: boolean;
}

export interface BrowserInfo {
  name: string;
  /** Chromium (Chrome/Edge/Opera/Brave) — satu-satunya yang mendukung penuh. */
  isChromium: boolean;
  isSafari: boolean;
  isFirefox: boolean;
}

/**
 * Nama browser dari User-Agent.
 *
 * Urutan pemeriksaan penting: Edge menyebut "Chrome" DAN "Safari" di UA-nya,
 * dan Chrome menyebut "Safari". Jadi yang paling spesifik diperiksa lebih dulu.
 */
export function detectBrowser(): BrowserInfo {
  if (typeof navigator === "undefined") {
    return { name: "Tidak diketahui", isChromium: true, isSafari: false, isFirefox: false };
  }
  const ua = navigator.userAgent;
  const chromium =
    /Edg\//.test(ua) || /OPR\//.test(ua) || (/Chrome\//.test(ua) && !/Edg\//.test(ua));

  if (/Edg\//.test(ua)) return { name: "Microsoft Edge", isChromium: true, isSafari: false, isFirefox: false };
  if (/OPR\//.test(ua)) return { name: "Opera", isChromium: true, isSafari: false, isFirefox: false };
  if (/Firefox\//.test(ua)) return { name: "Firefox", isChromium: false, isSafari: false, isFirefox: true };
  // Safari harus diperiksa SETELAH Chrome/Edge/Opera karena UA-nya ikut disebut.
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) {
    return { name: "Safari", isChromium: false, isSafari: true, isFirefox: false };
  }
  if (/Chrome\//.test(ua)) return { name: "Google Chrome", isChromium: true, isSafari: false, isFirefox: false };
  return { name: "Tidak diketahui", isChromium: chromium, isSafari: false, isFirefox: false };
}

/**
 * Apakah WebGL bisa dibuat. TensorFlow.js memakai backend WebGL; tanpa itu ia
 * jatuh ke WASM/CPU yang jauh lebih lambat (atau gagal sama sekali).
 *
 * Canvas-nya sengaja dibuang setelah dipakai: membiarkan konteks WebGL
 * menggantung memakan salah satu dari ~16 slot konteks yang dibatasi browser.
 */
export function hasWebGL(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    if (!gl) return false;
    // Lepaskan konteksnya secara eksplisit; GC saja tidak cukup cepat.
    const lose = (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Terjemahkan kegagalan getUserMedia menjadi pesan yang menyebut penyebabnya.
 *
 * Nama DOMException-nya sudah tepat membedakan kasus, tapi tidak pernah layak
 * ditampilkan apa adanya ("NotReadableError" tidak berarti apa-apa bagi
 * pengguna). `kind` menentukan kata benda yang dipakai supaya pesan mikrofon
 * tidak berbunyi "kamera".
 */
export function describeMediaError(err: unknown, kind: "kamera" | "mikrofon"): DeviceIssue {
  const name = (err as { name?: string })?.name || "";
  const denied: DeviceIssue = {
    id: kind === "kamera" ? "camera-denied" : "microphone-denied",
    severity: "fatal",
    title: `Akses ${kind} ditolak`,
    detail: `Browser menolak permintaan ${kind} untuk situs ini.`,
    fix: `Klik ikon 🔒 di address bar → izinkan ${kind} → muat ulang halaman.`,
  };

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return denied;
    case "NotFoundError":
    case "OverconstrainedError":
      return {
        id: kind === "kamera" ? "no-camera" : "no-microphone",
        severity: "fatal",
        title: `${kind === "kamera" ? "Kamera" : "Mikrofon"} tidak ditemukan`,
        detail: `Tidak ada perangkat ${kind} yang terbaca di komputer ini.`,
        fix: `Sambungkan ${kind}, lalu muat ulang halaman.`,
      };
    case "NotReadableError":
    case "AbortError":
      return {
        id: kind === "kamera" ? "no-camera" : "no-microphone",
        severity: "fatal",
        title: `${kind === "kamera" ? "Kamera" : "Mikrofon"} sedang dipakai aplikasi lain`,
        detail: `Perangkat ${kind} terdeteksi tapi tidak bisa dibuka — biasanya karena Zoom, Google Meet, atau tab lain masih memakainya.`,
        fix: `Tutup aplikasi/tab yang memakai ${kind}, lalu muat ulang halaman.`,
      };
    default:
      return denied;
  }
}

/**
 * Jalankan seluruh pemeriksaan yang relevan untuk sebuah halaman.
 *
 * Sengaja TIDAK memanggil getUserMedia: itu memunculkan prompt izin, dan
 * memunculkannya saat halaman baru dibuka (bukan saat pengguna menekan tombol)
 * membuat sebagian besar orang menekan "Block" secara refleks. Yang dipakai di
 * sini hanya pemeriksaan pasif: enumerateDevices (mendeteksi ADA/TIDAKNYA
 * perangkat tanpa izin) dan Permissions API (status izin yang sudah pernah
 * diputuskan). Kegagalan saat tombol benar-benar ditekan ditangani
 * describeMediaError().
 */
export async function runDeviceDiagnostics(needs: DiagnosticsNeeds): Promise<DeviceIssue[]> {
  const issues: DeviceIssue[] = [];
  if (typeof window === "undefined") return issues;

  const browser = detectBrowser();

  // 1. Secure context. getUserMedia mati total di luar HTTPS/localhost — ini
  //    penyebab paling sering "kamera tidak jalan" saat situs dibuka lewat IP
  //    lokal (mis. http://192.168.1.5:3000).
  if ((needs.camera || needs.microphone) && !window.isSecureContext) {
    issues.push({
      id: "insecure-context",
      severity: "fatal",
      title: "Halaman tidak dibuka lewat koneksi aman",
      detail: `Alamat saat ini (${window.location.protocol}//${window.location.host}) bukan HTTPS maupun localhost. Browser memblokir kamera & mikrofon di alamat seperti ini — ini aturan browser, bukan pengaturan VERO.`,
      fix: "Buka situs lewat alamat https:// atau http://localhost.",
    });
  }

  // 2. Koneksi. Model AI diunduh dari server; offline = model tidak pernah tiba.
  if (navigator.onLine === false) {
    issues.push({
      id: "offline",
      severity: "fatal",
      title: "Tidak ada koneksi internet",
      detail: "Perangkat ini sedang offline. Model AI dan data kelas tidak bisa dimuat.",
      fix: "Sambungkan kembali ke internet, lalu muat ulang halaman.",
    });
  }

  // 3. Browser. Web Speech API (pengenalan suara) hanya ada di Chromium.
  if (needs.speechRecognition) {
    const punyaSR =
      "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
    if (!punyaSR) {
      issues.push({
        id: "speech-unsupported",
        severity: "fatal",
        title: `${browser.name} tidak mendukung pengenalan suara`,
        detail:
          "Web Speech API untuk mengubah suara menjadi teks belum tersedia di browser ini. Fitur ini ada di Chrome dan Edge.",
        fix: "Buka halaman ini di Google Chrome atau Microsoft Edge.",
      });
    }
  }

  if ((needs.camera || needs.webgl) && !browser.isChromium) {
    issues.push({
      id: "browser-unsupported",
      severity: "warning",
      title: `${browser.name} belum diuji untuk fitur AI`,
      detail:
        "Deteksi bahasa isyarat VERO diuji pada Chrome dan Edge. Di browser lain, MediaPipe bisa berjalan jauh lebih lambat atau gagal memuat.",
      fix: "Kalau deteksinya tersendat, coba buka di Chrome atau Edge.",
    });
  }

  // 4. WebGL — backend TensorFlow.js.
  if (needs.webgl && !hasWebGL()) {
    issues.push({
      id: "no-webgl",
      severity: "warning",
      title: "Akselerasi grafis (WebGL) tidak aktif",
      detail:
        "Browser ini tidak bisa membuat konteks WebGL, jadi model AI terpaksa berjalan di CPU — jauh lebih lambat.",
      fix: "Aktifkan 'Use graphics acceleration when available' di pengaturan browser, lalu muat ulang.",
    });
  }

  // 5. Keberadaan perangkat. enumerateDevices menyembunyikan LABEL sebelum izin
  //    diberikan, tapi `kind` tetap terbaca — cukup untuk tahu ada/tidaknya.
  if ((needs.camera || needs.microphone) && navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (needs.camera && !devices.some((d) => d.kind === "videoinput")) {
        issues.push({
          id: "no-camera",
          severity: "fatal",
          title: "Tidak ada kamera di perangkat ini",
          detail: "Sistem operasi tidak melaporkan satu pun perangkat kamera.",
          fix: "Sambungkan webcam, lalu muat ulang halaman.",
        });
      }
      if (needs.microphone && !devices.some((d) => d.kind === "audioinput")) {
        issues.push({
          id: "no-microphone",
          severity: "fatal",
          title: "Tidak ada mikrofon di perangkat ini",
          detail: "Sistem operasi tidak melaporkan satu pun perangkat mikrofon.",
          fix: "Sambungkan mikrofon atau headset, lalu muat ulang halaman.",
        });
      }
    } catch {
      // enumerateDevices bisa dilarang oleh Permissions-Policy. Diam: tidak tahu
      // bukan berarti rusak (aturan 2 di kepala berkas).
    }
  }

  // 6. Izin yang SUDAH ditolak sebelumnya. Ini penting karena pengguna yang
  //    pernah menekan "Block" tidak akan pernah melihat prompt lagi — tombolnya
  //    seolah tidak berfungsi tanpa penjelasan apa pun.
  if (navigator.permissions?.query) {
    const perlu: Array<{ nama: PermissionName; kind: "kamera" | "mikrofon"; aktif?: boolean }> = [
      { nama: "camera" as PermissionName, kind: "kamera", aktif: needs.camera },
      { nama: "microphone" as PermissionName, kind: "mikrofon", aktif: needs.microphone },
    ];
    for (const p of perlu) {
      if (!p.aktif) continue;
      try {
        const status = await navigator.permissions.query({ name: p.nama });
        if (status.state === "denied") {
          issues.push({
            id: p.kind === "kamera" ? "camera-denied" : "microphone-denied",
            severity: "fatal",
            title: `Akses ${p.kind} diblokir untuk situs ini`,
            detail: `Izin ${p.kind} pernah ditolak, jadi browser tidak akan menampilkan permintaan izin lagi.`,
            fix: `Klik ikon 🔒 di address bar → ubah ${p.kind} menjadi "Izinkan" → muat ulang halaman.`,
          });
        }
      } catch {
        // Firefox & Safari belum mendukung query nama ini — bukan kegagalan.
      }
    }
  }

  // Satu penyebab bisa terdeteksi dua jalur (mis. izin ditolak terbaca dari
  // Permissions API DAN dari daftar perangkat kosong). Tampilkan sekali saja.
  const unik = new Map<DeviceIssueId, DeviceIssue>();
  for (const i of issues) if (!unik.has(i.id)) unik.set(i.id, i);
  return [...unik.values()];
}
