"use client";
import { useEffect, useState, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion"; 
import { 
  Hand, Play, Pause, ChevronLeft, ChevronRight, 
  Upload, Type, Video, VideoOff, Move, MonitorPlay
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import Script from 'next/script';
import "reveal.js/reveal.css";
import "reveal.js/theme/white.css";
import { toast } from "sonner";
import LoadingScreen from "@/components/LoadingScreen";

// AI: pipeline yang SAMA dengan halaman /translate — MediaPipe Holistic +
// ekstraksi 212 fitur + buffer 30 frame + model TensorFlow.js terlatih.
// (Menggantikan heuristik lama modelbisindo/modelsibi berbasis @mediapipe/hands.)
import { extractHolisticFeatures, FrameBuffer } from "@/app/utils/holisticFeatures";
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
  modeLabel,
  modelFor,
  type ModelId,
  type SignLevel,
  type SignSystem,
} from "@/lib/signModes";
import SignModeSelect from "@/components/SignModeSelect";
import { detectDevice, mediaConfigFor } from "@/lib/deviceCapability";
import DesktopOnly from "@/components/DesktopOnly";

// --- DEKLARASI GLOBAL MEDIAPIPE (Holistic, sama seperti /translate) ---
declare global {
  interface Window {
    Holistic: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
    POSE_CONNECTIONS: any;
    myHolisticInstance: any;
  }
}

// Kombinasi mana yang punya model ditentukan HANYA di lib/signModes.ts; halaman
// ini tinggal memakai tipenya supaya daftar model tidak tersalin di dua tempat.
type ModelPilihan = ModelId;
const MIN_CONFIDENCE = 0.6;

// Berapa dari 5 tebakan terakhir yang harus SEPAKAT sebelum label ditampilkan.
const MIN_VOTES = 3;

const HAND_CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],
  [10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],
  [18,19],[19,20],[0,17]
];

// Lihat catatan gerbang desktop di studio/translate/page.tsx — pola yang sama.
export default function PresentasiPage() {
  return (
    <DesktopOnly
      fitur="Presentasi Isyarat"
      alasan="Presentasi dikendalikan lewat isyarat tangan yang dibaca kamera sambil menampilkan slide berdampingan. Keduanya butuh layar lebar dan tenaga komputasi yang tidak dimiliki ponsel maupun tablet."
    >
      <PresentasiStudio />
    </DesktopOnly>
  );
}

