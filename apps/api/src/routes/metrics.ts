import { query } from "../db";

interface CountRow {
  c: string;
}

/**
 * Prometheus text format (subset). Không gắn tenant — dùng scrape nội bộ / có METRICS_TOKEN.
 */
export async function getPrometheusMetrics(): Promise<string> {
  const [
    renderQueued,
    renderProcessing,
    publishQueued,
    publishProcessing,
    notifUnread
  ] = await Promise.all([
    query<CountRow>(
      `select count(*)::text as c from render_jobs where status = 'queued'`
    ),
    query<CountRow>(
      `select count(*)::text as c from render_jobs where status = 'processing'`
    ),
    query<CountRow>(
      `
        select count(*)::text as c
        from publish_jobs
        where status in ('queued', 'scheduled')
          and (scheduled_at is null or scheduled_at <= now())
      `
    ),
    query<CountRow>(
      `select count(*)::text as c from publish_jobs where status = 'processing'`
    ),
    query<CountRow>(
      `select count(*)::text as c from notification_events where read_at is null`
    )
  ]);

  const lines = [
    "# HELP appaffilate_render_jobs_queued Render jobs waiting in DB",
    "# TYPE appaffilate_render_jobs_queued gauge",
    `appaffilate_render_jobs_queued ${renderQueued.rows[0]?.c ?? "0"}`,
    "# HELP appaffilate_render_jobs_processing Render jobs in progress",
    "# TYPE appaffilate_render_jobs_processing gauge",
    `appaffilate_render_jobs_processing ${renderProcessing.rows[0]?.c ?? "0"}`,
    "# HELP appaffilate_publish_jobs_queued Publish jobs ready to run",
    "# TYPE appaffilate_publish_jobs_queued gauge",
    `appaffilate_publish_jobs_queued ${publishQueued.rows[0]?.c ?? "0"}`,
    "# HELP appaffilate_publish_jobs_processing Publish jobs in progress",
    "# TYPE appaffilate_publish_jobs_processing gauge",
    `appaffilate_publish_jobs_processing ${publishProcessing.rows[0]?.c ?? "0"}`,
    "# HELP appaffilate_notifications_unread Unread in-app notifications",
    "# TYPE appaffilate_notifications_unread gauge",
    `appaffilate_notifications_unread ${notifUnread.rows[0]?.c ?? "0"}`
  ];

  return `${lines.join("\n")}\n`;
}
