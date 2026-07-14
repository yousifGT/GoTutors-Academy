import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { checkOrigin } from "@/lib/csrf";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;

    // CSRF: same-origin check on every mutating API request. NextAuth's own
    // routes (/api/auth/*) ship their own CSRF protection, so skip them.
    if (pathname.startsWith("/api/")) {
      if (pathname.startsWith("/api/auth/")) return NextResponse.next();
      return checkOrigin(req) ?? NextResponse.next();
    }

    const token = req.nextauth.token;
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
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // API routes enforce their own auth in the handler; don't gate them at
        // the edge, so login flows and the origin check above still run.
        if (req.nextUrl.pathname.startsWith("/api/")) return true;
        // A token marked invalid (user deactivated/deleted) is treated as logged
        // out so protected pages redirect to login.
        if (token?.invalid) return false;
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    "/admin/:path*",
    "/centre/:path*",
    "/instructor/:path*",
    "/trainee/:path*",
    "/my-team/:path*",
    "/api/:path*",
  ],
};
