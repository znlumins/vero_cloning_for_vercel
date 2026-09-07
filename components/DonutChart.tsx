"use client";
// Donut bagian-dari-keseluruhan, digambar sebagai SVG biasa.
//
// KENAPA TANPA PUSTAKA CHART
// --------------------------
// Bentuk ini hanya butuh beberapa busur lingkaran dan satu angka di tengah.
// Menarik pustaka chart untuk itu berarti menambah ratusan kilobyte ke bundel
// yang dikirim ke setiap pengguna — termasuk pengguna yang tidak akan pernah
// membuka panel admin — demi menggambar tiga potongan. Satu <circle> dengan
// stroke-dasharray sudah cukup, dan hasilnya bisa diberi gaya dengan token yang
// sama seperti sisa aplikasi.
//
// CATATAN AKSESIBILITAS
// Warna BUKAN satu-satunya pembawa makna di sini: tiap potongan selalu
// didampingi legenda berisi label, jumlah, dan persentase dalam bentuk teks.
// Donut-nya sendiri diberi ringkasan teks lewat aria-label untuk pembaca layar,
// dan tabelnya tetap terbaca kalau warnanya tidak terlihat sama sekali.

import { useState } from "react";

export interface PotonganDonut {
  label: string;
  value: number;
  /** Warna isian. Sudah lolos pemeriksaan CVD & kontras — lihat pemakainya. */
  color: string;
}

interface Props {
  potongan: PotonganDonut[];
  /** Angka besar di tengah donut. */
  nilaiTengah: number | string;
  labelTengah: string;
  ukuran?: number;
  tebal?: number;
}

export default function DonutChart({
  potongan,
  nilaiTengah,
  labelTengah,
  ukuran = 180,
  tebal = 22,
}: Props) {
  const [disorot, setDisorot] = useState<number | null>(null);

  const total = potongan.reduce((s, p) => s + p.value, 0);
  const r = (ukuran - tebal) / 2;
  const keliling = 2 * Math.PI * r;
  // Celah 2px antar potongan, seperti spacer di antara segmen bertumpuk: tanpa
  // itu dua warna bersebelahan terbaca seperti satu blok di layar kecil.
  const celah = total > 0 && potongan.filter((p) => p.value > 0).length > 1 ? 2 : 0;

  // Titik mulai tiap busur dihitung dari jumlah potongan SEBELUMNYA, bukan dengan
  // menumpuk penghitung yang diubah-ubah di dalam map. Selain lebih jelas, ia juga
  // tidak menyimpan sisa keadaan dari render sebelumnya.
  const busur = potongan.map((p, i) => {
    const sebelumnya = potongan.slice(0, i).reduce((s, q) => s + q.value, 0);
    const panjang = total > 0 ? (p.value / total) * keliling : 0;
    const mulai = total > 0 ? (sebelumnya / total) * keliling : 0;
    return { ...p, i, panjang: Math.max(0, panjang - celah), mulai };
  });

  const ringkasan =
    total > 0
      ? potongan
          .map((p) => `${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`)
          .join(", ")
      : "Belum ada data.";

  return (
    <div className="relative shrink-0" style={{ width: ukuran, height: ukuran }}>
      <svg
        width={ukuran}
        height={ukuran}
        viewBox={`0 0 ${ukuran} ${ukuran}`}
        role="img"
        aria-label={`${labelTengah}: ${nilaiTengah}. ${ringkasan}`}
      >
        {/* Cincin dasar — juga berlaku sebagai keadaan kosong: kalau belum ada
            data sama sekali, yang terlihat lingkaran abu-abu, bukan area kosong
            yang menyerupai kerusakan tampilan. */}
        <circle
          cx={ukuran / 2}
          cy={ukuran / 2}
          r={r}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={tebal}
        />
        {busur.map((b) =>
          b.panjang <= 0 ? null : (
            <circle
              key={b.label}
              cx={ukuran / 2}
              cy={ukuran / 2}
              r={r}
              fill="none"
              stroke={b.color}
              strokeWidth={disorot === b.i ? tebal + 4 : tebal}
              strokeDasharray={`${b.panjang} ${keliling - b.panjang}`}
              strokeDashoffset={-b.mulai}
              strokeLinecap="butt"
              // Mulai dari jam 12, searah jarum jam — arah baca yang diharapkan
              // orang; bawaan SVG mulai dari jam 3.
              transform={`rotate(-90 ${ukuran / 2} ${ukuran / 2})`}
              className="transition-all duration-150 cursor-default"
              onMouseEnter={() => setDisorot(b.i)}
              onMouseLeave={() => setDisorot(null)}
            />
          ),
        )}
      </svg>

      {/* Angka di tengah. aria-hidden karena isinya sudah disebutkan di
          aria-label SVG di atas — kalau tidak, pembaca layar membacanya dua kali. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" aria-hidden="true">
        {disorot !== null && potongan[disorot] ? (
          <>
            <span className="text-2xl font-black text-slate-900 leading-none">{potongan[disorot].value}</span>
            <span className="text-[10px] font-bold text-slate-500 mt-1.5 text-center px-4 leading-tight">
              {potongan[disorot].label}
            </span>
          </>
        ) : (
          <>
            <span className="text-3xl font-black text-slate-900 leading-none">{nilaiTengah}</span>
            <span className="text-[11px] font-medium text-slate-400 mt-1.5">{labelTengah}</span>
          </>
        )}
      </div>
    </div>
  );
}
