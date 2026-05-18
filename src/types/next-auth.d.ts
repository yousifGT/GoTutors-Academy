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
  }
}
