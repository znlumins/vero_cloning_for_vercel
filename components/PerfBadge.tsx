"use client";
// Badge diagnostik di pojok kanvas halaman AI (translate / meeting / presentasi).
//
// Badge ini tidak sekadar memuntahkan angka — ia MENYIMPULKAN. Saat pengguna
// melapor "ngelag", yang dibutuhkan bukan empat bilangan lalu disuruh
// menghitung sendiri, melainkan satu kalimat: apa yang lambat, dan apa obatnya.
// Kesimpulan itu ada di tooltip; angkanya tetap tampil untuk dilaporkan balik
// ke kami. Lihat usePerfStats untuk alasan tiap angka dikumpulkan.

import { Activity, AlertTriangle } from "lucide-react";
import {
  CAMERA_WARN_FPS,
  COST_WARN_MS,
  FPS_WARN_THRESHOLD,
  type PerfStats,
} from "@/app/hooks/usePerfStats";

interface PerfBadgeProps {
  perf: PerfStats;
  /** Sembunyikan badge saat deteksi tidak aktif. */
  visible?: boolean;
}

/**
 * Terjemahkan angka mentah jadi vonis yang bisa ditindaklanjuti.
 *
 * Inti pemisahannya: fps rendah punya DUA penyebab yang dari luar terlihat
 * identik. Yang membedakan adalah biaya per frame — 1000/biaya memberi plafon
 * MediaPipe di perangkat ini. Kalau plafonnya tinggi tapi fps rendah, berarti
 * kameranya yang pelit, bukan pemrosesannya.
 */
function diagnosa(perf: PerfStats): { warn: boolean; pesan: string } {
  const { fps, cameraFps, cameraTargetFps, costMs, backend } = perf;
  const plafon = costMs > 0 ? Math.round(1000 / costMs) : 0;

  const sebab: string[] = [];

  if (cameraFps > 0 && cameraFps < CAMERA_WARN_FPS) {
    const janji = cameraTargetFps > 0 ? ` (kamera menjanjikan ${cameraTargetFps} fps)` : "";
    sebab.push(
      `Kamera cuma mengirim ${cameraFps} fps${janji}. Penyebab tersering: ruangan kurang terang — webcam memperlambat diri demi gambar lebih terang. Coba tambah cahaya sebelum menyalahkan kode.`
    );
  }

  if (costMs > 0 && costMs >= COST_WARN_MS) {
    sebab.push(
      `MediaPipe butuh ${costMs} ms per frame, jadi plafonnya cuma ${plafon} fps. Ini beban pemrosesan — Mode Ringan (resolusi & complexity turun) mestinya menolong.`
    );
  }

  if (backend === "cpu") {
    sebab.push(
      "TFJS berjalan di backend CPU, berkali lipat lebih lambat dari WebGL/WASM."
    );
  }

  if (sebab.length > 0) return { warn: true, pesan: sebab.join(" ") };

  if (fps > 0 && fps < FPS_WARN_THRESHOLD) {
    return {
      warn: true,
      pesan: `FPS rendah (${fps}) padahal kamera dan MediaPipe sama-sama terlihat sehat. Penyebabnya di tempat lain — laporkan angka di badge ini.`,
    };
  }

  return {
    warn: false,
    pesan: plafon
      ? `Performa normal. Plafon MediaPipe di perangkat ini ${plafon} fps; laju sengaja dibatasi 30 fps agar selaras dengan data latih.`
      : "Performa normal.",
  };
}

export default function PerfBadge({ perf, visible = true }: PerfBadgeProps) {
  if (!visible) return null;

  const { fps, cameraFps, costMs, backend } = perf;
  const { warn, pesan } = diagnosa(perf);

  return (
    <div
      className={`absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md border text-[10px] font-black tracking-wide tabular-nums ${
        warn
          ? "bg-amber-500/90 border-amber-300 text-white"
          : "bg-slate-900/70 border-white/10 text-white"
      }`}
      title={pesan}
    >
      {warn ? <AlertTriangle size={12} /> : <Activity size={12} />}
      <span>{fps > 0 ? `${fps} FPS` : "— FPS"}</span>
      <span className="opacity-40">·</span>
      {/* Laju kamera: pembanding wajib untuk fps di sebelah kiri. */}
      <span title="FPS yang dikirim kamera">
        CAM {cameraFps > 0 ? cameraFps : "—"}
      </span>
      <span className="opacity-40">·</span>
      {/* Biaya per frame: dari sini plafon MediaPipe dihitung (1000/biaya). */}
      <span title="Biaya satu frame MediaPipe">
        {costMs > 0 ? `${costMs}ms` : "—ms"}
      </span>
      <span className="opacity-40">·</span>
      <span className="uppercase">{backend}</span>
    </div>
  );
}
