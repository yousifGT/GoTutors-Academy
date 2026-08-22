import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        if (!creds?.email || !creds.password) return null;
        const email = creds.email.toLowerCase();
        // 5 sign-in attempts / 60s per email.
        if (!rateLimit(`signin:${email}`, 5, 60).ok) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, password: true, role: true, active: true },
        });
        // Compare against a dummy hash when the user is missing so a wrong email
        // and a wrong password take the same time to fail.
        const hash = user?.password ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
        const ok = await bcrypt.compare(creds.password, hash);
        if (!user || !user.active || !ok) return null;

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as unknown as { role: Role }).role;
      }
      if (token.uid) {
        // Re-read on every request so deactivating an account takes effect at
        // once rather than when the token happens to expire.
        const fresh = await prisma.user.findUnique({
          where: { id: token.uid as string },
          select: { role: true, active: true },
        });
        if (!fresh || !fresh.active) token.invalid = true;
        else {
          token.role = fresh.role;
          token.invalid = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
};
