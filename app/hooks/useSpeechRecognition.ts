// app/hooks/useSpeechRecognition.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
// Web Speech API (SpeechRecognition / SpeechRecognitionEvent) belum ada di lib
// TypeScript standar, jadi objek & event-nya diperlakukan `any` di batas ini —
// sama seperti deklarasi Window.webkitSpeechRecognition di seluruh proyek.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Web Speech API (SpeechRecognition) yang tahan-banting.
 *
 * Menutup akar masalah "Error: network" yang tidak tertangani:
 *  - SEMUA error ditangkap di onerror; tidak ada yang di-throw ulang.
 *  - `network` (server Google tak terjangkau / diblokir adblocker) => retry
 *    otomatis dengan exponential backoff selama pengguna masih ingin mendengar.
 *  - `not-allowed` / `service-not-allowed` => fatal, hentikan & beri tahu; TIDAK
 *    di-retry supaya tidak jadi loop prompt izin.
 *  - `no-speech` / `aborted` => jinak, tidak dianggap kegagalan.
 *  - continuous mode: onend otomatis me-restart selama intent masih aktif.
 *  - start() dibungkus try/catch => InvalidStateError (start ganda) tak crash.
 *  - cleanup memakai abort() + melepas handler => aman saat hot-reload Turbopack.
 */

export type SpeechErrorKind =
  | "network"
  | "no-speech"
  | "not-allowed"
  | "audio-capture"
  | "aborted"
  | "unsupported"
  | "other";

interface Options {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxRetries?: number;
  onError?: (kind: SpeechErrorKind, raw: string) => void;
}

interface Result {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;      // hasil final terkumpul
  interim: string;         // hasil sementara (realtime)
  error: SpeechErrorKind | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function useSpeechRecognition(opts: Options = {}): Result {
  const {
    lang = "id-ID",
    continuous = true,
    interimResults = true,
    maxRetries = 5,
    onError,
  } = opts;

  // Lazy-init: dievaluasi sekali saat mount (client), tanpa setState-in-effect.
  const [isSupported] = useState(() => !!getSpeechRecognition());
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<SpeechErrorKind | null>(null);

  const recognitionRef = useRef<any>(null);
  const wantListeningRef = useRef(false);   // intent pengguna (bukan status aktual)
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRetryRef = useRef(false);
  const finalRef = useRef("");
  const onErrorRef = useRef<Options["onError"]>(onError);
  // Error `network` dilaporkan SEKALI saja per sesi mendengar.
  //
  // Tanpa penjaga ini, satu gangguan menghasilkan rentetan pemberitahuan: error
  // pertama memanggil onError, lalu tiap percobaan sambung ulang yang gagal
  // memanggilnya lagi (5x, dengan backoff 0,5s–8s), ditutup satu panggilan lagi
  // saat percobaan habis. Bagi pengguna itu terlihat seperti alert yang
  // beruntun terus — padahal semuanya satu kejadian yang sama.
  const networkNotifiedRef = useRef(false);

  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    pendingRetryRef.current = false;
  }, []);

  const beginRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.start();
    } catch {
      // InvalidStateError: sudah berjalan. Aman diabaikan — onend/onstart
      // akan menyelaraskan state.
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    if (!wantListeningRef.current) return;
    if (retryCountRef.current >= maxRetries) {
      wantListeningRef.current = false;
      // Yang ini SELALU dilaporkan meski pemberitahuan pertama sudah keluar:
      // artinya berbeda — bukan lagi "sedang mencoba", tapi "menyerah, mikrofon
      // berhenti". Tanpa ini mikrofon mati tanpa penjelasan apa pun.
      onErrorRef.current?.("network", "retry-exhausted");
      return;
    }
    clearRetry();
    pendingRetryRef.current = true;
    const attempt = retryCountRef.current++;
    const delay = Math.min(500 * 2 ** attempt, 8000); // 0.5s,1s,2s,4s,8s
    retryTimerRef.current = setTimeout(() => {
      pendingRetryRef.current = false;
      if (wantListeningRef.current) beginRecognition();
    }, delay);
  }, [maxRetries, clearRetry, beginRecognition]);

  // Inisialisasi objek SpeechRecognition sekali; pasang handler.
  useEffect(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;

    const rec = new SR();
    rec.continuous = continuous;
    rec.interimResults = interimResults;
    rec.lang = lang;

    rec.onstart = () => {
      setIsListening(true);
      setError(null);
      retryCountRef.current = 0; // sambungan pulih => reset backoff
      networkNotifiedRef.current = false; // gangguan berikutnya boleh dilaporkan
    };

    rec.onresult = (event: any) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalRef.current += chunk + " ";
        else interimText += chunk;
      }
      setTranscript(finalRef.current);
      setInterim(interimText);
    };

    rec.onerror = (event: any) => {
      const raw: string = event?.error || "other";
      let kind: SpeechErrorKind = "other";

      switch (raw) {
        case "network":
          kind = "network";
          // Sementara: coba sambung ulang dengan backoff. Pemberitahuannya cuma
          // untuk kegagalan PERTAMA — percobaan berikutnya berlangsung diam.
          setError("network");
          if (!networkNotifiedRef.current) {
            networkNotifiedRef.current = true;
            onErrorRef.current?.("network", raw);
          }
          scheduleRetry();
          return; // jangan biarkan onend memicu restart ganda
        case "not-allowed":
        case "service-not-allowed":
          kind = "not-allowed";
          wantListeningRef.current = false; // fatal: jangan loop prompt izin
          clearRetry();
          break;
        case "audio-capture":
          kind = "audio-capture";
          wantListeningRef.current = false;
          clearRetry();
          break;
        case "no-speech":
          kind = "no-speech"; // jinak: onend akan me-restart bila intent aktif
          break;
        case "aborted":
          kind = "aborted";   // dari stop()/cleanup kita sendiri
          break;
      }

      if (kind !== "no-speech" && kind !== "aborted") setError(kind);
      onErrorRef.current?.(kind, raw);
    };

    rec.onend = () => {
      setIsListening(false);
      setInterim("");
      // Restart otomatis untuk continuous mode / no-speech — TAPI jangan bila
      // retry network sudah dijadwalkan (menghindari restart ganda).
      if (wantListeningRef.current && !pendingRetryRef.current) {
        beginRecognition();
      }
    };

    recognitionRef.current = rec;

    return () => {
      wantListeningRef.current = false;
      clearRetry();
      rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
      try { rec.abort(); } catch {}
      recognitionRef.current = null;
    };
  }, [lang, continuous, interimResults, scheduleRetry, clearRetry, beginRecognition]);

  const start = useCallback(() => {
    if (!recognitionRef.current) {
      onErrorRef.current?.("unsupported", "unsupported");
      return;
    }
    setError(null);
    retryCountRef.current = 0;
    networkNotifiedRef.current = false;
    clearRetry();
    wantListeningRef.current = true;
    beginRecognition();
  }, [clearRetry, beginRecognition]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    clearRetry();
    try { recognitionRef.current?.stop(); } catch {}
  }, [clearRetry]);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  return { isSupported, isListening, transcript, interim, error, start, stop, reset };
}
