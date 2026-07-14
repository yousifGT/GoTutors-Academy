/** @type {import('next').NextConfig} */
// Dev needs 'unsafe-eval' for React Fast Refresh / HMR; production does not.
const isDev = process.env.NODE_ENV !== "production";
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // CSP allows inline styles (Tailwind/next-themes), self scripts, embeds for YT/Vimeo/Loom,
  // and uploaded media. Adjust the connect/media origins for your CDN.
  // NOTE: 'unsafe-inline' for scripts remains for now — removing it needs a
  // per-request nonce + 'strict-dynamic' and browser QA of the video embeds
  // (the player injects the YouTube IFrame API script at runtime). The residual
  // XSS risk is low: the app has no dangerouslySetInnerHTML/eval sinks.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.youtube.com https://player.vimeo.com https://www.loom.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "frame-src https://www.youtube.com https://player.vimeo.com https://www.loom.com",
      "media-src 'self' blob: https:",
      "connect-src 'self' https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
module.exports = nextConfig;
