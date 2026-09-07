import { describe, it, expect } from "vitest";
import { hitungGridVideo, RASIO_UTAMA, RASIO_CADANGAN } from "./videoGrid";

// Beberapa ukuran container nyata. Angkanya bukan karangan: itu kira-kira sisa
// ruang setelah sidebar, header, dan bilah kontrol dipotong pada layar-layar
// yang benar-benar dipakai orang.
const LAPTOP = { width: 1200, height: 700 };   // 15" dengan sidebar terbuka
const ULTRAWIDE = { width: 2400, height: 900 };
const SEMPIT = { width: 900, height: 620 };    // jendela dikecilkan / panel chat dibuka
const PONSEL = { width: 380, height: 700 };

describe("hitungGridVideo", () => {
  it("1 peserta: satu tile tunggal", () => {
    for (const c of [LAPTOP, ULTRAWIDE, SEMPIT]) {
      const g = hitungGridVideo({ ...c, count: 1 });
      expect(g.cols).toBe(1);
      expect(g.rows).toBe(1);
    }
  });

  it("2 peserta: dua kolom sejajar, bukan bertumpuk", () => {
    // Ini kasus yang paling mudah salah: menumpuk dua tile atas-bawah sebenarnya
    // memberi luas sedikit lebih besar di container melebar, jadi pemilih
    // "luas terbesar" polos akan memilih tumpukan.
    for (const c of [LAPTOP, ULTRAWIDE, SEMPIT]) {
      const g = hitungGridVideo({ ...c, count: 2 });
      expect(g.cols).toBe(2);
      expect(g.rows).toBe(1);
    }
  });

  it("3 dan 4 peserta: grid 2x2", () => {
    for (const jumlah of [3, 4]) {
      const g = hitungGridVideo({ ...LAPTOP, count: jumlah });
      expect(g.cols).toBe(2);
      expect(g.rows).toBe(2);
    }
  });

  it("9 peserta: grid 3x3", () => {
    const g = hitungGridVideo({ ...LAPTOP, count: 9 });
    expect(g.cols).toBe(3);
    expect(g.rows).toBe(3);
  });

  it("5 peserta: 3 kolom (baris terakhir boleh tidak penuh)", () => {
    const g = hitungGridVideo({ ...LAPTOP, count: 5 });
    expect(g.cols).toBe(3);
    expect(g.rows).toBe(2);
  });

  it("tile tidak pernah melebihi container", () => {
    const gap = 16;
    for (const c of [LAPTOP, ULTRAWIDE, SEMPIT, PONSEL]) {
      for (const count of [1, 2, 3, 4, 5, 9, 12, 25]) {
        const g = hitungGridVideo({ ...c, count, gap });
        const totalLebar = g.tileWidth * g.cols + gap * (g.cols - 1);
        const totalTinggi = g.tileHeight * g.rows + gap * (g.rows - 1);
        expect(totalLebar).toBeLessThanOrEqual(c.width);
        expect(totalTinggi).toBeLessThanOrEqual(c.height);
      }
    }
  });

  it("semua peserta selalu kebagian sel", () => {
    for (const count of [1, 2, 3, 4, 5, 7, 9, 16]) {
      const g = hitungGridVideo({ ...LAPTOP, count });
      expect(g.cols * g.rows).toBeGreaterThanOrEqual(count);
    }
  });

  it("tile mempertahankan rasio yang dilaporkan", () => {
    for (const count of [1, 2, 4, 9]) {
      const g = hitungGridVideo({ ...LAPTOP, count });
      // Toleransi 1 piksel: tileWidth/tileHeight dibulatkan ke bawah.
      expect(Math.abs(g.tileWidth / g.tileHeight - g.aspectRatio)).toBeLessThan(0.05);
    }
  });

  it("container melebar tetap memakai 16:9", () => {
    expect(hitungGridVideo({ ...LAPTOP, count: 4 }).aspectRatio).toBe(RASIO_UTAMA);
    expect(hitungGridVideo({ ...ULTRAWIDE, count: 6 }).aspectRatio).toBe(RASIO_UTAMA);
  });

  it("container tinggi & sempit jatuh ke 4:3 karena 16:9 membuang ruang", () => {
    // Di ponsel, tile 16:9 menyisakan ruang vertikal yang besar; 4:3 mengisinya.
    const g = hitungGridVideo({ ...PONSEL, count: 2 });
    expect(g.aspectRatio).toBe(RASIO_CADANGAN);
    expect(g.cols).toBe(1);
    expect(g.rows).toBe(2);
  });

  it("ukuran container nol tidak membuatnya meledak", () => {
    const g = hitungGridVideo({ width: 0, height: 0, count: 4 });
    expect(g.tileWidth).toBe(0);
    expect(g.tileHeight).toBe(0);
    expect(g.cols).toBeGreaterThanOrEqual(1);
  });

  it("nol peserta mengembalikan grid kosong, bukan pembagian dengan nol", () => {
    const g = hitungGridVideo({ ...LAPTOP, count: 0 });
    expect(Number.isFinite(g.tileWidth)).toBe(true);
    expect(g.tileWidth).toBe(0);
  });
});
