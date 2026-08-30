import path from "node:path";
import type { PhotoResolver } from "@/lib/report-pdf";
import { keyFromHref, readUpload } from "@/lib/storage";

/**
 * Turn stored photo URLs into bytes the PDF renderer can draw.
 *
 * Every image is read through the storage layer by its object key, from disk or
 * from the bucket, whichever holds it. Nothing is fetched over HTTP: the
 * renderer would happily fetch any URL it is handed, and these URLs arrive in
 * the database through an API body, so a fetch here would be an SSRF waiting to
 * be asked for. `keyFromHref` accepts only this app's own upload paths, and
 * anything else is dropped — a missing photo in a report beats a server that
 * can be pointed at an internal address.
 */

const FORMAT_BY_EXT: Record<string, "png" | "jpg"> = {
  ".png": "png",
  ".jpg": "jpg",
  ".jpeg": "jpg",
  ".webp": "png", // read as bytes; the renderer sniffs the real format
};

/**
 * Load every photo the report references, once, so the renderer never has to go
 * looking mid-render. Returns a resolver for `renderReportPdf`.
 */
export async function loadPhotos(urls: string[]): Promise<PhotoResolver> {
  const resolved = new Map<string, { data: Buffer; format: "png" | "jpg" }>();

  await Promise.all(
    Array.from(new Set(urls)).map(async (url) => {
      const key = keyFromHref(url);
      if (!key) return;
      const format = FORMAT_BY_EXT[path.extname(key).toLowerCase()];
      if (!format) return;
      const data = await readUpload(key).catch(() => null);
      if (data) resolved.set(url, { data, format });
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
