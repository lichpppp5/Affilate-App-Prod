import type { AuthSession } from "../auth";
import { hashPassword } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { requirePermission } from "../rbac";

type RoleName = "org_admin" | "content_manager" | "reviewer" | "operator" | "analyst";

interface TenantRow {
  id: string;
  name: string;
  timezone: string;
  created_at: string;
}

interface CreateTenantInput {
  id?: string;
  name?: string;
  timezone?: string;
  adminEmail?: string;
  adminDisplayName?: string;
  adminPassword?: string;
}

interface UpdateTenantInput {
  name?: string;
  timezone?: string;
}

export async function listTenants(session: AuthSession) {
  const denied = requirePermission(session, "tenants:read");
  if (denied) {
    return denied;
  }

  const result = await query<TenantRow>(
    `
      select id, name, timezone, created_at::text
      from tenants
      order by created_at desc
    `
  );

  return {
    statusCode: 200,
    payload: result.rows.map(mapTenant)
  };
}

export async function createTenant(session: AuthSession, body: CreateTenantInput) {
  const denied = requirePermission(session, "tenants:write");
  if (denied) {
    return denied;
  }

  const id = String(body.id ?? "")
    .trim()
    .replaceAll(" ", "_");
  const name = String(body.name ?? "").trim();
  const timezone = String(body.timezone ?? "Asia/Ho_Chi_Minh").trim();

  const adminEmail = String(body.adminEmail ?? "").trim().toLowerCase();
  const adminDisplayName = String(body.adminDisplayName ?? "").trim();
  const adminPassword = String(body.adminPassword ?? "").trim();

  if (!id) {
    return invalid("tenant id is required");
  }
  if (!name) {
    return invalid("tenant name is required");
  }
  if (!adminEmail || !adminEmail.includes("@")) {
    return invalid("adminEmail is required");
  }
  if (!adminDisplayName) {
    return invalid("adminDisplayName is required");
  }
  if (adminPassword.length < 6) {
    return invalid("adminPassword must be at least 6 characters");
  }

  // Create tenant
  try {
    await query(
      `
        insert into tenants (id, name, timezone)
        values ($1, $2, $3)
      `,
      [id, name, timezone]
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
      return invalid("tenant id already exists");
    }
    throw e;
  }

  // Create user if not exists (global unique email)
  const userLookup = await query<{ id: string }>(
    `select id from users where lower(email) = lower($1) limit 1`,
    [adminEmail]
  );

  const userId = userLookup.rows[0]?.id ?? createId("user");
  if (!userLookup.rows[0]) {
    await query(
      `
        insert into users (id, email, password_hash, display_name)
        values ($1, $2, $3, $4)
      `,
      [userId, adminEmail, hashPassword(adminPassword), adminDisplayName]
    );
  }

  // Create membership for new tenant
  const membershipId = createId("membership");
  await query(
    `
      insert into memberships (id, tenant_id, user_id, role_name)
      values ($1, $2, $3, $4)
    `,
    [membershipId, id, userId, "org_admin" satisfies RoleName]
  );

  void recordAudit({
    session,
    action: "tenant.create",
    resourceType: "tenant",
    resourceId: id,
    metadata: { tenantName: name, adminEmail }
  });

  return {
    statusCode: 201,
    payload: {
      tenant: { id, name, timezone },
      admin: {
        userId,
        email: adminEmail,
        displayName: adminDisplayName,
        roleName: "org_admin"
      }
    }
  };
}

export async function updateTenant(session: AuthSession, id: string, body: UpdateTenantInput) {
  const denied = requirePermission(session, "tenants:write");
  if (denied) {
    return denied;
  }

  const existing = await query<TenantRow>(
    `select id, name, timezone, created_at::text from tenants where id = $1`,
    [id]
  );

  const current = existing.rows[0];
  if (!current) {
    return notFound();
  }

  const nextName = body.name !== undefined ? String(body.name).trim() : current.name;
  const nextTimezone =
    body.timezone !== undefined ? String(body.timezone).trim() : current.timezone;

  if (!nextName) {
    return invalid("name cannot be empty");
  }
  if (!nextTimezone) {
    return invalid("timezone cannot be empty");
  }

  const result = await query<TenantRow>(
    `
      update tenants
      set name = $2,
          timezone = $3
      where id = $1
      returning id, name, timezone, created_at::text
    `,
    [id, nextName, nextTimezone]
  );

  void recordAudit({
    session,
    action: "tenant.update",
    resourceType: "tenant",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: mapTenant(result.rows[0])
  };
}

export async function deleteTenant(session: AuthSession, id: string) {
  const denied = requirePermission(session, "tenants:delete");
  if (denied) {
    return denied;
  }

  if (id === session.tenantId) {
    return invalid("You cannot delete your current tenant");
  }

  const result = await query<{ id: string }>(
    `delete from tenants where id = $1 returning id`,
    [id]
  );

  if (result.rows.length === 0) {
    return notFound();
  }

  void recordAudit({
    session,
    action: "tenant.delete",
    resourceType: "tenant",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: { deleted: true, id }
  };
}

function mapTenant(row: TenantRow) {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    createdAt: row.created_at
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
    payload: { message: "Tenant not found" }
  };
}

