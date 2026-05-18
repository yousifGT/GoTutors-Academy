import crypto from "node:crypto";

const EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
};

export async function saveUploadedVideo(file: File): Promise<string> {
  const ext = EXT_BY_TYPE[file.type] ?? "bin";
  const id = crypto.randomBytes(12).toString("hex");
  const filename = `${id}.${ext}`;

  if (process.env.UPLOAD_BACKEND === "s3") {
    return saveToS3(file, filename);
  }
  return saveToLocalDisk(file, filename);
}

async function saveToLocalDisk(file: File, filename: string): Promise<string> {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "public", "uploads", "videos");
  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buf);
  return `/uploads/videos/${filename}`;
}

/**
 * S3-compatible upload (AWS S3, Cloudflare R2, MinIO, etc).
 *
 * Requires the optional `@aws-sdk/client-s3` dependency at runtime. We don't ship it
 * by default to keep the install lean — add it with `npm i @aws-sdk/client-s3` when
 * you enable UPLOAD_BACKEND=s3.
 *
 * Env:
 *   S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 *   S3_ENDPOINT          (optional, for non-AWS providers)
 *   S3_PUBLIC_URL_BASE   (optional CDN/public base; defaults to AWS virtual-hosted URL)
 */
async function saveToS3(file: File, filename: string): Promise<string> {
  const bucket = mustEnv("S3_BUCKET");
  const region = mustEnv("S3_REGION");
  const accessKeyId = mustEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = mustEnv("S3_SECRET_ACCESS_KEY");
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const publicBase = process.env.S3_PUBLIC_URL_BASE;

  const key = `videos/${filename}`;
  // @aws-sdk/client-s3 is an optional peer dep; we import it dynamically so the
  // app builds and runs without it when UPLOAD_BACKEND is unset (the default).
  const mod = await import(/* webpackIgnore: true */ "@aws-sdk/client-s3" as any).catch(() => null);
  if (!mod) {
    throw new Error(
      "UPLOAD_BACKEND=s3 but @aws-sdk/client-s3 is not installed. Run: npm i @aws-sdk/client-s3"
    );
  }
  const { S3Client, PutObjectCommand } = mod;
  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: !!endpoint,
  });
  const body = new Uint8Array(await file.arrayBuffer());
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: file.type,
      CacheControl: "public, max-age=31536000, immutable",
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
