import type { AuthSession } from "../auth";
import { query } from "../db";
import { requirePermission } from "../rbac";

interface NotificationRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  kind: string;
  severity: string;
  title: string;
  body: string;
  ref_type: string;
  ref_id: string;
  read_at: string | null;
  created_at: string;
}

export async function listNotifications(
  session: AuthSession,
  params: { unreadOnly?: boolean; limit?: number }
) {
  const denied = requirePermission(session, "notifications:read");
  if (denied) {
    return denied;
  }

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const unreadOnly = params.unreadOnly ?? false;

  const result = await query<NotificationRow>(
    `
      select
        id,
        tenant_id,
        user_id,
        kind,
        severity,
        title,
        body,
        ref_type,
        ref_id,
        read_at::text,
        created_at::text
      from notification_events
      where tenant_id = $1
        and (user_id is null or user_id = $2)
        and ($3::boolean = false or read_at is null)
      order by created_at desc
      limit $4
    `,
    [session.tenantId, session.userId, unreadOnly, limit]
  );

  return {
    statusCode: 200,
    payload: result.rows.map(mapRow)
  };
}

export async function markNotificationRead(session: AuthSession, id: string) {
  const denied = requirePermission(session, "notifications:write");
  if (denied) {
    return denied;
  }

  const result = await query<{ id: string }>(
    `
      update notification_events
      set read_at = now()
      where tenant_id = $1
        and id = $2
        and (user_id is null or user_id = $3)
      returning id
    `,
    [session.tenantId, id, session.userId]
  );

  if (result.rows.length === 0) {
    return {
      statusCode: 404,
      payload: { message: "Notification not found" }
    };
  }

  return {
    statusCode: 200,
    payload: { ok: true, id: result.rows[0].id }
  };
}

export async function markAllNotificationsRead(session: AuthSession) {
  const denied = requirePermission(session, "notifications:write");
  if (denied) {
    return denied;
  }

  await query(
    `
      update notification_events
      set read_at = now()
      where tenant_id = $1
        and read_at is null
        and (user_id is null or user_id = $2)
    `,
    [session.tenantId, session.userId]
  );

  return {
    statusCode: 200,
    payload: { ok: true }
  };
}

function mapRow(row: NotificationRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    kind: row.kind,
    severity: row.severity,
    title: row.title,
    body: row.body,
    refType: row.ref_type,
    refId: row.ref_id,
    readAt: row.read_at,
    createdAt: row.created_at
  };
}
