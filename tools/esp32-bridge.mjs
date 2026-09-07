// Jembatan ESP32 Cam — supaya alat bisa dipakai dari situs VERO yang ONLINE.
//
// MASALAH YANG DIPECAHKAN
// Halaman HTTPS dilarang memuat sumber daya HTTP ("mixed content"). Kamera
// menyiarkan HTTP polos dari 192.168.x.x, jadi https://verolearning.my.id
// tidak boleh menyentuhnya. Itu aturan di dalam peramban, bukan sesuatu yang
// bisa ditambal dari sisi situs.
//
// KENAPA INI BERHASIL
// Ada satu pengecualian resmi: alamat loopback (127.0.0.1, ::1, localhost)
// digolongkan "potentially trustworthy" oleh spesifikasi Secure Contexts, dan
// spesifikasi Mixed Content secara eksplisit MELEWATKAN sumber yang tergolong
// itu. Jadi halaman HTTPS boleh memuat http://127.0.0.1:8081/stream, sementara
// http://192.168.43.5:81/stream diblokir — padahal dua-duanya HTTP polos.
// Ini pengecualian yang memang disengaja, bukan celah keamanan: lalu lintas ke
// loopback tidak pernah meninggalkan mesin, jadi tidak ada yang bisa menyadap
// atau menyisipinya di tengah jalan. Pola yang sama dipakai pembaca kartu,
// jembatan printer, dan alat penandatangan dokumen.
//
// Program ini duduk di 127.0.0.1 dan meneruskan ke kamera. Browser cuma bicara
// ke loopback; yang bicara ke jaringan adalah program ini.
//
//   Browser (https) → 127.0.0.1:8081 → 192.168.43.5:81  (stream)
//                                    → 192.168.43.5:80  (kontrol)
//
// CARA PAKAI
//   node tools/esp32-bridge.mjs 192.168.43.5
//   node tools/esp32-bridge.mjs 192.168.43.5 --port 9000
//
// Lalu di VERO isi alamatnya dengan:  127.0.0.1:8081
//
// CATATAN: laptop yang menjalankan ini harus satu WiFi dengan kameranya. Yang
// pindah ke internet cuma halaman VERO-nya; videonya tidak pernah keluar dari
// jaringan lokal.

import http from "node:http";

const argv = process.argv.slice(2);

// Argumen bebas pertama = alamat kamera. Nilai yang mengikuti sebuah --flag
// dilewati, supaya "--port 9000 192.168.43.5" tidak salah membaca 9000 sebagai
// alamat kamera.
const kameraHost = (() => {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      i++; // lompati nilainya
      continue;
    }
    return argv[i];
  }
  return undefined;
})();

if (!kameraHost) {
  console.error(`
Alamat kamera belum diisi.

  node tools/esp32-bridge.mjs <ip-esp32> [--port 8081]

Contoh:
  node tools/esp32-bridge.mjs 192.168.43.5

IP-nya dibaca dari Serial Monitor Arduino saat ESP32 menyala.
`);
  process.exit(1);
}


// Firmware CameraWebServer memakai DUA server: halaman kontrol di port 80,
// stream MJPEG di port 81. Jembatan menyatukan keduanya di satu port supaya
// yang perlu diketik di VERO cuma satu alamat.
//
// Bisa ditimpa lewat --stream-port / --control-port kalau firmware-nya diubah.
function ambilPort(nama, bawaan) {
  const i = argv.indexOf(nama);
  if (i === -1) return bawaan;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.error(`Nilai ${nama} tidak sah: ${argv[i + 1]}`);
    process.exit(1);
  }
  return n;
}
const PORT_STREAM = ambilPort("--stream-port", 81);
const PORT_KONTROL = ambilPort("--control-port", 80);
const portLokal = ambilPort("--port", 8081);

/**
 * Header yang membuat halaman HTTPS boleh memakai jembatan ini.
 *
 * `Access-Control-Allow-Private-Network` itu bagian dari Private Network
 * Access: Chrome mensyaratkan halaman publik meminta izin lebih dulu sebelum
 * menjangkau alamat jaringan privat/loopback. Tanpa header ini permintaannya
 * ditolak di tahap preflight, sebelum sempat menyentuh kamera sama sekali.
 */
