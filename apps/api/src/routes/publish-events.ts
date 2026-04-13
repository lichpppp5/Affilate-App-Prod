import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { requirePermission } from "../rbac";
import { markProjectStatus } from "../worker";

interface PublishAttemptRow {
  id: string;
  tenant_id: string;
  publish_job_id: string;
  stage: string;
  status: string;
  response_payload: string;
  error_message: string;
  started_at: string;
  completed_at: string | null;
}

interface PublishWebhookRow {
  id: string;
  tenant_id: string;
  publish_job_id: string;
  event_type: string;
  payload: string;
  processed_status: string;
  created_at: string;
}

interface WebhookInput {
  publishJobId?: string;
  eventType?: string;
  payload?: Record<string, unknown>;
}

export async function listPublishAttempts(session: AuthSession) {
  const denied = requirePermission(session, "publish:read");
  if (denied) {
    return denied;
  }

  const result = await query<PublishAttemptRow>(
    `
      select
        id,
        tenant_id,
        publish_job_id,
        stage,
        status,
        response_payload,
        error_message,
        started_at::text,
        completed_at::text
      from publish_attempts
      where tenant_id = $1
      order by started_at desc
    `,
    [session.tenantId]
  );

  return {
    statusCode: 200,
    payload: result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      publishJobId: row.publish_job_id,
      stage: row.stage,
      status: row.status,
      responsePayload: row.response_payload,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined
    }))
  };
}

export async function listPublishWebhookEvents(session: AuthSession) {
  const denied = requirePermission(session, "publish:read");
  if (denied) {
    return denied;
  }

  const result = await query<PublishWebhookRow>(
    `
      select
        id,
        tenant_id,
        publish_job_id,
        event_type,
        payload,
        processed_status,
        created_at::text
      from publish_webhook_events
      where tenant_id = $1
      order by created_at desc
    `,
    [session.tenantId]
  );

  return {
    statusCode: 200,
    payload: result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      publishJobId: row.publish_job_id,
      eventType: row.event_type,
      payload: row.payload,
      processedStatus: row.processed_status,
      createdAt: row.created_at
    }))
  };
}

export async function simulatePublishWebhook(
  session: AuthSession,
  input: WebhookInput
) {
  const denied = requirePermission(session, "publish:operate");
  if (denied) {
    return denied;
  }

  if (!input.publishJobId || !input.eventType) {
    return {
      statusCode: 400,
      payload: {
        message: "publishJobId and eventType are required"
      }
    };
  }

  const jobResult = await query<{
    id: string;
    project_id: string;
  }>(
    `
      select id, project_id
      from publish_jobs
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, input.publishJobId]
  );

  const job = jobResult.rows[0];

  if (!job) {
    return {
      statusCode: 404,
      payload: {
        message: "Publish job not found"
      }
    };
  }

  const payload = JSON.stringify(
    input.payload ?? {
      publishJobId: input.publishJobId,
      eventType: input.eventType
    }
  );

  const eventResult = await query<PublishWebhookRow>(
    `
      insert into publish_webhook_events (
        id,
        tenant_id,
        publish_job_id,
        event_type,
        payload,
        processed_status
      )
      values ($1, $2, $3, $4, $5, 'processed')
      returning
        id,
        tenant_id,
        publish_job_id,
        event_type,
        payload,
        processed_status,
        created_at::text
    `,
    [
      createId("webhook"),
      session.tenantId,
      input.publishJobId,
      input.eventType,
      payload
    ]
  );

  const publishStatus = mapWebhookToPublishStatus(input.eventType);

  await query(
    `
      update publish_jobs
      set status = $3,
          updated_at = now()
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, input.publishJobId, publishStatus]
  );

  await markProjectStatus(
    session.tenantId,
    job.project_id,
    publishStatus === "published" ? "published" : publishStatus === "failed" ? "failed" : "scheduled"
  );

  void recordAudit({
    session,
    action: "publish_webhook.simulate",
    resourceType: "publish_job",
    resourceId: input.publishJobId,
    metadata: { eventType: input.eventType }
  });

  return {
    statusCode: 201,
    payload: {
      id: eventResult.rows[0].id,
      publishJobId: input.publishJobId,
      eventType: input.eventType,
      publishStatus
    }
  };
}

function mapWebhookToPublishStatus(eventType: string) {
  if (eventType === "published") {
    return "published";
  }

  if (eventType === "failed") {
    return "failed";
  }

  return "draft_uploaded";
}
