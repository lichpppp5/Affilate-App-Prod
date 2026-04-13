import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type StorageDriver = "local" | "s3";

const storageDriver = (process.env.OBJECT_STORAGE_DRIVER ?? "local") as StorageDriver;
const localDir = resolve(
  process.cwd(),
  process.env.OBJECT_STORAGE_LOCAL_DIR ?? "./apps/api/object-storage"
);
const bucket = process.env.OBJECT_STORAGE_BUCKET ?? "appaffilate-assets";

const s3Client =
  storageDriver === "s3"
    ? new S3Client({
        region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
        endpoint: process.env.OBJECT_STORAGE_ENDPOINT || undefined,
        forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
        credentials:
          process.env.OBJECT_STORAGE_ACCESS_KEY_ID &&
          process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
                secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY
              }
            : undefined
      })
    : null;
let bucketEnsured = false;

export interface StoredObject {
  body: Buffer;
  contentType: string;
  contentLength: number;
}

export async function putStoredObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  if (storageDriver === "s3") {
    await ensureBucket();
    await s3Client!.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType
      })
    );

    return {
      storageKey: input.key,
      storageProvider: "s3"
    };
  }

  const targetPath = resolve(localDir, input.key);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, input.body);

  return {
    storageKey: input.key,
    storageProvider: "local"
  };
}

export async function createPresignedUpload(input: {
  key: string;
  contentType: string;
}) {
  if (storageDriver !== "s3") {
    throw new Error("Direct presigned upload is only available for s3 storage");
  }

  await ensureBucket();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.contentType
  });

  const uploadUrl = await getSignedUrl(s3Client!, command, {
    expiresIn: 15 * 60
  });

  return {
    uploadUrl,
    method: "PUT",
    storageKey: input.key,
    storageProvider: "s3"
  };
}

export async function getStoredObject(key: string, fallbackContentType: string) {
  if (storageDriver === "s3") {
    await ensureBucket();
    const result = await s3Client!.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );

    const bytes = Buffer.from(await result.Body!.transformToByteArray());
    return {
      body: bytes,
      contentType: result.ContentType ?? fallbackContentType,
      contentLength: bytes.length
    } satisfies StoredObject;
  }

  const filePath = resolve(localDir, key);
  const body = await readFile(filePath);

  return {
    body,
    contentType: fallbackContentType,
    contentLength: body.length
  } satisfies StoredObject;
}

export async function deleteStoredObject(key: string) {
  if (!key) {
    return;
  }

  if (storageDriver === "s3") {
    await ensureBucket();
    await s3Client!.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
    return;
  }

  await rm(resolve(localDir, key), {
    force: true
  });
}

export async function verifyStoredObject(key: string) {
  if (storageDriver === "s3") {
    await ensureBucket();
    await s3Client!.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
    return true;
  }

  return false;
}

export function getStorageDriver() {
  return storageDriver;
}

export function isDirectUploadSupported() {
  return storageDriver === "s3";
}

export function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

async function ensureBucket() {
  if (storageDriver !== "s3" || bucketEnsured) {
    return;
  }

  try {
    await s3Client!.send(
      new HeadBucketCommand({
        Bucket: bucket
      })
    );
  } catch {
    await s3Client!.send(
      new CreateBucketCommand({
        Bucket: bucket
      })
    );
  }

  bucketEnsured = true;
}