function pasangHeaderIzin(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

// Batas waktu MENYAMBUNG, bukan batas waktu streaming. IP yang salah ketik
// atau ESP32 yang mati tidak menolak koneksi — paketnya cuma hilang, dan TCP
// baru menyerah setelah puluhan detik. Tanpa batas ini jembatan menggantung
// tanpa jawaban apa pun, dan peramban tidak punya cara membedakannya dari
// kamera yang sedang lambat.
const BATAS_SAMBUNG_MS = 6000;

function teruskan(req, res, portTujuan) {
  let batasSambung = null;
  const batalkanBatas = () => {
    if (batasSambung !== null) {
      clearTimeout(batasSambung);
      batasSambung = null;
    }
  };

  const hulu = http.request(
    {
      host: kameraHost,
      port: portTujuan,
      path: req.url,
      method: "GET",
      headers: { Connection: "keep-alive" },
    },
    (jawaban) => {
      // Header sudah datang — sisanya boleh berlangsung selama apa pun, karena
      // MJPEG memang jawaban yang tidak pernah selesai.
      batalkanBatas();
      pasangHeaderIzin(res);
      // Salin apa adanya — khususnya Content-Type multipart/x-mixed-replace
      // beserta boundary-nya, yang menjadi penanda MJPEG bagi peramban.
      for (const [nama, nilai] of Object.entries(jawaban.headers)) {
        if (nama.toLowerCase() === "access-control-allow-origin") continue;
        res.setHeader(nama, nilai);
      }
      res.writeHead(jawaban.statusCode ?? 200);
      // pipe, bukan buffer: MJPEG itu jawaban yang tidak pernah selesai.
      // Menampungnya di memori berarti tidak ada gambar yang pernah sampai.
      jawaban.pipe(res);
    }
  );

  hulu.on("error", (err) => {
    batalkanBatas();
    console.error(`  ✗ ${req.url} — ${err.message}`);
    if (!res.headersSent) {
      pasangHeaderIzin(res);
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(
        `Kamera di ${kameraHost}:${portTujuan} tidak menjawab.\n\n` +
          `${err.message}\n\n` +
          `Periksa: ESP32 menyala? IP-nya masih sama (cek Serial Monitor)?\n` +
          `Laptop ini satu WiFi dengan kameranya?\n`
      );
    } else {
      // Sudah di tengah stream — tidak ada lagi status yang bisa dikirim,
      // tinggal tutup supaya peramban tahu sumbernya habis.
      res.end();
    }
  });

  batasSambung = setTimeout(() => {
    hulu.destroy(new Error(`tidak ada jawaban dalam ${BATAS_SAMBUNG_MS / 1000} detik`));
  }, BATAS_SAMBUNG_MS);

  // Kalau peramban menutup tab / VERO memanggil stopCamera, koneksi ke kamera
  // ikut ditutup. Tanpa ini ESP32 menyangka kliennya masih ada dan tetap
  // mengirim frame — jatah koneksinya cuma sedikit dan cepat habis.
  res.on("close", () => {
    batalkanBatas();
    hulu.destroy();
  });
  req.on("aborted", () => {
    batalkanBatas();
    hulu.destroy();
  });

  hulu.end();
}

const server = http.createServer((req, res) => {
  const jalur = (req.url ?? "/").split("?")[0];

  if (req.method === "OPTIONS") {
    pasangHeaderIzin(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (jalur === "/stream") {
    console.log(`  → stream dibuka`);
    teruskan(req, res, PORT_STREAM);
    return;
  }

  if (jalur === "/control" || jalur === "/status" || jalur === "/capture") {
    console.log(`  → ${req.url}`);
    teruskan(req, res, PORT_KONTROL);
    return;
  }

  pasangHeaderIzin(res);
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(
    `Jembatan ESP32 Cam aktif.\n\n` +
      `Kamera  : ${kameraHost}\n` +
      `Stream  : http://127.0.0.1:${portLokal}/stream\n\n` +
      `Isi alamat ini di VERO:  127.0.0.1:${portLokal}\n`
  );
});

// Sengaja diikat ke 127.0.0.1, BUKAN 0.0.0.0. Mengikat ke semua antarmuka
// berarti siapa pun di WiFi yang sama bisa menonton kamera lewat laptop ini.
server.listen(portLokal, "127.0.0.1", () => {
  console.log(`
Jembatan ESP32 Cam aktif.

  Kamera   : http://${kameraHost}  (stream :${PORT_STREAM}, kontrol :${PORT_KONTROL})
  Jembatan : http://127.0.0.1:${portLokal}

Isi alamat ini di VERO (bagian KAMERA JARINGAN):

  127.0.0.1:${portLokal}

Berlaku di situs online (https) MAUPUN localhost. Biarkan jendela ini terbuka
selama alat dipakai. Ctrl+C untuk berhenti.
`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${portLokal} sudah dipakai program lain. Coba port lain:\n` +
        `  node tools/esp32-bridge.mjs ${kameraHost} --port 9000`
    );
  } else {
    console.error(`Jembatan gagal jalan: ${err.message}`);
  }
  process.exit(1);
});
