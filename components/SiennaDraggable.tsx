"use client";
// Membuat tombol widget aksesibilitas Vero bisa digeser ke mana saja.
//
// Widget dimuat dari CDN dan menyuntikkan tombolnya sendiri (.vero-menu-btn),
// jadi kita tidak bisa menyusun ulang markup-nya — komponen ini menempel ke
// elemen itu setelah muncul di DOM.
//
// Kenapa perlu digeser: tombolnya dipaku di pojok kanan bawah, tempat yang sama
// dengan tombol kirim chat, kontrol meeting, dan panel presentasi. Di layar
// kecil ia menutupi kontrol di bawahnya dan tidak ada cara menyingkirkannya.
//
// Tiga hal yang membuat ini tidak sesederhana "pasang mousemove":
//  1. Posisi widget dikunci lewat CSS ber-!important (lihat globals.css), jadi
//     penimpaannya harus inline + priority "important" agar menang.
//  2. Tombolnya punya handler klik sendiri untuk membuka menu. Tanpa penjagaan,
//     setiap selesai menggeser menu ikut terbuka. Karena itu geseran yang
//     melewati ambang jarak akan menelan satu event klik berikutnya.
//  3. Ini widget AKSESIBILITAS — menjadikannya khusus-tetikus justru bertolak
//     belakang dengan tujuannya. Jadi saat tombol difokus, Shift + tombol panah
//     ikut menggesernya.

import { useEffect } from "react";

const KUNCI_SIMPANAN = "vero.accessibility.posisi";
const AMBANG_GESER_PX = 5; // di bawah ini dianggap klik, bukan geseran
const MARGIN_TEPI_PX = 8;
const LANGKAH_PAPAN_KETIK_PX = 20;

interface Posisi {
  x: number;
  y: number;
}

