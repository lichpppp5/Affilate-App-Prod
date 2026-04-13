import type { AuthSession } from "./auth";
import { query } from "./db";
import { createId } from "./lib/ids";

export function recordAudit(input: {
  session: AuthSession;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}) {
  const id = createId("audit");
  const metadataJson = JSON.stringify(input.metadata ?? {});

  return query(
    `
      insert into audit_logs (
        id,
        tenant_id,
        user_id,
        action,
        resource_type,
        resource_id,
        metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      id,
      input.session.tenantId,
      input.session.userId,
      input.action,
      input.resourceType ?? "",
      input.resourceId ?? "",
      metadataJson
    ]
  ).catch((error) => {
    console.error("[audit] record failed", error);
  });
}
