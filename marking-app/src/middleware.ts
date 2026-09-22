import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { checkOrigin } from "@/lib/csrf";

/**
 * Everything is behind a login except the login page itself, first-run setup,
 * and the health check.
 */
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;

    // CSRF: same-origin check on every mutating /api request, so no route can
    // forget it. NextAuth's own routes ship their own protection.
    if (pathname.startsWith("/api/")) {
      if (pathname.startsWith("/api/auth/")) return NextResponse.next();
      return checkOrigin(req) ?? NextResponse.next();
    }

    const token = req.nextauth.token;
    if (!token) return NextResponse.next();

    // An admin-set password is temporary and known to two people. Hold the app
    // closed until its owner picks their own. Page routes only — the
    // change-password screen still needs its API route to work.
    if (token.mustChangePassword && pathname !== "/change-password") {
      return NextResponse.redirect(new URL("/change-password", req.url));
    }

    if (pathname.startsWith("/team") && token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        // API routes check auth in the handler, so the origin check above still
        // runs and login flows are not gated at the edge.
        if (pathname.startsWith("/api/")) return true;
        if (pathname === "/setup") return true;
        // A token marked invalid (user deactivated or deleted) is treated as
        // logged out, so protected pages send them back to the login screen.
        if (token?.invalid) return false;
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    /*
     * Everything except: the login and setup screens, Next's own assets, the
     * uploads directory (served statically, and already unguessable), and the
     * favicon.
     */
    "/((?!login|setup|_next/static|_next/image|uploads|favicon.ico).*)",
  ],
};
