import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { userIdDariRequest } from '@/lib/authToken';

// Hanya jenis berkas yang memang dibutuhkan aplikasi: gambar profil/postingan dan
// lampiran tugas. Daftar-putih, bukan daftar-hitam -- jauh lebih aman.
const EKST_DIIZINKAN = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',            // gambar
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.csv', // dokumen
  '.mp4', '.webm',                                     // video singkat
]);
const UKURAN_MAKS = 25 * 1024 * 1024; // 25 MB

export async function POST(request: Request) {
  try {
    // Hanya pengguna terautentikasi yang boleh mengunggah — tanpa ini siapa pun
    // bisa menjejali disk server dengan berkas tanpa batas.
    if (!userIdDariRequest(request)) {
      return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // path.extname pada nama asli, di-lowercase. Ekstensi seperti .html/.svg/.js
    // ditolak: berkas di /uploads/ disajikan apa adanya oleh server, jadi HTML/SVG
    // yang diunggah bisa menjalankan skrip di domain yang sama (XSS tersimpan).
    // Dibuktikan lewat uji QA: sebelumnya evil.html berhasil diunggah tanpa login.
    const ext = (path.extname(file.name) || '').toLowerCase();
    if (!EKST_DIIZINKAN.has(ext)) {
      return NextResponse.json(
        { error: `Tipe berkas ${ext || '(tanpa ekstensi)'} tidak diizinkan.` },
        { status: 400 },
      );
    }

    if (file.size > UKURAN_MAKS) {
      return NextResponse.json(
        { error: `Berkas terlalu besar (maks ${UKURAN_MAKS / 1024 / 1024} MB).` },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Nama berkas dibangun sendiri dari UUID + ekstensi ter-whitelist -- nama asli
    // dari pengguna TIDAK dipakai untuk path, jadi tidak ada celah path traversal.
    const uniqueSuffix = `${Date.now()}-${uuidv4().substring(0, 8)}`;
    const filename = `${uniqueSuffix}${ext}`;
    
    // Determine path
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    
    // Ensure directory exists
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, filename);

    // Write file
    await fs.writeFile(filePath, buffer);

    // Return the public URL
    const publicUrl = `/uploads/${filename}`;
    
    return NextResponse.json({ url: publicUrl, filename: file.name }, { status: 200 });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
