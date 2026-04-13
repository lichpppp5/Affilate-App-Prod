import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";

import Busboy from "busboy";

import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { requirePermission } from "../rbac";
import {
  createPresignedUpload,
  deleteStoredObject,
  getStorageDriver,
  getStoredObject,
  isDirectUploadSupported,
  putStoredObject,
  sanitizeFilename,
  verifyStoredObject
} from "../storage";
import { ensureTenantProduct } from "./helpers";

interface AssetRow {
  id: string;
  tenant_id: string;
  product_id: string | null;
  kind: "image" | "audio" | "video";
  storage_key: string;
  mime_type: string;
  checksum: string;
  title: string;
  original_filename: string;
  size_bytes: string;
  storage_provider: string;
}

interface AssetInput {
  productId?: string;
  kind?: "image" | "audio" | "video";
  storageKey?: string;
  mimeType?: string;
  checksum?: string;
  title?: string;
  originalFilename?: string;
  sizeBytes?: number;
  storageProvider?: string;
}

export async function listAssets(session: AuthSession) {
  const denied = requirePermission(session, "assets:read");
  if (denied) {
    return denied;
  }

  const result = await query<AssetRow>(
    `
      select
        id,
        tenant_id,
        product_id,
        kind,
        storage_key,
        mime_type,
        checksum,
        title,
        original_filename,
        size_bytes::text,
        storage_provider
      from assets
      where tenant_id = $1
      order by created_at desc
    `,
    [session.tenantId]
  );

  return {
    statusCode: 200,
    payload: result.rows.map(mapAsset)
  };
}

export async function getAsset(session: AuthSession, id: string) {
  const denied = requirePermission(session, "assets:read");
  if (denied) {
    return denied;
  }

  const row = await getAssetRow(session, id);

  if (!row) {
    return notFound();
  }

  return {
    statusCode: 200,
    payload: mapAsset(row)
  };
}

export async function getAssetContent(session: AuthSession, id: string) {
  const row = await getAssetRow(session, id);

  if (!row) {
    return null;
  }

  const object = await getStoredObject(row.storage_key, row.mime_type);

  return {
    asset: mapAsset(row),
    content: object
  };
}

export async function createAsset(session: AuthSession, body: AssetInput) {
  const denied = requirePermission(session, "assets:write");
  if (denied) {
    return denied;
  }

  if (!body.kind || !body.storageKey || !body.mimeType || !body.checksum) {
    return invalid("kind, storageKey, mimeType, and checksum are required");
  }

  if (!(await ensureTenantProduct(session, body.productId))) {
    return invalid("Referenced product does not belong to tenant");
  }

  const result = await query<AssetRow>(
    `
      insert into assets (
        id,
        tenant_id,
        product_id,
        kind,
        storage_key,
        mime_type,
        checksum,
        title,
        original_filename,
        size_bytes,
        storage_provider
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      returning
        id,
        tenant_id,
        product_id,
        kind,
        storage_key,
        mime_type,
        checksum,
        title,
        original_filename,
        size_bytes::text,
        storage_provider
    `,
    [
      createId("asset"),
      session.tenantId,
      body.productId ?? null,
      body.kind,
      body.storageKey,
      body.mimeType,
      body.checksum,
      body.title ?? "",
      body.originalFilename ?? "",
      body.sizeBytes ?? 0,
      body.storageProvider ?? getStorageDriver()
    ]
  );

  const payload = mapAsset(result.rows[0]);
  void recordAudit({
    session,
    action: "asset.create",
    resourceType: "asset",
    resourceId: payload.id
  });

  return {
    statusCode: 201,
    payload
  };
}

export async function uploadAsset(session: AuthSession, request: IncomingMessage) {
  const denied = requirePermission(session, "assets:write");
  if (denied) {
    return denied;
  }

  const parsed = await parseMultipartUpload(request);

  if (!parsed.fileBody || !parsed.fileName || !parsed.mimeType) {
    return invalid("file is required");
  }

  if (!(await ensureTenantProduct(session, parsed.productId))) {
    return invalid("Referenced product does not belong to tenant");
  }

  const assetId = createId("asset");
  const checksum = createHash("sha256").update(parsed.fileBody).digest("hex");
  const fileName = sanitizeFilename(parsed.fileName || `${assetId}.bin`);
  const storageKey = `${session.tenantId}/assets/${assetId}/${fileName}`;
  const kind = parsed.kind ?? inferAssetKind(parsed.mimeType);

  const stored = await putStoredObject({
    key: storageKey,
    body: parsed.fileBody,
    contentType: parsed.mimeType
  });

  const result = await query<AssetRow>(
    `
      insert into assets (
        id,
        tenant_id,
        product_id,
        kind,
        storage_key,
        mime_type,
        checksum,
        title,
        original_filename,
        size_bytes,
        storage_provider
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      returning
        id,
        tenant_id,
        product_id,
        kind,
        storage_key,
        mime_type,
        checksum,
        title,
        original_filename,
        size_bytes::text,
        storage_provider
    `,
    [
      assetId,
      session.tenantId,
      parsed.productId ?? null,
      kind,
      stored.storageKey,
      parsed.mimeType,
      checksum,
      parsed.title ?? fileName,
      parsed.fileName,
      parsed.fileBody.length,
      stored.storageProvider
    ]
  );

  const payload = mapAsset(result.rows[0]);
  void recordAudit({
    session,
    action: "asset.upload",
    resourceType: "asset",
    resourceId: payload.id
  });

  return {
    statusCode: 201,
    payload
  };
}

export function getStorageConfig(session: AuthSession) {
  const denied = requirePermission(session, "assets:read");
  if (denied) {
    return denied;
  }

  return {
    statusCode: 200,
    payload: {
      driver: getStorageDriver(),
      directUploadEnabled: isDirectUploadSupported()
    }
  };
}

