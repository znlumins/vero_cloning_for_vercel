import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { kirimEmail, templateResetPassword, emailDikonfigurasi } from "@/lib/mail";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Return success even if not found to prevent email enumeration attacks
      return NextResponse.json({ message: "Jika email terdaftar, tautan reset telah dikirim." });
    }

    // Generate token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 jam

    await prisma.user.update({
      where: { email },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;

    // Kirim email sungguhan lewat SMTP (Gmail) bila dikonfigurasi.
    if (emailDikonfigurasi()) {
      try {
        const { html, text } = templateResetPassword(resetUrl);
        await kirimEmail({
          to: email,
          subject: "Reset Kata Sandi Akun VERO",
          html,
          text,
        });
      } catch (mailErr) {
        // Jangan bocorkan detail ke pemanggil, tapi catat di server.
        console.error("Gagal mengirim email reset:", mailErr);
        return NextResponse.json(
          { error: "Gagal mengirim email. Coba lagi nanti." },
          { status: 500 },
        );
      }
    } else {
      // SMTP belum diset (mis. dev lokal). Cetak link ke konsol server.
      console.log("[DEV] SMTP belum dikonfigurasi. Link reset:", resetUrl);
    }

    // mockResetUrl HANYA di dev DAN hanya saat SMTP belum ada — untuk memudahkan
    // pengetesan tanpa email. Di produksi tautan cuma sampai ke inbox pemilik.
    const bocorkanUntukDev =
      process.env.NODE_ENV !== "production" && !emailDikonfigurasi();
    return NextResponse.json({
      message: "Tautan reset telah dikirim ke email Anda.",
      ...(bocorkanUntukDev ? { mockResetUrl: resetUrl } : {}),
    });

  } catch (error) {
    console.error("Forgot Password Error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal" }, { status: 500 });
  }
}
