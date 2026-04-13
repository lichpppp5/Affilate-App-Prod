import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { enqueuePublishJobId } from "../lib/job-queue";
import { requirePermission } from "../rbac";
import {
  ensureTenantChannelAccount,
  ensureTenantProduct,
  ensureTenantProject
} from "./helpers";
import { markProjectStatus } from "../worker";

interface PublishRow {
  id: string;
  tenant_id: string;
  project_id: string;
  product_id: string;
  channel: string;
  account_id: string;
  caption: string;
  hashtags: string[];
  disclosure_text: string;
  affiliate_link: string;
  scheduled_at: string | null;
  status: string;
}

interface PublishInput {
  projectId?: string;
  productId?: string;
  channel?: string;
  accountId?: string;
  caption?: string;
  hashtags?: string[];
  disclosureText?: string;
  affiliateLink?: string;
  scheduledAt?: string;
  status?: string;
}

export async function listPublishJobs(session: AuthSession) {
  const denied = requirePermission(session, "publish:read");
  if (denied) {
    return denied;
  }

  const result = await query<PublishRow>(
    `
      select
        id,
        tenant_id,
        project_id,
        product_id,
        channel,
        account_id,
        caption,
        hashtags,
        disclosure_text,
        affiliate_link,
        scheduled_at::text,
        status
      from publish_jobs
      where tenant_id = $1
      order by created_at desc
    `,
    [session.tenantId]
  );

  return {
    statusCode: 200,
    payload: result.rows.map(mapPublishJob)
  };
}

