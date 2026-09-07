// lib/mail.ts — pengiriman email via SMTP (default Gmail) memakai Nodemailer.
//
// Konfigurasi lewat environment (lihat DEPLOYMENT.md / .env):
//   EMAIL_SERVER_HOST      default: smtp.gmail.com
//   EMAIL_SERVER_PORT      default: 465 (SSL). Pakai 587 untuk STARTTLS.
//   EMAIL_SERVER_USER      alamat Gmail pengirim, mis. vero...@gmail.com
//   EMAIL_SERVER_PASSWORD  APP PASSWORD Gmail (BUKAN password akun biasa)
//   EMAIL_FROM             opsional, default: "VERO <EMAIL_SERVER_USER>"
//
// Gmail menolak password akun untuk SMTP: pengguna harus mengaktifkan 2FA lalu
// membuat "App Password" di https://myaccount.google.com/apppasswords.

import nodemailer from "nodemailer";

export function emailDikonfigurasi(): boolean {
  return !!(process.env.EMAIL_SERVER_USER && process.env.EMAIL_SERVER_PASSWORD);
}

function buatTransport() {
  const port = Number(process.env.EMAIL_SERVER_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST || "smtp.gmail.com",
    port,
    secure: port === 465, // 465 = SSL langsung; 587 = STARTTLS
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
  });
}

interface KirimArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Kirim satu email. Melempar error kalau gagal (dipanggil di dalam try/catch). */
export async function kirimEmail({ to, subject, html, text }: KirimArgs) {
  if (!emailDikonfigurasi()) {
    throw new Error("SMTP belum dikonfigurasi (EMAIL_SERVER_USER/PASSWORD kosong).");
  }
  const from = process.env.EMAIL_FROM || `VERO <${process.env.EMAIL_SERVER_USER}>`;
  const transport = buatTransport();
  await transport.sendMail({ from, to, subject, html, text });
}

/** Template email reset password (link tautan yang bisa diklik). */
export function templateResetPassword(resetUrl: string) {
  const text =
    `Kami menerima permintaan reset kata sandi akun VERO Anda.\n\n` +
    `Buka tautan berikut untuk membuat kata sandi baru (berlaku 1 jam):\n${resetUrl}\n\n` +
    `Jika Anda tidak meminta ini, abaikan email ini.`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a">
    <h2 style="margin:0 0 8px;color:#4338ca">VERO</h2>
    <p style="font-size:15px;line-height:1.6;color:#334155">
      Kami menerima permintaan <b>reset kata sandi</b> untuk akun VERO Anda.
      Klik tombol di bawah untuk membuat kata sandi baru. Tautan ini berlaku
      <b>1 jam</b>.
    </p>
    <p style="text-align:center;margin:28px 0">
      <a href="${resetUrl}"
         style="background:#4338ca;color:#fff;text-decoration:none;font-weight:bold;
                padding:14px 28px;border-radius:10px;display:inline-block;font-size:14px">
        Reset Kata Sandi
      </a>
    </p>
    <p style="font-size:12px;color:#94a3b8;line-height:1.6">
      Kalau tombol tidak berfungsi, salin tautan ini ke browser:<br>
      <a href="${resetUrl}" style="color:#6366f1;word-break:break-all">${resetUrl}</a>
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
    <p style="font-size:12px;color:#94a3b8">
      Jika Anda tidak meminta reset kata sandi, abaikan saja email ini —
      akun Anda tetap aman.
    </p>
  </div>`;

  return { text, html };
}
