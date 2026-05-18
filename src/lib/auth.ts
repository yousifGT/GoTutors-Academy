import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { RoleType } from "@prisma/client";
import { rateLimit } from "@/lib/rate-limit";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
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
        // 5 sign-in attempts / 60s per email
        const rl = rateLimit(`signin:${email}`, 5, 60);
        if (!rl.ok) return null;
        const user = await prisma.user.findUnique({
          where: { email },
          include: { role: true, centre: true },
        });
        if (!user || !user.active) return null;
        const ok = await bcrypt.compare(creds.password, user.password);
        if (!ok) return null;
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          roleType: user.role.type,
          roleId: user.roleId,
          centreId: user.centreId ?? null,
          position: user.position ?? null,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as any;
        token.uid = u.id;
        token.roleType = u.roleType;
        token.roleId = u.roleId;
        token.centreId = u.centreId;
        token.position = u.position;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.uid;
        (session.user as any).roleType = token.roleType;
        (session.user as any).roleId = token.roleId;
        (session.user as any).centreId = token.centreId;
        (session.user as any).position = token.position;
      }
      return session;
    },
  },
};

export const roleDashboard: Record<RoleType, string> = {
  SUPER_ADMIN: "/admin",
  CENTRE_ADMIN: "/centre",
  INSTRUCTOR: "/instructor",
  TRAINEE: "/trainee",
};
