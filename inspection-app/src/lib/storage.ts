import crypto from "node:crypto";
import path from "node:path";

/**
 * Where inspection photos and debrief signatures are kept.
 *
 * Local disk by default so the app runs with nothing else installed. Set
 * UPLOAD_BACKEND=s3 for anything real: a container filesystem does not survive
 * a redeploy, two instances behind a load balancer cannot see each other's
 * files, and these are photographs taken inside a children's setting — they
 * need the retention controls and access policy of a proper object store, in a
 * UK/EU region. See docs/BACKEND-HANDOFF.md §5.
 *
 * Both backends store the same thing: an object under a key like
 * `photos/<32 hex>.jpg`. What is written into the database is never the storage
 * location but an app URL, `/api/uploads/photos/<32 hex>.jpg`, which is served
 * by an authenticated route. That keeps the bucket private, keeps the stored
 * value stable if the backend changes, and means a photo cannot be read by
 * anyone who merely knows its URL.
 */

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

const TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

export const ACCEPTED_TYPES = Object.keys(EXT_BY_TYPE);
export const MAX_BYTES = 12 * 1024 * 1024; // a phone photo, not a video

export type UploadKind = "photo" | "signature";
export const UPLOAD_KINDS: UploadKind[] = ["photo", "signature"];

/** The one shape a stored key may take. Anything else is not ours. */
const KEY_RE = /^(photos|signatures)\/[a-f0-9]{32}\.(jpg|png|webp|heic)$/;

/**
 * Where uploads served from disk live.
 *
 * NOT under `public/`. Next serves everything it finds there as a static file,
 * with no session and no scope check — so while these sat in `public/uploads`,
 * every photograph was readable by anyone who had the URL, straight past the
 * authenticated route built to decide who may see it. A random filename was the
 * only thing in the way, which is exactly the "hard to guess is not an access
 * policy" this app says it does not rely on.
 *
 * Legacy rows still say `/uploads/...`; a rewrite in next.config.js sends that
 * path through the authenticated route, so those images keep working and are
 * now checked too.
 */
export const LOCAL_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), "var", "uploads");

export function isAcceptedType(type: string): boolean {
  return type in EXT_BY_TYPE;
}

export function usingS3(): boolean {
  return process.env.UPLOAD_BACKEND === "s3";
}

export function backendName(): "local" | "s3" {
  return usingS3() ? "s3" : "local";
}

export function contentTypeForKey(key: string): string {
  return TYPE_BY_EXT[path.extname(key).slice(1).toLowerCase()] ?? "application/octet-stream";
}

/** The URL stored in the database for an object key. */
export function hrefForKey(key: string): string {
  return `/api/uploads/${key}`;
}

/**
 * The object key behind a stored URL, or null if this is not one of ours.
 *
 * Accepts the legacy `/uploads/...` form as well: rows written before uploads
 * were served through an authenticated route still point at the static path,
 * and those photos have to keep appearing in their reports.
 */
export function keyFromHref(href: string): string | null {
  const rest = href.startsWith("/api/uploads/")
    ? href.slice("/api/uploads/".length)
    : href.startsWith("/uploads/")
      ? href.slice("/uploads/".length)
      : null;
  if (rest === null) return null;
  // Tested against the whole-key pattern, so `..` and any other traversal is
  // rejected here rather than relied on being caught further down.
  return KEY_RE.test(rest) ? rest : null;
}

/** Both URL forms a given key may be stored as, for looking a row up by URL. */
export function hrefsForKey(key: string): string[] {
  return [`/api/uploads/${key}`, `/uploads/${key}`];
}

export interface SavedUpload {
  /** what goes in the database */
  href: string;
  key: string;
  contentType: string;
  bytes: number;
  backend: "local" | "s3";
}

export async function saveUpload(file: File, kind: UploadKind): Promise<SavedUpload> {
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) throw new Error(`Unsupported file type: ${file.type}`);
  // Random name: the original filename is attacker-controlled and can carry a
  // path or a second extension.
  const key = `${kind}s/${crypto.randomBytes(16).toString("hex")}.${ext}`;
  const body = Buffer.from(await file.arrayBuffer());

  if (usingS3()) await putToS3(key, body, file.type);
  else await putToDisk(key, body);

  return { href: hrefForKey(key), key, contentType: file.type, bytes: body.length, backend: backendName() };
}

/**
 * Read an object back.
 *
 * When the store is S3 but the object is not there, disk is tried as well: an
 * app switched over to S3 still has to serve everything photographed before the
 * switch, and those files are on the volume, not in the bucket.
 */
export async function readUpload(key: string): Promise<Buffer | null> {
  if (!KEY_RE.test(key)) return null;
  if (usingS3()) {
    const fromS3 = await getFromS3(key);
    if (fromS3) return fromS3;
  }
  return readFromDisk(key);
}

/**
 * Open an object for streaming, so a photo is never held in this process in
 * full on its way to a browser.
 *
 * The bytes are proxied rather than handed over as a presigned URL. A redirect
 * would save this app the bandwidth, but it puts a bucket address in the page —
 * which the app's own content-security policy then has to be widened to allow,
 * and which is a working link to a photograph for as long as the signature
 * lasts, to anyone it is forwarded to. At the volume one inspection produces,
 * that is not a trade worth making.
 */
export async function openUpload(key: string): Promise<ReadableStream<Uint8Array> | null> {
  if (!KEY_RE.test(key)) return null;
  if (usingS3()) {
    const fromS3 = await (await s3()).open(key);
    if (fromS3) return fromS3;
  }
  return openFromDisk(key);
}

async function putToDisk(key: string, body: Buffer): Promise<void> {
  const { promises: fs } = await import("node:fs");
  const full = path.join(LOCAL_ROOT, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
}

async function readFromDisk(key: string): Promise<Buffer | null> {
  const { promises: fs } = await import("node:fs");
  return fs.readFile(path.join(LOCAL_ROOT, key)).catch(() => null);
}

async function openFromDisk(key: string): Promise<ReadableStream<Uint8Array> | null> {
  const data = await readFromDisk(key);
  if (!data) return null;
  // Read whole rather than piped: an upload is capped at 12MB, and bridging a
  // Node stream to a web one goes through `node:stream`, which does not survive
  // the bundler here — `Readable.toWeb` came back undefined at run time and
  // turned every image on the local backend into a 500.
  return new Response(new Uint8Array(data)).body;
}

export async function deleteUpload(key: string, backend: "local" | "s3"): Promise<void> {
  if (!KEY_RE.test(key)) return;
  if (backend === "s3") {
    await deleteFromS3(key);
    return;
  }
  const { promises: fs } = await import("node:fs");
  await fs.unlink(path.join(LOCAL_ROOT, key)).catch(() => undefined);
}

/*
 * S3 is loaded lazily. The SDK is a dependency so a deploy cannot forget it,
 * but an install running on local disk should not pay to load it on boot.
 */

async function s3() {
  return (await import("@/lib/s3")).default;
}

async function putToS3(key: string, body: Buffer, contentType: string): Promise<void> {
  await (await s3()).put(key, body, contentType);
}

async function getFromS3(key: string): Promise<Buffer | null> {
  return (await s3()).get(key);
}

async function deleteFromS3(key: string): Promise<void> {
  await (await s3()).remove(key);
}
