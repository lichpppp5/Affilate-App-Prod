import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { requirePermission } from "../rbac";
import { ensureTenantProduct } from "./helpers";

type Channel = "tiktok" | "shopee" | "facebook";

interface MappingRow {
  id: string;
  tenant_id: string;
  product_id: string;
  channel: string;
  external_product_id: string;
  metadata_json: string;
}

interface MappingInput {
  productId?: string;
  channel?: string;
  externalProductId?: string;
  metadataJson?: Record<string, unknown>;
}

export async function listProductChannelMappings(
  session: AuthSession,
  productId?: string | null
) {
  const denied = requirePermission(session, "publish:read");
  if (denied) {
    return denied;
  }

  const result = productId
    ? await query<MappingRow>(
        `
          select id, tenant_id, product_id, channel, external_product_id, metadata_json
          from product_channel_mappings
          where tenant_id = $1 and product_id = $2
          order by channel asc
        `,
        [session.tenantId, productId]
      )
    : await query<MappingRow>(
        `
          select id, tenant_id, product_id, channel, external_product_id, metadata_json
          from product_channel_mappings
          where tenant_id = $1
          order by product_id asc, channel asc
        `,
        [session.tenantId]
      );

  return {
    statusCode: 200,
    payload: result.rows.map(mapRow)
  };
}

export async function createProductChannelMapping(
  session: AuthSession,
  body: MappingInput
) {
  const denied = requirePermission(session, "publish:write");
  if (denied) {
    return denied;
  }

  if (!body.productId || !isChannel(body.channel)) {
    return invalid("productId and channel (facebook|tiktok|shopee) are required");
  }

  if (!(await ensureTenantProduct(session, body.productId))) {
    return invalid("Referenced product does not belong to tenant");
  }

  const metadataJson = stringifyMetadata(body.metadataJson);
  const id = createId("pmap");

  try {
    const result = await query<MappingRow>(
      `
        insert into product_channel_mappings (
          id,
          tenant_id,
          product_id,
          channel,
          external_product_id,
          metadata_json
        )
        values ($1, $2, $3, $4, $5, $6::text)
        returning id, tenant_id, product_id, channel, external_product_id, metadata_json
      `,
      [
        id,
        session.tenantId,
        body.productId,
        body.channel,
        body.externalProductId?.trim() ?? "",
        metadataJson
      ]
    );

    const payload = mapRow(result.rows[0]);
    void recordAudit({
      session,
      action: "product_channel_mapping.create",
      resourceType: "product_channel_mapping",
      resourceId: payload.id
    });

    return {
      statusCode: 201,
      payload
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return invalid("A mapping for this product and channel already exists");
    }
    throw e;
  }
}

export async function updateProductChannelMapping(
  session: AuthSession,
  id: string,
  body: MappingInput
) {
  const denied = requirePermission(session, "publish:write");
  if (denied) {
    return denied;
  }

  const existing = await query<MappingRow>(
    `
      select id, tenant_id, product_id, channel, external_product_id, metadata_json
      from product_channel_mappings
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (existing.rows.length === 0) {
    return notFound();
  }

  const current = existing.rows[0];
  const nextProductId = body.productId ?? current.product_id;
  const nextChannel = body.channel ?? current.channel;

  if (!isChannel(nextChannel)) {
    return invalid("channel must be facebook, tiktok, or shopee");
  }

  if (!(await ensureTenantProduct(session, nextProductId))) {
    return invalid("Referenced product does not belong to tenant");
  }

  const nextMeta =
    body.metadataJson !== undefined
      ? stringifyMetadata(body.metadataJson)
      : current.metadata_json;

  try {
    const result = await query<MappingRow>(
      `
        update product_channel_mappings
        set product_id = $3,
            channel = $4,
            external_product_id = $5,
            metadata_json = $6::text,
            updated_at = now()
        where tenant_id = $1 and id = $2
        returning id, tenant_id, product_id, channel, external_product_id, metadata_json
      `,
      [
        session.tenantId,
        id,
        nextProductId,
        nextChannel,
        body.externalProductId?.trim() ?? current.external_product_id,
        nextMeta
      ]
    );

    void recordAudit({
      session,
      action: "product_channel_mapping.update",
      resourceType: "product_channel_mapping",
      resourceId: id
    });

    return {
      statusCode: 200,
      payload: mapRow(result.rows[0])
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return invalid("A mapping for this product and channel already exists");
    }
    throw e;
  }
}

export async function deleteProductChannelMapping(session: AuthSession, id: string) {
  const denied = requirePermission(session, "publish:write");
  if (denied) {
    return denied;
  }

  const result = await query<{ id: string }>(
    `
      delete from product_channel_mappings
      where tenant_id = $1 and id = $2
      returning id
    `,
    [session.tenantId, id]
  );

  if (result.rows.length === 0) {
    return notFound();
  }

  void recordAudit({
    session,
    action: "product_channel_mapping.delete",
    resourceType: "product_channel_mapping",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: { deleted: true, id }
  };
}

function isChannel(value: string | undefined): value is Channel {
  return value === "tiktok" || value === "shopee" || value === "facebook";
}

function stringifyMetadata(meta: Record<string, unknown> | undefined) {
  if (!meta) {
    return "{}";
  }
  try {
    return JSON.stringify(meta);
  } catch {
    return "{}";
  }
}

function mapRow(row: MappingRow) {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata_json || "{}") as Record<string, unknown>;
  } catch {
    metadata = {};
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id,
    channel: row.channel,
    externalProductId: row.external_product_id,
    metadataJson: metadata
  };
}

function invalid(message: string) {
  return {
    statusCode: 400 as const,
    payload: { message }
  };
}

function notFound() {
  return {
    statusCode: 404 as const,
    payload: { message: "Product channel mapping not found" }
  };
}