export default function SiennaDraggable() {
  useEffect(() => {
    let tombol: HTMLElement | null = null;
    let observer: MutationObserver | null = null;
    let sedangGeser = false;
    let baruSajaDigeser = false;
    let awalPointer: Posisi = { x: 0, y: 0 };
    let awalTombol: Posisi = { x: 0, y: 0 };

    /** Jaga tombol tetap di dalam layar, berapa pun ukuran jendelanya. */
    const jepitKeLayar = (pos: Posisi, el: HTMLElement): Posisi => {
      const kotak = el.getBoundingClientRect();
      const maksX = window.innerWidth - kotak.width - MARGIN_TEPI_PX;
      const maksY = window.innerHeight - kotak.height - MARGIN_TEPI_PX;
      return {
        x: Math.min(Math.max(pos.x, MARGIN_TEPI_PX), Math.max(maksX, MARGIN_TEPI_PX)),
        y: Math.min(Math.max(pos.y, MARGIN_TEPI_PX), Math.max(maksY, MARGIN_TEPI_PX)),
      };
    };

    // Inline + "important": aturan .vero-menu-btn di globals.css memakai
    // !important, dan hanya inline-!important yang bisa mengalahkannya.
    const terapkanPosisi = (pos: Posisi, el: HTMLElement) => {
      const aman = jepitKeLayar(pos, el);
      // Koordinat di bawah relatif terhadap viewport (hasil getBoundingClientRect),
      // jadi elemennya wajib fixed agar angkanya berarti. Sienna memang memakai
      // fixed, tapi ini ditegaskan supaya tidak bergantung pada detail CDN.
      el.style.setProperty("position", "fixed", "important");
      el.style.setProperty("left", `${aman.x}px`, "important");
      el.style.setProperty("top", `${aman.y}px`, "important");
      el.style.setProperty("right", "auto", "important");
      el.style.setProperty("bottom", "auto", "important");
      el.style.setProperty("transition", "none", "important");
    };

    const simpanPosisi = (pos: Posisi) => {
      try {
        localStorage.setItem(KUNCI_SIMPANAN, JSON.stringify(pos));
      } catch {
        // Mode penyamaran / penyimpanan penuh — posisi cukup berlaku sesi ini.
      }
    };

    const bacaPosisi = (): Posisi | null => {
      try {
        const mentah = localStorage.getItem(KUNCI_SIMPANAN);
        if (!mentah) return null;
        const p = JSON.parse(mentah);
        return typeof p?.x === "number" && typeof p?.y === "number" ? p : null;
      } catch {
        return null;
      }
    };

    const posisiSekarang = (el: HTMLElement): Posisi => {
      const kotak = el.getBoundingClientRect();
      return { x: kotak.left, y: kotak.top };
    };

    const saatPointerBergerak = (e: PointerEvent) => {
      if (!sedangGeser || !tombol) return;
      const dx = e.clientX - awalPointer.x;
      const dy = e.clientY - awalPointer.y;
      if (!baruSajaDigeser && Math.hypot(dx, dy) > AMBANG_GESER_PX) {
        baruSajaDigeser = true;
      }
      if (baruSajaDigeser) {
        e.preventDefault();
        terapkanPosisi({ x: awalTombol.x + dx, y: awalTombol.y + dy }, tombol);
      }
    };

    const saatPointerLepas = (e: PointerEvent) => {
      if (!sedangGeser || !tombol) return;
      sedangGeser = false;
      tombol.style.removeProperty("cursor");
      try {
        tombol.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer sudah terlepas duluan — abaikan.
      }

      if (baruSajaDigeser) {
        simpanPosisi(posisiSekarang(tombol));
        // Telan SATU klik berikutnya, kalau tidak menu Sienna terbuka tiap kali
        // selesai menggeser. Fase capture supaya mendahului handler Sienna.
        const telanKlik = (ev: Event) => {
          ev.preventDefault();
          ev.stopPropagation();
        };
        document.addEventListener("click", telanKlik, { capture: true, once: true });
        // Jaring pengaman: kalau klik tidak pernah datang, lepaskan lagi.
        setTimeout(() => document.removeEventListener("click", telanKlik, true), 400);
      }
      baruSajaDigeser = false;
    };

    const saatPointerTekan = (e: PointerEvent) => {
      if (!tombol || e.button !== 0) return;
      sedangGeser = true;
      baruSajaDigeser = false;
      awalPointer = { x: e.clientX, y: e.clientY };
      awalTombol = posisiSekarang(tombol);
      tombol.style.setProperty("cursor", "grabbing");
      try {
        tombol.setPointerCapture(e.pointerId);
      } catch {
        // Browser lawas tanpa pointer capture — geseran tetap jalan lewat
        // pendengar di document.
      }
    };

    // Widget aksesibilitas tidak boleh jadi khusus-tetikus.
    const saatTombolDitekan = (e: KeyboardEvent) => {
      if (!tombol || !e.shiftKey) return;
      const arah: Record<string, Posisi> = {
        ArrowUp: { x: 0, y: -LANGKAH_PAPAN_KETIK_PX },
        ArrowDown: { x: 0, y: LANGKAH_PAPAN_KETIK_PX },
        ArrowLeft: { x: -LANGKAH_PAPAN_KETIK_PX, y: 0 },
        ArrowRight: { x: LANGKAH_PAPAN_KETIK_PX, y: 0 },
      };
      const delta = arah[e.key];
      if (!delta) return;
      e.preventDefault();
      const kini = posisiSekarang(tombol);
      const baru = { x: kini.x + delta.x, y: kini.y + delta.y };
      terapkanPosisi(baru, tombol);
      simpanPosisi(posisiSekarang(tombol));
    };

    const saatUkuranBerubah = () => {
      if (!tombol) return;
      terapkanPosisi(posisiSekarang(tombol), tombol);
    };

    const pasang = (el: HTMLElement) => {
      tombol = el;
      el.style.setProperty("cursor", "grab");
      el.style.setProperty("touch-action", "none"); // cegah layar ikut menggulir
      el.setAttribute("title", "Seret untuk memindahkan · Shift + panah juga bisa");

      const tersimpan = bacaPosisi();
      if (tersimpan) terapkanPosisi(tersimpan, el);

      el.addEventListener("pointerdown", saatPointerTekan);
      el.addEventListener("keydown", saatTombolDitekan);
      document.addEventListener("pointermove", saatPointerBergerak);
      document.addEventListener("pointerup", saatPointerLepas);
      window.addEventListener("resize", saatUkuranBerubah);
    };

    // Widget dimuat lewat strategy "lazyOnload", jadi tombolnya belum tentu ada
    // saat komponen ini dipasang — tunggu sampai muncul.
    const cari = () => document.querySelector<HTMLElement>(".vero-menu-btn");
    const adaLangsung = cari();
    if (adaLangsung) {
      pasang(adaLangsung);
    } else {
      observer = new MutationObserver(() => {
        const el = cari();
        if (el) {
          observer?.disconnect();
          observer = null;
          pasang(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      tombol?.removeEventListener("pointerdown", saatPointerTekan);
      tombol?.removeEventListener("keydown", saatTombolDitekan);
      document.removeEventListener("pointermove", saatPointerBergerak);
      document.removeEventListener("pointerup", saatPointerLepas);
      window.removeEventListener("resize", saatUkuranBerubah);
    };
  }, []);

  return null;
}
