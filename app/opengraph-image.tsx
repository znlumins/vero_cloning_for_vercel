import { ImageResponse } from "next/og";

// Gambar pratinjau saat tautan VERO dibagikan (WhatsApp, Instagram, X, Slack).
// Sebelum ini tidak ada sama sekali, jadi setiap link tampil polos — hanya teks
// abu-abu tanpa gambar, yang membuat produknya terlihat belum jadi.
//
// Digambar dengan next/og alih-alih menaruh PNG di public/: teksnya ikut
// berubah kalau nama atau tagline diperbarui, dan tidak ada berkas biner yang
// perlu diurus di git.

export const alt =
  "VERO Learning — platform belajar dan menerjemahkan bahasa isyarat";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#f8fafc",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#4f46e5",
            marginBottom: 28,
          }}
        >
          VERO Learning
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.1,
            color: "#0f172a",
            marginBottom: 32,
          }}
        >
          Mendobrak Batasan Komunikasi.
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: "#475569",
            lineHeight: 1.4,
            marginBottom: 48,
          }}
        >
          Terjemahkan bahasa isyarat BISINDO &amp; SIBI langsung dari kamera.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              padding: "12px 24px",
              borderRadius: 14,
              background: "#4f46e5",
              color: "#ffffff",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            verolearning.my.id
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#94a3b8" }}>
            PKM-KC Universitas Brawijaya
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
