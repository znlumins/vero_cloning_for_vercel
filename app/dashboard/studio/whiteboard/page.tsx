"use client";
import { useRef, useState, useEffect } from "react";
import { ReactSketchCanvas, ReactSketchCanvasRef } from "react-sketch-canvas";
import {
  Pencil,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Download,
  ChevronRight
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import LoadingScreen from "@/components/LoadingScreen";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";

export default function WhiteboardPage() {
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  const [isEraseMode, setIsEraseMode] = useState(false);
  const [strokeColor, setStrokeColor] = useState("#4f46e5");
  const [strokeWidth, setStrokeWidth] = useState(5);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await db.auth.getUser();
      if (!user) router.push("/login"); else setUser(user);
    };
    getUser();
  }, [router]);

  // --- PERBAIKAN UTAMA DI SINI ---
  // Gunakan useEffect untuk memberi perintah ke canvas saat mode berubah
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.eraseMode(isEraseMode);
    }
  }, [isEraseMode]); // Efek ini akan berjalan setiap kali isEraseMode berubah

  if (!user) return <LoadingScreen />;

  return (
    <div className="flex min-h-screen bg-slate-50 overflow-hidden antialiased text-slate-900">
      <Sidebar role={user.user_metadata.role} userName={user.user_metadata.full_name} />

      {/* pb-24 di layar kecil: bottom-nav Sidebar melayang di atas konten dan
          tanpa ruang ini ia menutupi tepi bawah kanvas. */}
      {/* pt-16 di bawah lg memberi ruang untuk tombol menu yang melayang di
          pojok kiri atas; pb-24 mencegah bottom-nav menutupi tepi kanvas. */}
      <main className="flex-1 flex flex-col h-screen p-4 pt-16 lg:p-8 pb-24 lg:pb-8 gap-4 lg:gap-6 overflow-hidden">

        {/* Di ponsel toolbar jadi baris horizontal di atas kanvas: kolom selebar
            80px memakan seperempat layar dan menyisakan kanvas yang tak berguna. */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
          <div className="w-full lg:w-20 shrink-0 bg-white border border-slate-200 rounded-3xl shadow-xl p-3 lg:p-4 flex flex-row lg:flex-col items-center gap-4 lg:gap-6 overflow-x-auto no-scrollbar">
            <div className="flex flex-row lg:flex-col gap-2 shrink-0">
              <button
                onClick={() => setIsEraseMode(false)}
                className={`p-3 rounded-2xl transition-all border-2 ${!isEraseMode ? "bg-indigo-600 text-white border-indigo-600 shadow-lg" : "bg-slate-50 text-slate-400 border-transparent"}`}
              ><Pencil size={22} strokeWidth={2.5} /></button>
              <button
                onClick={() => setIsEraseMode(true)}
                className={`p-3 rounded-2xl transition-all border-2 ${isEraseMode ? "bg-slate-900 text-white border-slate-900 shadow-lg" : "bg-slate-50 text-slate-400 border-transparent"}`}
              ><Eraser size={22} strokeWidth={2.5} /></button>
            </div>
            <div className="w-px h-10 lg:w-full lg:h-px bg-slate-100 shrink-0" />
            <div className="flex flex-row lg:flex-col gap-3 shrink-0">
              {["#4f46e5", "#ef4444", "#22c55e", "#f59e0b", "#0f172a"].map((color) => (
                <button key={color} onClick={() => { setStrokeColor(color); setIsEraseMode(false); }}
                  className={`w-8 h-8 shrink-0 rounded-full border-4 transition-transform hover:scale-110 ${strokeColor === color && !isEraseMode ? "border-slate-300 scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: color }} />
              ))}
            </div>
            <div className="w-px h-10 lg:w-full lg:h-px bg-slate-100 shrink-0" />
            <div className="flex flex-row lg:flex-col gap-3 shrink-0 lg:w-full">
              <button onClick={() => canvasRef.current?.undo()} className="p-3 hover:bg-slate-100 text-slate-600 rounded-2xl transition-all shrink-0 lg:w-full flex justify-center" title="Undo"><Undo2 size={22} /></button>
              <button onClick={() => canvasRef.current?.redo()} className="p-3 hover:bg-slate-100 text-slate-600 rounded-2xl transition-all shrink-0 lg:w-full flex justify-center" title="Redo"><Redo2 size={22} /></button>
              <div className="w-px h-10 lg:w-full lg:h-px bg-slate-100 lg:my-1 shrink-0" />
              <button onClick={() => canvasRef.current?.clearCanvas()} className="p-3 hover:bg-red-50 text-red-500 rounded-2xl transition-all shrink-0 lg:w-full flex justify-center" title="Hapus Semua"><Trash2 size={22} /></button>
              <button
                onClick={async () => {
                  const image = await canvasRef.current?.exportImage("png");
                  if (image) {
                    const link = document.createElement("a");
                    link.href = image;
                    link.download = "whiteboard-export.png";
                    link.click();
                  }
                }}
                className="p-3 bg-indigo-600 text-white rounded-2xl transition-all hover:bg-indigo-700 shadow-md shrink-0 lg:w-full flex justify-center lg:mt-2"
                title="Simpan"
              >
                <Download size={22} />
              </button>
            </div>
          </div>

          <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-inner overflow-hidden relative group">

            <ReactSketchCanvas
              ref={canvasRef}
              strokeColor={strokeColor}
              strokeWidth={strokeWidth}
              eraserWidth={strokeWidth}
              canvasColor="#ffffff"
              // HILANGKAN PROPS `eraseMode` DARI SINI
              className="w-full h-full cursor-crosshair"
            />

            <div className="absolute bottom-6 left-6 pointer-events-none">
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}