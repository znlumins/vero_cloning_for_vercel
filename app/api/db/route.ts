/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/db/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { userIdDariRequest } from '@/lib/authToken';

const tableModelMap: Record<string, string> = {
  'users': 'user',
  'profiles': 'profile',
  // Dua tabel ini SUDAH dipakai dashboard mahasiswa untuk menghitung persentase
  // presensi, tapi tidak pernah terdaftar di sini — jadi setiap kuerinya balik
  // dengan galat "Table X not mapped", ditelan diam-diam oleh try/catch di
  // halaman, dan presensi selalu tampil 100% untuk semua orang.
  'attendance_sessions': 'attendanceSession',
  'attendance_records': 'attendanceRecord',
  'announcements': 'announcement',
  'notifications': 'notification',
  'academic_stats': 'academicStat',
  'archive_items': 'archiveItem',
  'classes': 'class',
  'class_posts': 'classPost',
  'enrollments': 'enrollment',
  'explore_courses': 'exploreCourse',
  'groups': 'group',
  'group_members': 'groupMember',
  'meeting_participants': 'meetingParticipant',
  'messages': 'message',
  'schedules': 'schedule',
  'tasks': 'task',
  'task_submissions': 'taskSubmission'
};

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function convertKeysToCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertKeysToCamelCase);
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[toCamelCase(key)] = convertKeysToCamelCase(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}

function convertKeysToSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertKeysToSnakeCase);
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[toSnakeCase(key)] = convertKeysToSnakeCase(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}

// Kolom yang TIDAK BOLEH pernah keluar ke client, apa pun tabelnya. Endpoint ini
// dipanggil langsung dari browser (lihat lib/db.ts), jadi apa pun yang dikembalikan
// bisa dibaca siapa saja. `SELECT *` pada tabel users sebelumnya membocorkan hash
// bcrypt + token reset — dibuktikan lewat uji QA. Nama dalam bentuk camelCase
// (dari Prisma) maupun snake_case (setelah konversi) sama-sama dibuang.
const KOLOM_RAHASIA = new Set([
  'password', 'resetToken', 'reset_token', 'resetTokenExpiry', 'reset_token_expiry',
]);

function buangKolomRahasia(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(buangKolomRahasia);
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const bersih: any = {};
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      if (KOLOM_RAHASIA.has(key)) continue;
      bersih[key] = buangKolomRahasia(obj[key]);
    }
    return bersih;
  }
  return obj;
}

/**
 * Ambil id pesan sasaran dari daftar filter yang dikirim client.
 * Sengaja HANYA menerima penyaringan berdasarkan id — sunting/hapus massal lewat
 * filter bebas tidak diizinkan, karena satu permintaan tidak boleh menyentuh
 * banyak baris sekaligus.
 */
function pesanTargetDariFilters(filters: any): { id: string } {
  const daftar = Array.isArray(filters) ? filters : [];
  const byId = daftar.find((f: any) => f?.type === 'eq' && f?.column === 'id');
  return { id: byId ? String(byId.value) : '' };
}

