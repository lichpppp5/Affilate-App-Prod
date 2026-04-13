import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { requirePermission } from "../rbac";

interface ProductRow {
  id: string;
  tenant_id: string;
  sku: string;
  title: string;
  description: string;
  price: string;
  channels: string[];
  affiliate_source_url: string;
  affiliate_program: string;
}

interface ProductInput {
  sku?: string;
  title?: string;
  description?: string;
  price?: number;
  channels?: string[];
  affiliateSourceUrl?: string;
  affiliateProgram?: string;
}

export async function listProducts(session: AuthSession) {
  const denied = requirePermission(session, "products:read");
  if (denied) {
    return denied;
  }

  const result = await query<ProductRow>(
    `
      select
        id,
        tenant_id,
        sku,
        title,
        description,
        price::text,
        channels,
        affiliate_source_url,
        affiliate_program
      from products
      where tenant_id = $1
      order by created_at desc
    `,
    [session.tenantId]
  );

  return {
    statusCode: 200,
    payload: result.rows.map(mapProduct)
  };
}

export async function getProduct(session: AuthSession, id: string) {
  const denied = requirePermission(session, "products:read");
  if (denied) {
    return denied;
  }

  const result = await query<ProductRow>(
    `
      select
        id,
        tenant_id,
        sku,
        title,
        description,
        price::text,
        channels,
        affiliate_source_url,
        affiliate_program
      from products
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (result.rows.length === 0) {
    return notFound();
  }

  return {
    statusCode: 200,
    payload: mapProduct(result.rows[0])
  };
}

export async function createProduct(
  session: AuthSession,
  body: ProductInput
) {
  const denied = requirePermission(session, "products:write");
  if (denied) {
    return denied;
  }

  if (!body.sku || !body.title) {
    return invalid("sku and title are required");
  }

  const result = await query<ProductRow>(
    `
      insert into products (
        id,
        tenant_id,
        sku,
        title,
        description,
        price,
        channels,
        affiliate_source_url,
        affiliate_program
      )
      values ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9)
      returning
        id,
        tenant_id,
        sku,
        title,
        description,
        price::text,
        channels,
        affiliate_source_url,
        affiliate_program
    `,
    [
      createId("prod"),
      session.tenantId,
      body.sku,
      body.title,
      body.description ?? "",
      body.price ?? 0,
      body.channels ?? [],
      body.affiliateSourceUrl ?? "",
      body.affiliateProgram ?? ""
    ]
  );

  const row = mapProduct(result.rows[0]);
  void recordAudit({
    session,
    action: "product.create",
    resourceType: "product",
    resourceId: row.id,
    metadata: { sku: row.sku }
  });

  return {
    statusCode: 201,
    payload: row
  };
}

export async function updateProduct(
  session: AuthSession,
  id: string,
  body: ProductInput
) {
  const denied = requirePermission(session, "products:write");
  if (denied) {
    return denied;
  }

  const existing = await query<ProductRow>(
    `
      select
        id,
        tenant_id,
        sku,
        title,
        description,
        price::text,
        channels,
        affiliate_source_url,
        affiliate_program
      from products
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (existing.rows.length === 0) {
    return notFound();
  }

  const current = existing.rows[0];
  const result = await query<ProductRow>(
    `
      update products
      set sku = $3,
          title = $4,
          description = $5,
          price = $6,
          channels = $7::text[],
          affiliate_source_url = $8,
          affiliate_program = $9,
          updated_at = now()
      where tenant_id = $1 and id = $2
      returning
        id,
        tenant_id,
        sku,
        title,
        description,
        price::text,
        channels,
        affiliate_source_url,
        affiliate_program
    `,
    [
      session.tenantId,
      id,
      body.sku ?? current.sku,
      body.title ?? current.title,
      body.description ?? current.description,
      body.price ?? Number(current.price),
      body.channels ?? current.channels,
      body.affiliateSourceUrl ?? current.affiliate_source_url,
      body.affiliateProgram ?? current.affiliate_program
    ]
  );

  const row = mapProduct(result.rows[0]);
  void recordAudit({
    session,
    action: "product.update",
    resourceType: "product",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: row
  };
}

export async function deleteProduct(session: AuthSession, id: string) {
  const denied = requirePermission(session, "products:delete");
  if (denied) {
    return denied;
  }

  const result = await query<{ id: string }>(
    `
      delete from products
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
    action: "product.delete",
    resourceType: "product",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: {
      deleted: true,
      id
    }
  };
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
      message: "Product not found"
    }
  };
}

function mapProduct(row: ProductRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sku: row.sku,
    title: row.title,
    description: row.description,
    price: Number(row.price),
    channels: row.channels ?? [],
    affiliateSourceUrl: row.affiliate_source_url ?? "",
    affiliateProgram: row.affiliate_program ?? ""
  };
}
