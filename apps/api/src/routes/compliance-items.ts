import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { requirePermission } from "../rbac";

type Channel = "tiktok" | "shopee" | "facebook";

interface ComplianceRow {
  id: string;
  tenant_id: string;
  channel: string;
  code: string;
  label: string;
  required: boolean;
  sort_order: number;
}

interface ComplianceInput {
  channel?: string;
  code?: string;
  label?: string;
  required?: boolean;
  sortOrder?: number;
}

export async function listComplianceItems(
  session: AuthSession,
  channelFilter?: string | null
) {
  const denied = requirePermission(session, "projects:read");
  if (denied) {
    return denied;
  }

  if (channelFilter && !isChannel(channelFilter)) {
    return invalid("channel must be tiktok, shopee, or facebook");
  }

  const result = await query<ComplianceRow>(
    channelFilter
      ? `
        select id, tenant_id, channel, code, label, required, sort_order
        from compliance_checklist_items
        where tenant_id = $1 and channel = $2
        order by sort_order asc, code asc
      `
      : `
        select id, tenant_id, channel, code, label, required, sort_order
        from compliance_checklist_items
        where tenant_id = $1
        order by channel asc, sort_order asc, code asc
      `,
    channelFilter ? [session.tenantId, channelFilter] : [session.tenantId]
  );

  return {
    statusCode: 200,
    payload: result.rows.map(mapRow)
  };
}

export async function getComplianceItem(session: AuthSession, id: string) {
  const denied = requirePermission(session, "projects:read");
  if (denied) {
    return denied;
  }

  const result = await query<ComplianceRow>(
    `
      select id, tenant_id, channel, code, label, required, sort_order
      from compliance_checklist_items
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

export async function createComplianceItem(session: AuthSession, body: ComplianceInput) {
  const denied = requirePermission(session, "projects:write");
  if (denied) {
    return denied;
  }

  if (!isChannel(body.channel) || !body.code?.trim() || !body.label?.trim()) {
    return invalid("channel (tiktok|shopee|facebook), code, and label are required");
  }

  const id = createId("comp");
  const result = await query<ComplianceRow>(
    `
      insert into compliance_checklist_items (
        id,
        tenant_id,
        channel,
        code,
        label,
        required,
        sort_order
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      returning id, tenant_id, channel, code, label, required, sort_order
    `,
    [
      id,
      session.tenantId,
      body.channel,
      body.code.trim(),
      body.label.trim(),
      body.required !== false,
      body.sortOrder != null && Number.isFinite(body.sortOrder)
        ? Math.floor(body.sortOrder)
        : 0
    ]
  );

  const payload = mapRow(result.rows[0]);
  void recordAudit({
    session,
    action: "compliance_item.create",
    resourceType: "compliance_checklist_item",
    resourceId: payload.id
  });

  return {
    statusCode: 201,
    payload
  };
}

export async function updateComplianceItem(
  session: AuthSession,
  id: string,
  body: ComplianceInput
) {
  const denied = requirePermission(session, "projects:write");
  if (denied) {
    return denied;
  }

  const existing = await query<ComplianceRow>(
    `
      select id, tenant_id, channel, code, label, required, sort_order
      from compliance_checklist_items
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (existing.rows.length === 0) {
    return notFound();
  }

  const current = existing.rows[0];
  const nextChannel = body.channel ?? current.channel;
  if (!isChannel(nextChannel)) {
    return invalid("channel must be tiktok, shopee, or facebook");
  }

  const result = await query<ComplianceRow>(
    `
      update compliance_checklist_items
      set channel = $3,
          code = $4,
          label = $5,
          required = $6,
          sort_order = $7,
          updated_at = now()
      where tenant_id = $1 and id = $2
      returning id, tenant_id, channel, code, label, required, sort_order
    `,
    [
      session.tenantId,
      id,
      nextChannel,
      body.code?.trim() || current.code,
      body.label?.trim() || current.label,
      body.required ?? current.required,
      body.sortOrder != null && Number.isFinite(body.sortOrder)
        ? Math.floor(body.sortOrder)
        : current.sort_order
    ]
  );

  void recordAudit({
    session,
    action: "compliance_item.update",
    resourceType: "compliance_checklist_item",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: mapRow(result.rows[0])
  };
}

export async function deleteComplianceItem(session: AuthSession, id: string) {
  const denied = requirePermission(session, "projects:delete");
  if (denied) {
    return denied;
  }

  const result = await query<{ id: string }>(
    `
      delete from compliance_checklist_items
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
    action: "compliance_item.delete",
    resourceType: "compliance_checklist_item",
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

function mapRow(row: ComplianceRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    channel: row.channel,
    code: row.code,
    label: row.label,
    required: row.required,
    sortOrder: row.sort_order
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
    payload: { message: "Compliance item not found" }
  };
}
