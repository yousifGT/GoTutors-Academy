import crypto from "node:crypto";

/**
 * Where inspection photos and debrief signatures are kept.
 *
 * Local disk by default so the app runs with nothing else installed. Set
 * UPLOAD_BACKEND=s3 for anything real: these are photographs taken inside a
 * children's setting, and they need the retention controls and access policy of
 * a proper object store, in a UK/EU region. See docs/BACKEND-HANDOFF.md §5.
 */

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export const ACCEPTED_TYPES = Object.keys(EXT_BY_TYPE);
export const MAX_BYTES = 12 * 1024 * 1024; // a phone photo, not a video

export type UploadKind = "photo" | "signature";

export function isAcceptedType(type: string): boolean {
  return type in EXT_BY_TYPE;
}

export async function saveUpload(file: File, kind: UploadKind): Promise<string> {
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) throw new Error(`Unsupported file type: ${file.type}`);
  // Random name: the original filename is attacker-controlled and can carry a
  // path or a second extension.
  const filename = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  const key = `${kind}s/${filename}`;

  if (process.env.UPLOAD_BACKEND === "s3") return saveToS3(file, key);
  return saveToLocalDisk(file, key);
}

async function saveToLocalDisk(file: File, key: string): Promise<string> {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "public", "uploads", path.dirname(key));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(process.cwd(), "public", "uploads", key), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${key}`;
}

/**
 * S3-compatible upload (AWS S3, Cloudflare R2, MinIO).
 *
 * `@aws-sdk/client-s3` is an optional dependency, imported only when this
 * backend is switched on, so the default install stays small.
 *
 * Env: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
 *      S3_ENDPOINT (non-AWS), S3_PUBLIC_URL_BASE (CDN base)
 */
async function saveToS3(file: File, key: string): Promise<string> {
  const bucket = mustEnv("S3_BUCKET");
  const region = mustEnv("S3_REGION");
  const accessKeyId = mustEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = mustEnv("S3_SECRET_ACCESS_KEY");
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const publicBase = process.env.S3_PUBLIC_URL_BASE;

  // The specifier is held in a variable so TypeScript does not try to resolve
  // it: the package is optional, and must not be a compile-time dependency of a
  // build that never switches this backend on.
  const pkg = "@aws-sdk/client-s3";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import(/* webpackIgnore: true */ pkg).catch(() => null);
  if (!mod) {
    throw new Error("UPLOAD_BACKEND=s3 but @aws-sdk/client-s3 is not installed. Run: npm i @aws-sdk/client-s3");
  }
  const { S3Client, PutObjectCommand } = mod;
  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: !!endpoint,
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new Uint8Array(await file.arrayBuffer()),
      ContentType: file.type,
      CacheControl: "private, max-age=31536000, immutable",
    })
  );

  if (publicBase) return `${publicBase.replace(/\/$/, "")}/${key}`;
  if (endpoint) return `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}
