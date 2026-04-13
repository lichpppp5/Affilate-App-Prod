import type { AuthSession } from "../auth";
import { query } from "../db";

export async function ensureTenantProduct(
  session: AuthSession,
  productId: string | undefined
) {
  if (!productId) {
    return true;
  }

  const result = await query<{ id: string }>(
    `
      select id
      from products
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, productId]
  );

  return result.rows.length > 0;
}

export async function ensureTenantProject(
  session: AuthSession,
  projectId: string | undefined
) {
  if (!projectId) {
    return true;
  }

  const result = await query<{ id: string }>(
    `
      select id
      from video_projects
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, projectId]
  );

  return result.rows.length > 0;
}

export async function ensureTenantChannelAccount(
  session: AuthSession,
  accountId: string | undefined,
  channel?: string
) {
  if (!accountId) {
    return true;
  }

  const result = await query<{ id: string }>(
    `
      select id
      from channel_accounts
      where tenant_id = $1
        and id = $2
        and ($3::text is null or channel = $3)
    `,
    [session.tenantId, accountId, channel ?? null]
  );

  return result.rows.length > 0;
}
