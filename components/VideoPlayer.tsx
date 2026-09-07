"use client";
import { useEffect, useRef } from "react";
import { Loader2, User } from "lucide-react";

// Definisikan tipe data yang diterima komponen ini
interface VideoPlayerProps {
  stream: MediaStream | null;
  isMuted?: boolean;
}

export default function VideoPlayer({ stream, isMuted = false }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement && stream) {
      videoElement.srcObject = stream;
      videoElement.play().catch(error => {
        if (error.name !== 'AbortError') console.error("Video Play Error:", error);
      });
    }
    return () => {
      if (videoElement) videoElement.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="relative w-full h-full bg-slate-50 flex items-center justify-center overflow-hidden">
      {!stream ? (
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center border border-slate-200 shadow-sm">
            <User size={32} className="text-slate-300" />
          </div>
          <div className="flex items-center gap-2 text-indigo-600">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Menghubungkan...</span>
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isMuted}
          className="w-full h-full object-cover transform scale-x-[-1]"
        />
      )}
    </div>
  );
}