export async function createAssetPresignedUpload(
  session: AuthSession,
  body: {
    fileName?: string;
    mimeType?: string;
  }
) {
  const denied = requirePermission(session, "assets:write");
  if (denied) {
    return denied;
  }

  if (!body.fileName || !body.mimeType) {
    return invalid("fileName and mimeType are required");
  }

  if (!isDirectUploadSupported()) {
    return invalid("Direct upload is only available when storage driver is s3");
  }

  const assetId = createId("asset");
  const fileName = sanitizeFilename(body.fileName || `${assetId}.bin`);
  const storageKey = `${session.tenantId}/assets/${assetId}/${fileName}`;
  const signed = await createPresignedUpload({
    key: storageKey,
    contentType: body.mimeType
  });

  return {
    statusCode: 200,
    payload: {
      assetId,
      fileName,
      uploadUrl: signed.uploadUrl,
      method: signed.method,
      storageKey
    }
  };
}

export async function completeAssetUpload(
  session: AuthSession,
  body: AssetInput & { assetId?: string }
) {
  const denied = requirePermission(session, "assets:write");
  if (denied) {
    return denied;
  }

  if (
    !body.assetId ||
    !body.kind ||
    !body.storageKey ||
    !body.mimeType ||
    !body.checksum ||
    !body.originalFilename
  ) {
    return invalid(
      "assetId, kind, storageKey, mimeType, checksum, and originalFilename are required"
    );
  }

  if (!(await ensureTenantProduct(session, body.productId))) {
    return invalid("Referenced product does not belong to tenant");
  }

  await verifyStoredObject(body.storageKey);

  return createAsset(session, {
    ...body,
    storageProvider: "s3"
  });
}

export async function updateAsset(
  session: AuthSession,
  id: string,
  body: AssetInput
) {
  const denied = requirePermission(session, "assets:write");
  if (denied) {
    return denied;
  }

  const current = await getAssetRow(session, id);

  if (!current) {
    return notFound();
  }

  const nextProductId =
    body.productId === undefined ? current.product_id ?? undefined : body.productId;

  if (!(await ensureTenantProduct(session, nextProductId))) {
    return invalid("Referenced product does not belong to tenant");
  }

  const result = await query<AssetRow>(
    `
      update assets
      set product_id = $3,
          title = $4,
          updated_at = now()
      where tenant_id = $1 and id = $2
      returning
        id,
        tenant_id,
        product_id,
        kind,
        storage_key,
        mime_type,
        checksum,
        title,
        original_filename,
        size_bytes::text,
        storage_provider
    `,
    [session.tenantId, id, nextProductId ?? null, body.title ?? current.title]
  );

  void recordAudit({
    session,
    action: "asset.update",
    resourceType: "asset",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: mapAsset(result.rows[0])
  };
}

export async function deleteAsset(session: AuthSession, id: string) {
  const denied = requirePermission(session, "assets:delete");
  if (denied) {
    return denied;
  }

  const current = await getAssetRow(session, id);

  if (!current) {
    return notFound();
  }

  await query<{ id: string }>(
    `
      delete from assets
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  try {
    await deleteStoredObject(current.storage_key);
  } catch {
    // Asset metadata is already removed; storage cleanup is best-effort.
  }

  void recordAudit({
    session,
    action: "asset.delete",
    resourceType: "asset",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: { deleted: true, id }
  };
}

async function getAssetRow(session: AuthSession, id: string) {
  const result = await query<AssetRow>(
    `
      select
        id,
        tenant_id,
        product_id,
        kind,
        storage_key,
        mime_type,
        checksum,
        title,
        original_filename,
        size_bytes::text,
        storage_provider
      from assets
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  return result.rows[0] ?? null;
}

function parseMultipartUpload(request: IncomingMessage) {
  return new Promise<{
    productId?: string;
    title?: string;
    kind?: "image" | "audio" | "video";
    fileBody?: Buffer;
    fileName?: string;
    mimeType?: string;
  }>((resolvePromise, rejectPromise) => {
    const parser = Busboy({
      headers: request.headers
    });

    const fields: {
      productId?: string;
      title?: string;
      kind?: "image" | "audio" | "video";
      fileBody?: Buffer;
      fileName?: string;
      mimeType?: string;
    } = {};

    parser.on("field", (name: string, value: string) => {
      if (name === "productId") {
        fields.productId = value || undefined;
      } else if (name === "title") {
        fields.title = value || undefined;
      } else if (name === "kind") {
        fields.kind = value as "image" | "audio" | "video";
      }
    });

    parser.on(
      "file",
      (
        _name: string,
        file: NodeJS.ReadableStream,
        info: { filename: string; mimeType: string }
      ) => {
      const chunks: Buffer[] = [];
      fields.fileName = info.filename;
      fields.mimeType = info.mimeType;

      file.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      file.on("end", () => {
        fields.fileBody = Buffer.concat(chunks);
      });
      }
    );

    parser.on("error", rejectPromise);
    parser.on("finish", () => resolvePromise(fields));
    request.pipe(parser);
  });
}

function inferAssetKind(mimeType: string) {
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  return "image";
}

function invalid(message: string) {
  return {
    statusCode: 400,
    payload: { message }
  };
}

function notFound() {
  return {
    statusCode: 404,
    payload: {
      message: "Asset not found"
    }
  };
}

function mapAsset(row: AssetRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id ?? undefined,
    kind: row.kind,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    checksum: row.checksum,
    title: row.title,
    originalFilename: row.original_filename,
    sizeBytes: Number(row.size_bytes),
    storageProvider: row.storage_provider
  };
}
