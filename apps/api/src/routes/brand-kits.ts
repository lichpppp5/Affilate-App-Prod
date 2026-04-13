import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { requirePermission } from "../rbac";

interface BrandKitRow {
  id: string;
  tenant_id: string;
  name: string;
  primary_color: string;
  font_family: string;
  logo_asset_id: string;
}

interface BrandKitInput {
  name?: string;
  primaryColor?: string;
  fontFamily?: string;
  logoAssetId?: string;
}

export async function listBrandKits(session: AuthSession) {
  const denied = requirePermission(session, "projects:read");
  if (denied) {
    return denied;
  }

  const result = await query<BrandKitRow>(
    `
      select id, tenant_id, name, primary_color, font_family, logo_asset_id
      from brand_kits
      where tenant_id = $1
      order by name asc
    `,
    [session.tenantId]
  );

  return {
    statusCode: 200,
    payload: result.rows.map(mapRow)
  };
}

export async function getBrandKit(session: AuthSession, id: string) {
  const denied = requirePermission(session, "projects:read");
  if (denied) {
    return denied;
  }

  const result = await query<BrandKitRow>(
    `
      select id, tenant_id, name, primary_color, font_family, logo_asset_id
      from brand_kits
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (result.rows.length === 0) {
    return notFound();
  }

  return {
    statusCode: 200,
    payload: mapRow(result.rows[0])
  };
}

export async function createBrandKit(session: AuthSession, body: BrandKitInput) {
  const denied = requirePermission(session, "projects:write");
  if (denied) {
    return denied;
  }

  if (!body.name?.trim()) {
    return invalid("name is required");
  }

  const id = createId("brand");
  const result = await query<BrandKitRow>(
    `
      insert into brand_kits (
        id,
        tenant_id,
        name,
        primary_color,
        font_family,
        logo_asset_id
      )
      values ($1, $2, $3, $4, $5, $6)
      returning id, tenant_id, name, primary_color, font_family, logo_asset_id
    `,
    [
      id,
      session.tenantId,
      body.name.trim(),
      body.primaryColor?.trim() || "#1d4ed8",
      body.fontFamily?.trim() || "Inter",
      body.logoAssetId?.trim() || ""
    ]
  );

  const payload = mapRow(result.rows[0]);
  void recordAudit({
    session,
    action: "brand_kit.create",
    resourceType: "brand_kit",
    resourceId: payload.id
  });

  return {
    statusCode: 201,
    payload
  };
}

export async function updateBrandKit(session: AuthSession, id: string, body: BrandKitInput) {
  const denied = requirePermission(session, "projects:write");
  if (denied) {
    return denied;
  }

  const existing = await query<BrandKitRow>(
    `
      select id, tenant_id, name, primary_color, font_family, logo_asset_id
      from brand_kits
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (existing.rows.length === 0) {
    return notFound();
  }

  const current = existing.rows[0];
  const result = await query<BrandKitRow>(
    `
      update brand_kits
      set name = $3,
          primary_color = $4,
          font_family = $5,
          logo_asset_id = $6,
          updated_at = now()
      where tenant_id = $1 and id = $2
      returning id, tenant_id, name, primary_color, font_family, logo_asset_id
    `,
    [
      session.tenantId,
      id,
      body.name?.trim() || current.name,
      body.primaryColor?.trim() ?? current.primary_color,
      body.fontFamily?.trim() ?? current.font_family,
      body.logoAssetId?.trim() ?? current.logo_asset_id
    ]
  );

  void recordAudit({
    session,
    action: "brand_kit.update",
    resourceType: "brand_kit",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: mapRow(result.rows[0])
  };
}

export async function deleteBrandKit(session: AuthSession, id: string) {
  const denied = requirePermission(session, "projects:delete");
  if (denied) {
    return denied;
  }

  const result = await query<{ id: string }>(
    `
      delete from brand_kits
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
    action: "brand_kit.delete",
    resourceType: "brand_kit",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: { deleted: true, id }
  };
}

function mapRow(row: BrandKitRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    primaryColor: row.primary_color,
    fontFamily: row.font_family,
    logoAssetId: row.logo_asset_id || undefined
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
    payload: { message: "Brand kit not found" }
  };
}
