import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
/**
 * The object store, when UPLOAD_BACKEND=s3.
 *
 * The bucket is expected to be **private**: nothing here makes an object
 * public, and reads go out as presigned URLs that expire. Photos taken inside a
 * children's setting must not be readable by anyone who has the address.
 *
 * Works against AWS S3, and against anything speaking its API (Cloudflare R2,
 * MinIO) via S3_ENDPOINT.
 *
 * Env:
 *   S3_BUCKET              required
 *   S3_REGION              required
 *   S3_ACCESS_KEY_ID       omit on AWS to use the task/instance role
 *   S3_SECRET_ACCESS_KEY   omit likewise
 *   S3_ENDPOINT            non-AWS store; switches on path-style addressing
 */

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
}

export function s3Config(): S3Config {
  return {
    bucket: mustEnv("S3_BUCKET"),
    region: mustEnv("S3_REGION"),
    endpoint: process.env.S3_ENDPOINT || undefined,
  };
}

/** Every setting the S3 backend needs, or the ones that are missing. */
export function missingConfig(): string[] {
  return ["S3_BUCKET", "S3_REGION"].filter((k) => !process.env[k]);
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  const cfg = s3Config();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    // A non-AWS endpoint is almost always path-style; virtual-host style needs
    // a wildcard certificate the operator probably does not have.
    forcePathStyle: !!cfg.endpoint,
    // With no keys in the environment the SDK's default chain runs, which on
    // ECS or EC2 finds the task or instance role. That is the right way to do
    // this on AWS: no long-lived secret to leak or rotate.
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  });
  return client;
}

async function put(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: s3Config().bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // The object never changes: the key contains 16 random bytes, and a
      // second upload of the same photo gets a new key.
      CacheControl: "private, max-age=31536000, immutable",
      ServerSideEncryption: "AES256",
    })
  );
}

/** The whole object, for the PDF renderer, which needs the bytes in hand. */
async function get(key: string): Promise<Buffer | null> {
  const body = await body_(key);
  if (!body?.transformToByteArray) return null;
  return Buffer.from(await body.transformToByteArray());
}

/** The object as a stream, for serving it on to a browser. */
async function open(key: string): Promise<ReadableStream<Uint8Array> | null> {
  const body = await body_(key);
  if (!body?.transformToWebStream) return null;
  return body.transformToWebStream();
}

interface S3Body {
  transformToByteArray?: () => Promise<Uint8Array>;
  transformToWebStream?: () => ReadableStream<Uint8Array>;
}

async function body_(key: string): Promise<S3Body | null> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: s3Config().bucket, Key: key }));
    return (res.Body as S3Body | undefined) ?? null;
  } catch (e) {
    // A key that is not there is an ordinary answer — a photo deleted, or a row
    // that outlived its object — not a fault of the store.
    if (isNotFound(e)) return null;
    throw e;
  }
}

async function remove(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: s3Config().bucket, Key: key })).catch((e) => {
    if (!isNotFound(e)) throw e;
  });
}

/** Can we reach the bucket with the credentials we have? For the health check. */
async function check(): Promise<void> {
  await s3().send(new HeadBucketCommand({ Bucket: s3Config().bucket }));
}

function isNotFound(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name;
  const status = (e as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
  return name === "NoSuchKey" || name === "NotFound" || status === 404;
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`UPLOAD_BACKEND=s3 but ${name} is not set`);
  return v;
}

/** Reset between tests; the client caches config read at first use. */
export function _resetClient(): void {
  client = null;
}

/** The whole store, as one object, so callers import it by name and not piecemeal. */
const store = { put, get, open, remove, check };
export default store;
