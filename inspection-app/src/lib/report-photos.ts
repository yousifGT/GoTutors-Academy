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
export interface LoadedPhotos {
  resolve: PhotoResolver;
  /** how many distinct images the report referred to */
  requested: number;
  /** the ones that could not be drawn, and why */
  missing: { url: string; reason: "unreadable path" | "unsupported format" | "not in the store" }[];
}

export async function loadPhotos(urls: string[]): Promise<LoadedPhotos> {
  const resolved = new Map<string, { data: Buffer; format: "png" | "jpg" }>();
  const missing: LoadedPhotos["missing"] = [];
  const wanted = Array.from(new Set(urls));

  await Promise.all(
    wanted.map(async (url) => {
      const key = keyFromHref(url);
      if (!key) return void missing.push({ url, reason: "unreadable path" });
      const format = FORMAT_BY_EXT[path.extname(key).toLowerCase()];
      if (!format) return void missing.push({ url, reason: "unsupported format" });
      const data = await readUpload(key).catch(() => null);
      if (data) resolved.set(url, { data, format });
      else missing.push({ url, reason: "not in the store" });
    })
  );

  // Said out loud. A photograph that could not be read used to disappear from
  // the report in silence: the route still returned 200, the audit row still
  // recorded that a complete report had been downloaded, and the only sign was
  // a gap on a page nobody was comparing against anything. An object store
  // returning AccessDenied for an hour would have produced a stack of formal
  // reports missing their evidence, with nothing anywhere to say so.
  if (missing.length) {
    console.error("report photos could not be drawn", {
      requested: wanted.length,
      missing: missing.length,
      reasons: missing.map((m) => m.reason),
    });
  }

  return { resolve: (url) => resolved.get(url) ?? null, requested: wanted.length, missing };
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
