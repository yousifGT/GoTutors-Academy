import { RoleType } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      roleType: RoleType;
      roleId: string;
      centreId: string | null;
      position: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    roleType: RoleType;
    roleId: string;
    centreId: string | null;
    position: string | null;
    /** Epoch ms of the last DB re-validation (throttles the freshness check). */
    checkedAt?: number;
    /** Set when the user was deactivated/deleted since the token was issued. */
    invalid?: boolean;
  }
}
