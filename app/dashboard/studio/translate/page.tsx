"use client";
import { useEffect, useState, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import LoadingScreen from "@/components/LoadingScreen";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import { Camera, CameraOff, RefreshCw, Loader2, Zap, Info, X } from "lucide-react";
import { toast } from "sonner";
import Script from "next/script";

import {
  extractHolisticFeatures,
  FrameBuffer,
} from "../../../utils/holisticFeatures";

import { useTFJSModel } from "../../../hooks/useTFJSModel";
import { usePerfStats } from "../../../hooks/usePerfStats";
import PerfBadge from "@/components/PerfBadge";
import { createFramePacer, type FramePacer } from "@/lib/framePacer";
import {
  DRAWING_UTILS_SCRIPT_URL,
  HOLISTIC_SCRIPT_URL,
  holisticLocateFile,
} from "@/lib/mediapipeCdn";
import { openCameraStream } from "@/lib/cameraDevices";
import {
  isModeAvailable,
  modeLabel,
  modelFor,
  unavailableReason,
  type SignLevel,
  type SignSystem,
} from "@/lib/signModes";
import SignModeSelect from "@/components/SignModeSelect";
import { useCameraDevices } from "../../../hooks/useCameraDevices";
import CameraSelect from "@/components/CameraSelect";
import { detectDevice, mediaConfigFor, RECOMMENDED_SPEC } from "@/lib/deviceCapability";
import DesktopOnly from "@/components/DesktopOnly";
import DeviceIssueBanner from "@/components/DeviceIssueBanner";

declare global {
  interface Window {
    Holistic: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    FACEMESH_TESSELATION: any;
    HAND_CONNECTIONS: any;
    POSE_CONNECTIONS: any;
  }
}

// Ambang confidence minimum untuk menampilkan huruf (tunable). Turunkan kalau
// model masih ragu-ragu, naikkan kalau terlalu banyak tebakan ngawur.
const MIN_CONFIDENCE = 0.6;

// Berapa dari 5 tebakan terakhir yang harus SEPAKAT sebelum label ditampilkan.
const MIN_VOTES = 3;

// Disimpan terpisah dari CAMERA_STORAGE_KEY (lib/cameraDevices.ts) supaya
// pemilihan ESP32 di halaman ini tidak ikut memengaruhi kamera default di
// halaman meeting/presentasi yang berbagi hook useCameraDevices yang sama.
const ESP32_URL_STORAGE_KEY = "vero.esp32CamStreamUrl";
// Sumber yang terakhir dipilih ikut disimpan. Tanpa ini URL-nya kembali terisi
// setelah muat ulang halaman tapi dropdown-nya balik ke "kamera bawaan" —
// keadaan setengah-setengah yang bikin orang mengira URL-nya hilang.
const ESP32_SOURCE_STORAGE_KEY = "vero.esp32CamSelected";
const ESP32_FRAMESIZE_STORAGE_KEY = "vero.esp32CamFramesize";
const ESP32_HMIRROR_STORAGE_KEY = "vero.esp32CamHmirror";

// --- Semua di bawah ini murni olahan gambar di browser — TIDAK ada sensor
// fisik (BH1750/VL53L1X) yang dipakai, dan firmware ESP32 TIDAK pernah
// di-reflash. Satu-satunya yang menyentuh ESP32 adalah panggilan runtime ke
// endpoint /control bawaan firmware (dipakai juga oleh slider "Resolution" di
// halaman kontrol kamera http://<ip>/) — ini API yang memang sudah ada di
// firmware yang sekarang ter-flash, bukan perubahan kode/reflash baru. ---

// OV2640 di kondisi indoor biasa agak gelap dibanding webcam laptop (AGC/AEC
// bawaannya pas-pasan). CSS filter ini cuma kosmetik di elemen canvas
// tampilan — bukan mengubah exposure sensor ataupun data yang diproses MediaPipe.
const ESP32_BRIGHTNESS_FILTER = "brightness(1.35) contrast(1.08) saturate(1.05)";

// framesize_t di driver esp32-camera — angka-angka ini urutan tetap enum
// resminya (dipakai juga oleh dropdown "Resolution" di halaman kontrol kamera
// bawaan). Dibuat bisa dipilih pengguna, bukan dipatok satu angka: mana yang
// paling pas cuma ketahuan di tempat (tergantung kekuatan WiFi & laptopnya),
// dan itu justru hal yang paling ingin diutak-atik saat demo.
const ESP32_FRAMESIZES = [
  { value: 5, label: "QVGA 320x240 — paling ringan" },
  { value: 8, label: "VGA 640x480 — seimbang" },
  { value: 9, label: "SVGA 800x600 — paling detail" },
];
// VGA, bukan SVGA. MJPEG lewat hotspot HP + Holistic di laptop tanpa GPU itu
// dua leher botol yang menumpuk; SVGA menaikkan ukuran JPEG ~2,2x tanpa
// menambah detail tangan yang benar-benar terpakai model. Naikkan sendiri
// lewat dropdown kalau di tempat ternyata lancar.
const ESP32_DEFAULT_FRAMESIZE = 8;

// Kamera ESP32 terpasang fisik terbalik (kebalik kiri-kanan) di board ini —
// hmirror=1 ngoreksi itu di level sensor lewat /control juga, JADI berlaku
// untuk gambar yang dikirim ke MediaPipe (bukan sekadar tampilan). Kanvas
// tampilan (canvasRef di JSX) tetap punya CSS scale-x-[-1] miliknya sendiri
// buat efek cermin selfie khas webcam — dua-duanya independen, tidak saling
// meniadakan secara keliru: yang ini betulin ORIENTASI SUMBER, yang itu cuma
// gaya tampilan "cermin" seperti webcam biasa.
//
// KENAPA INI DIBUAT BISA DIGANTI DARI UI, bukan konstanta mati: arah cermin
// menentukan tangan mana yang dilabeli MediaPipe sebagai KIRI dan mana KANAN,
// dan fitur yang masuk model disusun per-tangan (lihat holisticFeatures.ts).
// Kalau arahnya kebalik dari data latih, modelnya tidak "agak meleset" — dia
// meleset sistematis untuk semua isyarat satu tangan. Salah pasang sensor
// sedikit saja sudah membalik ini, jadi harus bisa dibetulkan di tempat tanpa
// mengubah kode.
const ESP32_DEFAULT_HMIRROR = 1;

// Perkiraan jarak tangan dari UKURAN telapak di gambar (landmark 5 = pangkal
// telunjuk, landmark 17 = pangkal kelingking — "lebar telapak" MediaPipe
// Hands). Rumus kamera lubang jarum: jarak = (lebar_asli_cm * fokal_px) / lebar_px.
//
// Panjang fokal disimpan sebagai RASIO terhadap lebar gambar, bukan angka
// piksel mati. Panjang fokal dalam piksel ikut membesar sebanding resolusi:
// tebakan 280px yang dulu ditulis untuk QVGA (320x240) jadi salah 2,5x begitu
// resolusinya naik ke SVGA — jaraknya kebaca jauh lebih dekat dari aslinya.
// Rasio ini tidak berubah saat dropdown resolusi diganti.
//
// Angkanya masih TEBAKAN kasar (280/320), belum dikalibrasi ke unit fisik
// manapun. Cara kalibrasi manual: taruh tangan tepat 30cm dari kamera, lihat
// angka yang muncul, lalu RASIO baru = rasio_sekarang * (30 / angka_terbaca).
const HAND_WIDTH_CM = 8.5;
const ESP32_FOCAL_RATIO = 280 / 320;

// Ambang kegelapan dari rata-rata luma sampel kecil (skala 0-255). Di bawah
// ini dianggap "kurang cahaya". Sengaja disampel dari <img> MENTAH (sebelum
// filter kecerahan kosmetik di atas), supaya deteksinya jujur ke kondisi
// ruangan asli, bukan ke gambar yang sudah dipercantik.
const DARK_LUMA_THRESHOLD = 60;
const DARK_SAMPLE_INTERVAL_MS = 800;

// Berapa lama menunggu frame pertama sebelum menyerah. Tanpa batas waktu,
// alamat yang salah ketik bikin tombolnya menggantung tanpa kabar sampai
// browser sendiri yang menyerah — bisa semenit lebih.
const ESP32_CONNECT_TIMEOUT_MS = 8000;

// Penjarangan pembaruan angka jarak. Tanpa ini setHandDistanceCm dipanggil
// tiap frame (~30x/detik) dan SETIAP panggilan me-render ulang seluruh
// halaman — persis pola yang dulu bikin halaman ini berat.
const DISTANCE_UPDATE_INTERVAL_MS = 250;
const DISTANCE_MIN_DELTA_CM = 2;

// Berapa sampel berturut-turut (x DARK_SAMPLE_INTERVAL_MS) yang isinya persis
// identik sebelum stream dianggap membeku. MJPEG yang putus di tengah jalan
// TIDAK selalu memicu event error: <img> cuma berhenti diperbarui, dan
// MediaPipe terus memproses frame terakhir yang sama berulang-ulang — dari
// layar kelihatan masih hidup, padahal prediksinya sudah tidak berarti.
// Derau sensor membuat dua frame asli nyaris mustahil identik sampai ke bit,
// jadi kesamaan persis adalah tanda beku yang cukup dipercaya.
const STREAM_FREEZE_SAMPLES = 5;

/**
 * Lengkapi apa pun yang diketik pengguna jadi URL stream yang sah.
 *
 * Yang dibaca orang dari Serial Monitor cuma alamat IP-nya ("192.168.43.5").
 * Tanpa pelengkapan ini, teks itu dipakai apa adanya sebagai src <img>, lalu
 * peramban memperlakukannya sebagai alamat RELATIF terhadap situs — jadi
 * menembak ke server web ini, bukan ke kameranya, dan pesan gagalnya
 * menyesatkan sama sekali.
 *
 * Aturan firmware CameraWebServer: halaman kontrol di port 80, stream MJPEG di
 * port 81 path /stream.
 */
function normalizeEsp32Url(raw: string): string | null {
  const teks = raw.trim();
  if (!teks) return null;
  const berskema = /^https?:\/\//i.test(teks) ? teks : `http://${teks}`;
  let url: URL;
  try {
    url = new URL(berskema);
  } catch {
    return null;
  }
  if (!url.hostname) return null;
  // Cuma host tanpa path → arahkan ke endpoint stream bawaan firmware.
  if (url.pathname === "" || url.pathname === "/") {
    if (!url.port) url.port = "81";
    url.pathname = "/stream";
  }
  return url.toString();
}

/**
 * Alamat endpoint /control.
 *
 * Kalau menembak kamera LANGSUNG, stream ada di port 81 sedangkan kontrol di
 * port 80 — jadi port-nya dibuang. Kalau lewat jembatan (tools/esp32-bridge.mjs)
 * atau tunnel, satu port melayani dua-duanya, jadi port-nya HARUS dipertahankan.
 * Membuang port di kasus kedua membuat kontrol menembak port 80 laptop sendiri.
 */
function esp32ControlBase(streamUrl: string): string | null {
  try {
    const url = new URL(streamUrl);
    if (url.port === "81") return `${url.protocol}//${url.hostname}/control`;
    return `${url.origin}/control`;
  } catch {
    return null;
  }
}

/**
 * Loopback (127.0.0.1, ::1, localhost) digolongkan "potentially trustworthy"
 * oleh spesifikasi Secure Contexts, dan aturan mixed content secara eksplisit
 * melewatkan sumber yang tergolong itu. Jadi halaman HTTPS BOLEH memuat
 * http://127.0.0.1:8081/stream walau http://192.168.43.5:81/stream diblokir.
 *
 * Inilah yang membuat jalur jembatan bekerja di situs online.
 */
function alamatLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * Peramban menolak memuat sumber daya HTTP dari halaman yang disajikan lewat
 * HTTPS ("mixed content"). Ini penghalang yang TIDAK bisa diakali dari sisi
 * kode: bukan soal CORS, bukan soal izin, dan tidak ada header yang bisa
 * dipasang ESP32 untuk melewatinya.
 *
 * Kenapa mem-proxy lewat server VERO tidak menolong: server produksi ada di
 * VPS di internet, sedangkan kameranya di alamat jaringan lokal (192.168.x.x)
 * yang cuma bisa dijangkau dari dalam jaringan itu sendiri. Server tidak punya
 * jalan ke sana sama sekali.
 *
 * Yang MENOLONG adalah proxy di sisi laptop: `tools/esp32-bridge.mjs` duduk di
 * 127.0.0.1 dan meneruskan ke kamera. Loopback dikecualikan dari aturan mixed
 * content (lihat alamatLoopback di bawah), jadi jalur itu sah dipakai bahkan
 * dari situs online.
 *
 * Fungsi ini hanya menyalakan peringatan untuk kasus yang memang mustahil:
 * situs HTTPS menembak alamat LAN langsung.
 */
function esp32TerblokirMixedContent(streamUrl: string): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.protocol !== "https:") return false;
  try {
    const url = new URL(streamUrl);
    if (url.protocol === "https:") return false;
    // Lewat jembatan di loopback — dikecualikan aturan mixed content.
    return !alamatLoopback(url.hostname);
  } catch {
    return false;
  }
}

