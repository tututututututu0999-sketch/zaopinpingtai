import { Client } from "minio";

let client: Client | undefined;
let bucketReady: Promise<void> | undefined;

function storageConfig() {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  if (!endpoint) throw new Error("S3_ENDPOINT 未配置");
  const url = new URL(endpoint);
  return {
    endPoint: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
    useSSL: url.protocol === "https:",
    accessKey: process.env.S3_ACCESS_KEY?.trim() ?? "",
    secretKey: process.env.S3_SECRET_KEY?.trim() ?? "",
  };
}

function bucketName() { return process.env.S3_BUCKET?.trim() || "visual-assets"; }

export function objectStore() {
  client ??= new Client(storageConfig());
  return client;
}

export async function ensureBucket() {
  bucketReady ??= (async () => {
    const store = objectStore(); const bucket = bucketName();
    if (!(await store.bucketExists(bucket))) await store.makeBucket(bucket);
  })();
  return bucketReady;
}

export async function putObject(key: string, content: Buffer, contentType: string) {
  await ensureBucket();
  await objectStore().putObject(bucketName(), key, content, content.length, { "Content-Type": contentType });
  return key;
}

export async function getObject(key: string) {
  await ensureBucket();
  const stream = await objectStore().getObject(bucketName(), key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function removeObject(key: string) {
  await ensureBucket();
  await objectStore().removeObject(bucketName(), key);
}

export async function objectStoreHealthy() { await ensureBucket(); return true; }
