import type { AuthSession } from "../auth";
import { query } from "../db";
import { forbidden, hasPermission } from "../rbac";

interface CountRow {
  count: string;
}

interface ChannelCountRow {
  channel: string;
  count: string;
}

interface ReportsFilter {
  from?: string;
  to?: string;
}

export async function getReportsSnapshot(
  session: AuthSession,
  filter: ReportsFilter = {}
) {
  if (!hasPermission(session.roleName, "reports:read")) {
    return forbidden();
  }

  const renderUnit = Number(process.env.COST_RENDER_UNIT_USD ?? "0.03");
  const publishUnit = Number(process.env.COST_PUBLISH_UNIT_USD ?? "0.02");

  const [fromClause, fromValues] = buildDateClause(filter, 2);
  const [
    avgProductPrice,
    publishSummary,
    approvalSummary,
    projectsByStatus,
    channels,
    renderCompleted,
    publishAttempts
  ] = await Promise.all([
    query<{ avg_price: string | null }>(
      `
        select avg(price)::text as avg_price
        from products
        where tenant_id = $1
        ${fromClause("created_at")}
      `,
      [session.tenantId, ...fromValues]
    ),
    query<CountRow>(
      `
        select count(*)::text as count
        from publish_jobs
        where tenant_id = $1 and status = 'published'
        ${fromClause("created_at")}
      `,
      [session.tenantId, ...fromValues]
    ),
    query<CountRow>(
      `
        select count(*)::text as count
        from approvals
        where tenant_id = $1 and decision = 'approved'
        ${fromClause("created_at")}
      `,
      [session.tenantId, ...fromValues]
    ),
    query<{ status: string; count: string }>(
      `
        select status, count(*)::text as count
        from video_projects
        where tenant_id = $1
        ${fromClause("created_at")}
        group by status
      `,
      [session.tenantId, ...fromValues]
    ),
    query<ChannelCountRow>(
      `
        select channel, count(*)::text as count
        from publish_jobs
        where tenant_id = $1
        ${fromClause("created_at")}
        group by channel
      `,
      [session.tenantId, ...fromValues]
    ),
    query<CountRow>(
      `
        select count(*)::text as count
        from render_jobs
        where tenant_id = $1 and status = 'completed'
        ${fromClause("completed_at")}
      `,
      [session.tenantId, ...fromValues]
    ),
    query<CountRow>(
      `
        select count(*)::text as count
        from publish_attempts
        where tenant_id = $1 and status = 'success'
        ${fromClause("completed_at")}
      `,
      [session.tenantId, ...fromValues]
    )
  ]);

  const renderCount = Number(renderCompleted.rows[0]?.count ?? 0);
  const publishAttemptCount = Number(publishAttempts.rows[0]?.count ?? 0);
  const estimatedRenderCostUsd = renderCount * renderUnit;
  const estimatedPublishCostUsd = publishAttemptCount * publishUnit;

  return {
    avgProductPrice: Number(avgProductPrice.rows[0]?.avg_price ?? 0),
    publishedJobs: Number(publishSummary.rows[0]?.count ?? 0),
    approvedReviews: Number(approvalSummary.rows[0]?.count ?? 0),
    projectStatuses: projectsByStatus.rows.map((row) => ({
      status: row.status,
      count: Number(row.count)
    })),
    channels: channels.rows.map((row) => ({
      channel: row.channel,
      count: Number(row.count)
    })),
    operations: {
      completedRenders: renderCount,
      successfulPublishAttempts: publishAttemptCount,
      estimatedRenderCostUsd,
      estimatedPublishCostUsd,
      estimatedTotalCostUsd: estimatedRenderCostUsd + estimatedPublishCostUsd,
      unitAssumptions: {
        renderUsd: renderUnit,
        publishAttemptUsd: publishUnit
      }
    },
    filter
  };
}

function buildDateClause(filter: ReportsFilter, startingIndex: number) {
  const values: string[] = [];
  let sql = "";
  let index = startingIndex;

  if (filter.from) {
    sql += ` and %COLUMN% >= $${index}`;
    values.push(filter.from);
    index += 1;
  }

  if (filter.to) {
    sql += ` and %COLUMN% <= $${index}`;
    values.push(filter.to);
  }

  return [
    (column: string) => sql.replaceAll("%COLUMN%", column),
    values
  ] as const;
}