// Gerbang desktop dipasang di LUAR komponen isinya, bukan sebagai cabang di
// dalamnya: dengan begini seluruh hook kamera & MediaPipe di TranslateStudio
// tidak pernah dijalankan di ponsel — bukan sekadar disembunyikan tampilannya.
export default function TranslateGesturePage() {
  return (
    <DesktopOnly
      fitur="Penerjemah Bahasa Isyarat"
      alasan="Penerjemah ini menjalankan model AI di atas video kamera secara terus-menerus. Beban itu terlalu berat untuk ponsel dan tablet — perangkat menjadi panas dan deteksinya tersendat, jadi kami tidak menyajikannya setengah jalan."
    >
      <TranslateStudio />
    </DesktopOnly>
  );
}

function TranslateStudio() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isLibraryLoaded, setIsLibraryLoaded] = useState(false);
  const router = useRouter();

  const [isDetecting, setIsDetecting] = useState(false);
  const [prediction, setPrediction] = useState("SIAP...");
  const [confidence, setConfidence] = useState<number>(0);

  // Mode ringan untuk perangkat lemah (auto-deteksi, bisa di-override manual).
  const [lightMode, setLightMode] = useState(false);
  const [lowEndDetected, setLowEndDetected] = useState(false);
  const [showSpecBanner, setShowSpecBanner] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holisticRef = useRef<any>(null);

  // Sumber ESP32 Cam: <img> MJPEG digambar ke <canvas> tersembunyi tiap frame,
  // lalu canvas itu (bukan videoRef) yang dikirim ke MediaPipe. Beda total
  // dari jalur webcam yang pakai getUserMedia + <video>.
  const [videoSource, setVideoSource] = useState<"webcam" | "esp32">("webcam");
  const [esp32Url, setEsp32Url] = useState("");
  const [esp32Framesize, setEsp32Framesize] = useState(ESP32_DEFAULT_FRAMESIZE);
  const [esp32Hmirror, setEsp32Hmirror] = useState(ESP32_DEFAULT_HMIRROR === 1);
  // Panel kamera jaringan terlipat secara bawaan. Alat VERO itu perkakas
  // segelintir orang; menaruh opsinya sejajar dengan daftar kamera biasa
  // membuat setiap murid melihat pilihan yang tidak ada artinya buat mereka.
  // Terlipat, bukan disembunyikan berdasarkan protokol — halaman HTTPS tetap
  // butuh pintu ini kalau blokir mixed content dilonggarkan dari setelan
  // peramban.
  const [esp32PanelTerbuka, setEsp32PanelTerbuka] = useState(false);
  const esp32ImgRef = useRef<HTMLImageElement>(null);
  const esp32CanvasRef = useRef<HTMLCanvasElement>(null);
  // Penangan error stream yang dipasang SELAMA sesi berjalan (bukan cuma saat
  // menyambung). Disimpan supaya bisa dicopot lagi di stopCamera — kalau tidak,
  // pengosongan src saat berhenti bisa memicu error dan memanggil stopCamera
  // untuk kedua kalinya.
  const esp32ErrorHandlerRef = useRef<(() => void) | null>(null);
  // videoSource dibaca dari dalam onResults yang terdaftar sekali ke MediaPipe —
  // pakai ref supaya tidak terjebak nilai lama dari closure (pola yang sama
  // dengan lightModeRef di bawah).
  const videoSourceRef = useRef<"webcam" | "esp32">("webcam");

  // Perkiraan jarak tangan (cm) & status kurang-cahaya — dua-duanya dihitung
  // dari gambar kamera itu sendiri, khusus jalur ESP32 Cam. Lihat konstanta
  // HAND_WIDTH_CM/ESP32_FOCAL_RATIO/DARK_LUMA_THRESHOLD di atas.
  const [handDistanceCm, setHandDistanceCm] = useState<number | null>(null);
  const [isTooDark, setIsTooDark] = useState(false);
  const [isStreamBeku, setIsStreamBeku] = useState(false);
  const darkSampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastDarkSampleAtRef = useRef(0);
  // Cegah toast kegelapan spam tiap 800ms — cuma sekali tiap kali TRANSISI
  // dari cukup terang ke gelap.
  const darkWarnedRef = useRef(false);
  // Penjarangan angka jarak: kapan terakhir di-render & nilai yang sedang
  // tampil. Dua-duanya ref, bukan state — dibaca tiap frame, dan menjadikannya
  // state justru menghidupkan lagi render-per-frame yang mau dihindari.
  const lastDistanceAtRef = useRef(0);
  const shownDistanceRef = useRef<number | null>(null);
  // Deteksi stream beku: sidik jari sampel terakhir + berapa kali berturut-turut
  // sidik jarinya sama persis.
  const lastLumaSigRef = useRef<number | null>(null);
  const freezeCountRef = useRef(0);
  // Pengatur laju frame MediaPipe (menggantikan helper Camera tanpa batas laju).
  const pacerRef = useRef<FramePacer | null>(null);
  
  // Frame buffer untuk sequence-based LSTM (30 frames)
  const bufferRef = useRef(new FrameBuffer(30));
  const isPredictingRef = useRef(false);
  const predictionHistoryRef = useRef<string[]>([]);
  // Penjarangan prediksi: waktu prediksi terakhir + jarak minimum antar prediksi.
  const lastPredictAtRef = useRef(0);
  const predictIntervalRef = useRef(120);
  // lightMode dibaca dari dalam onResults yang terdaftar sekali ke MediaPipe —
  // pakai ref supaya tidak terjebak nilai lama dari closure.
  const lightModeRef = useRef(false);

  // Alat ukur: fps nyata + backend TFJS. Tanpa ini keluhan "ngelag" cuma tebakan.
  const perf = usePerfStats();

  // Pemilih kamera — tanpa ini alat kamera yang ditancapkan lewat USB tidak
  // pernah terpakai, karena browser selalu memberi kamera bawaan laptop.
  const kamera = useCameraDevices();

  // Mode dipilih EKSPLISIT: sistem (BISINDO/SIBI) x tingkat (ABJAD/KATA).
  //
  // Sebelumnya halaman ini mengunci BISINDO dan menjalankan DUA model sekaligus
  // (abjad + kata) lalu mengambil confidence tertinggi, supaya pengguna tidak
  // perlu berganti mode. Sekarang pilihannya kembali eksplisit — SIBI tidak bisa
  // dijangkau lewat cara lama — dan sebagai efek samping ongkos inferensi turun
  // separuh karena hanya satu model yang jalan per frame.
  const [system, setSystem] = useState<SignSystem>("bisindo");
  const [level, setLevel] = useState<SignLevel>("abjad");

  const modeTersedia = isModeAvailable(system, level);
  // Kombinasi tak tersedia tidak bisa dipilih dari UI (tombolnya mati), tapi
  // hook tetap butuh nama model yang sah — pakai BISINDO abjad sebagai penadah.
  const activeModel = modelFor(system, level) ?? "bisindo";

  const model = useTFJSModel(activeModel);
  const isModelLoading = model.isLoading;
  const modelError = model.error;

  // Baca preferensi ESP32 yang tersimpan (kalau ada) sekali saat mount.
  useEffect(() => {
    try {
      const savedUrl = window.localStorage.getItem(ESP32_URL_STORAGE_KEY);
      if (savedUrl) setEsp32Url(savedUrl);

      if (window.localStorage.getItem(ESP32_SOURCE_STORAGE_KEY) === "1") {
        setVideoSource("esp32");
        videoSourceRef.current = "esp32";
        // Yang terakhir kali memakai alat tidak boleh disuruh mencari-cari lagi
        // di mana setelannya tadi.
        setEsp32PanelTerbuka(true);
      }

      const savedSize = Number(window.localStorage.getItem(ESP32_FRAMESIZE_STORAGE_KEY));
      // Hanya terima angka yang memang ada di daftar — nilai asing di
      // localStorage (bekas versi lama, atau diutak-atik) jangan sampai
      // dikirim mentah-mentah ke /control.
      if (ESP32_FRAMESIZES.some((f) => f.value === savedSize)) setEsp32Framesize(savedSize);

      const savedMirror = window.localStorage.getItem(ESP32_HMIRROR_STORAGE_KEY);
      if (savedMirror === "0" || savedMirror === "1") setEsp32Hmirror(savedMirror === "1");
    } catch {
      // localStorage bisa diblokir (mode privat) — bukan alasan untuk gagal.
    }
  }, []);

  function simpanPreferensi(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // lihat catatan di atas.
    }
  }

  function handleEsp32UrlChange(url: string) {
    setEsp32Url(url);
    simpanPreferensi(ESP32_URL_STORAGE_KEY, url);
  }

  /**
   * Kirim satu setelan ke firmware lewat endpoint /control bawaannya.
   *
   * Dipanggil dua keadaan: sekali di awal koneksi, dan lagi setiap pengguna
   * mengubah dropdown SAAT stream sedang jalan — firmware menerapkannya
   * seketika, jadi tidak perlu memutus dan menyambung ulang.
   *
   * Gagal di sini tidak pernah menggagalkan stream: kameranya cuma tetap di
   * setelan sebelumnya.
   */
  async function kirimKontrolEsp32(variable: string, value: number, streamUrl: string) {
    const base = esp32ControlBase(streamUrl);
    if (!base) return;
    try {
      await fetch(`${base}?var=${variable}&val=${value}`);
    } catch (e) {
      console.warn(`Gagal set ${variable} di ESP32 Cam:`, e);
    }
  }

  function handleFramesizeChange(value: number) {
    setEsp32Framesize(value);
    simpanPreferensi(ESP32_FRAMESIZE_STORAGE_KEY, String(value));
    const url = normalizeEsp32Url(esp32Url);
    if (isDetecting && videoSource === "esp32" && url) {
      kirimKontrolEsp32("framesize", value, url);
    }
  }

  function handleHmirrorChange(aktif: boolean) {
    setEsp32Hmirror(aktif);
    simpanPreferensi(ESP32_HMIRROR_STORAGE_KEY, aktif ? "1" : "0");
    const url = normalizeEsp32Url(esp32Url);
    if (isDetecting && videoSource === "esp32" && url) {
      kirimKontrolEsp32("hmirror", aktif ? 1 : 0, url);
    }
  }

  // Memilih kamera fisik otomatis mematikan jalur jaringan — dua sumber tidak
  // bisa hidup bersamaan, dan menekan dropdown ini adalah cara paling wajar
  // untuk menyatakan "saya mau pakai webcam saja".
  function handleCameraSelect(id: string | null) {
    setVideoSource("webcam");
    videoSourceRef.current = "webcam";
    simpanPreferensi(ESP32_SOURCE_STORAGE_KEY, "0");
    kamera.select(id);
  }

  /** Nyalakan/matikan jalur kamera jaringan. Sumber kamera hanya satu pada satu waktu. */
  function handleEsp32Toggle(aktif: boolean) {
    setVideoSource(aktif ? "esp32" : "webcam");
    videoSourceRef.current = aktif ? "esp32" : "webcam";
    simpanPreferensi(ESP32_SOURCE_STORAGE_KEY, aktif ? "1" : "0");
  }

  // Alamat yang benar-benar akan dipakai, ditampilkan balik ke pengguna. Orang
  // mengetik "192.168.43.5" lalu bertanya-tanya ke mana perginya port 81 —
  // memperlihatkan hasil pelengkapannya jauh lebih menenangkan daripada
  // membiarkan mereka menebak.
  const alamatEsp32Siap = normalizeEsp32Url(esp32Url);
  const esp32Terblokir = alamatEsp32Siap !== null && esp32TerblokirMixedContent(alamatEsp32Siap);
  // Situs disajikan lewat HTTPS = halaman online. Di sana kamera hanya bisa
  // dijangkau lewat jembatan loopback, jadi petunjuknya berbeda dari localhost.
  const situsOnline = typeof window !== "undefined" && window.location.protocol === "https:";
  // Kalau pengguna sempat mengetik IP kamera lalu kena blokir, pakai IP itu di
  // contoh perintah — lebih enak disalin daripada angka karangan.
  const alamatContohIp = esp32Terblokir && alamatEsp32Siap
    ? new URL(alamatEsp32Siap).hostname
    : "192.168.43.5";

  // Deteksi perangkat lemah sekali saat mount → sarankan Mode Ringan.
  useEffect(() => {
    const profile = detectDevice();
    if (profile.isLowEnd) {
      setLightMode(true);
      setLowEndDetected(true);
      setShowSpecBanner(true);
    }
  }, []);

  useEffect(() => {
    const checkLib = setInterval(() => {
      // window.Camera tidak lagi dibutuhkan — stream & laju frame kini diurus
      // sendiri (getUserMedia + framePacer), jadi camera_utils sudah dilepas.
      if (window.Holistic && window.drawConnectors) {
        setIsLibraryLoaded(true);
        clearInterval(checkLib);
      }
    }, 1000);
    return () => clearInterval(checkLib);
  }, []);

  const onResults = async (results: any) => {
    // Catat frame terproses SEBELUM early-return apa pun, supaya fps mencerminkan
    // laju MediaPipe sesungguhnya — bukan laju frame yang lolos ke prediksi.
    perf.tick();

    if (!canvasRef.current || !videoRef.current) return;
    const canvasCtx = canvasRef.current.getContext("2d");
    if (!canvasCtx) return;

    // Samakan ukuran kanvas dengan ukuran frame ASLI dari kamera.
    //
    // Tanpa ini gambar jadi gepeng: kanvas dipatok 1280x720 lewat JSX, lalu
    // drawImage merenggangkan frame apa pun ke kotak itu. Banyak webcam laptop
    // hanya sanggup 4:3 (mis. 640x480), dan constraint getUserMedia kita memakai
    // "ideal" yang sifatnya saran — bukan paksaan — jadi kamera boleh saja
    // mengirim 4:3. Meregangkan 4:3 ke kotak 16:9 = wajah kelihatan penyet.
    //
    // Dengan menyamakan ukuran intrinsik kanvas ke frame asli, drawImage jadi
    // 1:1 tanpa distorsi; CSS "object-cover" yang mengurus pas-nya ke kotak
    // tampilan (memotong tepi, bukan meregangkan).
    const frameW = results.image?.width || videoRef.current.videoWidth;
    const frameH = results.image?.height || videoRef.current.videoHeight;
    if (frameW && frameH) {
      if (canvasRef.current.width !== frameW) canvasRef.current.width = frameW;
      if (canvasRef.current.height !== frameH) canvasRef.current.height = frameH;
    }

    // Perkiraan jarak tangan dari ukuran telapak di gambar — cuma buat sumber
    // ESP32 Cam (lihat konstanta HAND_WIDTH_CM/ESP32_FOCAL_RATIO di atas file).
    if (videoSourceRef.current === "esp32") {
      const handLm = results.rightHandLandmarks || results.leftHandLandmarks;
      const sekarang = performance.now();
      if (handLm && handLm.length > 17 && frameW && frameH) {
        const a = handLm[5]; // pangkal telunjuk
        const b = handLm[17]; // pangkal kelingking
        const dx = (a.x - b.x) * frameW;
        const dy = (a.y - b.y) * frameH;
        const pixelWidth = Math.hypot(dx, dy);
        if (pixelWidth > 4) {
          // Panjang fokal ikut lebar frame yang SEDANG dipakai, jadi angkanya
          // tetap sama walau resolusi diganti di tengah jalan.
          const focalPx = ESP32_FOCAL_RATIO * frameW;
          const estCm = Math.round((HAND_WIDTH_CM * focalPx) / pixelWidth);
          const tampil = shownDistanceRef.current;
          // Render ulang hanya kalau angkanya benar-benar bergerak, dan paling
          // sering seperempat detik sekali. Tanpa dua pagar ini seluruh halaman
          // ikut di-render 30x/detik cuma untuk satu label kecil.
          const berubah = tampil === null || Math.abs(estCm - tampil) >= DISTANCE_MIN_DELTA_CM;
          if (berubah && sekarang - lastDistanceAtRef.current >= DISTANCE_UPDATE_INTERVAL_MS) {
            lastDistanceAtRef.current = sekarang;
            shownDistanceRef.current = estCm;
            setHandDistanceCm(estCm);
          }
        }
      } else if (shownDistanceRef.current !== null) {
        // Tangan hilang dari frame. Dikosongkan sekali saja — tanpa penjaga ini
        // cabang inilah yang jalan tiap frame selama tidak ada tangan, dan itu
        // justru keadaan yang paling sering.
        shownDistanceRef.current = null;
        lastDistanceAtRef.current = sekarang;
        setHandDistanceCm(null);
      }
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

    // Di Mode Ringan, LEWATI overlay landmark. Menggambar 1 rangkaian pose + 2
    // rangkaian tangan tiap frame bukan ongkos gratis di CPU lemah, sementara
    // overlay itu murni hiasan — tidak dipakai untuk prediksi. Videonya tetap
    // tampil; yang hilang cuma garis-garisnya.
    if (!lightModeRef.current) {
    // Draw Landmarks — NO GREEN COLORS
    if (results.poseLandmarks) {
      window.drawConnectors(canvasCtx, results.poseLandmarks, window.POSE_CONNECTIONS, { color: '#6366F1', lineWidth: 4 }); // Indigo
      window.drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#EF4444', lineWidth: 2 }); // Red
    }
    if (results.rightHandLandmarks) {
      window.drawConnectors(canvasCtx, results.rightHandLandmarks, window.HAND_CONNECTIONS, { color: '#8B5CF6', lineWidth: 5 }); // Violet
      window.drawLandmarks(canvasCtx, results.rightHandLandmarks, { color: '#A78BFA', lineWidth: 2 }); // Light violet
    }
    if (results.leftHandLandmarks) {
      window.drawConnectors(canvasCtx, results.leftHandLandmarks, window.HAND_CONNECTIONS, { color: '#EC4899', lineWidth: 5 }); // Pink
      window.drawLandmarks(canvasCtx, results.leftHandLandmarks, { color: '#F472B6', lineWidth: 2 }); // Light pink
    }
    }

    // Extract 212 features and add to buffer.
    // push() already keeps a sliding window of the last 30 frames, so once
    // it's primed it STAYS full — no need to drop frames manually.
    const handsVisible = !!(
      results.rightHandLandmarks || results.leftHandLandmarks
    );
    const features = extractHolisticFeatures(results);
    bufferRef.current.push(features);

    if (!handsVisible) {
      // Tidak ada tangan di depan kamera → jangan tampilkan tebakan pede yg salah.
      setPrediction("—");
      setConfidence(0);
      predictionHistoryRef.current = [];
    } else if (!bufferRef.current.isReady()) {
      // Only shown while collecting the very first 30 frames.
      setPrediction("MENGUMPULKAN DATA...");
    } else if (
      !isPredictingRef.current &&
      performance.now() - lastPredictAtRef.current >= predictIntervalRef.current
    ) {
      // Buffer full: predict on the current 30-frame window. Between predictions
      // we keep the last letter on screen (don't revert to "collecting").
      // Prediksi DIJARANGKAN (lihat predictIntervalMs) — dulu jalan tiap frame.
      isPredictingRef.current = true;
      lastPredictAtRef.current = performance.now();
      const frames = bufferRef.current.getFrames();

      try {
        // Satu model saja — yang sesuai mode terpilih.
        const result = await model.predict(frames);

        if (
          result &&
          result.huruf &&
          result.huruf !== "?" &&
          result.confidence >= MIN_CONFIDENCE
        ) {
          const history = predictionHistoryRef.current;
          history.push(result.huruf);
          if (history.length > 5) history.shift();

          // Smoothing: majority vote over last few predictions
          const counts = history.reduce((acc: Record<string, number>, val: string) => {
            acc[val] = (acc[val] || 0) + 1;
            return acc;
          }, {});

          let maxCount = 0;
          let smoothedLabel = result.huruf;
          for (const key in counts) {
            if (counts[key] > maxCount) {
              maxCount = counts[key];
              smoothedLabel = key;
            }
          }

          // Wajib ada KESEPAKATAN nyata, bukan sekadar "yang terbanyak".
          // "Terbanyak" bisa berarti 1 dari 5: saat kamera bergoyang sedikit dan
          // model menghasilkan lima tebakan acak yang semuanya berbeda, salah
          // satunya tetap tampil seolah yakin (mis. huruf Z muncul tanpa ada yang
          // berisyarat). Minimal 3 dari 5 harus sepakat.
          if (maxCount >= MIN_VOTES) {
            setPrediction(smoothedLabel.toUpperCase());
            setConfidence(result.confidence);
          }
        }
      } catch (e) {
        console.error("TFJS prediction error:", e);
      } finally {
        isPredictingRef.current = false;
      }
    }
    canvasCtx.restore();
  };

  async function startCamera() {
    if (!isLibraryLoaded) return;

    // URL hasil pelengkapan dipakai di seluruh jalur ESP32 di bawah. Dihitung
    // sekali di sini supaya yang divalidasi dan yang benar-benar dipakai
    // menyambung tidak mungkin berbeda.
    const streamUrl = videoSource === "esp32" ? normalizeEsp32Url(esp32Url) : null;

    if (videoSource === "esp32") {
      if (!streamUrl) {
        toast.error("Alamat ESP32 Cam belum benar. Isi IP-nya saja, mis. 192.168.43.5");
        return;
      }
      if (esp32TerblokirMixedContent(streamUrl)) {
        toast.error(
          "Peramban memblokir kamera jaringan di situs HTTPS. Buka VERO lewat http://localhost:3000 di laptop yang satu WiFi dengan kameranya.",
          { duration: 10000 }
        );
        return;
      }
    } else if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error("Akses Kamera Diblokir! Anda harus menggunakan URL 'localhost' atau HTTPS.");
      return;
    }

    // Penjaga terakhir: tombol tingkat yang tak tersedia sudah mati di UI, tapi
    // keadaan bisa saja tak sah karena bug di tempat lain. Jangan sampai model
    // yang salah dimuat diam-diam.
    if (!modeTersedia) {
      toast.error(unavailableReason(system, level) ?? "Mode ini belum tersedia.");
      return;
    }

    setIsDetecting(true);
    const cfg = mediaConfigFor(lightMode);
    const label = modeLabel(system, level);
    toast.info(lightMode ? `AI ${label} Aktif (Mode Ringan)` : `AI ${label} Aktif`);
    bufferRef.current.clear();
    perf.reset();
    predictIntervalRef.current = cfg.predictIntervalMs;
    lastPredictAtRef.current = 0;
    lightModeRef.current = lightMode;

    const holistic = new window.Holistic({
      locateFile: holisticLocateFile,
    });

    holistic.setOptions({
      modelComplexity: cfg.modelComplexity,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    holistic.onResults(onResults);
    holisticRef.current = holistic;

    if (videoSource === "esp32" && streamUrl) {
      try {
        const img = esp32ImgRef.current;
        const canvas = esp32CanvasRef.current;
        if (!img || !canvas) throw new Error("Elemen ESP32 Cam belum siap");

        // Kirim resolusi + arah cermin lewat endpoint /control bawaan firmware
        // (port 80) SEBELUM mulai nyambung ke stream-nya (port 81) — biar frame
        // pertama yang diterima udah di setelan yang benar. Gagal (mis. ESP32
        // lagi gak bisa dijangkau) TIDAK menggagalkan koneksi; stream tetap
        // lanjut jalan di setelan lama.
        await Promise.all([
          kirimKontrolEsp32("framesize", esp32Framesize, streamUrl),
          kirimKontrolEsp32("hmirror", esp32Hmirror ? 1 : 0, streamUrl),
        ]);

        // <img> MJPEG memuat part pertamanya lewat event "load" biasa di Chrome —
        // dipakai sebagai tanda stream sudah benar-benar nyambung sebelum mulai
        // ngirim frame ke MediaPipe.
        //
        // Diberi batas waktu: alamat yang benar bentuknya tapi tidak ada
        // isinya (salah satu angka IP, atau kameranya belum menyala) tidak
        // memicu error cepat — koneksinya cuma menggantung, dan tanpa batas
        // waktu tombolnya ikut menggantung tanpa penjelasan.
        await new Promise<void>((resolve, reject) => {
          let batasWaktu: ReturnType<typeof setTimeout> | null = null;
          const cleanup = () => {
            if (batasWaktu !== null) clearTimeout(batasWaktu);
            img.removeEventListener("load", onLoad);
            img.removeEventListener("error", onError);
          };
          const onLoad = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); reject(new Error("Gagal konek ke stream ESP32 Cam")); };
          img.addEventListener("load", onLoad, { once: true });
          img.addEventListener("error", onError, { once: true });
          batasWaktu = setTimeout(() => {
            cleanup();
            img.removeAttribute("src");
            reject(new Error("Waktu tunggu habis"));
          }, ESP32_CONNECT_TIMEOUT_MS);
          img.src = streamUrl;
        });

        // Setelah tersambung, pasang penangan error yang menetap. MJPEG itu satu
        // koneksi HTTP yang dibiarkan menganga; kalau ESP32 mati atau WiFi-nya
        // putus di tengah sesi, di sinilah ketahuannya.
        const onStreamError = () => {
          toast.error("Stream ESP32 Cam terputus. Cek kamera & WiFi-nya.");
          stopCamera();
        };
        esp32ErrorHandlerRef.current = onStreamError;
        img.addEventListener("error", onStreamError);

        // Gak ada cara jujur ngukur fps kamera buat sumber jaringan (beda dari
        // getVideoPlaybackQuality() milik <video>), jadi angkanya dikosongkan
        // saja daripada menampilkan sesuatu yang menyesatkan.
        perf.watchVideo(null);

        pacerRef.current?.stop();
        pacerRef.current = createFramePacer(
          async () => {
            const im = esp32ImgRef.current;
            const cv = esp32CanvasRef.current;
            if (!holisticRef.current || !im || !cv || !im.complete || im.naturalWidth === 0) return;
            const w = im.naturalWidth;
            const h = im.naturalHeight;
            if (cv.width !== w) cv.width = w;
            if (cv.height !== h) cv.height = h;
            const ctx = cv.getContext("2d");
            if (!ctx) return;

            // TIDAK pakai ctx.filter di sini — filter Canvas2D itu berat kalau
            // dijalankan tiap frame (beda dari CSS filter biasa yang gratis di
            // GPU compositor), dan bikin MediaPipe kayak "gak mau" deteksi
            // padahal cuma keteteran. MediaPipe sengaja terima gambar MENTAH;
            // efek kecerahan dipindah ke CSS filter di elemen canvas tampilan
            // (lihat JSX) — cuma soal compositing, gak menyentuh data piksel
            // yang diproses.
            ctx.drawImage(im, 0, 0, w, h);

            // Deteksi kegelapan: disampel dari <img> MENTAH (bukan cv yang sudah
            // dipercantik filter di atas), dan dijarangkan — gak perlu tiap frame.
            const now = performance.now();
            if (now - lastDarkSampleAtRef.current >= DARK_SAMPLE_INTERVAL_MS) {
              lastDarkSampleAtRef.current = now;
              if (!darkSampleCanvasRef.current) {
                const sc = document.createElement("canvas");
                sc.width = 16;
                sc.height = 16;
                darkSampleCanvasRef.current = sc;
              }
              const sc = darkSampleCanvasRef.current;
              const sctx = sc.getContext("2d", { willReadFrequently: true });
              if (sctx) {
                sctx.drawImage(im, 0, 0, 16, 16);
                const data = sctx.getImageData(0, 0, 16, 16).data;
                let sum = 0;
                for (let i = 0; i < data.length; i += 4) {
                  sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                }
                const avgLuma = sum / (data.length / 4);
                const dark = avgLuma < DARK_LUMA_THRESHOLD;
                setIsTooDark(dark);
                if (dark && !darkWarnedRef.current) {
                  darkWarnedRef.current = true;
                  toast.warning("Cahaya terlalu gelap — coba pindah ke tempat yang lebih terang.");
                } else if (!dark) {
                  darkWarnedRef.current = false;
                }

                // Sampel yang sama sekali tidak bergerak = stream membeku.
                // Memakai jumlah luma mentah (bukan rata-rata yang dibulatkan)
                // supaya perubahan sekecil derau sensor pun terhitung.
                if (lastLumaSigRef.current === sum) {
                  freezeCountRef.current += 1;
                  if (freezeCountRef.current === STREAM_FREEZE_SAMPLES) {
                    setIsStreamBeku(true);
                    toast.warning(
                      "Gambar ESP32 Cam berhenti bergerak — prediksi tidak lagi mengikuti gerakan. Matikan lalu nyalakan ulang AI.",
                      { duration: 8000 }
                    );
                  }
                } else {
                  lastLumaSigRef.current = sum;
                  if (freezeCountRef.current >= STREAM_FREEZE_SAMPLES) setIsStreamBeku(false);
                  freezeCountRef.current = 0;
                }
              }
            }

            await holisticRef.current.send({ image: cv });
          },
          { onSample: perf.reportCost }
        );
        pacerRef.current.start();
      } catch (e) {
        console.error("Gagal memulai ESP32 Cam:", e);
        const habisWaktu = e instanceof Error && e.message === "Waktu tunggu habis";
        toast.error(
          habisWaktu
            ? `Tidak ada jawaban dari ${streamUrl} dalam ${ESP32_CONNECT_TIMEOUT_MS / 1000} detik. Cek alamat IP-nya di Serial Monitor & pastikan laptop satu WiFi dengan kameranya.`
            : "Gagal konek ke ESP32 Cam. Cek alamat & pastikan satu jaringan WiFi.",
          { duration: 8000 }
        );
        stopCamera();
      }
      return;
    }

    // Ambil stream sendiri, TIDAK memakai helper Camera dari camera_utils.
    // Camera menggerakkan onFrame sekali per requestAnimationFrame tanpa batas
    // laju, sehingga MediaPipe jalan secepat CPU sanggup dan menyaturasi main
    // thread. Dengan stream sendiri, laju frame bisa diatur lewat framePacer.
    try {
      // frameRate DIMINTA eksplisit. Sebelumnya kita cuma meminta ukuran gambar,
      // jadi kamera bebas memutuskan lajunya sendiri — dan webcam laptop di
      // ruang redup memilih 15fps demi eksposur lebih panjang. Akibatnya jendela
      // 30-frame diisi separuh frame interpolasi dan akurasi turun, tanpa satu
      // pun petunjuk di layar.
      //
      // Sengaja "ideal", bukan "min": kalau dipaksa dan kamera tidak sanggup,
      // getUserMedia GAGAL TOTAL dan kameranya tidak menyala sama sekali —
      // jauh lebih buruk daripada 15fps. Badge menampilkan laju yang benar-benar
      // terkirim, jadi kalau permintaan ini diabaikan kamera, kita tetap tahu.
      const stream = await openCameraStream(
        {
          width: { ideal: cfg.width },
          height: { ideal: cfg.height },
          frameRate: { ideal: 30 },
        },
        kamera.selectedId
      );

      // Nama asli kamera baru terbaca setelah izin diberikan, jadi daftar
      // disegarkan begitu stream pertama berhasil dibuka.
      kamera.refresh();

      const vid = videoRef.current;
      if (!vid) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      vid.srcObject = stream;
      vid.muted = true;
      vid.playsInline = true;
      await vid.play();

      // Ukur laju kamera dari elemen ini — pembanding wajib untuk fps terproses.
      perf.watchVideo(vid);

      pacerRef.current?.stop();
      pacerRef.current = createFramePacer(
        async () => {
          const v = videoRef.current;
          if (holisticRef.current && v && v.readyState >= 2) {
            await holisticRef.current.send({ image: v });
          }
        },
        { onSample: perf.reportCost }
      );
      pacerRef.current.start();
    } catch (e) {
      console.error("Gagal memulai kamera:", e);
      toast.error("Kamera gagal diakses. Periksa izin kamera di browser.");
      stopCamera();
    }
  }

  function stopCamera() {
    setIsDetecting(false);

    const holistic = holisticRef.current;
    holisticRef.current = null;

    // Hentikan pengatur laju dulu supaya tak ada send() menyusul ke instance
    // Holistic yang sudah ditutup.
    pacerRef.current?.stop();
    pacerRef.current = null;

    try {
      if (holistic) holistic.close();
    } catch (e) {
      console.warn("Failed to close MediaPipe holistic instance:", e);
    }

    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => {
        try { track.stop(); } catch (err) { }
      });
      videoRef.current.srcObject = null;
    }

    // MJPEG itu koneksi HTTP yang dibiarkan terbuka terus — kalau src gak
    // dikosongin, browser tetap nyedot bandwidth dari ESP32 walau AI-nya mati.
    if (esp32ImgRef.current) {
      // Copot penangan error DULU. Pengosongan src di bawah bisa memicu event
      // error, dan penangan itu memanggil stopCamera — yang artinya fungsi ini
      // memanggil dirinya sendiri di tengah pembersihan.
      if (esp32ErrorHandlerRef.current) {
        esp32ImgRef.current.removeEventListener("error", esp32ErrorHandlerRef.current);
        esp32ErrorHandlerRef.current = null;
      }
      // removeAttribute, bukan src = "". String kosong justru membuat peramban
      // memuat ULANG alamat halaman ini sebagai gambar — permintaan sia-sia
      // yang berakhir sebagai error di konsol.
      esp32ImgRef.current.removeAttribute("src");
    }
    setHandDistanceCm(null);
    setIsTooDark(false);
    setIsStreamBeku(false);
    darkWarnedRef.current = false;
    lastDarkSampleAtRef.current = 0;
    shownDistanceRef.current = null;
    lastDistanceAtRef.current = 0;
    lastLumaSigRef.current = null;
    freezeCountRef.current = 0;

    setPrediction("");
    setConfidence(0);
    bufferRef.current.clear();
    perf.watchVideo(null);
    perf.reset();
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await db.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);
      setLoading(false);
    };
    init();
    return () => stopCamera();
  }, [router]);

  if (loading) return <LoadingScreen />;
  if (!user) return <LoadingScreen />;

  const isReady = isLibraryLoaded && !isModelLoading;

  return (
    <div className="flex min-h-screen bg-white text-slate-900 antialiased overflow-hidden font-sans">
      {/* Versi dipatok — lihat lib/mediapipeCdn.ts. URL tanpa versi membuat
          aplikasi bisa berubah sendiri dan dua laptop bisa menjalankan versi
          berbeda, yang membatalkan perbandingan angka performa antar perangkat. */}
      <Script src={HOLISTIC_SCRIPT_URL} strategy="afterInteractive" />
      <Script src={DRAWING_UTILS_SCRIPT_URL} strategy="afterInteractive" />
      <Sidebar role={user.user_metadata.role} userName={user.user_metadata.full_name} />
      {/* pt-14 di bawah lg: halaman ini tidak punya header, jadi ruang untuk
          tombol menu yang melayang harus disediakan di sini. */}
      <main className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden pt-14 lg:pt-0 pb-20 lg:pb-0 bg-slate-50">

        {/* Diagnostik perangkat. Halaman ini butuh kamera + WebGL; kalau salah
            satunya bermasalah, penyebabnya disebut di sini alih-alih membiarkan
            layar hanya diam tanpa keterangan. */}
        <div className="px-6 pt-4 empty:hidden">
          <DeviceIssueBanner needs={{ camera: true, webgl: true }} fitur="Penerjemah Isyarat" />
        </div>

        <div className="flex-1 flex flex-col lg:flex-row relative min-h-0">
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8 relative min-w-0">
            <div className="relative w-full max-w-6xl aspect-video bg-white rounded-4xl border-4 border-white shadow-2xl overflow-hidden ring-1 ring-slate-200">
              <video ref={videoRef} className="hidden" playsInline muted />
              {/* Sumber ESP32 Cam: <img> MJPEG + <canvas> penampung frame, dua-duanya
                  tersembunyi — cuma dipakai sebagai input MediaPipe, bukan ditampilkan
                  langsung (yang tampil ke user tetap canvasRef di atas). */}
              {/* next/image gak bisa dipakai di sini: itu optimizer buat gambar statis,
                  sedangkan ini <img> mentah yang isinya terus diganti server ESP32 lewat
                  MJPEG multipart. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={esp32ImgRef} crossOrigin="anonymous" alt="" className="hidden" />
              <canvas ref={esp32CanvasRef} className="hidden" />
              <canvas
                ref={canvasRef}
                className="w-full h-full object-cover transform scale-x-[-1] bg-slate-200"
                width={1280}
                height={720}
                style={videoSource === "esp32" ? { filter: ESP32_BRIGHTNESS_FILTER } : undefined}
              />
              <PerfBadge perf={perf} visible={isDetecting} />

              {/* Perkiraan jarak tangan & peringatan kurang cahaya — dua-duanya
                  hasil olah gambar di browser, khusus sumber ESP32 Cam. */}
              {videoSource === "esp32" && isDetecting && (
                <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
                  {handDistanceCm !== null && (
                    <div className="px-3 py-1.5 rounded-xl backdrop-blur-md border border-white/10 bg-slate-900/70 text-white text-[10px] font-black tracking-wide tabular-nums">
                      ~{handDistanceCm} cm dari kamera
                    </div>
                  )}
                  {isStreamBeku && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md border border-rose-300 bg-rose-600/90 text-white text-[10px] font-black tracking-wide">
                      <Info size={12} /> Gambar berhenti — nyalakan ulang AI
                    </div>
                  )}
                  {isTooDark && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md border border-amber-300 bg-amber-500/90 text-white text-[10px] font-black tracking-wide">
                      <Info size={12} /> Kurang cahaya — pindah ke tempat lebih terang
                    </div>
                  )}
                </div>
              )}

              {!isDetecting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100/60 backdrop-blur-md">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl mb-4 text-indigo-600 border border-slate-100"><RefreshCw size={32} /></div>
                </div>
              )}
            </div>
          </div>
          {/* Panel ini JAUH lebih tinggi daripada layar begitu "Kamera Jaringan"
              dibuka: pemilih mode + pemilih kamera + panel ESP32 + mode ringan +
              kotak hasil 350px + tombol Aktifkan AI. Induknya lg:overflow-hidden
              dan panel ini tidak punya overflow sendiri — jadi bagian bawahnya
              terpotong mati dan satu-satunya cara melihat tombol Aktifkan AI
              adalah memperkecil zoom peramban. `min-h-0` wajib menyertai
              `overflow-y-auto` di sini: tanpanya anak flex menolak menyusut di
              bawah tinggi kontennya dan gulirnya tidak pernah aktif. */}
          <div className="w-full lg:w-100 lg:h-full min-h-0 lg:overflow-y-auto border-l border-slate-200 flex flex-col bg-white shrink-0 shadow-2xl z-10">
            <div className="p-6 lg:p-8 border-b border-slate-50 space-y-4 shrink-0">
              {/* Pemilih mode. Dikunci saat AI aktif — ganti mode berarti memuat
                  model lain, jadi berlaku saat AI dinyalakan berikutnya. */}
              <SignModeSelect
                system={system}
                level={level}
                onChange={(s, l) => {
                  setSystem(s);
                  // Pindah ke sistem yang tidak punya tingkat ini (SIBI + KATA)
                  // akan menyisakan pilihan mati. Turunkan ke ABJAD supaya
                  // keadaannya selalu sah tanpa pengguna perlu membetulkan.
                  setLevel(isModeAvailable(s, l) ? l : "abjad");
                }}
                disabled={isDetecting}
              />

              {/* Pemilih kamera. Dikunci saat AI aktif — mengganti kamera berarti
                  membuka ulang stream, jadi berlaku saat AI dinyalakan berikutnya.
                  Juga dikunci saat kamera jaringan menyala: dropdown ini cuma
                  mendaftar kamera fisik, dan dua sumber tidak bisa hidup bersama. */}
              <CameraSelect
                devices={kamera.devices}
                selectedId={kamera.selectedId}
                onSelect={handleCameraSelect}
                disabled={isDetecting || videoSource === "esp32"}
              />

              {/* Kamera jaringan (alat VERO). Dipakai <details> bawaan, bukan
                  buka-tutup buatan sendiri — sama alasannya dengan <select> di
                  CameraSelect: perilaku terlipat bawaan sudah dimengerti penuh
                  oleh pembaca layar dan navigasi papan ketik. */}
              <details
                open={esp32PanelTerbuka}
                onToggle={(e) => setEsp32PanelTerbuka(e.currentTarget.open)}
                className="rounded-2xl border border-slate-200 bg-slate-50/60"
              >
                <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-[11px] font-black text-slate-500 uppercase tracking-widest select-none">
                  <span className="flex items-center gap-2"><Camera size={14} /> Kamera Jaringan</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] ${videoSource === "esp32" ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {videoSource === "esp32" ? 'AKTIF' : 'MATI'}
                  </span>
                </summary>

                <div className="px-4 pb-4 space-y-3">
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Untuk alat VERO (ESP32 Cam) yang menyiarkan lewat WiFi. Kamera USB
                    dan webcam biasa tidak perlu bagian ini.
                  </p>

                  <button
                    onClick={() => handleEsp32Toggle(videoSource !== "esp32")}
                    disabled={isDetecting}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-[11px] font-black transition-all ${
                      videoSource === "esp32"
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                        : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
                    } ${isDetecting ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span>PAKAI KAMERA JARINGAN</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] ${videoSource === "esp32" ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {videoSource === "esp32" ? 'AKTIF' : 'NONAKTIF'}
                    </span>
                  </button>

                  {videoSource === "esp32" && (
                    <div>
                      <label
                        htmlFor="esp32-stream-url"
                        className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2"
                      >
                        Alamat Kamera
                      </label>
                      <input
                        id="esp32-stream-url"
                        type="text"
                        value={esp32Url}
                        onChange={(e) => handleEsp32UrlChange(e.target.value)}
                        disabled={isDetecting}
                        placeholder={situsOnline ? "127.0.0.1:8081" : "192.168.43.5"}
                        className={`w-full px-4 py-3 rounded-2xl border bg-slate-50 border-slate-200 text-[11px] font-black text-slate-700 outline-none focus:border-indigo-400 ${
                          isDetecting ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      />
                      <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                        {situsOnline
                          ? "Di situs online, isi alamat jembatan (127.0.0.1:8081) — bukan IP kameranya. Lihat petunjuk di bawah."
                          : "Cukup alamat IP dari Serial Monitor — port 81 dan /stream ditambahkan sendiri. Laptop ini harus satu WiFi/hotspot dengan ESP32 Cam-nya."}
                      </p>
                      {alamatEsp32Siap && (
                        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed break-all">
                          Akan menyambung ke <span className="font-black text-slate-500">{alamatEsp32Siap}</span>
                        </p>
                      )}

                      {/* Peringatan mixed content. Ditampilkan sebagai panel menetap,
                          bukan cuma toast saat gagal: ini penghalang yang tidak akan
                          hilang sendiri, jadi harus terbaca SEBELUM orang menekan
                          tombol dan bingung kenapa tidak jalan. */}
                      {esp32Terblokir && (
                        <div className="mt-3 bg-rose-50 border border-rose-200 rounded-2xl p-4">
                          <div className="flex gap-2">
                            <Info size={16} className="text-rose-500 shrink-0 mt-0.5" />
                            <div className="text-[11px] text-rose-700 leading-relaxed">
                              <p className="font-black">Alamat ini diblokir di situs online.</p>
                              <p className="mt-1">
                                Halaman HTTPS tidak boleh menembak alamat jaringan lokal langsung.
                                Pakai jembatan di bawah — alamatnya berubah jadi{" "}
                                <span className="font-black">127.0.0.1:8081</span>, bukan IP kamera.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Petunjuk jembatan. Hanya di situs online — di localhost
                          alamat kamera bisa dipakai langsung, jadi menampilkan
                          langkah tambahan di sana cuma bikin ragu. */}
                      {situsOnline && (
                        <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                          <div className="flex gap-2">
                            <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                            <div className="text-[11px] text-indigo-700 leading-relaxed">
                              <p className="font-black">Jalankan jembatan dulu di laptop ini.</p>
                              <p className="mt-1">
                                Di folder proyek VERO, buka terminal lalu:
                              </p>
                              <code className="block mt-1 px-2 py-1.5 rounded-lg bg-white/70 border border-indigo-100 text-[10px] font-mono break-all">
                                node tools/esp32-bridge.mjs {alamatContohIp}
                              </code>
                              <p className="mt-2">
                                Ganti angkanya dengan IP kamera dari Serial Monitor. Biarkan
                                terminalnya terbuka, lalu isi kolom di atas dengan{" "}
                                <span className="font-black">127.0.0.1:8081</span>.
                              </p>
                              <p className="mt-2">
                                Videonya tidak keluar dari jaringan lokal — jembatan cuma
                                menyambungkan peramban ke kamera lewat laptop ini.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Resolusi & arah cermin. Keduanya dikirim ke firmware lewat
                          /control dan BOLEH diubah saat AI menyala — firmware
                          menerapkannya seketika, jadi tidak perlu putus-sambung. */}
                      <div className="mt-3">
                        <label
                          htmlFor="esp32-framesize"
                          className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2"
                        >
                          Resolusi Kamera
                        </label>
                        <select
                          id="esp32-framesize"
                          value={esp32Framesize}
                          onChange={(e) => handleFramesizeChange(Number(e.target.value))}
                          className="w-full px-4 py-3 rounded-2xl border bg-slate-50 border-slate-200 text-[11px] font-black text-slate-700 outline-none focus:border-indigo-400"
                        >
                          {ESP32_FRAMESIZES.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                          Turunkan kalau gambarnya patah-patah. Bisa diubah saat AI menyala.
                        </p>
                      </div>

                      <button
                        onClick={() => handleHmirrorChange(!esp32Hmirror)}
                        className={`mt-3 w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-[11px] font-black transition-all ${
                          esp32Hmirror
                            ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <span className="flex items-center gap-2"><Camera size={14} /> BALIK KIRI-KANAN</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] ${esp32Hmirror ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                          {esp32Hmirror ? 'AKTIF' : 'NONAKTIF'}
                        </span>
                      </button>
                      <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                        Kalau isyarat satu tangan sering salah tebak padahal gerakannya benar,
                        coba balik setelan ini — arah cermin menentukan tangan mana yang dibaca
                        sebagai kiri dan mana kanan.
                      </p>
                    </div>
                  )}
                </div>
              </details>

              {/* Toggle Mode Ringan (auto-nyala di perangkat lemah). Dikunci saat
                  AI aktif — berlaku ketika AI diaktifkan berikutnya. */}
              <button
                onClick={() => setLightMode((v) => !v)}
                disabled={isDetecting}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-[11px] font-black transition-all ${lightMode ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700'} ${isDetecting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="flex items-center gap-2"><Zap size={14} /> MODE RINGAN</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] ${lightMode ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{lightMode ? 'AKTIF' : 'NONAKTIF'}</span>
              </button>
              {isDetecting && (
                <p className="text-[10px] text-slate-400 text-center -mt-2">Matikan AI dulu untuk mengubah mode.</p>
              )}

              {showSpecBanner && (
                <div className="relative bg-indigo-50 border border-indigo-100 rounded-2xl p-4 pr-8">
                  <button onClick={() => setShowSpecBanner(false)} className="absolute top-2 right-2 text-indigo-300 hover:text-indigo-500"><X size={14} /></button>
                  <div className="flex gap-2">
                    <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-indigo-700 leading-relaxed">
                      {lowEndDetected ? 'Perangkat Anda terdeteksi kurang bertenaga — Mode Ringan diaktifkan otomatis. ' : ''}{RECOMMENDED_SPEC}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1 p-6 lg:p-8 border-b border-slate-50 text-center bg-slate-50/30 flex flex-col shrink-0">
              <div className="flex-1 bg-slate-900 p-8 rounded-4xl shadow-2xl shadow-indigo-200 border-b-8 border-indigo-600 transition-all flex flex-col items-center justify-center min-h-[220px]">
                {isModelLoading ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 size={32} className="animate-spin text-indigo-400" />
                    <p className="text-indigo-300 text-sm font-bold">Memuat Model AI...</p>
                  </div>
                ) : modelError ? (
                  <p className="text-red-400 text-sm font-bold">Error: {modelError}</p>
                ) : (
                  <>
                    <h2 className="text-4xl font-black text-white tracking-tighter wrap-break-word uppercase leading-tight">{prediction}</h2>
                    {confidence > 0 && (
                       <p className="text-indigo-300 mt-4 text-sm font-bold">Confidence: {(confidence * 100).toFixed(1)}%</p>
                    )}
                  </>
                )}
              </div>
            </div>
            {/* Menempel di dasar panel yang menggulir. Tombol ini satu-satunya
                cara menyalakan/mematikan kamera — menguburnya di bawah gulir
                berarti orang harus menggulir dulu setiap kali ingin berhenti. */}
            <div className="p-6 lg:p-8 flex flex-col justify-center items-center text-center shrink-0 lg:sticky lg:bottom-0 bg-white border-t border-slate-100">
              <button
                disabled={!isReady}
                onClick={isDetecting ? stopCamera : startCamera}
                className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-xl ${!isReady ? 'bg-slate-100 text-slate-400 cursor-not-allowed' :
                  isDetecting ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-200' : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-indigo-200'
                  }`}
              >
                {!isReady ? <><Loader2 size={18} className="animate-spin inline mr-2" /> Loading AI...</> :
                  isDetecting ? <><CameraOff size={20} className="inline mr-2" /> Matikan AI</> : <><Camera size={20} className="inline mr-2" /> Aktifkan AI</>}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}