"use client";
import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { db } from "@/lib/db";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mic, Camera, ChevronLeft, Hand, MessageSquareText, Volume2, VolumeX,
  Pencil, Eraser, Trash2, MonitorPlay, ChevronRight, Loader2, Zap, Info, X,
  ScreenShare, ScreenShareOff, Images
} from "lucide-react";
import { hitungGridVideo } from "@/lib/videoGrid";
import VideoPlayer from "@/components/VideoPlayer";
import { toast } from "sonner";
import Script from 'next/script';
import LoadingScreen from "@/components/LoadingScreen";
import { ReactSketchCanvas, ReactSketchCanvasRef } from "react-sketch-canvas";

// --- IMPORT LOGIKA AI CLIENT-SIDE ---
// Pakai pipeline yang sama persis dengan halaman studio/translate:
// MediaPipe Holistic → extractHolisticFeatures (212 fitur) → FrameBuffer(30) →
// useTFJSModel (LSTM sequence: bisindo/sibi/kata).
import {
  extractHolisticFeatures,
  FrameBuffer,
} from "@/app/utils/holisticFeatures";
import { useTFJSModel } from "@/app/hooks/useTFJSModel";
import { usePerfStats } from "@/app/hooks/usePerfStats";
import PerfBadge from "@/components/PerfBadge";
import { createFramePacer, type FramePacer } from "@/lib/framePacer";
import {
  DRAWING_UTILS_SCRIPT_URL,
  HOLISTIC_SCRIPT_URL,
  holisticLocateFile,
} from "@/lib/mediapipeCdn";
import { openCameraStream, readSavedCameraId } from "@/lib/cameraDevices";
import {
  isModeAvailable,
  modelFor,
  type SignLevel,
  type SignSystem,
} from "@/lib/signModes";
import SignModeSelect from "@/components/SignModeSelect";
import { speakIndonesian, primeIndonesianVoice } from "@/lib/tts";
import { detectDevice, mediaConfigFor, RECOMMENDED_SPEC } from "@/lib/deviceCapability";
import DesktopOnly from "@/components/DesktopOnly";
import DeviceIssueBanner from "@/components/DeviceIssueBanner";

