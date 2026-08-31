/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

// Inspection photos are taken on site and may include children — the CSP is
// deliberately tighter than a marketing site's: no third-party frames or scripts.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Every image the app shows is one it stored itself, served from
      // /api/uploads — photos are proxied out of the object store rather than
      // linked to it, so there is no third-party image host to allow. Leaving
      // `https:` open here would let a URL written into the database load a
      // tracking pixel in front of whoever opens the report.
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
module.exports = nextConfig;
