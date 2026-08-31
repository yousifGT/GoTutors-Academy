import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role: Role;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: Role;
    invalid?: boolean;
    /**
     * When this session was actually opened, in epoch milliseconds.
     *
     * Deliberately not `iat`: next-auth re-stamps that on every token re-encode,
     * so it says when the token was last refreshed, not when the person signed
     * in. Revocation has to compare against the latter.
     */
    signedInAt?: number;
  }
}
