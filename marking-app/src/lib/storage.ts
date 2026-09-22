import crypto from "node:crypto";

/**
 * Where photographed pages live.
 *
 * Local disk in development; S3 (or any S3-compatible bucket) in production.
 * The route that calls this refuses to save to local disk in production,
 * because a container filesystem is wiped by every deploy and a lost paper is
 * not recoverable inside the product — the test went home in a school bag.
 */

const IMAGE_EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function saveUploadedPaper(file: File): Promise<string> {
  const ext = IMAGE_EXT_BY_TYPE[file.type] ?? "bin";
  const filename = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
  return process.env.UPLOAD_BACKEND === "s3" ? saveToS3(file, filename) : saveToLocalDisk(file, filename);
}

/**
 * Read an uploaded page back, to send to the marking model.
 *
 * The URL is whatever `saveUploadedPaper` returned: a site-relative path on
 * local disk, or an absolute URL on S3. Both have to work, because a deployment
 * can switch backends while old submissions still point at the old shape.
 */
export async function readUpload(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not read upload ${url}: HTTP ${res.status}`);
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? contentTypeFromPath(url),
    };
  }

  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  // The path came from saveUploadedPaper, but it round-trips through a database
  // column, so normalise it back under public/uploads rather than trusting it.
  const safe = path.normalize(url).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.join(process.cwd(), "public", safe);
  const root = path.join(process.cwd(), "public", "uploads");
  if (!full.startsWith(root)) throw new Error(`Refusing to read outside the uploads directory: ${url}`);
  return { bytes: await fs.readFile(full), contentType: contentTypeFromPath(url) };
}

function contentTypeFromPath(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return Object.entries(IMAGE_EXT_BY_TYPE).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
}

async function saveToLocalDisk(file: File, filename: string): Promise<string> {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "public", "uploads", "papers");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return `/uploads/papers/${filename}`;
}

/**
 * S3-compatible upload (AWS S3, Cloudflare R2, MinIO…).
 *
 * `@aws-sdk/client-s3` is an optional dependency, imported dynamically so the
 * app builds and runs without it when UPLOAD_BACKEND is unset (the default).
 *
 * Env: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
 *      S3_ENDPOINT (optional), S3_PUBLIC_URL_BASE (optional CDN base).
 */
async function saveToS3(file: File, filename: string): Promise<string> {
  const bucket = mustEnv("S3_BUCKET");
  const region = mustEnv("S3_REGION");
  const accessKeyId = mustEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = mustEnv("S3_SECRET_ACCESS_KEY");
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const publicBase = process.env.S3_PUBLIC_URL_BASE;

  const key = `papers/${filename}`;
  const mod = await import(/* webpackIgnore: true */ "@aws-sdk/client-s3" as string).catch(() => null);
  if (!mod) throw new Error("UPLOAD_BACKEND=s3 but @aws-sdk/client-s3 is not installed. Run: npm i @aws-sdk/client-s3");

  const { S3Client, PutObjectCommand } = mod as {
    S3Client: new (config: unknown) => { send: (command: unknown) => Promise<unknown> };
    PutObjectCommand: new (input: unknown) => unknown;
  };
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
