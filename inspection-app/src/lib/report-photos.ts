import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PhotoResolver } from "@/lib/report-pdf";

/**
 * Turn stored photo URLs into something the PDF renderer can draw.
 *
 * Local uploads are read straight off disk. Remote ones are only allowed
 * through if they sit under the configured object store: the renderer fetches
 * whatever URL it is handed, and these URLs reach the database through an API
 * body, so passing them through unchecked would let a caller make the server
 * fetch an arbitrary address. Anything unrecognised is dropped — a missing
 * photo in a report is better than an SSRF.
 */

const EXT_FORMAT: Record<string, "png" | "jpg"> = {
  ".png": "png",
  ".jpg": "jpg",
  ".jpeg": "jpg",
  ".webp": "png", // read as bytes; the renderer sniffs the real format
};

function allowedRemotePrefixes(): string[] {
  const out: string[] = [];
  const base = process.env.S3_PUBLIC_URL_BASE;
  if (base) out.push(base.replace(/\/$/, "") + "/");
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint && bucket) out.push(`${endpoint.replace(/\/$/, "")}/${bucket}/`);
  if (bucket && region) out.push(`https://${bucket}.s3.${region}.amazonaws.com/`);
  return out;
}

/**
 * Load every photo the report references, once, so the renderer never has to go
 * looking mid-render. Returns a resolver for `renderReportPdf`.
 */
export async function loadPhotos(urls: string[]): Promise<PhotoResolver> {
  const remote = allowedRemotePrefixes();
  const resolved = new Map<string, { data: Buffer; format: "png" | "jpg" } | string>();

  await Promise.all(
    Array.from(new Set(urls)).map(async (url) => {
      if (url.startsWith("/uploads/")) {
        // Normalise before use: a stored path is data, and `..` in it must not
        // reach outside the uploads directory.
        const root = path.join(process.cwd(), "public", "uploads");
        const full = path.normalize(path.join(root, url.slice("/uploads/".length)));
        if (!full.startsWith(root + path.sep)) return;
        const format = EXT_FORMAT[path.extname(full).toLowerCase()];
        if (!format) return;
        const data = await readFile(full).catch(() => null);
        if (data) resolved.set(url, { data, format });
        return;
      }
      if (remote.some((p) => url.startsWith(p))) resolved.set(url, url);
    })
  );

  return (url) => resolved.get(url) ?? null;
}

/** Every photo URL in a report, including the signature. */
export function photoUrls(report: {
  groups: { rows: { entries: { photos: string[] }[] }[] }[];
  debrief: { signatureUrl: string | null };
}): string[] {
  const urls = report.groups.flatMap((g) => g.rows.flatMap((r) => r.entries.flatMap((e) => e.photos)));
  if (report.debrief.signatureUrl) urls.push(report.debrief.signatureUrl);
  return urls;
}