declare global {
  interface Window {
    Holistic: any;
    drawConnectors: any;
    drawLandmarks: any;
    POSE_CONNECTIONS: any;
    myHolisticInstance: any;
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const HAND_CONNECTIONS: [number, number][] = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

// Ambang confidence minimum untuk menampilkan tebakan (samakan dgn translate).
const MIN_CONFIDENCE = 0.6;

// Berapa dari 5 tebakan terakhir yang harus SEPAKAT sebelum sebuah label
// ditampilkan. Tanpa ambang ini, lima tebakan acak yang semuanya berbeda pun
// lolos (lihat penjelasan di tempat pemakaiannya).
const MIN_VOTES = 3;

// stream boleh null: koneksi DATA bisa terbuka lebih dulu daripada stream media
// tiba (dan sebaliknya). Dulu tipe ini memaksa stream selalu ada, yang menutupi
// kenyataan bahwa kedua jalur itu datang terpisah dan tidak berurutan.
interface PeerData { stream: MediaStream | null; conn: any; subtitle: string; }

function MeetingContent() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomID = searchParams.get("roomID") || "GENERAL-MEETING";

  // Label ruang yang mudah dibaca. Pola id dibuat di halaman diskusi:
  // "dm-<idA>--<idB>" (diurutkan agar simetris), "grup-<id>", atau "GLOBAL".
  const roomLabel = roomID.startsWith("dm-")
    ? "Ruang Personal"
    : roomID.startsWith("grup-")
    ? "Ruang Grup"
    : "Ruang Umum";

  // --- STATE UTAMA ---
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<{ [key: string]: PeerData }>({});
  const [isJoining, setIsJoining] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);

  // --- STATE STUDIO & AI ---
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [isSttActive, setIsSttActive] = useState(false);
  const [isTtsActive, setIsTtsActive] = useState(true);
  const isTtsActiveRef = useRef(true); // Ref to avoid stale closure in handleIncomingData
  const [mySubtitle, setMySubtitle] = useState("");
  // Mode ringan untuk perangkat lemah (auto-deteksi, bisa di-override manual).
  const [lightMode, setLightMode] = useState(false);
  const [lowEndDetected, setLowEndDetected] = useState(false);
  const [showSpecBanner, setShowSpecBanner] = useState(false);

  // Mode dipilih EKSPLISIT (sama seperti studio/translate): sistem BISINDO/SIBI
  // x tingkat ABJAD/KATA. Sebelumnya halaman ini mengunci BISINDO dan
  // menjalankan dua model sekaligus; SIBI tidak bisa dijangkau sama sekali.
  const [system, setSystem] = useState<SignSystem>("bisindo");
  const [level, setLevel] = useState<SignLevel>("abjad");
  const activeModel = modelFor(system, level) ?? "bisindo";
  const model = useTFJSModel(activeModel);
  const isModelLoading = model.isLoading;
  
  // --- STATE WHITEBOARD & PRESENTASI ---
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
  const [isEraseMode, setIsEraseMode] = useState(false);
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const [isPresenting, setIsPresenting] = useState(false);
  const [remotePresentation, setRemotePresentation] = useState<any>(null);
  const [mySlides, setMySlides] = useState<string[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // --- STATE BERBAGI LAYAR ---
  // Terpisah dari presentasi slide. Keduanya sama-sama mengisi "panggung utama",
  // tapi jalurnya berbeda sama sekali: slide adalah gambar yang dikirim lewat
  // saluran data, berbagi layar adalah MediaStream yang dikirim lewat panggilan
  // media tersendiri.
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteScreen, setRemoteScreen] = useState<{ peerId: string; stream: MediaStream } | null>(null);
  /** Nama orang yang sedang mempresentasikan — untuk indikator ke SEMUA peserta. */
  const [presenterName, setPresenterName] = useState<string | null>(null);

  // --- REFS ---
  const peerInstance = useRef<any>(null);
  const activeCalls = useRef<Set<string>>(new Set());
  const screenStreamRef = useRef<MediaStream | null>(null);
  /** Panggilan media khusus layar, satu per peserta — supaya bisa ditutup rapi. */
  const screenCalls = useRef<Map<string, any>>(new Map());
  const myNameRef = useRef<string>("Peserta");
  /**
   * Kondisi papan tulis TERKINI, disimpan di ref (bukan state).
   *
   * Dua guna: (1) menerapkan gambar yang datang saat papan belum terpasang di
   * DOM, dan (2) mengirim kondisi papan ke peserta yang baru bergabung, supaya
   * ia tidak menatap papan kosong padahal yang lain sudah menggambar.
   */
  const papanPathsRef = useRef<any[]>([]);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const gestureVideoRef = useRef<HTMLVideoElement>(null); // sumber frame MediaPipe (harus di DOM)
  const gestureEnabledRef = useRef(false);
  const gestureFrameId = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isIncomingDrawing = useRef(false);
  const myStreamRef = useRef<MediaStream | null>(null);
  const userIdRef = useRef<string | null>(null);

  // AI sequence pipeline (identik dgn translate)
  const bufferRef = useRef(new FrameBuffer(30));
  const isPredictingRef = useRef(false);
  const predictionHistoryRef = useRef<string[]>([]);
  const subtitleTimeoutRef = useRef<any>(null);
  const lastSpokenRef = useRef<string>(""); // label terakhir yg di-TTS (anti-ulang)

  // Alat ukur: fps nyata + backend TFJS.
  const perf = usePerfStats();

  // Pengatur laju frame MediaPipe (menggantikan rAF tanpa batas).
  const gesturePacerRef = useRef<FramePacer | null>(null);
  // Penjarangan prediksi: waktu prediksi terakhir + jarak minimum antar prediksi.
  const lastPredictAtRef = useRef(0);
  const predictIntervalRef = useRef(120);
  // lightMode dibaca dari dalam onResults yang terdaftar sekali ke MediaPipe —
  // pakai ref supaya tidak terjebak nilai lama dari closure.
  const lightModeRef = useRef(false);

  // Simpan peers terbaru di ref supaya broadcast (subtitle AI) tidak memakai
  // closure lama — onResults Holistic hanya terdaftar sekali.
  const peersRef = useRef(peers);
  useEffect(() => { peersRef.current = peers; }, [peers]);

  // --- UKURAN AREA VIDEO ---
  // Grid dihitung dari ukuran container yang SEBENARNYA, jadi ukurannya harus
  // diukur, bukan ditebak. ResizeObserver dipakai karena container ini berubah
  // ukuran bukan hanya saat jendela di-resize: papan tulis dibuka/ditutup,
  // presentasi dimulai, banner spek muncul — semuanya mengubah tinggi area video
  // tanpa satu pun event `resize` pada window.
  const [ukuranArea, setUkuranArea] = useState({ width: 0, height: 0 });
  const JARAK_TILE = 16;
  const observerArea = useRef<ResizeObserver | null>(null);

  // Callback ref, bukan useEffect dengan daftar dependensi.
  //
  // Area video hanya terpasang di DOM saat galeri sedang ditampilkan — ia hilang
  // ketika papan tulis atau presentasi mengambil alih panggung, lalu muncul lagi
  // setelahnya. useEffect([]) akan mengamati elemen yang sudah dilepas dan tidak
  // pernah mengamati penggantinya; useEffect tanpa dependensi memasang-lepas
  // observer di SETIAP render. Callback ref dipanggil tepat saat elemennya
  // benar-benar berganti — tidak lebih, tidak kurang.
  const pasangAreaVideo = useCallback((el: HTMLDivElement | null) => {
    observerArea.current?.disconnect();
    observerArea.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;

    setUkuranArea({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setUkuranArea((lama) =>
        // Abaikan perubahan sub-piksel: tanpa penjaga ini, pembulatan tata letak
        // bisa memicu putaran ukur → render → ukur yang tidak pernah tenang.
        Math.abs(lama.width - r.width) < 1 && Math.abs(lama.height - r.height) < 1
          ? lama
          : { width: r.width, height: r.height },
      );
    });
    ro.observe(el);
    observerArea.current = ro;
  }, []);

  // Deteksi perangkat lemah sekali saat mount → aktifkan Mode Ringan otomatis.
  // Sekaligus panaskan daftar voice TTS Indonesia lebih awal.
  useEffect(() => {
    primeIndonesianVoice();
    const profile = detectDevice();
    if (profile.isLowEnd) {
      setLightMode(true);
      setLowEndDetected(true);
      setShowSpecBanner(true);
    }
  }, []);

  // --- BROADCASTING ---
  const broadcastData = (data: any) => {
    Object.values(peersRef.current).forEach((p) => { if (p.conn && p.conn.open) p.conn.send(data); });
  };

  /**
   * Terapkan sekumpulan goresan ke papan tulis.
   *
   * DUA BUG YANG DIPERBAIKI DI SINI:
   *
   * 1. `loadPaths()` pada react-sketch-canvas MENAMBAHKAN goresan, tidak
   *    menggantinya. Versi lama memanggilnya langsung tiap kali data masuk,
   *    padahal yang dikirim selalu SELURUH isi papan — jadi setiap goresan baru
   *    menumpuk salinan seluruh papan di atas dirinya sendiri. Setelah beberapa
   *    coretan, papan penerima jadi gumpalan tinta. Karena itu papan dibersihkan
   *    lebih dulu.
   *
   * 2. Papan hanya terpasang di DOM ketika sedang dibuka, jadi `canvasRef.current`
   *    bernilai null tepat pada saat gambar orang lain tiba (papan baru akan
   *    dibuka sepersekian detik kemudian). Goresannya lenyap tanpa jejak, dan
   *    papan terbuka dalam keadaan kosong — inilah yang terlihat sebagai
   *    "whiteboard tidak sinkron". Sekarang goresannya disimpan di ref dan
   *    diterapkan ulang begitu papannya benar-benar terpasang (lihat useEffect
   *    di bawah).
   */
  const terapkanGoresan = (paths: any[]) => {
    papanPathsRef.current = paths || [];
    const kanvas = canvasRef.current;
    if (!kanvas) return;
    isIncomingDrawing.current = true;
    kanvas.resetCanvas();
    if (paths?.length) kanvas.loadPaths(paths);
    // Beri satu putaran supaya onStroke yang terpicu oleh loadPaths tidak
    // dikira goresan buatan pengguna lalu disiarkan balik (pantulan tak
    // berujung antar peserta).
    setTimeout(() => { isIncomingDrawing.current = false; }, 80);
  };

  const handleIncomingData = (peerId: string, data: any) => {
    if (data.subtitle !== undefined) {
        setPeers(prev => ({ ...prev, [peerId]: { ...prev[peerId], subtitle: data.subtitle } }));
        if (data.subtitle && isTtsActiveRef.current) handleSpeak(data.subtitle); // Use ref to avoid stale closure
    }
    if (data.type === "whiteboard") {
        if (data.action === "draw") {
            terapkanGoresan(data.paths);
            // Selalu dipanggil, tanpa memeriksa `isWhiteboardOpen` lebih dulu.
            // Pemeriksaan itu membaca state dari closure yang dibuat SEKALI saat
            // koneksi terpasang, jadi nilainya membeku selamanya di `false`.
            // Memanggil setter dengan nilai yang sama tidak menimbulkan render
            // ulang, sehingga memeriksanya pun tidak menghemat apa-apa.
            setIsWhiteboardOpen(true);
        } else if (data.action === "clear") {
            papanPathsRef.current = [];
            canvasRef.current?.resetCanvas();
        }
    }
    if (data.type === "presentation") {
        if (data.action === "start") {
            setPresenterName(data.name || "Seseorang");
            if (data.mode === "screen") {
                // Gambarnya menyusul lewat panggilan media terpisah; yang ini
                // hanya pengumuman supaya indikator "sedang mempresentasikan"
                // muncul seketika, tidak menunggu stream tersambung.
                setRemotePresentation(null);
            } else {
                setRemotePresentation({ peerId, image: data.image, index: data.index });
            }
            setIsWhiteboardOpen(false);
        } else if (data.action === "stop") {
            setRemotePresentation(null);
            setPresenterName(null);
            setRemoteScreen((prev) => (prev?.peerId === peerId ? null : prev));
        }
    }
  };

  // handleIncomingData dibaca lewat ref, bukan dipanggil langsung.
  //
  // Pendengar `conn.on('data')` dipasang SEKALI per koneksi, jadi fungsi yang
  // ditangkapnya adalah versi dari render saat itu — beserta seluruh state yang
  // ikut terbekukan di dalamnya. Dengan ref yang disegarkan tiap render, data
  // yang masuk selalu diproses oleh versi terbaru.
  const handleIncomingDataRef = useRef(handleIncomingData);
  useEffect(() => { handleIncomingDataRef.current = handleIncomingData; });

  // Goresan yang tiba saat papan belum terpasang diterapkan begitu ia terbuka.
  useEffect(() => {
    if (!isWhiteboardOpen) return;
    if (!papanPathsRef.current.length) return;
    // Tunggu satu putaran agar ReactSketchCanvas selesai memasang ref-nya.
    const t = setTimeout(() => terapkanGoresan(papanPathsRef.current), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWhiteboardOpen]);

  // --- PEERJS & SIGNALING ---

  /**
   * Kirim layar yang sedang dibagikan ke SATU peserta.
   *
   * Layar dikirim sebagai PANGGILAN MEDIA TERSENDIRI, bukan dengan menukar track
   * kamera pada panggilan yang sudah ada. Menukar track memang lebih sedikit
   * kodenya, tapi konsekuensinya wajah presenter hilang dari layar semua orang
   * selama ia mempresentasikan — padahal di aplikasi untuk Teman Tuli, wajah dan
   * tangan presenter justru bagian yang tidak boleh hilang. Dengan panggilan
   * terpisah, kamera dan layar mengalir berdampingan.
   *
   * `metadata.kind` adalah penanda yang membuat penerima tahu panggilan ini
   * membawa layar, bukan kamera peserta baru.
   */
  const kirimLayarKe = (remotePeerId: string, stream: MediaStream) => {
    if (!peerInstance.current) return;
    try {
      const call = peerInstance.current.call(remotePeerId, stream, {
        metadata: { kind: "screen", name: myNameRef.current },
      });
      call.on("error", (err: any) => console.error("Panggilan layar gagal ke", remotePeerId, err));
      screenCalls.current.set(remotePeerId, call);
    } catch (e) {
      console.error("Gagal mengirim layar ke", remotePeerId, e);
    }
  };

  const callOtherUser = (remotePeerId: string, stream: MediaStream) => {
    if (!peerInstance.current || activeCalls.current.has(remotePeerId)) return;
    const call = peerInstance.current.call(remotePeerId, stream, { metadata: { kind: "camera" } });
    call.on("stream", (remoteStream: MediaStream) => {
        setPeers(prev => ({ ...prev, [remotePeerId]: { stream: remoteStream, conn: prev[remotePeerId]?.conn || null, subtitle: prev[remotePeerId]?.subtitle || '' } }));
    });
    call.on("error", (err: any) => {
        console.error("Panggilan kamera gagal ke", remotePeerId, err);
        toast.error("Gagal menyambung ke salah satu peserta.");
    });
    const conn = peerInstance.current.connect(remotePeerId);
    conn.on("open", () => {
        conn.on("data", (data: any) => handleIncomingDataRef.current(remotePeerId, data));
        setPeers(prev => ({ ...prev, [remotePeerId]: { ...prev[remotePeerId], conn } }));
        // Peserta yang baru masuk harus ikut melihat apa yang SUDAH berlangsung —
        // papan tulis yang sudah tergambar dan layar yang sedang dibagikan.
        // Tanpa ini, ia duduk di ruangan yang tampak kosong sementara yang lain
        // sedang menatap presentasi.
        if (papanPathsRef.current.length) {
          conn.send({ type: "whiteboard", action: "draw", paths: papanPathsRef.current });
        }
        if (screenStreamRef.current) {
          conn.send({ type: "presentation", action: "start", mode: "screen", name: myNameRef.current });
          kirimLayarKe(remotePeerId, screenStreamRef.current);
        }
    });
    conn.on("error", (err: any) => console.error("Saluran data gagal ke", remotePeerId, err));
    activeCalls.current.add(remotePeerId);
  };

  // --- BERBAGI LAYAR ---
  const stopScreenShare = () => {
    const s = screenStreamRef.current;
    screenStreamRef.current = null;
    if (s) s.getTracks().forEach((t) => t.stop());

    screenCalls.current.forEach((call) => { try { call.close(); } catch { /* sudah tertutup */ } });
    screenCalls.current.clear();

    setScreenStream(null);
    setIsScreenSharing(false);
    setPresenterName(null);
    // Panggung utama otomatis kembali ke tampilan galeri karena activePresImage
    // & remoteScreen sama-sama kosong — tidak ada tata letak yang perlu
    // dikembalikan secara manual.
    broadcastData({ type: "presentation", action: "stop" });
  };

  const startScreenShare = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Browser ini tidak mendukung berbagi layar. Gunakan Chrome/Edge versi terbaru lewat localhost atau HTTPS.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        // 15fps cukup untuk slide/dokumen dan jauh lebih ringan daripada 30fps —
        // penting karena penerjemah isyarat juga sedang memakan CPU yang sama.
        video: { frameRate: { ideal: 15 } },
        audio: true,
      });

      screenStreamRef.current = s;
      setScreenStream(s);
      setIsScreenSharing(true);
      setPresenterName(myNameRef.current);
      setIsWhiteboardOpen(false);
      setIsPresenting(false);
      setRemotePresentation(null);

      // Umumkan dulu (indikator langsung muncul di semua peserta), baru kirim
      // streamnya.
      broadcastData({ type: "presentation", action: "start", mode: "screen", name: myNameRef.current });
      Object.keys(peersRef.current).forEach((pid) => kirimLayarKe(pid, s));

      // Tombol "Stop sharing" bawaan browser tidak lewat aplikasi kita sama
      // sekali. Tanpa pendengar ini, presenter menghentikan berbagi lewat bilah
      // browser dan semua peserta tetap menatap gambar beku selamanya.
      s.getVideoTracks()[0].addEventListener("ended", () => stopScreenShare());

      toast.success("Layar Anda sedang dibagikan.");
    } catch (e: any) {
      // Membedakan penolakan izin dari kegagalan lain: keduanya butuh tindakan
      // yang sama sekali berbeda dari pengguna.
      if (e?.name === "NotAllowedError") {
        toast.error("Izin berbagi layar ditolak.");
      } else if (e?.name === "NotFoundError") {
        toast.error("Tidak ada layar/jendela yang bisa dibagikan.");
      } else {
        toast.error(`Gagal memulai berbagi layar: ${e?.message || "penyebab tidak diketahui"}`);
      }
      console.error("getDisplayMedia gagal:", e);
    }
  };

  const toggleScreenShare = () => {
    if (isScreenSharing) stopScreenShare();
    else startScreenShare();
  };

  const startMeeting = async (uid: string) => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error("Kamera/Mic Diblokir! Akses aplikasi melalui URL 'localhost' atau gunakan HTTPS.");
        setIsJoining(false);
        return;
      }
      const { default: Peer } = await import("peerjs");
      // Resolusi kamera mengikuti Mode Ringan: perangkat lemah → 640x480 agar
      // tidak lag; normal → 1280x720 (tangan lebih jelas, akurasi naik).
      // detectDevice() dipanggil langsung karena state lightMode belum tentu
      // ter-set saat startMeeting berjalan di mount.
      const cfg = mediaConfigFor(detectDevice().isLowEnd);
      // frameRate diminta eksplisit — tanpa ini kamera bebas memilih 15fps di
      // ruang redup (eksposur lebih panjang), yang merusak jendela temporal
      // tanpa satu pun petunjuk di layar. "ideal" bukan "min": paksaan bikin
      // getUserMedia gagal total di kamera yang tidak sanggup.
      // Hormati kamera yang dipilih di halaman terjemah (tersimpan bersama),
      // supaya alat kamera USB cukup dipilih sekali untuk seluruh aplikasi.
      const stream = await openCameraStream(
        {
          width: { ideal: cfg.width },
          height: { ideal: cfg.height },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        },
        readSavedCameraId(),
        true
      );
      setMyStream(stream);
      myStreamRef.current = stream;

      const peer = new Peer(uid, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
      peerInstance.current = peer;

      peer.on("open", async (id) => {
        setIsJoining(false);
        await db.from("meeting_participants").upsert({ room_id: roomID, user_id: uid, peer_id: id, last_seen: new Date().toISOString() });
        const { data: participants } = await db.from("meeting_participants").select("peer_id").eq("room_id", roomID).neq("user_id", uid);
        participants?.forEach((p: any) => callOtherUser(p.peer_id, stream));
      });

      peer.on("call", (call) => {
        // Panggilan yang membawa LAYAR ditangani terpisah dari kamera. Tanpa
        // pemilahan ini, layar presenter masuk ke slot video kameranya — wajah
        // presenter tergantikan tangkapan layar, dan panggung utama tetap kosong.
        const kind = (call.metadata as any)?.kind;
        if (kind === "screen") {
          // Dijawab TANPA stream: ini jalur satu arah, penerima tidak perlu
          // mengirim balik apa pun.
          call.answer();
          call.on("stream", (s) => {
            setRemoteScreen({ peerId: call.peer, stream: s });
            setPresenterName((call.metadata as any)?.name || "Seseorang");
            setIsWhiteboardOpen(false);
          });
          call.on("close", () => {
            setRemoteScreen((prev) => (prev?.peerId === call.peer ? null : prev));
            setPresenterName(null);
          });
          call.on("error", (err: any) => console.error("Stream layar bermasalah dari", call.peer, err));
          return;
        }

        call.answer(stream);
        // Pertahankan subtitle & conn yang sudah ada — stream media dan koneksi
        // data tiba terpisah, jadi yang datang belakangan tidak boleh menimpa
        // hasil kerja yang lebih dulu sampai.
        call.on("stream", (s) => setPeers(prev => ({ ...prev, [call.peer]: { stream: s, conn: prev[call.peer]?.conn || null, subtitle: prev[call.peer]?.subtitle || '' } })));
        call.on("error", (err: any) => console.error("Panggilan kamera bermasalah dari", call.peer, err));
      });

      // Simpan koneksi data yang MASUK ke state peers.
      //
      // INI AKAR BUG "subtitle tidak muncul dua arah". Sebelumnya handler ini
      // hanya memasang pendengar `data` tanpa pernah menyimpan `conn`, sehingga
      // di sisi penerima peers[X].conn tetap null. broadcastData melewati peer
      // yang conn-nya null, jadi data hanya mengalir SATU ARAH: dari peserta yang
      // baru masuk (dialah yang memanggil) ke peserta lama — tidak pernah balik.
      // Akibatnya speech-to-text dan keterangan huruf gesture cuma kelihatan di
      // satu sisi. Menyimpan conn di sini membuat jalurnya dua arah.
      peer.on("connection", (conn) => {
        conn.on("open", () => {
          conn.on("data", (d) => handleIncomingDataRef.current(conn.peer, d));
          setPeers((prev) => ({
            ...prev,
            [conn.peer]: {
              stream: prev[conn.peer]?.stream ?? null,
              conn,
              subtitle: prev[conn.peer]?.subtitle || "",
            },
          }));

          // Susulkan kondisi yang sedang berlangsung ke peserta yang baru masuk
          // — alasannya sama dengan di callOtherUser.
          if (papanPathsRef.current.length) {
            conn.send({ type: "whiteboard", action: "draw", paths: papanPathsRef.current });
          }
          if (screenStreamRef.current) {
            conn.send({ type: "presentation", action: "start", mode: "screen", name: myNameRef.current });
            kirimLayarKe(conn.peer, screenStreamRef.current);
          }
        });
        conn.on("close", () => {
          setPeers((prev) => {
            const next = { ...prev };
            if (next[conn.peer]) next[conn.peer] = { ...next[conn.peer], conn: null };
            return next;
          });
          // Peserta yang pergi tidak boleh meninggalkan layarnya membeku di
          // panggung utama.
          setRemoteScreen((prev) => (prev?.peerId === conn.peer ? null : prev));
          const panggilanLayar = screenCalls.current.get(conn.peer);
          if (panggilanLayar) { try { panggilanLayar.close(); } catch { /* sudah tertutup */ } }
          screenCalls.current.delete(conn.peer);
        });
      });

      peer.on("error", (err: any) => {
        console.error("PeerJS error:", err);
        // `peer-unavailable` wajar terjadi: peserta lain sudah keluar tapi
        // barisnya di meeting_participants belum sempat terhapus. Sisanya
        // benar-benar berarti panggilan tidak bisa tersambung.
        if (err?.type !== "peer-unavailable") {
          toast.error(`Koneksi meeting bermasalah: ${err?.type || err?.message || "tidak diketahui"}`);
        }
      });
    } catch (e) {
      console.error("startMeeting gagal:", e);
      toast.error("Kamera/Mic gagal diakses");
      setIsJoining(false);
    }
  };

  // --- GESTURE AI RECOGNITION (Holistic sequence, sama dgn studio/translate) ---
  const onHolisticResults = async (results: any) => {
    // Catat frame terproses SEBELUM early-return apa pun, supaya fps mencerminkan
    // laju MediaPipe sesungguhnya.
    perf.tick();

    // 1) Gambar overlay landmark (pose + tangan) di atas video sendiri.
    //    Di Mode Ringan overlay DILEWATI — murni hiasan, tidak dipakai untuk
    //    prediksi, tapi menggambarnya tiap frame memakan CPU yang justru langka
    //    di perangkat lemah.
    const canvas = lightModeRef.current ? null : drawCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (results.poseLandmarks && window.POSE_CONNECTIONS) {
          window.drawConnectors(ctx, results.poseLandmarks, window.POSE_CONNECTIONS, { color: '#6366F1', lineWidth: 3 });
        }
        if (results.rightHandLandmarks) {
          window.drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, { color: "#8B5CF6", lineWidth: 4 });
          window.drawLandmarks(ctx, results.rightHandLandmarks, { color: "#ffffff", lineWidth: 1, radius: 2 });
        }
        if (results.leftHandLandmarks) {
          window.drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, { color: "#EC4899", lineWidth: 4 });
          window.drawLandmarks(ctx, results.leftHandLandmarks, { color: "#ffffff", lineWidth: 1, radius: 2 });
        }
        ctx.restore();
      }
    }

    // 2) Ekstrak 212 fitur & dorong ke buffer geser 30-frame.
    const handsVisible = !!(results.rightHandLandmarks || results.leftHandLandmarks);
    const features = extractHolisticFeatures(results);
    bufferRef.current.push(features);

    // Tak ada tangan → jangan tebak, reset histori smoothing.
    if (!handsVisible) {
      predictionHistoryRef.current = [];
      return;
    }
    // Buffer belum penuh / masih ada prediksi berjalan → tunggu.
    if (!bufferRef.current.isReady() || isPredictingRef.current) return;
    // Prediksi DIJARANGKAN (lihat predictIntervalMs) — dulu jalan tiap frame,
    // dan karena dua model dipakai sekaligus itu 2 forward-pass LSTM per frame.
    if (performance.now() - lastPredictAtRef.current < predictIntervalRef.current) return;

    isPredictingRef.current = true;
    lastPredictAtRef.current = performance.now();
    const frames = bufferRef.current.getFrames();
    try {
      // Satu model saja — yang sesuai mode terpilih.
      const result = await model.predict(frames);
      if (result && result.huruf && result.huruf !== "?" && result.confidence >= MIN_CONFIDENCE) {
        // Smoothing: majority vote atas 5 prediksi terakhir.
        const history = predictionHistoryRef.current;
        history.push(result.huruf);
        if (history.length > 5) history.shift();

        const counts = history.reduce((acc: Record<string, number>, val: string) => {
          acc[val] = (acc[val] || 0) + 1;
          return acc;
        }, {});
        let maxCount = 0;
        let smoothedLabel = result.huruf;
        for (const key in counts) {
          if (counts[key] > maxCount) { maxCount = counts[key]; smoothedLabel = key; }
        }

        // Wajib ada KESEPAKATAN nyata, bukan sekadar "yang terbanyak".
        //
        // BUG YANG DIPERBAIKI: kode lama menampilkan label dengan hitungan
        // tertinggi tanpa ambang apa pun — dan "tertinggi" bisa berarti 1 dari 5.
        // Jadi saat kamera bergoyang sedikit dan model menghasilkan lima tebakan
        // acak yang semuanya berbeda, salah satunya tetap ditampilkan seolah
        // yakin. Itu sebabnya huruf seperti Z muncul tiba-tiba tanpa ada yang
        // berisyarat. Sekarang label baru tampil kalau minimal 3 dari 5 tebakan
        // terakhir sepakat.
        if (maxCount >= MIN_VOTES) {
          updateMySubtitle(smoothedLabel.toUpperCase(), true);
        }
      }
    } catch (e) {
      console.error("TFJS prediction error:", e);
    } finally {
      isPredictingRef.current = false;
    }
  };

  const toggleGesture = async () => {
    if (isGestureActive) {
        gestureEnabledRef.current = false;
        setIsGestureActive(false);
        gesturePacerRef.current?.stop();
        gesturePacerRef.current = null;
        perf.watchVideo(null);
        if (gestureFrameId.current) cancelAnimationFrame(gestureFrameId.current);
        // FIX: Null out BEFORE close to prevent race condition with pending frames
        const holisticInstance = window.myHolisticInstance;
        window.myHolisticInstance = null;
        try { if (holisticInstance) holisticInstance.close(); } catch (e) { console.warn("Gesture close:", e); }
    } else {
        if (!myStream) return toast.error("Aktifkan kamera dulu");
        if (!window.Holistic) return toast.error("Library AI belum siap, coba lagi sebentar");
        if (isModelLoading) return toast.error("Model AI masih dimuat, tunggu sebentar");
        setIsGestureActive(true);
        gestureEnabledRef.current = true;
        // Mulai bersih: buffer & histori kosong.
        bufferRef.current.clear();
        predictionHistoryRef.current = [];
        perf.reset();
        predictIntervalRef.current = mediaConfigFor(lightMode).predictIntervalMs;
        lastPredictAtRef.current = 0;
        lightModeRef.current = lightMode;

        if (!window.myHolisticInstance) {
            window.myHolisticInstance = new window.Holistic({ locateFile: holisticLocateFile });
            window.myHolisticInstance.setOptions({ modelComplexity: mediaConfigFor(lightMode).modelComplexity, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            window.myHolisticInstance.onResults(onHolisticResults);
        }

        // Sumber frame: elemen <video> hidden yang BENAR-BENAR ada di DOM (ref).
        // Video off-DOM (createElement tanpa append) di-throttle browser → frame
        // basi/lag → buffer temporal rusak → akurasi anjlok. Inilah beda utama
        // dari studio/translate (videonya di DOM), penyebab akurasi meeting jelek.
        const vid = gestureVideoRef.current;
        if (!vid) {
            toast.error("Elemen video gesture belum siap");
            setIsGestureActive(false);
            gestureEnabledRef.current = false;
            return;
        }
        vid.srcObject = myStream;
        vid.muted = true; vid.playsInline = true;
        await vid.play();

        // Ukur laju kamera dari elemen ini — pembanding wajib untuk fps terproses.
        perf.watchVideo(vid);

        // Laju frame DIATUR (lihat lib/framePacer.ts). Sebelumnya loop ini
        // meminta frame berikutnya segera setelah send() selesai — tanpa batas
        // laju — sehingga CPU saturasi 100% dan browser tak pernah kebagian
        // giliran. Itu akar lag di laptop lemah.
        gesturePacerRef.current?.stop();
        gesturePacerRef.current = createFramePacer(
            async () => {
                if (!gestureEnabledRef.current) return;
                if (vid.readyState >= 2 && window.myHolisticInstance) {
                    await window.myHolisticInstance.send({ image: vid });
                }
            },
            { onSample: perf.reportCost }
        );
        gesturePacerRef.current.start();
    }
  };

  // --- WHITEBOARD & SLIDES ---
  const clearLocalAndRemoteCanvas = () => {
    papanPathsRef.current = [];
    // resetCanvas, bukan clearCanvas: clearCanvas hanya "menghapus tampilan"
    // tapi menyimpan goresannya di riwayat, sehingga exportPaths berikutnya
    // masih mengirimkan coretan yang sudah dihapus ke peserta lain.
    canvasRef.current?.resetCanvas();
    broadcastData({ type: "whiteboard", action: "clear" });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const readers = Array.from(files).map(file => new Promise<string>((res) => {
        const reader = new FileReader(); reader.onload = (e) => res(e.target?.result as string); reader.readAsDataURL(file);
      }));
      Promise.all(readers).then(images => { setMySlides(images); setCurrentSlideIndex(0); toast.success("Slides dimuat."); });
    }
  };

  const togglePresentation = () => {
    if (isPresenting) {
        setIsPresenting(false);
        setPresenterName(null);
        broadcastData({ type: "presentation", action: "stop" });
    } else {
        if (mySlides.length === 0) return fileInputRef.current?.click();
        // Satu panggung, satu isi. Slide dan layar tidak boleh menyala bersamaan
        // — kalau dibiarkan, peserta lain menerima dua sumber untuk tempat yang
        // sama dan yang tampil tergantung mana yang kebetulan datang belakangan.
        if (isScreenSharing) stopScreenShare();
        setIsPresenting(true);
        setRemotePresentation(null);
        setPresenterName(myNameRef.current);
        broadcastData({ type: "presentation", action: "start", mode: "slides", name: myNameRef.current, image: mySlides[currentSlideIndex], index: currentSlideIndex });
    }
  };

  const changeSlide = (dir: number) => {
    const newIdx = (currentSlideIndex + dir + mySlides.length) % mySlides.length;
    setCurrentSlideIndex(newIdx);
    broadcastData({ type: "presentation", action: "start", mode: "slides", name: myNameRef.current, image: mySlides[newIdx], index: newIdx });
  };

  // --- SPEECH ---
  const handleSpeak = (text: string) => {
    if (!isTtsActive || !text) return;
    // Pakai helper bersama: paksa voice id-ID. Tanpa ini, Edge jatuh ke voice
    // Inggris dan membaca teks Indonesia dengan aksen Inggris.
    speakIndonesian(text);
  };

  const updateMySubtitle = (text: string, speakLocal = false) => {
    setMySubtitle(text); broadcastData({ subtitle: text });

    // TTS lokal HANYA untuk prediksi gesture (abjad BISINDO / KATA), bukan STT —
    // supaya suara sendiri tidak di-echo. Ucapkan sekali per label, jangan diulang
    // tiap frame selama isyarat ditahan. Pakai ref agar status TTS tidak basi.
    if (speakLocal && text && isTtsActiveRef.current && text !== lastSpokenRef.current) {
      lastSpokenRef.current = text;
      speakIndonesian(text); // helper: voice id-ID yang benar (fix aksen Inggris di Edge)
    }

    if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
    subtitleTimeoutRef.current = setTimeout(() => {
      setMySubtitle(""); broadcastData({ subtitle: "" });
      lastSpokenRef.current = ""; // reset: label sama boleh diucapkan lagi setelah jeda
    }, 3000);
  };

  // --- INIT & CLEANUP ---
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await db.auth.getUser();
      if (!user) return router.push("/login");
      setUser(user);
      userIdRef.current = user.id;
      myNameRef.current = user.user_metadata?.full_name || "Peserta";
      startMeeting(user.id);
    };
    init();
    if (SpeechRecognition) {
        const rec = new SpeechRecognition(); rec.continuous = true; rec.interimResults = true; rec.lang = 'id-ID';
        rec.onresult = (e: any) => {
            let t = ''; for (let i = e.resultIndex; i < e.results.length; ++i) t += e.results[i][0].transcript;
            if (t) updateMySubtitle(t);
        };
        recognitionRef.current = rec;
    }
    return () => {
      // 1. Hapus partisipasi dari database
      if (userIdRef.current) {
        db.from("meeting_participants").delete().eq("user_id", userIdRef.current).then();
      }
      // 2. Stop camera dan mic lokal
      if (myStreamRef.current) {
        myStreamRef.current.getTracks().forEach(t => t.stop());
      }
      // 2b. Stop tangkapan layar. Track getDisplayMedia TIDAK ikut mati saat
      // peer dihancurkan — kalau tidak dihentikan di sini, bilah "Anda sedang
      // membagikan layar" tetap menempel di browser setelah meeting ditutup.
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      screenCalls.current.forEach((call) => { try { call.close(); } catch { /* sudah tertutup */ } });
      screenCalls.current.clear();
      // 3. Hancurkan PeerJS instance
      if (peerInstance.current) {
        peerInstance.current.destroy();
      }
      // 4. Stop speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      // 5. Bersihkan loop animasi gesture & holistic instance
      gestureEnabledRef.current = false;
      gesturePacerRef.current?.stop();
      gesturePacerRef.current = null;
      if (gestureFrameId.current) {
        cancelAnimationFrame(gestureFrameId.current);
      }
      // FIX: Null out BEFORE close to prevent "SolutionWasm instance already deleted"
      const holisticInstance = window.myHolisticInstance;
      window.myHolisticInstance = null;
      try {
        if (holisticInstance) holisticInstance.close();
      } catch (e) {
        console.warn("Failed to close myHolisticInstance in meeting:", e);
      }
      // 6. Batalkan timeout subtitle yang tertunda.
      if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
    };
  }, []);

  const leaveMeeting = async () => {
      if (user) await db.from("meeting_participants").delete().eq("user_id", user.id);
      if (myStream) myStream.getTracks().forEach(t => t.stop());
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
      if (peerInstance.current) peerInstance.current.destroy();
      window.location.href = "/dashboard/diskusi";
  };

  if (isJoining || !user) return <LoadingScreen />;

  const activePresImage = isPresenting ? mySlides[currentSlideIndex] : remotePresentation?.image;
  const layarAktif = isScreenSharing ? screenStream : remoteScreen?.stream || null;
  // Ada isi di panggung utama? Kalau ya, galeri menyusut jadi strip pendamping.
  const adaPanggung = !!activePresImage || !!layarAktif;

  const tileCount = 1 + Object.keys(peers).length;
  // Grid dihitung dari UKURAN CONTAINER SUNGGUHAN (lihat lib/videoGrid.ts),
  // bukan dari rumus akar-kuadrat seperti sebelumnya. Rumus itu tidak pernah
  // tahu containernya seberapa besar, jadi tile-nya diregangkan mengikuti sel
  // grid — dan di layar yang lebih lebar/pendek dari dugaannya, wajah orang jadi
  // gepeng. Sekarang ukuran tile dihitung eksplisit dan rasionya dipatok.
  const grid = hitungGridVideo({
    width: ukuranArea.width,
    height: ukuranArea.height,
    count: tileCount,
    gap: JARAK_TILE,
  });

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Versi dipatok — lihat lib/mediapipeCdn.ts. */}
      <Script src={HOLISTIC_SCRIPT_URL} strategy="afterInteractive" />
      <Script src={DRAWING_UTILS_SCRIPT_URL} strategy="afterInteractive" />

      {/* Sumber frame untuk MediaPipe Holistic. WAJIB ada di DOM (walau hidden)
          agar browser tidak men-throttle dekode video → frame selalu segar. */}
      <video ref={gestureVideoRef} className="hidden" playsInline muted />
      
      {/* min-h-14 + flex-wrap, bukan h-14 mati: isi kanan header (pemilih mode,
          Mode Ringan, papan tulis, presentasi) tidak muat satu baris di layar
          sempit. Dengan tinggi terkunci, isinya terpotong; dengan ini ia turun
          ke baris berikutnya. */}
      <header className="min-h-14 pl-16 pr-4 sm:pr-6 lg:pl-6 py-2 bg-white border-b border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-y-2 z-50">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={leaveMeeting} className="p-2 hover:bg-slate-100 text-slate-700 rounded-full"><ChevronLeft size={20} /></button>
          <h1 className="font-black text-xs uppercase tracking-tighter text-slate-900">Vero<span className="text-indigo-600">Meeting</span></h1>
          {/* Tunjukkan ruang mana yang sedang dibuka. Tanpa ini, ruang personal
              dan grup terlihat identik — sulit menyadari kalau ternyata berada
              di ruang yang berbeda dari lawan bicara. */}
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
            {roomLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Pemilih mode isyarat. Dikunci saat gesture aktif — ganti mode
                berarti memuat model lain. */}
            {isModelLoading ? (
                /* Tinggi disamakan dengan pemilih mode (h-8) supaya header tidak
                   bergeser naik-turun tiap kali model selesai dimuat. */
                <div className="flex items-center h-8 gap-1.5 px-3 rounded-xl bg-slate-900 border border-slate-200">
                    <Loader2 size={12} className="animate-spin text-indigo-300" /><span className="text-[10px] font-black uppercase text-indigo-300">Memuat Model…</span>
                </div>
            ) : (
                <SignModeSelect
                    system={system}
                    level={level}
                    compact
                    disabled={isGestureActive}
                    onChange={(s, l) => {
                        setSystem(s);
                        setLevel(isModeAvailable(s, l) ? l : "abjad");
                    }}
                />
            )}
            {/* Mode Ringan (auto-nyala di perangkat lemah). Berlaku saat gesture diaktifkan berikutnya. */}
            <button onClick={() => setLightMode(v => !v)} title="Mode Ringan untuk perangkat lemah" className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase transition-all ${lightMode ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-slate-200 text-slate-500 hover:text-slate-700'}`}>
                <Zap size={13} /> {lightMode ? 'Ringan' : 'Normal'}
            </button>
            <button onClick={() => { setIsWhiteboardOpen(!isWhiteboardOpen); setIsPresenting(false); }} title="Papan tulis bersama" className={`p-2 rounded-xl border transition-all ${isWhiteboardOpen ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'border-slate-200 text-slate-700 hover:bg-slate-100'}`}><Pencil size={16} /></button>
            {/* Dua tombol, dua hal yang berbeda:
                - BAGIKAN LAYAR: menyalurkan layar/jendela sungguhan lewat WebRTC.
                - SLIDE: mengunggah gambar dan menggesernya bersama-sama.
                Tombol slide lama sebelumnya diberi nama "Presentasi" sehingga
                orang menekannya mengharapkan berbagi layar, lalu mendapat kotak
                pilih berkas — itulah "fitur share screen tidak berfungsi". */}
            <button
              onClick={toggleScreenShare}
              title={isScreenSharing ? "Hentikan berbagi layar" : "Bagikan layar Anda"}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all border ${isScreenSharing ? 'bg-rose-600 border-rose-600 text-white shadow-md' : 'border-slate-200 text-slate-700 hover:bg-slate-100'}`}
            >
              {isScreenSharing ? <ScreenShareOff size={16} /> : <ScreenShare size={16} />}
              <span className="hidden md:inline">{isScreenSharing ? "Stop Bagikan" : "Bagikan Layar"}</span>
            </button>
            <button onClick={togglePresentation} title="Presentasi slide gambar" className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all border ${isPresenting ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
              {isPresenting ? <MonitorPlay size={16} /> : <Images size={16} />}
              <span className="hidden md:inline">{isPresenting ? "Hentikan" : "Slide"}</span>
            </button>
            <input type="file" ref={fileInputRef} hidden multiple onChange={handleFileUpload} accept="image/*" />
        </div>
      </header>

      {/* Banner rekomendasi spek — muncul saat perangkat lemah terdeteksi. */}
      {showSpecBanner && (
        <div className="relative bg-indigo-50 border-b border-indigo-100 px-6 py-3 flex items-start gap-2 z-40">
          <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-indigo-700 leading-relaxed flex-1">
            {lowEndDetected ? 'Perangkat Anda terdeteksi kurang bertenaga — Mode Ringan diaktifkan otomatis. ' : ''}{RECOMMENDED_SPEC}
          </p>
          <button onClick={() => setShowSpecBanner(false)} className="text-indigo-300 hover:text-indigo-500 shrink-0"><X size={14} /></button>
        </div>
      )}

      {/* Diagnostik perangkat: meeting memakai kamera DAN mikrofon, jadi dua
          jalur izin bisa gagal sendiri-sendiri. Banner ini menyebut yang mana. */}
      <div className="px-4 pt-4 empty:hidden">
        <DeviceIssueBanner needs={{ camera: true, microphone: true, webgl: true }} fitur="Ruang Meeting" />
      </div>

      {/* Indikator "sedang mempresentasikan" — terlihat SEMUA peserta, termasuk
          presenternya sendiri. Tanpa penanda ini, orang yang layarnya sedang
          tersiar tidak punya satu pun petunjuk bahwa itu masih berlangsung. */}
      {presenterName && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-indigo-50 border border-indigo-100">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse shrink-0" />
            <p className="text-[11px] font-bold text-indigo-700 flex-1 min-w-0 truncate">
              {isScreenSharing || isPresenting
                ? "Anda sedang mempresentasikan ke seluruh peserta."
                : `${presenterName} sedang mempresentasikan.`}
            </p>
            {(isScreenSharing || isPresenting) && (
              <button
                onClick={() => (isScreenSharing ? stopScreenShare() : togglePresentation())}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Hentikan
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-4 gap-4 relative">
        <div className={`flex-1 min-w-0 transition-all duration-700 flex flex-col ${adaPanggung || isWhiteboardOpen ? 'bg-white rounded-[40px] shadow-2xl overflow-hidden text-slate-900' : ''}`}>
           {layarAktif ? (
               /* PANGGUNG UTAMA: LAYAR YANG DIBAGIKAN.
                  object-contain, bukan cover — layar orang lain tidak boleh
                  dipotong; teks di tepi dokumen justru sering yang terpenting. */
               <div className="relative flex-1 flex flex-col bg-slate-950">
                  <video
                    autoPlay
                    playsInline
                    muted={isScreenSharing}
                    className="w-full h-full object-contain"
                    ref={(el) => { if (el && el.srcObject !== layarAktif) el.srcObject = layarAktif; }}
                  />
                  <span className="absolute top-4 left-4 px-3 py-1.5 rounded-xl bg-black/60 text-white text-[10px] font-black uppercase tracking-widest">
                    {isScreenSharing ? "Layar Anda" : `Layar ${presenterName || "peserta"}`}
                  </span>
                  {(mySubtitle || (remoteScreen && peers[remoteScreen.peerId]?.subtitle)) && (
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white/95 text-slate-900 px-8 py-3 rounded-3xl text-2xl font-black shadow-xl border-2 border-slate-200 z-50">
                      {mySubtitle || (remoteScreen ? peers[remoteScreen.peerId]?.subtitle : "")}
                    </div>
                  )}
               </div>
           ) : activePresImage ? (
               <div className="relative flex-1 flex flex-col bg-slate-50">
                  <div className="flex-1 relative p-8">
                     <img src={activePresImage} className="w-full h-full object-contain" alt="Slide" />
                     {(mySubtitle || peers[remotePresentation?.peerId]?.subtitle) && (
                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white/95 text-slate-900 px-8 py-3 rounded-3xl text-2xl font-black shadow-xl border-2 border-slate-200 z-50">{mySubtitle || peers[remotePresentation?.peerId]?.subtitle}</div>
                     )}
                  </div>
                  {isPresenting && (
                    <div className="h-16 border-t flex items-center justify-center gap-10 bg-white">
                        <button onClick={() => changeSlide(-1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-900"><ChevronLeft /></button>
                        <span className="text-xs font-black uppercase text-slate-900">{currentSlideIndex + 1} / {mySlides.length}</span>
                        <button onClick={() => changeSlide(1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-900"><ChevronRight /></button>
                    </div>
                  )}
               </div>
           ) : isWhiteboardOpen ? (
               <div className="flex-1 flex flex-col">
                  <div className="h-12 border-b px-6 flex items-center justify-between bg-slate-50">
                     <div className="flex gap-2">
                        <button onClick={() => setIsEraseMode(false)} className={`p-1.5 rounded ${!isEraseMode ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}><Pencil size={14}/></button>
                        <button onClick={() => setIsEraseMode(true)} className={`p-1.5 rounded ${isEraseMode ? 'bg-slate-900 text-white' : 'text-slate-400'}`}><Eraser size={14}/></button>
                     </div>
                     <button onClick={clearLocalAndRemoteCanvas} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                  </div>
                  <ReactSketchCanvas ref={canvasRef} strokeColor="#4f46e5" strokeWidth={4} onStroke={() => { if(!isIncomingDrawing.current) canvasRef.current?.exportPaths().then(p => { papanPathsRef.current = p; broadcastData({ type: 'whiteboard', action: 'draw', paths: p }); }); }} />
               </div>
           ) : (
               /* GALERI.
                  Wadah luar diukur ResizeObserver; grid di dalamnya memakai
                  ukuran tile HASIL PERHITUNGAN, bukan `1fr` yang meregang
                  mengikuti sel. Itu bedanya: dengan 1fr, tile mengikuti bentuk
                  sel grid — dan begitu selnya tidak 16:9, videonya gepeng.
                  Sekarang selnya yang mengikuti tile. */
               <div ref={pasangAreaVideo} className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                  <div
                     className="grid"
                     style={{
                       gap: `${JARAK_TILE}px`,
                       gridTemplateColumns: `repeat(${grid.cols}, ${grid.tileWidth}px)`,
                       gridAutoRows: `${grid.tileHeight}px`,
                     }}
                  >
                     <div
                        className="relative bg-slate-900 rounded-[2rem] overflow-hidden shadow-sm group border-4 border-white"
                        style={{ aspectRatio: String(grid.aspectRatio) }}
                     >
                        {myStream && <VideoPlayer stream={myStream} isMuted={true} />}
                        {/* CANVAS GESTURE OVERLAY */}
                        {isGestureActive && (
                           <PerfBadge perf={perf} />
                        )}
                        {isGestureActive && (
                           <canvas ref={drawCanvasRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1] z-30 pointer-events-none" width={640} height={480} />
                        )}
                        {mySubtitle && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/95 text-slate-900 px-4 py-2 rounded-2xl text-base font-bold z-40 border border-slate-200 shadow-xl max-w-[90%] truncate">{mySubtitle}</div>}
                     </div>
                     {Object.entries(peers).map(([id, p]) => (
                       <div
                          key={id}
                          className="relative bg-slate-900 rounded-[2rem] overflow-hidden shadow-sm border-4 border-white"
                          style={{ aspectRatio: String(grid.aspectRatio) }}
                       >
                           {/* Stream bisa belum tiba walau koneksi data sudah terbuka —
                               tampilkan penanda menunggu, jangan render video kosong. */}
                           {p.stream ? (
                             <VideoPlayer stream={p.stream} />
                           ) : (
                             <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-[11px] font-black uppercase tracking-widest">
                               <Loader2 size={18} className="animate-spin mr-2" /> Menyambung…
                             </div>
                           )}
                           {p.subtitle && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/95 text-slate-900 px-4 py-2 rounded-2xl text-base font-bold z-40 border border-slate-200 shadow-xl max-w-[90%] truncate">{p.subtitle}</div>}
                       </div>
                     ))}
                  </div>
               </div>
           )}
        </div>

        {/* STRIP PESERTA saat ada yang mempresentasikan.
            Panggung utama mengambil hampir seluruh ruang, jadi peserta pindah ke
            jalur samping (atau bawah, di layar sempit) — persis pola Zoom/Meet.
            Wajah tetap terlihat: di aplikasi untuk Teman Tuli, kehilangan wajah
            saat presentasi sama dengan kehilangan pembicaraannya. */}
        {adaPanggung && (
          <div className="flex lg:flex-col gap-3 overflow-auto shrink-0 lg:w-56 pb-1 lg:pb-0">
            <div className="relative bg-slate-900 rounded-2xl overflow-hidden border-2 border-white shadow-sm shrink-0 w-40 lg:w-full aspect-video">
              {myStream && <VideoPlayer stream={myStream} isMuted={true} />}
            </div>
            {Object.entries(peers).map(([id, p]) => (
              <div key={id} className="relative bg-slate-900 rounded-2xl overflow-hidden border-2 border-white shadow-sm shrink-0 w-40 lg:w-full aspect-video">
                {p.stream ? <VideoPlayer stream={p.stream} /> : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    <Loader2 size={16} className="animate-spin" />
                  </div>
                )}
                {p.subtitle && <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-white/95 text-slate-900 px-2 py-0.5 rounded-lg text-[10px] font-bold max-w-[95%] truncate">{p.subtitle}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-20 bg-white border-t border-slate-200 flex items-center justify-center gap-4 md:gap-8 shrink-0 z-50 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)]">
        <button onClick={() => {if(myStream) myStream.getAudioTracks()[0].enabled = !isMicOn; setIsMicOn(!isMicOn);}} className={`p-4 rounded-3xl transition-all shadow-sm ${isMicOn ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}><Mic size={20}/></button>
        <button onClick={() => {if(myStream) myStream.getVideoTracks()[0].enabled = !isCamOn; setIsCamOn(!isCamOn);}} className={`p-4 rounded-3xl transition-all shadow-sm ${isCamOn ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}><Camera size={20}/></button>
        <div className="w-px h-10 bg-slate-200" />
        <button onClick={toggleGesture} disabled={isModelLoading} title={isModelLoading ? 'Model AI sedang dimuat…' : 'Deteksi bahasa isyarat'} className={`p-4 rounded-3xl border transition-all shadow-sm ${isModelLoading ? 'bg-slate-100 border-transparent text-slate-400 cursor-not-allowed' : isGestureActive ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200'}`}>{isModelLoading ? <Loader2 size={20} className="animate-spin" /> : <Hand size={20}/>}</button>
        <button onClick={() => { if(!isSttActive) recognitionRef.current?.start(); else recognitionRef.current?.stop(); setIsSttActive(!isSttActive); }} className={`p-4 rounded-3xl border transition-all shadow-sm ${isSttActive ? 'bg-indigo-100 border-indigo-200 text-indigo-700 animate-pulse' : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200'}`}><MessageSquareText size={20}/></button>
        <button onClick={() => { const next = !isTtsActive; setIsTtsActive(next); isTtsActiveRef.current = next; }} className={`p-4 rounded-3xl border transition-all shadow-sm ${isTtsActive ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200'}`}>{isTtsActive ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button>
        <button onClick={leaveMeeting} className="px-10 py-4 bg-red-600 hover:bg-red-700 text-white rounded-3xl font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95">Keluar</button>
      </div>
    </div>
  );
}

// Lihat catatan gerbang desktop di studio/translate/page.tsx — pola yang sama.
export default function MeetingPage() {
  return (
    <DesktopOnly
      fitur="Ruang Meeting"
      alasan="Ruang meeting menyalurkan video peserta sekaligus menjalankan penerjemah isyarat dan speech-to-text di perangkat Anda. Di ponsel dan tablet, ketiganya berebut tenaga yang sama dan panggilannya terputus."
    >
      <MeetingRoom />
    </DesktopOnly>
  );
}

function MeetingRoom() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MeetingContent />
    </Suspense>
  );
}