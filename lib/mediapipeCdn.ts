"use client";
// Sumber TUNGGAL versi MediaPipe yang ditarik dari CDN.
//
// KENAPA DIPATOK: sebelumnya URL ditulis tanpa nomor versi —
//
//     https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js
//
// jsDelivr menerjemahkan itu jadi "versi terbaru apa pun yang ada saat diminta".
// Dua akibatnya nyata:
//   1. Aplikasi bisa berubah perilaku tanpa kita men-deploy apa pun.
//   2. Dua laptop bisa menjalankan versi berbeda — yang membuat perbandingan
//      angka performa antar perangkat TIDAK SAH. Padahal itu persis yang sedang
//      kita kerjakan sekarang.
//
// PENTING — versi skrip & versi biner harus sama. holistic.js menarik berkas
// pendamping (.wasm, .binarypb, .tflite) lewat callback locateFile. Kalau
// skripnya dipatok tapi locateFile tidak, JS versi X akan memuat biner versi Y:
// sumber galat yang sangat sulit dilacak karena tidak ada pesan error yang
// menyebut versi. Karena itu keduanya WAJIB mengambil konstanta dari berkas ini,
// jangan pernah menulis URL MediaPipe langsung di halaman.
//
// Catatan: 0.5.1675471629 adalah rilis TERAKHIR paket ini (Februari 2023).
// MediaPipe Solutions sudah dihentikan Google dan digantikan
// @mediapipe/tasks-vision. Jadi memaku versi di sini tidak menahan pembaruan
// apa pun — memang tidak ada lagi pembaruan yang akan datang.

export const HOLISTIC_VERSION = "0.5.1675471629";
export const DRAWING_UTILS_VERSION = "0.3.1675466124";

export const HOLISTIC_SCRIPT_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@${HOLISTIC_VERSION}/holistic.js`;
export const DRAWING_UTILS_SCRIPT_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@${DRAWING_UTILS_VERSION}/drawing_utils.js`;

/**
 * locateFile untuk konstruktor Holistic. Versinya HARUS sama dengan
 * HOLISTIC_SCRIPT_URL — lihat penjelasan di atas.
 */
export function holisticLocateFile(file: string): string {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@${HOLISTIC_VERSION}/${file}`;
}
