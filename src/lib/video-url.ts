export type VideoProviderInput = "UPLOAD" | "YOUTUBE" | "VIMEO" | "LOOM";

const PROVIDER_HOSTS: Record<Exclude<VideoProviderInput, "UPLOAD">, (host: string) => boolean> = {
  YOUTUBE: (h) =>
    h === "youtu.be" || h === "youtube.com" || h.endsWith(".youtube.com") || h.endsWith(".youtube-nocookie.com"),
  VIMEO: (h) => h === "vimeo.com" || h.endsWith(".vimeo.com"),
  LOOM: (h) => h === "loom.com" || h.endsWith(".loom.com"),
};

/**
 * Validate a lesson video URL against its declared provider.
 *
 *  - UPLOAD: a local disk path (/uploads/...) or an https CDN/S3 URL.
 *  - YOUTUBE / VIMEO / LOOM: an https URL whose host belongs to that provider.
 *
 * This keeps attacker-controlled `javascript:` / `data:` URLs and arbitrary
 * off-provider hosts out of the <video>/<iframe> `src` the player renders, and
 * ties the stored URL to the CSP frame-src/media-src allow-list.
 */
export function isValidVideoUrl(provider: VideoProviderInput, url: string): boolean {
  if (provider === "UPLOAD") {
    if (url.startsWith("/")) return true;
    try {
      return new URL(url).protocol === "https:";
    } catch {
      return false;
    }
  }
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  return PROVIDER_HOSTS[provider](u.hostname.toLowerCase());
}