export async function getPublishJob(session: AuthSession, id: string) {
  const denied = requirePermission(session, "publish:read");
  if (denied) {
    return denied;
  }

  const result = await query<PublishRow>(
    `
      select
        id,
        tenant_id,
        project_id,
        product_id,
        channel,
        account_id,
        caption,
        hashtags,
        disclosure_text,
        affiliate_link,
        scheduled_at::text,
        status
      from publish_jobs
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (result.rows.length === 0) {
    return notFound();
  }

  return {
    statusCode: 200,
    payload: mapPublishJob(result.rows[0])
  };
}

export async function createPublishJob(
  session: AuthSession,
  body: PublishInput
) {
  const denied = requirePermission(session, "publish:write");
  if (denied) {
    return denied;
  }

  if (!body.projectId || !body.productId || !body.channel || !body.accountId) {
    return invalid("projectId, productId, channel, and accountId are required");
  }

  if (!(await ensureTenantProject(session, body.projectId))) {
    return invalid("Referenced project does not belong to tenant");
  }

  if (!(await ensureTenantProduct(session, body.productId))) {
    return invalid("Referenced product does not belong to tenant");
  }

  if (!(await ensureTenantChannelAccount(session, body.accountId, body.channel))) {
    return invalid("Referenced channel account does not belong to tenant");
  }

  const result = await query<PublishRow>(
    `
      insert into publish_jobs (
        id,
        tenant_id,
        project_id,
        product_id,
        channel,
        account_id,
        caption,
        hashtags,
        disclosure_text,
        affiliate_link,
        scheduled_at,
        status
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12)
      returning
        id,
        tenant_id,
        project_id,
        product_id,
        channel,
        account_id,
        caption,
        hashtags,
        disclosure_text,
        affiliate_link,
        scheduled_at::text,
        status
    `,
    [
      createId("publish"),
      session.tenantId,
      body.projectId,
      body.productId,
      body.channel,
      body.accountId,
      body.caption ?? "",
      body.hashtags ?? [],
      body.disclosureText ?? "",
      body.affiliateLink ?? "",
      body.scheduledAt ?? null,
      body.status ?? "queued"
    ]
  );

  await syncProjectStatus(session, body.projectId, body.status ?? "queued");

  const payload = mapPublishJob(result.rows[0]);
  void recordAudit({
    session,
    action: "publish_job.create",
    resourceType: "publish_job",
    resourceId: payload.id,
    metadata: { channel: payload.channel }
  });

  const initialStatus = body.status ?? "queued";
  if (initialStatus === "queued" || initialStatus === "scheduled") {
    void enqueuePublishJobId(payload.id);
  }

  return {
    statusCode: 201,
    payload
  };
}

export async function updatePublishJob(
  session: AuthSession,
  id: string,
  body: PublishInput
) {
  const denied = requirePermission(session, "publish:write");
  if (denied) {
    return denied;
  }

  const existing = await query<PublishRow>(
    `
      select
        id,
        tenant_id,
        project_id,
        product_id,
        channel,
        account_id,
        caption,
        hashtags,
        disclosure_text,
        affiliate_link,
        scheduled_at::text,
        status
      from publish_jobs
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (existing.rows.length === 0) {
    return notFound();
  }

  const current = existing.rows[0];
  const nextProjectId = body.projectId ?? current.project_id;
  const nextProductId = body.productId ?? current.product_id;

  if (!(await ensureTenantProject(session, nextProjectId))) {
    return invalid("Referenced project does not belong to tenant");
  }

  if (!(await ensureTenantProduct(session, nextProductId))) {
    return invalid("Referenced product does not belong to tenant");
  }

  if (
    !(await ensureTenantChannelAccount(
      session,
      body.accountId ?? current.account_id,
      body.channel ?? current.channel
    ))
  ) {
    return invalid("Referenced channel account does not belong to tenant");
  }

  const result = await query<PublishRow>(
    `
      update publish_jobs
      set project_id = $3,
          product_id = $4,
          channel = $5,
          account_id = $6,
          caption = $7,
          hashtags = $8::text[],
          disclosure_text = $9,
          affiliate_link = $10,
          scheduled_at = $11,
          status = $12,
          updated_at = now()
      where tenant_id = $1 and id = $2
      returning
        id,
        tenant_id,
        project_id,
        product_id,
        channel,
        account_id,
        caption,
        hashtags,
        disclosure_text,
        affiliate_link,
        scheduled_at::text,
        status
    `,
    [
      session.tenantId,
      id,
      nextProjectId,
      nextProductId,
      body.channel ?? current.channel,
      body.accountId ?? current.account_id,
      body.caption ?? current.caption,
      body.hashtags ?? current.hashtags,
      body.disclosureText ?? current.disclosure_text,
      body.affiliateLink ?? current.affiliate_link,
      body.scheduledAt ?? current.scheduled_at,
      body.status ?? current.status
    ]
  );

  await syncProjectStatus(session, nextProjectId, body.status ?? current.status);

  void recordAudit({
    session,
    action: "publish_job.update",
    resourceType: "publish_job",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: mapPublishJob(result.rows[0])
  };
}

export async function deletePublishJob(session: AuthSession, id: string) {
  const denied = requirePermission(session, "publish:write");
  if (denied) {
    return denied;
  }

  const result = await query<{ id: string }>(
    `
      delete from publish_jobs
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
    action: "publish_job.delete",
    resourceType: "publish_job",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: { deleted: true, id }
  };
}

export async function retryPublishJob(session: AuthSession, id: string) {
  const denied = requirePermission(session, "publish:operate");
  if (denied) {
    return denied;
  }

  const result = await query<PublishRow>(
    `
      update publish_jobs
      set status = 'queued',
          scheduled_at = null,
          updated_at = now()
      where tenant_id = $1
        and id = $2
        and status in ('failed', 'canceled', 'draft_uploaded', 'published')
      returning
        id,
        tenant_id,
        project_id,
        product_id,
        channel,
        account_id,
        caption,
        hashtags,
        disclosure_text,
        affiliate_link,
        scheduled_at::text,
        status
    `,
    [session.tenantId, id]
  );

  const row = result.rows[0];

  if (!row) {
    return invalid("Only failed, canceled, draft_uploaded, or published jobs can be retried");
  }

  await syncProjectStatus(session, row.project_id, "queued");

  void recordAudit({
    session,
    action: "publish_job.retry",
    resourceType: "publish_job",
    resourceId: id
  });

  void enqueuePublishJobId(row.id);

  return {
    statusCode: 200,
    payload: mapPublishJob(row)
  };
}

export async function cancelPublishJob(session: AuthSession, id: string) {
  const denied = requirePermission(session, "publish:operate");
  if (denied) {
    return denied;
  }

  const result = await query<PublishRow>(
    `
      update publish_jobs
      set status = 'canceled',
          updated_at = now()
      where tenant_id = $1
        and id = $2
        and status in ('queued', 'scheduled', 'processing', 'draft_uploaded')
      returning
        id,
        tenant_id,
        project_id,
        product_id,
        channel,
        account_id,
        caption,
        hashtags,
        disclosure_text,
        affiliate_link,
        scheduled_at::text,
        status
    `,
    [session.tenantId, id]
  );

  const row = result.rows[0];

  if (!row) {
    return invalid("Only queued, scheduled, processing, or draft_uploaded jobs can be canceled");
  }

  await markProjectStatus(session.tenantId, row.project_id, "approved");

  void recordAudit({
    session,
    action: "publish_job.cancel",
    resourceType: "publish_job",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: mapPublishJob(row)
  };
}

async function syncProjectStatus(
  session: AuthSession,
  projectId: string,
  publishStatus: string
) {
  let nextStatus = "scheduled";

  if (publishStatus === "published") {
    nextStatus = "published";
  } else if (publishStatus === "failed") {
    nextStatus = "failed";
  }

  await markProjectStatus(session.tenantId, projectId, nextStatus);
}

function invalid(message: string) {
  return {
    statusCode: 400,
    payload: { message }
  };
}

function notFound() {
  return {
    statusCode: 404,
    payload: {
      message: "Publish job not found"
    }
  };
}

function mapPublishJob(row: PublishRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    productId: row.product_id,
    channel: row.channel,
    accountId: row.account_id,
    caption: row.caption,
    hashtags: row.hashtags ?? [],
    disclosureText: row.disclosure_text,
    affiliateLink: row.affiliate_link,
    scheduledAt: row.scheduled_at ?? undefined,
    status: row.status
  };
}
