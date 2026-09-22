import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "MARKER";
      organisationId: string;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: string;
    organisationId?: string;
    mustChangePassword?: boolean;
    checkedAt?: number;
    invalid?: boolean;
  }
}
