/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
// app/api/auth/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { buatToken } from '@/lib/authToken';

export async function POST(req: Request) {
  try {
    const { action, email, password, options, userId } = await req.json();

    if (action === 'signUp') {
      if (!email || !password) {
        return NextResponse.json({ data: null, error: { message: "Email and password are required." } });
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });
      if (existingUser) {
        return NextResponse.json({ data: null, error: { message: "User already registered." } });
      }

      // Hash password using bcrypt
      const hashedPassword = await bcrypt.hash(password, 10);

      // Extract metadata (role, full_name)
      const fullName = options?.data?.full_name || 'New User';

      // Daftar-putih role yang boleh datang dari klien. ADMIN SENGAJA TIDAK ADA
      // di sini: badan permintaan sepenuhnya dikendalikan penyerang, jadi tanpa
      // penyaringan ini siapa pun bisa mengirim role:"ADMIN" lewat curl dan
      // langsung menguasai seluruh platform. Satu-satunya jalan jadi admin
      // adalah `npm run make-admin`, yang menuntut akses server.
      const rolePermintaan = options?.data?.role;
      const role = rolePermintaan === 'DOSEN' ? 'DOSEN' : 'MAHASISWA';

      const hearingPermintaan = options?.data?.hearing_status;
      const hearingStatus =
        hearingPermintaan === 'TEMAN_TULI' || hearingPermintaan === 'TEMAN_DENGAR'
          ? hearingPermintaan
          : null;

      // Dosen mulai dari PENDING — belum boleh membuat kelas atau menilai
      // sampai admin memverifikasi. Mahasiswa tidak punya status ini.
      const dosenStatus = role === 'DOSEN' ? 'PENDING' : null;

      // Create user and profile in transaction
      const newUser = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            email,
            password: hashedPassword
          }
        });

        await tx.profile.create({
          data: {
            id: u.id,
            name: fullName,
            role: role as any,
            hearingStatus: hearingStatus as any,
            dosenStatus: dosenStatus as any
          }
        });

        // Initialize academic stats for student
        if (role === 'MAHASISWA') {
          await tx.academicStat.create({
            data: {
              userId: u.id,
              presensi: 100
            }
          });
        }

        return u;
      });

      return NextResponse.json({
        data: {
          user: {
            id: newUser.id,
            email: newUser.email,
            user_metadata: {
              full_name: fullName,
              role: role,
              hearing_status: hearingStatus,
              dosen_status: dosenStatus
            }
          }
        },
        error: null
      });

    } else if (action === 'signIn') {
      if (!email || !password) {
        return NextResponse.json({ data: null, error: { message: "Email and password are required." } });
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
        include: { profile: true }
      });

      if (!user || !user.password) {
        return NextResponse.json({ data: null, error: { message: "Invalid email or password." } });
      }

      // Verify bcrypt password hash
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return NextResponse.json({ data: null, error: { message: "Invalid email or password." } });
      }

      const session = {
        // Token bertanda tangan HMAC (lib/authToken) — menggantikan token lama
        // yang cuma menempel userId sehingga bisa dipalsukan siapa saja.
        access_token: buatToken(user.id),
        user: {
          id: user.id,
          email: user.email,
          user_metadata: {
            full_name: user.profile?.name || 'User',
            role: user.profile?.role || 'MAHASISWA',
            // WAJIB ikut: tanpa ini, sesi di browser tidak punya foto profil,
            // sehingga pengguna tidak melihat FOTO-NYA SENDIRI padahal orang
            // lain (yang membaca profil dari DB) melihatnya.
            avatar_url: user.profile?.avatarUrl || null,
            // Dua ini menentukan arah sesaat setelah login: hearing_status yang
            // null mengarahkan ke /lengkapi-profil, dan dosen_status menentukan
            // apakah kewenangan mengajar terbuka atau masih terkunci.
            hearing_status: user.profile?.hearingStatus || null,
            dosen_status: user.profile?.dosenStatus || null,
            university: user.profile?.university || null,
            study_program: user.profile?.studyProgram || null
          }
        }
      };

      return NextResponse.json({
        data: {
          user: session.user,
          session
        },
        error: null
      });

    } else if (action === 'updateUser') {
      if (!userId || !password) {
        return NextResponse.json({ data: null, error: { message: "User ID and password are required." } });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
      });
      return NextResponse.json({ data: { message: "Password updated successfully." }, error: null });

    } else if (action === 'signOut') {
      return NextResponse.json({ data: null, error: null });
    }

    return NextResponse.json({ data: null, error: { message: `Auth action ${action} not supported.` } });

  } catch (error: any) {
    console.error("Auth API Error: ", error);
    return NextResponse.json({ data: null, error: { message: error.message || 'Unknown error' } });
  }
}
