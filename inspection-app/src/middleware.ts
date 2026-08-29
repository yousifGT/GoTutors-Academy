import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { checkOrigin } from "@/lib/csrf";

export default withAuth(
  function middleware(req) {
    // CSRF: same-origin check on every mutating API request. NextAuth's own
    // routes ship their own protection, so skip them.
    if (req.nextUrl.pathname.startsWith("/api/")) {
      if (req.nextUrl.pathname.startsWith("/api/auth/")) return NextResponse.next();
      return checkOrigin(req) ?? NextResponse.next();
    }
    return NextResponse.next();
  },
  {
    // withAuth has its own page config; without this it redirects to NextAuth's
    // built-in /api/auth/signin rather than our login screen.
    pages: { signIn: "/login" },
    callbacks: {
      authorized: ({ token, req }) => {
        // API routes authenticate in the handler so the origin check above still
        // runs and the response is JSON rather than a redirect to the login page.
        if (req.nextUrl.pathname.startsWith("/api/")) return true;
        if (token?.invalid) return false;
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: ["/", "/inspections/:path*", "/admin/:path*", "/profile", "/api/:path*"],
};
