// lib/authToken.ts
// Token sesi bertanda tangan — HANYA dipakai di sisi server (memakai `crypto`).
//
// Menggantikan token lama `mock-db-jwt-token-<id>` yang bisa ditebak siapa saja
// (cukup tahu userId korban → mengaku jadi dia). Token di sini ditandatangani
// dengan HMAC-SHA256 memakai rahasia server, jadi tidak bisa dipalsukan tanpa
// mengetahui rahasianya. Formatnya: base64url(payload) "." base64url(tandaTangan).

import crypto from "crypto";

// NEXTAUTH_SECRET wajib di produksi. Fallback dev di bawah HANYA agar lokal jalan
// tanpa konfigurasi; kalau bocor pun risikonya di mesin dev saja.
const RAHASIA =
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  "vero-dev-secret-ganti-di-produksi";

const UMUR_TOKEN_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

type Payload = { uid: string; exp: number };

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function dariB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function tandaTangani(bagianPayload: string): string {
  return b64url(crypto.createHmac("sha256", RAHASIA).update(bagianPayload).digest());
}

export function buatToken(userId: string): string {
  const payload: Payload = { uid: userId, exp: Date.now() + UMUR_TOKEN_MS };
  const bagianPayload = b64url(Buffer.from(JSON.stringify(payload)));
  return `${bagianPayload}.${tandaTangani(bagianPayload)}`;
}

/** Kembalikan userId kalau token sah & belum kedaluwarsa, atau null kalau tidak. */
export function verifikasiToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string") return null;
  const titik = token.indexOf(".");
  if (titik <= 0) return null;

  const bagianPayload = token.slice(0, titik);
  const tandaTangan = token.slice(titik + 1);

  const harusnya = tandaTangani(bagianPayload);
  const a = Buffer.from(tandaTangan);
  const b = Buffer.from(harusnya);
  // Bandingkan waktu-tetap supaya tidak bocor lewat lama pembandingan.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload: Payload = JSON.parse(dariB64url(bagianPayload).toString("utf8"));
    if (!payload.uid || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

/** Ambil Bearer token dari header Authorization sebuah Request lalu verifikasi. */
export function userIdDariRequest(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const cocok = /^Bearer\s+(.+)$/i.exec(h.trim());
  if (!cocok) return null;
  return verifikasiToken(cocok[1]);
}