function PresentasiStudio() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  // --- STATE PRESENTASI ---
  const [isDetecting, setIsDetecting] = useState(false);
  const [isCameraVisible, setIsCameraVisible] = useState(true);
  const [presentationText, setPresentationText] = useState("Teks terjemahan gesture akan muncul di sini.");
  
  // --- STATE SLIDE ---
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [slides, setSlides] = useState<any[]>([{ type: 'text', content: 'Silahkan klik tombol Upload di pojok kanan atas' }]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // --- REVEAL.JS INTEGRATION ---
  const deckRef = useRef<HTMLDivElement>(null);
  const revealInstance = useRef<any>(null);

  useEffect(() => {
    if (slides.length > 0 && deckRef.current && !revealInstance.current) {
      const deckEl = deckRef.current;
      const initReveal = async () => {
        // @ts-ignore
        const Reveal = (await import('reveal.js')).default;
        revealInstance.current = new Reveal(deckEl, {
          embedded: true,
          controls: false, // Disembunyikan karena pakai custom navbar
          progress: false,
          center: true,
          hash: false,
          transition: 'slide',
          width: '100%',
          height: '100%',
          margin: 0,
          backgroundTransition: 'none'
        });

        revealInstance.current.on('slidechanged', (event: any) => {
          setCurrentSlideIndex(event.indexh);
        });

        await revealInstance.current.initialize();
      };
      initReveal();
    } else if (revealInstance.current) {
      revealInstance.current.sync();
      revealInstance.current.slide(0);
    }
    
    return () => {
        // Cleanup if needed, though usually kept alive for the component lifecycle
    };
  }, [slides]);

  // --- STATE KUSTOMISASI ---
  const [textSize, setTextSize] = useState(40); 
  const [cameraScale, setCameraScale] = useState(1); 

  // --- STATE AI & MODEL ---
  // Mode disimpan sebagai sistem x tingkat; nama model diturunkan darinya
  // (lihat lib/signModes.ts) supaya pemetaan tidak ditulis ulang di sini.
  const [system, setSystem] = useState<SignSystem>("bisindo");
  const [level, setLevel] = useState<SignLevel>("abjad");
  const modelType: ModelPilihan = modelFor(system, level) ?? "bisindo";
  const modelTypeRef = useRef(modelType);
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const isMediaPipeLoaded = useRef(false);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const gestureEnabledRef = useRef(false);
  const requestRef = useRef<number>(0);

  // Sequence-based LSTM: buffer 30 frame + peredam prediksi (sama seperti translate)
  const bufferRef = useRef(new FrameBuffer(30));
  const isPredictingRef = useRef(false);
  const predictionHistoryRef = useRef<string[]>([]);

  // Model TensorFlow.js aktif (bisindo abjad / kata / sibi abjad)
  const { isLoading: isModelLoading, predict } = useTFJSModel(modelType);

  // Alat ukur: fps nyata + backend TFJS.
  const perf = usePerfStats();

  // Pengatur laju frame MediaPipe + sumber frame yang wajib ada di DOM.
  const pacerRef = useRef<FramePacer | null>(null);
  const gestureVideoRef = useRef<HTMLVideoElement>(null);
  // Penjarangan prediksi: waktu prediksi terakhir + jarak minimum antar prediksi.
  const lastPredictAtRef = useRef(0);
  const predictIntervalRef = useRef(120);
  // Mode Ringan di halaman ini murni auto-deteksi (tak ada toggle di UI-nya).
  const lightModeRef = useRef(false);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    const init = async () => {
      const { data: { user } } = await db.auth.getUser();
      if (!user) router.push("/login"); else setUser(user);
      
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          toast.error("Kamera Diblokir! Akses via 'localhost' atau HTTPS.");
          return;
        }
        // frameRate diminta eksplisit — tanpa ini kamera bebas turun ke 15fps
        // di ruang redup, yang merusak jendela temporal model. "ideal" bukan
        // "min" supaya kamera yang tidak sanggup tetap menyala.
        // Hormati kamera yang dipilih di halaman terjemah (tersimpan bersama).
        const stream = await openCameraStream(
          { frameRate: { ideal: 30 } },
          readSavedCameraId()
        );
        activeStream = stream;
        setMyStream(stream);
      } catch (err) {
        toast.error("Gagal akses kamera.");
      }
    };
    init();

    return () => {
      gestureEnabledRef.current = false;
      pacerRef.current?.stop();
      pacerRef.current = null;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (window.myHolisticInstance) {
        try {
          window.myHolisticInstance.close();
          window.myHolisticInstance = null;
        } catch (e) {}
      }
      if (activeStream) {
        activeStream.getTracks().forEach(track => {
          try { track.stop(); } catch (e) {}
        });
      }
    };
  }, [router]);

  // Sync modelType ke Ref + reset buffer & histori saat model berganti
  useEffect(() => {
    modelTypeRef.current = modelType;
    bufferRef.current.clear();
    predictionHistoryRef.current = [];
  }, [modelType]);

  useEffect(() => {
      const checkLib = setInterval(() => {
          if (window.Holistic && window.drawConnectors) {
              isMediaPipeLoaded.current = true;
              clearInterval(checkLib);
          }
      }, 1000);
      return () => clearInterval(checkLib);
  }, []);

  // --- LOGIKA AI GESTURE (identik dengan /translate) ---
  // MediaPipe Holistic -> gambar landmark jari & pose -> 212 fitur -> buffer 30
  // frame -> model TFJS -> label dengan peredam (majority vote).
  const onResults = async (results: any) => {
    // Catat frame terproses SEBELUM early-return apa pun.
    perf.tick();

    if (!drawCanvasRef.current) return;
    const canvasCtx = drawCanvasRef.current.getContext("2d");
    if (!canvasCtx) return;

    const HAND_CONN = window.HAND_CONNECTIONS || HAND_CONNECTIONS;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, drawCanvasRef.current.width, drawCanvasRef.current.height);

    // Di Mode Ringan overlay DILEWATI — hiasan yang tidak dipakai prediksi, tapi
    // menggambarnya tiap frame memakan CPU yang langka di perangkat lemah.
    if (!lightModeRef.current) {
    // Gambar landmark (overlay transparan di atas video). Warna sama dgn translate.
    if (results.poseLandmarks && window.POSE_CONNECTIONS) {
      window.drawConnectors(canvasCtx, results.poseLandmarks, window.POSE_CONNECTIONS, { color: "#6366F1", lineWidth: 3 });
    }
    if (results.rightHandLandmarks) {
      window.drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONN, { color: "#8B5CF6", lineWidth: 4 });
      window.drawLandmarks(canvasCtx, results.rightHandLandmarks, { color: "#A78BFA", lineWidth: 1, radius: 3 });
    }
    if (results.leftHandLandmarks) {
      window.drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONN, { color: "#EC4899", lineWidth: 4 });
      window.drawLandmarks(canvasCtx, results.leftHandLandmarks, { color: "#F472B6", lineWidth: 1, radius: 3 });
    }
    }
    canvasCtx.restore();

    // Ekstrak 212 fitur & dorong ke buffer sliding-window 30 frame.
    const handsVisible = !!(results.rightHandLandmarks || results.leftHandLandmarks);
    const features = extractHolisticFeatures(results);
    bufferRef.current.push(features);

    if (!handsVisible || !bufferRef.current.isReady()) return;
    if (isPredictingRef.current) return;
    // Prediksi DIJARANGKAN (lihat predictIntervalMs) — dulu jalan tiap frame.
    if (performance.now() - lastPredictAtRef.current < predictIntervalRef.current) return;
    lastPredictAtRef.current = performance.now();

    isPredictingRef.current = true;
    try {
      const result = await predict(bufferRef.current.getFrames());
      if (result && result.huruf && result.huruf !== "?" && result.confidence >= MIN_CONFIDENCE) {
        const history = predictionHistoryRef.current;
        history.push(result.huruf);
        if (history.length > 5) history.shift();

        // Peredam: majority vote atas beberapa prediksi terakhir.
        const counts: Record<string, number> = {};
        let best = result.huruf, bestN = 0;
        for (const h of history) {
          counts[h] = (counts[h] || 0) + 1;
          if (counts[h] > bestN) { bestN = counts[h]; best = h; }
        }

        // Wajib ada KESEPAKATAN nyata, bukan sekadar "yang terbanyak".
        // "Terbanyak" bisa berarti 1 dari 5: saat kamera bergoyang sedikit dan
        // model menghasilkan lima tebakan acak yang semuanya berbeda, salah
        // satunya tetap tampil seolah yakin. Minimal 3 dari 5 harus sepakat.
        if (bestN >= MIN_VOTES) {
          setPresentationText(best.toUpperCase());
        }
      }
    } catch (e) {
      console.error("Gagal Prediksi Presentasi:", e);
    } finally {
      isPredictingRef.current = false;
    }
  };

  const toggleDetecting = async () => {
    if (!isMediaPipeLoaded.current) return toast.error("Library AI sedang dimuat...");
    if (isModelLoading) return toast.error("Model AI sedang dimuat, tunggu sebentar...");

    if (isDetecting) {
      gestureEnabledRef.current = false;
      setIsDetecting(false);
      pacerRef.current?.stop();
      pacerRef.current = null;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      perf.watchVideo(null);
      perf.reset();
      return;
    }

    if (!myStream) return toast.error("Kamera tidak tersedia");
    setIsDetecting(true);
    gestureEnabledRef.current = true;
    bufferRef.current.clear();
    predictionHistoryRef.current = [];
    perf.reset();
    lastPredictAtRef.current = 0;
    lightModeRef.current = detectDevice().isLowEnd;
    predictIntervalRef.current = mediaConfigFor(lightModeRef.current).predictIntervalMs;
    toast.success(`AI ${modeLabel(system, level)} aktif`);

    if (!window.myHolisticInstance) {
      window.myHolisticInstance = new window.Holistic({
        locateFile: holisticLocateFile,
      });
      // Halaman ini dulu memaksa modelComplexity 1 tanpa peduli kemampuan
      // perangkat — celah yang sudah ditutup di translate & meeting. Kini ikut
      // auto-deteksi perangkat lemah (tanpa toggle manual di halaman ini).
      window.myHolisticInstance.setOptions({
        modelComplexity: mediaConfigFor(lightModeRef.current).modelComplexity,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      window.myHolisticInstance.onResults(onResults);
    }

    // Umpankan video (reuse myStream, tanpa akses kamera kedua) ke Holistic.
    // WAJIB elemen <video> yang BENAR-BENAR ada di DOM (walau class "hidden").
    // document.createElement tanpa append bikin Chrome men-throttle dekode video
    // → frame basi → buffer temporal rusak → prediksi ngawur. Bug yang sama
    // pernah diperbaiki di halaman meeting; halaman ini sebelumnya tertinggal.
    const videoElement = gestureVideoRef.current;
    if (!videoElement) {
      toast.error("Elemen video gesture belum siap");
      setIsDetecting(false);
      gestureEnabledRef.current = false;
      return;
    }
    videoElement.srcObject = myStream;
    videoElement.muted = true;
    videoElement.playsInline = true;
    await videoElement.play();

    // Ukur laju kamera dari elemen ini — pembanding wajib untuk fps terproses.
    perf.watchVideo(videoElement);

    // Laju frame DIATUR (lihat lib/framePacer.ts) — sebelumnya rAF meminta frame
    // berikutnya segera setelah send() selesai, tanpa batas, sehingga CPU
    // saturasi 100% dan browser tak pernah kebagian giliran.
    pacerRef.current?.stop();
    pacerRef.current = createFramePacer(
      async () => {
        if (!gestureEnabledRef.current) return;
        if (window.myHolisticInstance && videoElement.readyState >= 2) {
          await window.myHolisticInstance.send({ image: videoElement });
        }
      },
      { onSample: perf.reportCost }
    );
    pacerRef.current.start();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newSlides = Array.from(files).map((file) => ({
        type: 'image',
        src: URL.createObjectURL(file),
        alt: file.name
      }));
      setSlides(newSlides);
      setCurrentSlideIndex(0);
    }
  };

  if (!user) return <LoadingScreen />;
  const currentSlide = slides[currentSlideIndex];

  return (
    <div className="flex min-h-screen bg-white text-slate-900 antialiased overflow-hidden select-none font-sans">
      {/* Versi dipatok — lihat lib/mediapipeCdn.ts. */}
      <Script src={HOLISTIC_SCRIPT_URL} strategy="afterInteractive" />
      <Script src={DRAWING_UTILS_SCRIPT_URL} strategy="afterInteractive" />

      <Sidebar role={user.user_metadata.role} userName={user.user_metadata.full_name} />
      
      {/* pt-14 di bawah lg: halaman ini tidak punya header, jadi ruang untuk
          tombol menu yang melayang harus disediakan di sini. */}
      <main className="flex-1 flex flex-col min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden pt-14 lg:pt-0 pb-20 lg:pb-0 relative bg-slate-50">
        


        {/* --- AREA SLIDE --- */}
        <div className="flex-1 relative flex items-center justify-center p-10 bg-slate-50">
          <div className="relative w-full h-full bg-white rounded-3xl border-2 border-slate-200 shadow-2xl overflow-hidden flex items-center justify-center">
            
            {/* BOTTOM NAVBAR CONTROLS */}
            <div className="absolute bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200 px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-3 overflow-x-auto shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.1)] rounded-b-3xl">
              
              {/* LEFT: Navigasi Slide */}
              <div className="flex-1 flex items-center justify-start">
                {slides.length > 1 && (
                  <div className="flex items-center gap-4 text-slate-900 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                    <button onClick={() => revealInstance.current?.prev()} className="hover:text-emerald-600 transition-all transform hover:scale-125"><ChevronLeft size={24} strokeWidth={3}/></button>
                    <span className="font-mono font-black text-xs tracking-widest">{currentSlideIndex + 1} / {slides.length}</span>
                    <button onClick={() => revealInstance.current?.next()} className="hover:text-emerald-600 transition-all transform hover:scale-125"><ChevronRight size={24} strokeWidth={3}/></button>
                  </div>
                )}
              </div>

              {/* CENTER: Pengaturan */}
              <div className="flex-[2] flex items-center justify-center gap-4">
                {/* Pemilih mode — komponen yang sama dengan halaman terjemah &
                    meeting, membaca ketersediaan model dari lib/signModes.ts.
                    Dulu halaman ini punya daftar tombolnya sendiri, jadi saat
                    model SIBI KATA jadi nanti, "Coming Soon"-nya harus dicabut
                    manual di sini DAN di tempat lain. Sekarang cukup satu baris
                    di signModes.ts. */}
                {/* Tanpa lebar tetap: mode compact kini satu baris, jadi w-64
                    (sisa dari versi bertumpuk) justru memotong kelompok tombol
                    tingkat di sebelah kanan. */}
                <div className="shrink-0">
                  <SignModeSelect
                    system={system}
                    level={level}
                    compact
                    disabled={isDetecting}
                    onChange={(s, l) => {
                      setSystem(s);
                      setLevel(isModeAvailable(s, l) ? l : "abjad");
                    }}
                  />
                </div>

                <div className="hidden md:block h-6 w-px bg-slate-200" />

                {/* Slider Font */}
                <div className="flex items-center gap-3 bg-slate-50 px-4 py-1.5 rounded-xl border border-slate-200" title="Ukuran Teks AI">
                  <Type size={16} className="text-emerald-600" />
                  <input type="range" min="20" max="100" value={textSize} onChange={(e) => setTextSize(parseInt(e.target.value))} className="w-20 accent-emerald-600 cursor-pointer" />
                </div>

                {/* Slider Camera */}
                <div className="flex items-center gap-3 bg-slate-50 px-4 py-1.5 rounded-xl border border-slate-200" title="Ukuran Kamera">
                  <Video size={16} className="text-emerald-600" />
                  <input type="range" min="0.5" max="2" step="0.1" value={cameraScale} onChange={(e) => setCameraScale(parseFloat(e.target.value))} className="w-20 accent-emerald-600 cursor-pointer" />
                </div>
              </div>

              {/* RIGHT: Aksi */}
              <div className="flex-1 flex items-center justify-end gap-3">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" multiple className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-slate-400 bg-slate-50 border border-slate-200 hover:text-emerald-600 hover:border-emerald-200 rounded-xl transition-all" title="Upload Slide"><Upload size={20} /></button>
                <button onClick={() => setIsCameraVisible(!isCameraVisible)} className="p-2.5 text-slate-400 bg-slate-50 border border-slate-200 hover:text-emerald-600 hover:border-emerald-200 rounded-xl transition-all" title="Toggle Kamera">
                  {isCameraVisible ? <Video size={20} /> : <VideoOff size={20} />}
                </button>
                <button onClick={toggleDetecting} className={`ml-2 px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isDetecting ? 'bg-red-500 text-white shadow-lg shadow-red-200' : 'bg-emerald-500 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-600 hover:shadow-emerald-300'}`}>
                  {isDetecting ? "Stop AI" : "Mulai AI"}
                </button>
              </div>
            </div>
            {/* REVEAL.JS PRESENTATION AREA */}
            <div className="reveal w-full h-full pb-20" ref={deckRef}>
              <div className="slides w-full h-full">
                {slides.map((slide, i) => (
                  <section key={i} className="w-full h-full flex flex-col items-center justify-center p-4">
                    {slide.type === 'image' ? (
                      <div className="relative w-full h-[70vh] flex items-center justify-center">
                        <Image src={slide.src} alt={`Slide ${i}`} fill className="object-contain" priority={i === 0} />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-4 text-slate-300 w-full h-[70vh]">
                        <MonitorPlay size={64} strokeWidth={1.5} />
                        <p className="font-bold uppercase tracking-widest text-sm text-center px-10">{slide.content}</p>
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </div>

            {/* --- FLOATING CAMERA --- */}
            <AnimatePresence>
              {isCameraVisible && (
                <motion.div 
                  drag dragMomentum={false}
                  style={{ scale: cameraScale }}
                  className="absolute top-10 right-10 z-40 w-64 aspect-video bg-black rounded-2xl border-4 border-indigo-600 shadow-2xl overflow-hidden cursor-move origin-top-right group"
                >
                  {myStream && <video ref={(el) => { if(el) el.srcObject = myStream; }} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />}
                  {isDetecting && <canvas ref={drawCanvasRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1] z-10" width={640} height={480} />}
                  {/* Sumber frame MediaPipe — harus di DOM agar Chrome tidak
                      men-throttle dekodenya (lihat toggleDetecting). */}
                  <video ref={gestureVideoRef} className="hidden" playsInline muted />
                  <PerfBadge perf={perf} visible={isDetecting} />
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-indigo-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Move size={10} /></div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* --- FLOATING TRANSLATION TEXT --- */}
            <motion.div 
              drag dragMomentum={false}
              className="absolute bottom-28 z-40 bg-black/70 backdrop-blur-md px-6 sm:px-10 py-4 sm:py-6 rounded-3xl shadow-2xl cursor-move w-[90%] sm:w-auto sm:min-w-[500px] max-w-[85%] group flex flex-col items-center justify-center border border-white/10"
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">Geser Teks</div>
              <p 
                style={{ fontSize: `${textSize}px` }} 
                className="font-black text-white text-center leading-tight tracking-wide uppercase"
              >
                {presentationText}
              </p>
            </motion.div>
          </div>


        </div>
      </main>
    </div>
  );
}