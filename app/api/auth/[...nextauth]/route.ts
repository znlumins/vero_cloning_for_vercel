import NextAuth, { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import prisma from "@/lib/prisma";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "mock-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "mock-client-secret",
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        if (!user.email) return false;

        // Check if user exists
        let dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          include: { profile: true },
        });

        if (!dbUser) {
          // Register automatically if they don't exist
          dbUser = await prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
              data: {
                email: user.email!,
              },
            });

            await tx.profile.create({
              data: {
                id: newUser.id,
                name: user.name || "Google User",
                // MAHASISWA hanyalah nilai sementara: Google tidak pernah
                // menanyakan peran apa pun. Yang menentukan adalah
                // hearingStatus yang dibiarkan NULL — itulah penanda "profil
                // belum lengkap" yang membuat pengguna diarahkan ke
                // /lengkapi-profil, tempat ia memilih peran & statusnya sendiri.
                role: "MAHASISWA",
                avatarUrl: user.image || null,
              },
            });

            await tx.academicStat.create({
              data: {
                userId: newUser.id,
                presensi: 100,
              },
            });

            return await tx.user.findUnique({
              where: { id: newUser.id },
              include: { profile: true },
            });
          });
        }

        // Attach DB id to token for later
        user.id = dbUser!.id;
        (user as any).role = dbUser!.profile?.role;
        (user as any).fullName = dbUser!.profile?.name;
        (user as any).avatarUrl = dbUser!.profile?.avatarUrl;
        (user as any).hearingStatus = dbUser!.profile?.hearingStatus ?? null;
        (user as any).dosenStatus = dbUser!.profile?.dosenStatus ?? null;
        (user as any).university = dbUser!.profile?.university ?? null;
        (user as any).studyProgram = dbUser!.profile?.studyProgram ?? null;

        return true;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.fullName = (user as any).fullName;
        token.avatarUrl = (user as any).avatarUrl;
        token.hearingStatus = (user as any).hearingStatus ?? null;
        token.dosenStatus = (user as any).dosenStatus ?? null;
        token.university = (user as any).university ?? null;
        token.studyProgram = (user as any).studyProgram ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).full_name = token.fullName;
        (session.user as any).avatarUrl = token.avatarUrl;
        (session.user as any).hearingStatus = token.hearingStatus ?? null;
        (session.user as any).dosenStatus = token.dosenStatus ?? null;
        (session.user as any).university = token.university ?? null;
        (session.user as any).studyProgram = token.studyProgram ?? null;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET || "default-secret-for-dev",
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