export async function POST(req: Request) {
  try {
    // GERBANG AUTENTIKASI. Endpoint ini dipanggil langsung dari browser dan bisa
    // menjalankan operasi database apa pun, jadi TANPA sesi yang sah tidak boleh
    // ada yang lewat. Sebelum ini, siapa pun di internet bisa membaca/menulis
    // seluruh tabel tanpa login (dibuktikan lewat uji QA). Token diverifikasi
    // tanda tangannya, bukan sekadar ada.
    const uid = userIdDariRequest(req);
    if (!uid) {
      return NextResponse.json(
        { data: null, error: { message: 'Tidak terautentikasi.' } },
        { status: 401 },
      );
    }

    const { table, action, payload, filters, orderField, orderAscending } = await req.json();
    // Aksi yang BENAR-BENAR dijalankan. Bisa berbeda dari yang diminta klien:
    // 'delete' pada tabel messages dibelokkan jadi soft delete (lihat di bawah).
    let aksi: string = action;

    const modelName = tableModelMap[table];
    if (!modelName) {
      return NextResponse.json({ data: null, error: { message: `Table ${table} not mapped.` } });
    }

    const modelClient = (prisma as any)[modelName];
    if (!modelClient) {
      return NextResponse.json({ data: null, error: { message: `Prisma client for ${modelName} not found.` } });
    }

    // Tabel users hanya boleh DIBACA lewat endpoint umum ini (dashboard menampilkan
    // daftar nama/email). Segala tulis-menulisnya -- ganti password, hapus akun --
    // WAJIB lewat /api/auth yang memverifikasi kepemilikan. Tanpa pagar ini, siapa
    // pun bisa menimpa akun orang lain lewat satu POST. (Ubah role bukan lewat sini:
    // role ada di tabel profiles.)
    if (table === 'users' && action !== 'select') {
      return NextResponse.json(
        { data: null, error: { message: 'Operasi tabel users hanya lewat /api/auth.' } },
        { status: 403 },
      );
    }

    // PAGAR PESAN. Sunting & hapus pesan hanya boleh oleh PEMILIKNYA, dan
    // "hapus untuk semua orang" hanya dalam tenggat singkat setelah dikirim.
    //
    // Ini ditegakkan di SERVER, bukan di browser. Sebelumnya update/delete pada
    // tabel messages sama sekali tidak memeriksa kepemilikan: siapa pun yang
    // sudah login bisa menghapus atau menimpa pesan orang lain hanya dengan
    // mengirim satu POST berisi id pesan mana pun. Menyembunyikan tombolnya di
    // UI tidak menutup lubang itu — pagarnya harus di sini.
    let muatan = payload;

    if (table === 'messages' && (action === 'update' || action === 'delete')) {
      const pesan = await prisma.message.findFirst({
        where: pesanTargetDariFilters(filters),
      });

      if (!pesan) {
        return NextResponse.json(
          { data: null, error: { message: 'Pesan tidak ditemukan.' } },
          { status: 404 },
        );
      }
      if (pesan.userId !== uid) {
        return NextResponse.json(
          { data: null, error: { message: 'Hanya pengirim yang boleh mengubah atau menghapus pesan ini.' } },
          { status: 403 },
        );
      }
      // Pesan yang sudah dihapus tidak bisa disunting atau dihapus lagi —
      // isinya sudah tidak ada, jadi permintaan itu tidak punya makna.
      if (pesan.isDeleted) {
        return NextResponse.json(
          { data: null, error: { message: 'Pesan ini sudah dihapus.' } },
          { status: 409 },
        );
      }

      // Sunting hanya boleh menyentuh isi pesan. Tanpa daftar putih ini,
      // pengirim bisa menimpa kolom lain (mis. user_id) lewat payload.
      if (action === 'update' && payload && typeof payload === 'object') {
        for (const key of Object.keys(payload)) {
          if (key !== 'content') delete payload[key];
        }
        if (!payload.content || !String(payload.content).trim()) {
          return NextResponse.json(
            { data: null, error: { message: 'Isi pesan tidak boleh kosong.' } },
            { status: 400 },
          );
        }
        // Penanda & cap waktu sunting ditulis SERVER, bukan dikirim client —
        // kalau client yang menentukan, penanda "diedit" bisa dipalsukan atau
        // dihilangkan.
        payload.is_edited = true;
        payload.edited_at = new Date();
      }

      // HAPUS DIBELOKKAN JADI SOFT DELETE.
      //
      // Klien tetap memanggil .delete() seperti biasa; keputusan bahwa
      // "menghapus" berarti menandai dan mengosongkan — bukan membuang baris —
      // diambil DI SINI. Kalau penerjemahannya diserahkan ke klien, satu
      // permintaan buatan tangan sudah cukup untuk melenyapkan pesan sungguhan.
      //
      // Isi pesan dikosongkan, bukan sekadar disembunyikan lewat flag: selama
      // teksnya masih ada di baris itu, ia tetap ikut terkirim ke browser dan
      // "terhapus" hanya jadi urusan tampilan.
      if (action === 'delete') {
        aksi = 'update';
        muatan = { content: '', is_deleted: true, deleted_at: new Date() };
      }
    }

    // 1. Build Where Clause
    const where: any = {};
    let isSingle = false;

    if (filters && Array.isArray(filters)) {
      for (const filter of filters) {
        if (filter.type === 'eq') {
          where[toCamelCase(filter.column)] = filter.value;
        } else if (filter.type === 'neq') {
          where[toCamelCase(filter.column)] = { not: filter.value };
        } else if (filter.type === 'in') {
          where[toCamelCase(filter.column)] = { in: filter.value };
        } else if (filter.type === 'is') {
          if (filter.value === null) {
            where[toCamelCase(filter.column)] = null;
          } else {
            where[toCamelCase(filter.column)] = filter.value;
          }
        } else if (filter.type === 'gte') {
          const col = toCamelCase(filter.column);
          where[col] = { ...where[col], gte: filter.value };
        } else if (filter.type === 'lte') {
          const col = toCamelCase(filter.column);
          where[col] = { ...where[col], lte: filter.value };
        } else if (filter.type === 'or') {
          // Parse DM chat or filters e.g. and(user_id.eq.A,receiver_id.eq.B)
          const val = filter.value;
          const matches = [...val.matchAll(/and\(user_id\.eq\.([^,)]+),receiver_id\.eq\.([^)]+)\)/g)];
          if (matches.length === 2) {
            const userA = matches[0][1];
            const receiverB = matches[0][2];
            const userB = matches[1][1];
            const receiverA = matches[1][2];
            where.OR = [
              { userId: userA, receiverId: receiverB },
              { userId: userB, receiverId: receiverA }
            ];
          }
        } else if (filter.type === 'single') {
          isSingle = true;
        }
      }
    }

    let result: any = null;

    // 2. Perform actions
    if (aksi === 'select') {
      const orderBy: any = {};
      if (orderField) {
        orderBy[toCamelCase(orderField)] = orderAscending ? 'asc' : 'desc';
      }

      if (isSingle) {
        result = await modelClient.findFirst({
          where,
          orderBy: orderField ? orderBy : undefined
        });
      } else {
        result = await modelClient.findMany({
          where,
          orderBy: orderField ? orderBy : undefined
        });
      }
    } else if (aksi === 'insert') {
      const camelPayload = convertKeysToCamelCase(muatan);
      if (Array.isArray(camelPayload)) {
        // MENYISIPKAN BANYAK BARIS SEKALIGUS.
        //
        // DUA BUG YANG DIPERBAIKI DI SINI — keduanya di baris pengambilan hasil,
        // bukan di penyisipannya:
        //
        // 1. `orderBy: { createdAt: 'desc' }` DIPATOK untuk tabel APA PUN.
        //    Sebagian model tidak punya kolom itu — GroupMember mencatat waktunya
        //    sebagai `joinedAt` — dan Prisma menolak seluruh permintaan dengan
        //    "Unknown argument `createdAt`". Akibatnya setiap penyisipan anggota
        //    grup gagal, dan galat Prisma mentah itu muncul di layar pengguna.
        //    Karena `tableModelMap` memetakan banyak model dengan bentuk kolom
        //    yang berbeda-beda, satu nama kolom tidak boleh diasumsikan ada.
        //
        // 2. `findMany({ where })` dengan `where` KOSONG mengembalikan SELURUH
        //    ISI TABEL, bukan baris yang barusan dibuat. Pemanggil yang mengira
        //    sedang menerima hasil sisipannya justru menerima seluruh tabel —
        //    itulah yang dulu membuat `group.id` bernilai undefined saat membuat
        //    grup.
        //
        // Solusinya: kembalikan apa yang memang diketahui — jumlah baris yang
        // tercipta beserta muatan yang dikirim. createMany() pada MySQL tidak
        // mengembalikan baris hasil, jadi menebak-nebak isinya lewat findMany
        // hanya menghasilkan jawaban yang salah dengan percaya diri.
        await modelClient.createMany({ data: camelPayload });
        result = camelPayload;
      } else {
        result = await modelClient.create({
          data: camelPayload
        });
      }
    } else if (aksi === 'update') {
      const camelPayload = convertKeysToCamelCase(muatan);
      result = await modelClient.updateMany({
        where,
        data: camelPayload
      });
      // Retrieve updated data
      result = await modelClient.findMany({ where });
    } else if (aksi === 'upsert') {
      const camelPayload = convertKeysToCamelCase(muatan);
      let whereClause: any = null;
      if (camelPayload.id) {
        whereClause = { id: camelPayload.id };
      } else if (table === 'meeting_participants' && camelPayload.userId) {
        whereClause = { userId: camelPayload.userId };
      }

      if (whereClause) {
        const existing = await modelClient.findFirst({ where: whereClause });
        if (existing) {
          result = await modelClient.update({
            where: { id: existing.id },
            data: camelPayload
          });
        } else {
          result = await modelClient.create({
            data: camelPayload
          });
        }
      } else {
        result = await modelClient.create({
          data: camelPayload
        });
      }
    } else if (aksi === 'delete') {
      result = await modelClient.deleteMany({
        where
      });
    }

    const snakeResult = buangKolomRahasia(convertKeysToSnakeCase(result));
    return NextResponse.json({ data: snakeResult, error: null });
  } catch (error: any) {
    // Detail teknis TETAP dicatat — di log server, tempat yang memang untuk itu.
    console.error("Database API Error: ", error);

    // Tapi yang dikirim ke browser adalah kalimat yang bisa dibaca orang.
    //
    // Sebelumnya `error.message` Prisma diteruskan mentah-mentah, sehingga
    // pengguna disuguhi blok seperti "Invalid `prisma.groupMember.findMany()`
    // invocation: Unknown argument `createdAt`. Available options are marked
    // with ?." di tengah modal. Itu bukan hanya tidak bisa dimengerti — ia juga
    // membocorkan nama model, nama kolom, dan bentuk kueri kepada siapa pun yang
    // membuka aplikasi.
    //
    // Pesan galat yang MEMANG untuk pengguna (mis. "Hanya pengirim yang boleh
    // mengubah pesan ini") tidak lewat sini: semuanya dikembalikan lebih awal
    // lewat NextResponse tersendiri, jadi tidak ikut tersamarkan.
    return NextResponse.json(
      { data: null, error: { message: 'Terjadi kesalahan saat memproses data. Coba lagi sebentar lagi.' } },
      { status: 500 },
    );
  }
}
