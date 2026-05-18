import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;
    if (!token) return NextResponse.next();

    const role = token.roleType as string;
    const matches: Array<[string, string[]]> = [
      ["/admin", ["SUPER_ADMIN"]],
      ["/centre", ["SUPER_ADMIN", "CENTRE_ADMIN"]],
      ["/instructor", ["SUPER_ADMIN", "INSTRUCTOR"]],
      ["/trainee", ["SUPER_ADMIN", "TRAINEE", "CENTRE_ADMIN", "INSTRUCTOR"]],
    ];
    for (const [prefix, roles] of matches) {
      if (pathname.startsWith(prefix) && !roles.includes(role)) {
        const target =
          role === "SUPER_ADMIN" ? "/admin" :
          role === "CENTRE_ADMIN" ? "/centre" :
          role === "INSTRUCTOR" ? "/instructor" : "/trainee";
        return NextResponse.redirect(new URL(target, req.url));
      }
    }
    return NextResponse.next();
  },
  { callbacks: { authorized: ({ token }) => !!token } }
);

export const config = {
  matcher: ["/admin/:path*", "/centre/:path*", "/instructor/:path*", "/trainee/:path*", "/my-team/:path*"],
};
