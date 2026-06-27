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
        // Initial sign-in: seed the token from the authorize() result.
        const u = user as any;
        token.uid = u.id;
        token.roleType = u.roleType;
        token.roleId = u.roleId;
        token.centreId = u.centreId;
        token.position = u.position;
        token.checkedAt = Date.now();
        token.invalid = false;
        return token;
      }

      // On subsequent requests, re-validate against the DB at most once per
      // minute so deactivation and role/centre changes take effect promptly
      // without a query on every request (and never on static assets, which
      // don't reach NextAuth). The 7-day token is no longer trusted blindly.
      const STALE_MS = 60_000;
      if (token.checkedAt && Date.now() - token.checkedAt < STALE_MS) return token;

      const dbUser = await prisma.user.findUnique({
        where: { id: token.uid },
        include: { role: true },
      });
      token.checkedAt = Date.now();
      if (!dbUser || !dbUser.active) {
        token.invalid = true;
        return token;
      }
      token.invalid = false;
      token.roleType = dbUser.role.type;
      token.roleId = dbUser.roleId;
      token.centreId = dbUser.centreId ?? null;
      token.position = dbUser.position ?? null;
      return token;
    },
    async session({ session, token }) {
      // A deactivated/deleted user is presented as logged out, so requireSession
      // and the API handlers' `!session?.user` checks reject them.
      if (token.invalid) {
        return { ...session, user: undefined } as unknown as typeof session;
      }
      if (session.user) {
        session.user.id = token.uid;
        session.user.roleType = token.roleType;
        session.user.roleId = token.roleId;
        session.user.centreId = token.centreId;
        session.user.position = token.position;
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
