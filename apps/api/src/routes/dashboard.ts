import type { WorkflowStatus } from "@appaffilate/domain";

import type { AuthSession } from "../auth";
import { query } from "../db";
import { getProviderConfig } from "../providers";
import { forbidden, hasPermission } from "../rbac";

interface JobStat {
  label: string;
  value: number;
}

interface CountRow {
  status: string;
  count: string;
}

export interface DashboardSnapshot {
  workflowStates: Record<WorkflowStatus, number>;
  productCount: number;
  assetCount: number;
  projectCount: number;
  approvalCount: number;
  publishJobCount: number;
  alerts: JobStat[];
  oauthHealth: {
    connectedCount: number;
    expiredCount: number;
    expiringSoonCount: number;
  };
  providerHealth: Array<{
    provider: string;
    mode: string;
    configured: boolean;
  }>;
}

export async function getDashboardSnapshot(
  session: AuthSession
): Promise<DashboardSnapshot | ReturnType<typeof forbidden>> {
  if (!hasPermission(session.roleName, "dashboard:read")) {
    return forbidden();
  }

  const [
    workflowCounts,
    productCount,
    assetCount,
    projectCount,
    approvalCount,
    publishJobCount,
    channelStats
  ] = await Promise.all([
    query<CountRow>(
      `
        select status, count(*)::text as count
        from video_projects
        where tenant_id = $1
        group by status
      `,
      [session.tenantId]
    ),
    query<{ count: string }>(
      `select count(*)::text as count from products where tenant_id = $1`,
      [session.tenantId]
    ),
    query<{ count: string }>(
      `select count(*)::text as count from assets where tenant_id = $1`,
      [session.tenantId]
    ),
    query<{ count: string }>(
      `select count(*)::text as count from video_projects where tenant_id = $1`,
      [session.tenantId]
    ),
    query<{ count: string }>(
      `select count(*)::text as count from approvals where tenant_id = $1`,
      [session.tenantId]
    ),
    query<{ count: string }>(
      `select count(*)::text as count from publish_jobs where tenant_id = $1`,
      [session.tenantId]
    ),
    query<{
      connected_count: string;
      expired_count: string;
      expiring_soon_count: string;
    }>(
      `
        select
          count(*) filter (where status = 'connected')::text as connected_count,
          count(*) filter (where status = 'expired')::text as expired_count,
          count(*) filter (
            where token_expires_at is not null
              and token_expires_at <= now() + interval '24 hours'
          )::text as expiring_soon_count
        from channel_accounts
        where tenant_id = $1
      `,
      [session.tenantId]
    )
  ]);

  const tiktokProvider = getProviderConfig("tiktok");
  const shopeeProvider = getProviderConfig("shopee");
  const facebookProvider = getProviderConfig("facebook");
  const tokenExpiryCount = Number(channelStats.rows[0]?.expiring_soon_count ?? 0);

  const workflowStates: Record<WorkflowStatus, number> = {
    draft: 0,
    generating: 0,
    review: 0,
    approved: 0,
    scheduled: 0,
    published: 0,
    failed: 0
  };

  for (const row of workflowCounts.rows) {
    if (row.status in workflowStates) {
      workflowStates[row.status as WorkflowStatus] = Number(row.count);
    }
  }

  return {
    workflowStates,
    productCount: Number(productCount.rows[0]?.count ?? 0),
    assetCount: Number(assetCount.rows[0]?.count ?? 0),
    projectCount: Number(projectCount.rows[0]?.count ?? 0),
    approvalCount: Number(approvalCount.rows[0]?.count ?? 0),
    publishJobCount: Number(publishJobCount.rows[0]?.count ?? 0),
    alerts: [
      { label: "token_expiry_count", value: tokenExpiryCount },
      { label: "queue_depth", value: 0 }
    ],
    oauthHealth: {
      connectedCount: Number(channelStats.rows[0]?.connected_count ?? 0),
      expiredCount: Number(channelStats.rows[0]?.expired_count ?? 0),
      expiringSoonCount: tokenExpiryCount
    },
    providerHealth: [
      {
        provider: "tiktok",
        mode: tiktokProvider.isMock ? "mock" : "sandbox/proxy",
        configured: tiktokProvider.hasExplicitEndpoints
      },
      {
        provider: "shopee",
        mode: shopeeProvider.isMock ? "mock" : "sandbox/proxy",
        configured: shopeeProvider.hasExplicitEndpoints
      },
      {
        provider: "facebook",
        mode: facebookProvider.isMock ? "mock" : "sandbox/proxy",
        configured: facebookProvider.hasExplicitEndpoints
      }
    ]
  };
}
