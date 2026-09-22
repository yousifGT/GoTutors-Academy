import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Email + password, stored as bcrypt hashes in this app's own User table.
 *
 * The session carries the organisation id because every query in the app scopes
 * on it. Putting it in the token rather than looking it up per request is what
 * keeps a page render from fanning out into a dozen identical lookups — but it
 * also means the token has to be re-checked against the database periodically,
 * or a deactivated account keeps working until its token expires.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;
        if (!(await bcrypt.compare(password, user.password))) return null;

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organisationId: user.organisationId,
          mustChangePassword: user.mustChangePassword,
        } as never;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as {
          id: string;
          role: string;
          organisationId: string;
          mustChangePassword: boolean;
        };
        token.uid = u.id;
        token.role = u.role;
        token.organisationId = u.organisationId;
        token.mustChangePassword = u.mustChangePassword;
        token.checkedAt = Date.now();
        token.invalid = false;
        return token;
      }

      // Re-read the account every few minutes so deactivating someone, or
      // changing their role, takes effect without waiting for the token to
      // expire. A token whose user is gone is marked invalid, not silently
      // trusted.
      const CHECK_EVERY_MS = 5 * 60 * 1000;
      if (typeof token.checkedAt === "number" && Date.now() - token.checkedAt < CHECK_EVERY_MS) return token;

      const dbUser = await prisma.user.findUnique({
        where: { id: String(token.uid ?? "") },
        select: { id: true, role: true, organisationId: true, active: true, mustChangePassword: true },
      });
      token.checkedAt = Date.now();
      if (!dbUser || !dbUser.active) {
        token.invalid = true;
        return token;
      }
      token.invalid = false;
      token.role = dbUser.role;
      token.organisationId = dbUser.organisationId;
      token.mustChangePassword = dbUser.mustChangePassword;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid ?? "");
        session.user.role = token.role as "ADMIN" | "MARKER";
        session.user.organisationId = String(token.organisationId ?? "");
        session.user.mustChangePassword = !!token.mustChangePassword;
      }
      return session;
    },
  },
};
