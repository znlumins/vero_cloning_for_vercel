"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import LoadingScreen from "@/components/LoadingScreen";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Mic, Volume2 } from "lucide-react";
import { useSpeechRecognition, type SpeechErrorKind } from "@/app/hooks/useSpeechRecognition";
import DeviceIssueBanner from "@/components/DeviceIssueBanner";
import { describeMediaError } from "@/lib/deviceDiagnostics";
import {
  speakIndonesian,
  stopSpeaking,
  primeIndonesianVoice,
  activeIndonesianVoiceName,
  type TtsSource,
} from "@/lib/tts";

const QUICK_PHRASES = [
  "Tolong bantu saya",
  "Saya tidak bisa bicara",
  "Saya menggunakan bahasa isyarat",
  "Bisa tolong ketikkan?",
  "Terima kasih banyak",
  "Halo, selamat pagi"
];

export default function SpeechPage() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  // State untuk Text-to-Speech (TTS) - MANUAL
  const [textToSpeak, setTextToSpeak] = useState("Halo, selamat datang di VERO.");
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Jalur mana yang terakhir berbunyi: "server" = suara neural yang seragam di
  // semua browser, "browser" = suara bawaan sistem (kualitasnya bergantung
  // perangkat). Ditampilkan agar pengguna tahu mana yang sedang ia dengar.
  const [sumberSuara, setSumberSuara] = useState<TtsSource | null>(null);
  // Hook berhenti mencoba setelah 5 kali gagal menyambung. `speechError` sendiri
  // tidak cukup membedakan "sedang mencoba" dari "sudah menyerah" — di antara
  // percobaan, isListening juga sempat false. Tanpa penanda ini panel akan
  // menampilkan "menyambung ulang..." selamanya padahal mikrofon sudah mati.
  const [sttMenyerah, setSttMenyerah] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Frasa cepat sebagai komidi putar satu baris.
  //
  // Sebelumnya `flex-wrap`: enam tombol membungkus jadi dua-tiga baris dan
  // mendorong tombol bicara keluar dari layar di jendela pendek — dan seluruh
  // baris itu disembunyikan di bawah md, jadi justru pengguna ponsel yang
  // paling butuh frasa siap-pakai tidak pernah melihatnya. Satu baris yang
  // digulir mendatar memakai tinggi tetap berapa pun jumlah frasanya.
  const relFrasa = useRef<HTMLDivElement>(null);
  const [navFrasa, setNavFrasa] = useState({ diAwal: true, diAkhir: true });

  const perbaruiNavFrasa = useCallback(() => {
    const el = relFrasa.current;
    if (!el) return;
    // Toleransi 2px: lebar hasil layout kerap pecahan, jadi scrollLeft di ujung
    // kanan tidak pernah persis sama dengan scrollWidth - clientWidth.
    const sisaKanan = el.scrollWidth - el.clientWidth - el.scrollLeft;
    setNavFrasa({ diAwal: el.scrollLeft <= 2, diAkhir: sisaKanan <= 2 });
  }, []);

  useEffect(() => {
    const el = relFrasa.current;
    if (!el) return;
    perbaruiNavFrasa();
    // Lebar rel berubah saat jendela diubah ukurannya maupun saat sidebar
    // dibuka-tutup; tanpa pengamat ini panah bisa tetap mati padahal isinya
    // sudah meluap lagi.
    const pengamat = new ResizeObserver(perbaruiNavFrasa);
    pengamat.observe(el);
    return () => pengamat.disconnect();
  }, [perbaruiNavFrasa]);

  const geserFrasa = (arah: -1 | 1) => {
    const el = relFrasa.current;
    if (!el) return;
    el.scrollBy({ left: arah * Math.max(200, el.clientWidth * 0.8), behavior: "smooth" });
  };

  // Pesan error yang ramah-pengguna per jenis kegagalan Web Speech API.
  //
  // Setiap toast diberi `id` tetap supaya kejadian yang sama MENGGANTIKAN
  // pemberitahuan sebelumnya alih-alih menumpuk. Gangguan jaringan Web Speech
  // sering datang beruntun, dan tanpa id ini layar dipenuhi tumpukan pesan yang
  // isinya sama persis.
  const handleSpeechError = useCallback((kind: SpeechErrorKind, raw: string) => {
    switch (kind) {
      case "network":
        if (raw === "retry-exhausted") {
          setSttMenyerah(true);
          // Berbeda dari gangguan biasa: mikrofon SUDAH berhenti. Pengguna perlu
          // tahu itu, plus penyebab yang paling sering di balik error ini.
          toast.error("Mikrofon berhenti — layanan pengenalan suara tidak terjangkau.", {
            id: "speech-network",
            description:
              "Pengenalan suara Chrome/Edge memerlukan internet. Periksa koneksi, matikan VPN/adblocker, lalu tekan mikrofon lagi.",
            duration: 10000,
          });
        } else {
          toast.warning("Koneksi ke layanan suara terganggu, mencoba menyambung ulang...", {
            id: "speech-network",
          });
        }
        break;
      case "not-allowed":
        toast.error("Akses mikrofon ditolak. Izinkan mikrofon di pengaturan browser.", {
          id: "speech-permission",
        });
        break;
      case "audio-capture":
        toast.error("Mikrofon tidak terdeteksi. Periksa perangkat Anda.", {
          id: "speech-device",
        });
        break;
      case "unsupported":
        toast.error("Browser ini tidak mendukung pengenalan suara. Gunakan Chrome/Edge.", {
          id: "speech-unsupported",
        });
        break;
      // no-speech & aborted sengaja diam — bukan kegagalan yang perlu diganggu.
    }
  }, []);

  const {
    isSupported,
    isListening,
    transcript,
    interim,
    error: speechError,
    start,
    stop,
    reset,
  } = useSpeechRecognition({ lang: "id-ID", onError: handleSpeechError });

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await db.auth.getUser();
      if (!user) router.push("/login"); else setUser(user);
    };
    getUser();

    // Hentikan ucapan yang masih berjalan saat pengguna meninggalkan halaman —
    // stopSpeaking() menutup KEDUA jalur (elemen audio & speechSynthesis).
    return () => stopSpeaking();
  }, [router]);

  // Pemilihan suara & sintesisnya kini ditangani lib/tts.ts (satu jalur untuk
  // seluruh aplikasi). Yang perlu dilakukan halaman ini hanya menghangatkan
  // daftar voice cadangan browser lebih awal, karena browser memuatnya asinkron.
  useEffect(() => {
    primeIndonesianVoice();
  }, []);

  // Ikut turun mengikuti kalimat terbaru — TAPI hanya kalau pengguna memang
  // sedang berada di dekat bawah. Kalau ia menggulir ke atas untuk membaca ulang
  // bagian sebelumnya, menyeretnya kembali ke bawah tiap kata baru masuk membuat
  // transkrip panjang mustahil dibaca.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const jarakDariBawah = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (jarakDariBawah < 80) el.scrollTop = el.scrollHeight;
  }, [transcript, interim]);

  // Teks yang ditampilkan di panel (mengikuti kondisi hook, bukan state manual).
  const displayText = !isSupported
    ? "Maaf, browser Anda tidak mendukung fitur ini. Gunakan Chrome atau Edge."
    : sttMenyerah
    ? "Layanan pengenalan suara tidak terjangkau. Periksa koneksi internet, lalu tekan mikrofon untuk mencoba lagi."
    : speechError === "network"
    ? "Koneksi terputus, menyambung ulang..."
    : isListening
    ? (transcript + interim) || "Mendengarkan..."
    : transcript || "Tekan ikon mikrofon untuk memulai...";

  const handleListen = async () => {
    if (isListening) {
      stop();
      return;
    }
    // Minta izin mikrofon secara EKSPLISIT lebih dulu supaya prompt izin muncul
    // seketika saat tombol ditekan, dengan pesan yang jelas kalau ditolak.
    // Setelah izin diberikan untuk origin ini, SpeechRecognition memakainya
    // kembali tanpa prompt kedua.
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stream-nya sendiri tidak dipakai — cukup untuk memicu izin; segera tutup.
        stream.getTracks().forEach((t) => t.stop());
      } catch (err) {
        // describeMediaError membedakan "ditolak" dari "tidak ada perangkat" dan
        // "sedang dipakai aplikasi lain" — tiga hal yang butuh tindakan berbeda.
        const masalah = describeMediaError(err, "mikrofon");
        toast.error(masalah.title, { id: "speech-permission", description: masalah.fix });
        return;
      }
    }
    // Percobaan baru: hapus penanda menyerah agar panel & toast kembali normal.
    setSttMenyerah(false);
    reset();
    start();
  };
  
  const handleSpeak = async () => {
    if (!textToSpeak) return;
    setIsSpeaking(true);
    const sumber = await speakIndonesian(textToSpeak, {
      rate: 0.95,
      interrupt: true,
      onEnd: () => setIsSpeaking(false),
    });
    setSumberSuara(sumber);
    // "gagal" berarti tidak ada jalur yang berbunyi sama sekali — onEnd tidak
    // akan pernah dipanggil, jadi indikatornya harus dimatikan di sini.
    if (sumber === "gagal") {
      setIsSpeaking(false);
      toast.error("Perangkat ini tidak bisa memutar suara. Periksa volume & izin audio browser.");
    }
  };


  if (!user) return <LoadingScreen />;

  return (
    <div className="flex min-h-screen bg-white text-slate-900 antialiased overflow-hidden">
      <Sidebar role={user.user_metadata.role} userName={user.user_metadata.full_name} />

      {/* pt-14 di bawah lg: halaman ini tidak punya header, jadi ruang untuk
          tombol menu yang melayang harus disediakan di sini.

          Tingginya DIPATOK setinggi layar, juga di ponsel. Sebelumnya di bawah
          lg nilainya `min-h-screen`, sehingga panel transkrip ikut memanjang
          mengikuti isinya alih-alih menggulir — lalu kelebihannya dipotong oleh
          `overflow-hidden` di pembungkus terluar dan tidak bisa dijangkau sama
          sekali. dvh, bukan vh, supaya bilah alamat browser ponsel yang muncul
          dan hilang tidak memotong tepi bawah. */}
      <main className="flex-1 flex flex-col h-[100dvh] overflow-hidden pt-14 lg:pt-0 pb-20 lg:pb-0">

        
        {/* Banner diagnostik: mikrofon & Web Speech API dipakai halaman ini,
            jadi kegagalannya hampir selalu ada di sisi perangkat pengguna. */}
        {/* shrink-0 + batas tinggi: banner yang panjang tidak boleh menggencet
            kedua panel di bawahnya sampai tak tersisa ruang untuk digulir. */}
        <div className="px-4 lg:px-10 pt-4 lg:pt-6 shrink-0 max-h-[40%] overflow-y-auto empty:hidden">
          <DeviceIssueBanner needs={{ microphone: true, speechRecognition: true }} fitur="Speech to Text" />
        </div>

        {/* min-h-0 wajib: tanpa itu baris grid menolak menyusut lebih kecil dari
            isinya, sehingga panel transkrip membengkak keluar layar dan yang
            bisa digulir tidak pernah terbentuk. */}
        <div className="flex-1 grid grid-rows-2 min-h-0">

          {/* Panel Atas: HANYA TAMPILAN SPEECH-TO-TEXT */}
          <div className="bg-slate-50 flex flex-col relative border-b border-slate-200 min-h-0">
            {/* Wadah gulir terpisah dari panel supaya transkrip panjang bisa
                dibaca sampai habis. `m-auto` pada teksnya, BUKAN justify-center
                pada wadahnya: justify-center memotong bagian ATAS isi yang
                meluap dan bagian itu tidak akan pernah bisa dijangkau gulir. */}
            <div
              ref={transcriptRef}
              className="flex-1 min-h-0 overflow-y-auto w-full flex px-6 py-6 pb-28 lg:px-10 lg:py-10"
            >
              <p className="m-auto text-xl sm:text-2xl lg:text-4xl font-bold text-slate-800 text-center max-w-4xl leading-snug whitespace-pre-wrap break-words">
                {displayText}
              </p>
            </div>
            <button
              onClick={handleListen}
              className={`absolute bottom-6 right-6 lg:bottom-10 lg:right-10 w-16 h-16 lg:w-20 lg:h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
                isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-slate-600 hover:bg-indigo-600 hover:text-white'
              }`}
            ><Mic size={32} /></button>
          </div>

          {/* Panel Bawah: HANYA INPUT MANUAL TEXT-TO-SPEECH */}
          <div className="bg-white flex flex-col justify-between gap-6 p-6 lg:p-10 min-h-0 overflow-y-auto">
            <div className="w-full max-w-3xl mx-auto">
              <textarea
                value={textToSpeak}
                onChange={(e) => setTextToSpeak(e.target.value)}
                placeholder="Ketik kalimat di sini untuk diubah menjadi suara..."
                className="w-full h-28 lg:h-32 p-4 lg:p-6 text-lg lg:text-2xl font-bold text-center bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-200 transition-all resize-none"
              />
              <p className="mt-2 text-center text-xs font-semibold text-slate-400">
                {sumberSuara === "server"
                  ? "Suara: neural Bahasa Indonesia 🇮🇩 — sama di semua browser"
                  : sumberSuara === "browser"
                  ? `Suara cadangan bawaan browser${
                      activeIndonesianVoiceName() ? ` (${activeIndonesianVoiceName()})` : ""
                    } — kualitasnya bergantung perangkat Anda`
                  : "Suara neural Bahasa Indonesia — sama di semua browser"}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 sm:gap-4">
              <div className="flex-1 min-w-0 max-w-3xl flex items-center gap-1 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                {/* Panah selalu dirender, cuma diredupkan di ujung — kalau
                    disembunyikan, lebar rel berubah tiap kali digulir dan
                    tombol-tombolnya ikut melompat. */}
                <button
                  type="button"
                  onClick={() => geserFrasa(-1)}
                  disabled={navFrasa.diAwal}
                  aria-label="Frasa sebelumnya"
                  className="shrink-0 p-1.5 rounded-full text-slate-500 hover:text-indigo-600 hover:bg-white transition-all disabled:opacity-25 disabled:pointer-events-none"
                >
                  <ChevronLeft size={18} />
                </button>

                <div
                  ref={relFrasa}
                  onScroll={perbaruiNavFrasa}
                  className="flex-1 min-w-0 flex gap-2 overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {QUICK_PHRASES.map((phrase) => (
                    <button
                      key={phrase}
                      onClick={() => setTextToSpeak(phrase)}
                      className="shrink-0 snap-start whitespace-nowrap px-5 py-2 text-sm font-semibold bg-white rounded-full border border-slate-200 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => geserFrasa(1)}
                  disabled={navFrasa.diAkhir}
                  aria-label="Frasa berikutnya"
                  className="shrink-0 p-1.5 rounded-full text-slate-500 hover:text-indigo-600 hover:bg-white transition-all disabled:opacity-25 disabled:pointer-events-none"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <button 
                onClick={handleSpeak}
                className={`shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center shadow-2xl shadow-indigo-200 hover:scale-110 transition-transform ${
                  isSpeaking ? "animate-pulse" : ""
                }`}
              ><Volume2 size={32} /></button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}