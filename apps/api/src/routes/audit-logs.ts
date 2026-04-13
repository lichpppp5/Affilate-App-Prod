import type { AuthSession } from "../auth";
import { query } from "../db";
import { requirePermission } from "../rbac";

interface AuditRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  metadata_json: string;
  created_at: string;
}

export async function listAuditLogs(
  session: AuthSession,
  params: { limit?: number; offset?: number }
) {
  const denied = requirePermission(session, "audit:read");
  if (denied) {
    return denied;
  }

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  const result = await query<AuditRow>(
    `
      select id, tenant_id, user_id, action, resource_type, resource_id, metadata_json, created_at::text
      from audit_logs
      where tenant_id = $1
      order by created_at desc
      limit $2 offset $3
    `,
    [session.tenantId, limit, offset]
  );

  return {
    statusCode: 200,
    payload: result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: safeJson(row.metadata_json),
      createdAt: row.created_at
    }))
  };
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
