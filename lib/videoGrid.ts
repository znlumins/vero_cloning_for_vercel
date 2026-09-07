// Perhitungan tata letak grid video conference.
//
// Dipisah dari komponen dengan sengaja: ini fungsi murni (angka masuk, angka
// keluar) sehingga bisa diuji tanpa DOM, tanpa kamera, dan tanpa peserta
// sungguhan — tiga hal yang membuat bug tata letak video biasanya baru ketahuan
// saat rapat sedang berlangsung. Lihat lib/videoGrid.test.ts.
//
// Pendekatannya diadopsi dari palerdot/video-conferencing-ui: coba SEMUA jumlah
// kolom yang mungkin, hitung ukuran tile untuk masing-masing, lalu pilih yang
// menghasilkan tile TERBESAR. Tidak ada tabel ajaib "kalau 5 orang maka 3x2" —
// tabel seperti itu selalu salah begitu ukuran containernya di luar dugaan
// penulisnya (panel chat dibuka, jendela dikecilkan, layar ultrawide).

/** 16:9 dulu; 4:3 dipakai kalau ia memberi tile yang jelas lebih besar. */
export const RASIO_UTAMA = 16 / 9;
export const RASIO_CADANGAN = 4 / 3;

export interface OpsiGrid {
  /** Lebar & tinggi area yang tersedia, dalam piksel. */
  width: number;
  height: number;
  /** Jumlah peserta (termasuk diri sendiri). */
  count: number;
  /** Jarak antar tile, dalam piksel. */
  gap?: number;
  /** Rasio yang dicoba, berurutan. Default: 16:9 lalu 4:3. */
  aspectRatios?: number[];
}

export interface HasilGrid {
  cols: number;
  rows: number;
  /** Ukuran satu tile, sudah dibulatkan ke bawah agar tidak pernah melebihi container. */
  tileWidth: number;
  tileHeight: number;
  /** Rasio yang akhirnya dipakai — berguna untuk diteruskan ke CSS aspect-ratio. */
  aspectRatio: number;
}

const KOSONG: HasilGrid = { cols: 1, rows: 1, tileWidth: 0, tileHeight: 0, aspectRatio: RASIO_UTAMA };

/**
 * Ukuran tile untuk satu susunan kolom x baris tertentu.
 *
 * Tile dipaskan pada dua batas sekaligus — lebar DAN tinggi — lalu yang paling
 * mengekang yang menang. Menghitung dari lebar saja adalah kesalahan klasik yang
 * bikin baris paling bawah terpotong begitu pesertanya bertambah.
 */
function ukuranTile(width: number, height: number, cols: number, rows: number, gap: number, rasio: number) {
  const lebarTersedia = (width - gap * (cols - 1)) / cols;
  const tinggiTersedia = (height - gap * (rows - 1)) / rows;
  if (lebarTersedia <= 0 || tinggiTersedia <= 0) return { w: 0, h: 0 };

  // Paskan mengikuti lebar; kalau jadinya terlalu tinggi, paskan mengikuti tinggi.
  let w = lebarTersedia;
  let h = w / rasio;
  if (h > tinggiTersedia) {
    h = tinggiTersedia;
    w = h * rasio;
  }
  return { w, h };
}

/**
 * Hitung susunan grid terbaik.
 *
 * Aturan tambahan yang tidak ada di rumus luas semata: susunan harus SEARAH
 * dengan bentuk containernya — container melebar tidak boleh menghasilkan grid
 * yang lebih tinggi daripada lebar, dan sebaliknya. Tanpa aturan ini, dua
 * peserta di layar laptop justru ditumpuk atas-bawah (luasnya memang sedikit
 * lebih besar), padahal yang diharapkan siapa pun adalah bersebelahan.
 */
export function hitungGridVideo(opsi: OpsiGrid): HasilGrid {
  const { width, height, count } = opsi;
  const gap = opsi.gap ?? 16;
  const rasioDicoba = opsi.aspectRatios ?? [RASIO_UTAMA, RASIO_CADANGAN];

  if (count <= 0 || width <= 0 || height <= 0) return { ...KOSONG };

  const containerMelebar = width >= height;

  /** Susunan terbaik untuk SATU rasio tertentu. */
  const terbaikUntuk = (rasio: number): (HasilGrid & { luas: number }) | null => {
    let juara: (HasilGrid & { luas: number }) | null = null;
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols);

      // Searah dengan bentuk container (lihat catatan di atas). Satu peserta
      // selalu lolos karena 1x1 memenuhi kedua syarat.
      if (containerMelebar ? cols < rows : cols > rows) continue;

      const { w, h } = ukuranTile(width, height, cols, rows, gap, rasio);
      if (w <= 0 || h <= 0) continue;

      const luas = w * h;
      if (!juara || luas > juara.luas) {
        juara = {
          cols,
          rows,
          tileWidth: Math.floor(w),
          tileHeight: Math.floor(h),
          aspectRatio: rasio,
          luas,
        };
      }
    }
    return juara;
  };

  // 16:9 adalah TARGET, bukan salah satu peserta lomba yang setara.
  //
  // Kalau kedua rasio diadu murni berdasarkan luas, 4:3 hampir selalu menang —
  // pada lebar yang sama ia menghasilkan tile yang lebih tinggi. Aplikasinya
  // akan berakhir memakai 4:3 di mana-mana, dan rasio "target" jadi tidak
  // berarti apa-apa. Jadi 4:3 hanya diambil kalau ia memberi tile yang JAUH
  // lebih besar (≥25%) — keadaan yang muncul di container tinggi & sempit,
  // misalnya panel video di ponsel, tempat tile lebar memang membuang ruang
  // vertikal dalam jumlah besar.
  const AMBANG_CADANGAN = 1.25;

  const utama = terbaikUntuk(rasioDicoba[0] ?? RASIO_UTAMA);
  let pilihan = utama;

  for (const rasio of rasioDicoba.slice(1)) {
    const kandidat = terbaikUntuk(rasio);
    if (!kandidat) continue;
    if (!pilihan || kandidat.luas > (utama?.luas ?? 0) * AMBANG_CADANGAN) {
      pilihan = kandidat;
    }
  }

  if (!pilihan) return { ...KOSONG };
  return {
    cols: pilihan.cols,
    rows: pilihan.rows,
    tileWidth: pilihan.tileWidth,
    tileHeight: pilihan.tileHeight,
    aspectRatio: pilihan.aspectRatio,
  };
}
