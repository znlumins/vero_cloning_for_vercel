import { NextResponse } from "next/server";
import crypto from "crypto";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

// Text-to-Speech Bahasa Indonesia yang SAMA di semua browser.
//
// KENAPA DI SERVER, BUKAN DI BROWSER
// ----------------------------------
// `speechSynthesis` bawaan browser memakai suara yang dipasang SISTEM OPERASI.
// Akibatnya satu kalimat yang sama terdengar berbeda di tiap perangkat: Edge di
// Windows punya suara neural yang enak, Chrome di Linux sering tidak punya suara
// Indonesia sama sekali dan membacanya dengan aksen Inggris, Safari lain lagi.
// Untuk demo dan penjurian itu tidak bisa diandalkan.
//
// Rute ini mensintesis audio di server memakai suara neural Microsoft Edge —
// gratis, tanpa API key, dan tanpa kuota bulanan seperti ElevenLabs. Karena yang
// dikirim ke browser adalah berkas MP3 jadi, semua pengguna mendengar suara yang
// persis sama, apa pun browser dan sistem operasinya.
//
// Browser TETAP punya jalur cadangan (`lib/tts.ts` jatuh ke speechSynthesis bila
// rute ini gagal), jadi kalau layanan Microsoft tidak terjangkau, fiturnya
// menurun kualitasnya — bukan mati.

export const runtime = "nodejs";

// Dua suara neural Bahasa Indonesia yang tersedia. Daftar-putih, bukan nilai
// bebas: parameter `voice` datang dari klien dan diteruskan ke layanan luar.
const SUARA: Record<string, string> = {
  perempuan: "id-ID-GadisNeural",
  "laki-laki": "id-ID-ArdiNeural",
};
const SUARA_DEFAULT = "perempuan";

// Batas panjang teks. Sintesis membutuhkan waktu yang sebanding dengan panjang
// teks, jadi tanpa batas satu permintaan bisa menahan koneksi bermenit-menit.
const PANJANG_MAKS = 800;

// Cache dalam memori. Kalimat yang sama diucapkan berulang kali (frasa cepat di
// halaman speech, pesan chat yang dibacakan ulang), dan mensintesis ulang berarti
// menunggu ~1 detik untuk audio yang identik. Map menjaga urutan penyisipan,
// jadi entri terlama = kunci pertama — itu yang dibuang saat penuh.
const CACHE_MAKS = 200;
const cache = new Map<string, Buffer>();

function simpanCache(kunci: string, audio: Buffer) {
  if (cache.size >= CACHE_MAKS) {
    const terlama = cache.keys().next().value;
    if (terlama !== undefined) cache.delete(terlama);
  }
  cache.set(kunci, audio);
}

async function sintesis(teks: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream(teks);

  const potongan: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    audioStream.on("data", (c: Buffer) => potongan.push(c));
    audioStream.on("end", () => resolve());
    audioStream.on("error", reject);
    // Layanan Microsoft memakai WebSocket; kalau menggantung tanpa menutup, tanpa
    // batas waktu ini permintaan tidak akan pernah selesai.
    setTimeout(() => reject(new Error("timeout sintesis")), 15000);
  });

  return Buffer.concat(potongan);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const teks = String(body?.text ?? "").trim();
    const pilihan = String(body?.voice ?? SUARA_DEFAULT);

    if (!teks) {
      return NextResponse.json({ error: "Teks kosong." }, { status: 400 });
    }
    if (teks.length > PANJANG_MAKS) {
      return NextResponse.json(
        { error: `Teks terlalu panjang (maksimal ${PANJANG_MAKS} karakter).` },
        { status: 400 },
      );
    }

    const voice = SUARA[pilihan] ?? SUARA[SUARA_DEFAULT];
    const kunci = crypto.createHash("sha1").update(`${voice}|${teks}`).digest("hex");

    let audio = cache.get(kunci);
    if (!audio) {
      audio = await sintesis(teks, voice);
      if (!audio.length) throw new Error("audio kosong");
      simpanCache(kunci, audio);
    }

    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.length),
        // Teks yang sama selalu menghasilkan audio yang sama, jadi aman disimpan
        // lama di browser & CDN. ETag membuat pemutaran berulang tidak menyentuh
        // jaringan sama sekali.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
        ETag: `"${kunci}"`,
      },
    });
  } catch (e) {
    // Klien akan jatuh ke speechSynthesis bawaan browser saat menerima 503, jadi
    // kegagalan di sini menurunkan kualitas suara — tidak mematikan fiturnya.
    console.error("TTS gagal:", e);
    return NextResponse.json(
      { error: "Layanan suara tidak tersedia, memakai suara bawaan browser." },
      { status: 503 },
    );
  }
}
