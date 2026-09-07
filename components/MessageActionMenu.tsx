"use client";
// Menu aksi untuk satu gelembung pesan (Salin / Edit / Hapus).
//
// KENAPA INI DIPORTAL KE <body> DAN BUKAN SEKADAR `absolute` DI DALAM GELEMBUNG
// ----------------------------------------------------------------------------
// Versi sebelumnya memasang menu sebagai `absolute top-full` di dalam gelembung.
// Gelembung itu hidup di dalam daftar pesan yang ber-`overflow-y-auto`, dan
// aturan CSS-nya tegas: apa pun yang keluar dari kotak sebuah wadah yang
// meng-clip overflow akan DIPOTONG — tidak peduli seberapa besar z-index-nya.
//
// Akibatnya persis seperti yang dilaporkan: pesan yang diklik hampir selalu
// pesan terbaru, yaitu yang berada di dasar daftar; menu membuka ke bawah,
// langsung menabrak tepi wadah, dan yang tersisa terlihat cuma butir pertama —
// "SALIN". Edit dan Hapus tetap ter-render, hanya saja terpotong di luar area
// yang boleh digambar. Jadi ini bukan soal pengecekan kepemilikan pesan yang
// gagal; kondisinya sudah benar sejak awal, gambarnya yang tidak sampai.
//
// Dengan diportal ke <body> dan diposisikan `fixed`, menu tidak lagi terikat
// pada wadah mana pun. Posisinya lalu dihitung terhadap layar: membuka ke bawah
// kalau ada ruang, membalik ke atas kalau tidak, dan digeser masuk kalau
// tepinya melewati sisi layar.

import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Copy, Pencil, Trash2 } from "lucide-react";

const LEBAR_MENU = 224; // setara w-56
const JARAK = 8;        // jarak ke anchor & ke tepi layar

export interface AnchorMenu {
  /** Posisi elemen yang memicu menu, dalam koordinat layar (getBoundingClientRect). */
  rect: { top: number; bottom: number; left: number; right: number };
  /** Menu merapat ke kanan anchor untuk pesan sendiri (yang rata kanan). */
  rataKanan: boolean;
}

interface Props {
  anchor: AnchorMenu | null;
  /** Edit & Hapus hanya muncul untuk pesan sendiri. */
  punyaSaya: boolean;
  onSalin: () => void;
  onEdit: () => void;
  onHapus: () => void;
  onTutup: () => void;
}

export default function MessageActionMenu({
  anchor,
  punyaSaya,
  onSalin,
  onEdit,
  onHapus,
  onTutup,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  // POSISI DITULIS LANGSUNG KE ELEMENNYA, bukan lewat state.
  //
  // Alurnya memang harus: render dulu (supaya tingginya bisa diukur) → ukur →
  // tempatkan. Menyimpan hasil ukuran itu di state berarti satu putaran render
  // tambahan setiap kali menu dibuka, dan React memang menyarankan efek dipakai
  // untuk menyelaraskan DOM secara langsung seperti ini. useLayoutEffect, bukan
  // useEffect, supaya penempatannya terjadi SEBELUM cat pertama — kalau tidak,
  // menu terlihat berkedip dari pojok kiri atas ke tempat semestinya.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!anchor || !el) return;

    const tinggi = el.offsetHeight;
    const { innerWidth: lebarLayar, innerHeight: tinggiLayar } = window;

    // Vertikal: bawah dulu; kalau tidak muat, balik ke atas; kalau dua-duanya
    // tidak muat (layar sangat pendek), tempel ke tepi bawah.
    let top = anchor.rect.bottom + JARAK;
    if (top + tinggi > tinggiLayar - JARAK) {
      const diAtas = anchor.rect.top - tinggi - JARAK;
      top = diAtas >= JARAK ? diAtas : Math.max(JARAK, tinggiLayar - tinggi - JARAK);
    }

    // Horizontal: merapat ke sisi gelembung, lalu digeser masuk kalau melewati
    // tepi layar.
    let left = anchor.rataKanan ? anchor.rect.right - LEBAR_MENU : anchor.rect.left;
    left = Math.min(Math.max(JARAK, left), lebarLayar - LEBAR_MENU - JARAK);

    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.visibility = "visible";
  }, [anchor, punyaSaya]);

  // Tutup pada klik di luar, Escape, gulir, dan ubah ukuran jendela.
  //
  // Gulir didengarkan pada fase CAPTURE supaya gulir di dalam daftar pesan ikut
  // tertangkap — event scroll dari elemen dalam tidak menggelembung ke window.
  // Menu `fixed` tidak ikut bergerak saat daftarnya digulir, jadi kalau tidak
  // ditutup ia akan menggantung di tempat yang sudah tidak ada pesannya.
  useEffect(() => {
    if (!anchor) return;
    const tutup = () => onTutup();
    const padaTombol = (e: KeyboardEvent) => { if (e.key === "Escape") onTutup(); };
    const padaKlik = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onTutup();
    };

    // Ditunda satu putaran: klik yang MEMBUKA menu masih dalam perjalanan, dan
    // tanpa penundaan ini ia langsung menutup menunya sendiri.
    const id = setTimeout(() => document.addEventListener("mousedown", padaKlik), 0);
    document.addEventListener("keydown", padaTombol);
    window.addEventListener("scroll", tutup, true);
    window.addEventListener("resize", tutup);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", padaKlik);
      document.removeEventListener("keydown", padaTombol);
      window.removeEventListener("scroll", tutup, true);
      window.removeEventListener("resize", tutup);
    };
  }, [anchor, onTutup]);

  // `anchor` HANYA pernah diisi dari getBoundingClientRect() di dalam penangan
  // event — yang mustahil berjalan di server. Jadi kalau ia ada, `document`
  // sudah pasti ada juga, dan portalnya aman dibuat tanpa penanda "sudah
  // terpasang" tersendiri.
  if (!anchor) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Aksi pesan"
      // key memaksa elemen baru tiap kali menu berpindah pesan, sehingga ia
      // selalu kembali ke keadaan "belum ditempatkan" dan tidak sempat terlihat
      // di posisi pesan sebelumnya.
      key={`${anchor.rect.top}-${anchor.rect.left}`}
      style={{
        position: "fixed",
        width: LEBAR_MENU,
        top: 0,
        left: 0,
        // Disembunyikan sampai useLayoutEffect selesai mengukur & menempatkan.
        // Tetap dirender (bukan display:none) supaya tingginya bisa diukur.
        visibility: "hidden",
      }}
      className="z-[200] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
    >
      <button
        role="menuitem"
        onClick={onSalin}
        className="w-full flex items-center gap-2 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
      >
        <Copy size={13} /> Salin
      </button>
      {/* Edit & Hapus hanya untuk pesan sendiri. Ini semata kerapian tampilan —
          pagar sesungguhnya ada di app/api/db/route.ts, yang menolak permintaan
          atas pesan milik orang lain apa pun yang dikirim browser. */}
      {punyaSaya && (
        <>
          <button
            role="menuitem"
            onClick={onEdit}
            className="w-full flex items-center gap-2 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 border-t border-slate-100"
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            role="menuitem"
            onClick={onHapus}
            className="w-full flex items-center gap-2 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-red-600 hover:bg-red-50 border-t border-slate-100"
          >
            <Trash2 size={13} /> Hapus
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
