import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clientIp, forget, rateLimit } from "@/lib/rate-limit";

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
      async authorize(creds, req) {
        if (!creds?.email || !creds.password) return null;
        const email = creds.email.toLowerCase();

        // Two limits, because one of them alone is no limit at all.
        //
        // Per email stops someone working through a password list against one
        // account. On its own it lets an attacker try the same likely password
        // against every account in the company without ever hitting it, and it
        // hands anyone who knows an address the ability to lock its owner out
        // by burning the allowance on purpose.
        //
        // Per address stops the spray, and is the reason the per-email limit
        // being exhaustible is survivable: the flood that would exhaust it is
        // itself blocked.
        const from = clientIp({ headers: new Headers((req?.headers ?? {}) as Record<string, string>) });
        const [byEmail, byAddress] = await Promise.all([
          rateLimit(`signin:email:${email}`, 5, 60),
          rateLimit(`signin:ip:${from}`, 30, 60),
        ]);
        if (!byEmail.ok || !byAddress.ok) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, password: true, role: true, active: true },
        });
        // Compare against a dummy hash when the user is missing so a wrong email
        // and a wrong password take the same time to fail.
        const hash = user?.password ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
        const ok = await bcrypt.compare(creds.password, hash);
        if (!user || !user.active || !ok) return null;

        // Getting in clears both counts. Only failures are worth counting: the
        // limit exists to slow guessing, and someone who signed in successfully
        // is not guessing. Counting successes as well would lock out a real
        // office where a dozen people arrive at once behind one address.
        await Promise.all([forget(`signin:email:${email}`, 60), forget(`signin:ip:${from}`, 60)]);

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
          select: { role: true, active: true, sessionsValidFrom: true },
        });
        // A token issued before the account's cut-off is spent. There is no
        // server-side session list to delete from with this strategy, so this
        // is the only way a password change can actually end the sessions the
        // old password opened — otherwise whoever prompted the change keeps
        // the one they already had, for up to twelve hours.
        const issuedAt = typeof token.iat === "number" ? token.iat * 1000 : 0;
        const revoked = !!fresh && issuedAt > 0 && issuedAt < fresh.sessionsValidFrom.getTime();
        if (!fresh || !fresh.active || revoked) token.invalid = true;
        else {
          token.role = fresh.role;
          token.invalid = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // A token the check above rejected must not become a usable session.
      // Middleware only consults `token.invalid` for page routes — API routes
      // are allowed through so they can answer with JSON rather than a redirect
      // — so without this a deactivated account, or one whose sessions were
      // revoked by a password change, kept full use of the API until its token
      // expired. Dropping the user is what `viewerOr401` and `requireUser`
      // read: no user, no session.
      if (token.invalid) return { ...session, user: undefined as unknown as typeof session.user };
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
};
