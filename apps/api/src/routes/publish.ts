import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { enqueuePublishJobId } from "../lib/job-queue";
import { requirePermission } from "../rbac";
import {
  loadChannelCapabilitySettings,
  parseTrackingParamsObject
} from "../lib/channel-capabilities";
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
  external_id: string;
  compliance_json: string;
  tracking_params_json: string;
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
  complianceJson?: unknown;
  trackingParamsJson?: unknown;
  scheduledAt?: string;
  status?: string;
}

async function validateComplianceForChannel(
  session: AuthSession,
  channel: string,
  complianceJson: unknown
): Promise<{ ok: true; stored: string } | { ok: false; message: string }> {
  const checklist = await query<{ code: string; required: boolean }>(
    `
      select code, required
      from compliance_checklist_items
      where tenant_id = $1 and channel = $2
    `,
    [session.tenantId, channel]
  );

  let raw: { items?: Record<string, unknown> };
  if (complianceJson === undefined || complianceJson === null) {
    raw = { items: {} };
  } else if (typeof complianceJson === "string") {
    try {
      raw = JSON.parse(complianceJson) as { items?: Record<string, unknown> };
    } catch {
      return { ok: false, message: "complianceJson must be valid JSON" };
    }
  } else if (typeof complianceJson === "object" && !Array.isArray(complianceJson)) {
    raw = complianceJson as { items?: Record<string, unknown> };
  } else {
    return { ok: false, message: "complianceJson must be an object or JSON string" };
  }

  const itemsRaw =
    raw.items && typeof raw.items === "object" && !Array.isArray(raw.items)
      ? raw.items
      : {};

  const items: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(itemsRaw)) {
    items[key] = Boolean(value);
  }

  for (const row of checklist.rows) {
    if (row.required && !items[row.code]) {
      return {
        ok: false,
        message: `Compliance checklist requires "${row.code}" for channel ${channel}`
      };
    }
  }

  return { ok: true, stored: JSON.stringify({ items }) };
}

function mapComplianceJson(stored: string): { items: Record<string, boolean> } {
  try {
    const raw = JSON.parse(stored) as { items?: Record<string, unknown> };
    const itemsRaw =
      raw.items && typeof raw.items === "object" && !Array.isArray(raw.items)
        ? raw.items
        : {};
    const items: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(itemsRaw)) {
      items[key] = Boolean(value);
    }
    return { items };
  } catch {
    return { items: {} };
  }
}

function mapTrackingParamsJson(stored: string): Record<string, string> {
  try {
    return parseTrackingParamsObject(JSON.parse(stored || "{}"));
  } catch {
    return {};
  }
}

function normalizeTrackingParamsJson(
  input: unknown
): { ok: true; stored: string } | { ok: false; message: string } {
  if (input === undefined || input === null) {
    return { ok: true, stored: "{}" };
  }

  let parsed: unknown;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      return { ok: false, message: "trackingParamsJson must be valid JSON" };
    }
  } else {
    parsed = input;
  }

  const flat = parseTrackingParamsObject(parsed);
  return { ok: true, stored: JSON.stringify(flat) };
}

async function assertPublishAgainstCapabilities(
  session: AuthSession,
  channel: string,
  input: {
    caption: string;
    affiliateLink: string;
    disclosureText: string;
    productId: string;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { capabilities } = await loadChannelCapabilitySettings(
    session.tenantId,
    channel
  );

  if (capabilities.affiliateLinkRequired && !input.affiliateLink.trim()) {
    return {
      ok: false,
      message: `Affiliate link is required for channel ${channel}`
    };
  }

  if (capabilities.disclosureRequired && !input.disclosureText.trim()) {
    return {
      ok: false,
      message: `Disclosure text is required for channel ${channel}`
    };
  }

  if (
    capabilities.maxCaptionLength != null &&
    input.caption.length > capabilities.maxCaptionLength
  ) {
    return {
      ok: false,
      message: `Caption exceeds maximum length (${capabilities.maxCaptionLength}) for ${channel}`
    };
  }

  if (capabilities.requireProductMapping) {
    const m = await query<{ id: string }>(
      `
        select id
        from product_channel_mappings
        where tenant_id = $1 and product_id = $2 and channel = $3
      `,
      [session.tenantId, input.productId, channel]
    );

    if (m.rows.length === 0) {
      return {
        ok: false,
        message: `Product channel mapping is required for this product on ${channel}`
      };
    }
  }

  return { ok: true };
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
        external_id,
        compliance_json,
        tracking_params_json,
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
        external_id,
        compliance_json,
        tracking_params_json,
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

  const compliance = await validateComplianceForChannel(
    session,
    body.channel,
    body.complianceJson ?? { items: {} }
  );
  if (!compliance.ok) {
    return invalid(compliance.message);
  }

  const capCheck = await assertPublishAgainstCapabilities(session, body.channel, {
    caption: body.caption ?? "",
    affiliateLink: body.affiliateLink ?? "",
    disclosureText: body.disclosureText ?? "",
    productId: body.productId
  });
  if (!capCheck.ok) {
    return invalid(capCheck.message);
  }

  const tracking = normalizeTrackingParamsJson(body.trackingParamsJson ?? {});
  if (!tracking.ok) {
    return invalid(tracking.message);
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
        external_id,
        compliance_json,
        tracking_params_json,
        scheduled_at,
        status
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12, $13, $14, $15, $16)
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
        external_id,
        compliance_json,
        tracking_params_json,
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
      "",
      compliance.stored,
      tracking.stored,
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
        external_id,
        compliance_json,
        tracking_params_json,
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

  const current = existing.rows[0]!;
  const nextProjectId = body.projectId ?? current.project_id;
  const nextProductId = body.productId ?? current.product_id;
  const nextChannel = body.channel ?? current.channel;

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
      nextChannel
    ))
  ) {
    return invalid("Referenced channel account does not belong to tenant");
  }

  const complianceInput =
    body.complianceJson !== undefined
      ? body.complianceJson
      : mapComplianceJson(current.compliance_json);
  const compliance = await validateComplianceForChannel(session, nextChannel, complianceInput);
  if (!compliance.ok) {
    return invalid(compliance.message);
  }

  const capCheck = await assertPublishAgainstCapabilities(session, nextChannel, {
    caption: body.caption ?? current.caption,
    affiliateLink: body.affiliateLink ?? current.affiliate_link,
    disclosureText: body.disclosureText ?? current.disclosure_text,
    productId: nextProductId
  });
  if (!capCheck.ok) {
    return invalid(capCheck.message);
  }

  const trackingInput =
    body.trackingParamsJson !== undefined
      ? body.trackingParamsJson
      : (() => {
          try {
            return JSON.parse(current.tracking_params_json || "{}");
          } catch {
            return {};
          }
        })();
  const tracking = normalizeTrackingParamsJson(trackingInput);
  if (!tracking.ok) {
    return invalid(tracking.message);
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
          compliance_json = $11,
          tracking_params_json = $12,
          scheduled_at = $13,
          status = $14,
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
        external_id,
        compliance_json,
        tracking_params_json,
        scheduled_at::text,
        status
    `,
    [
      session.tenantId,
      id,
      nextProjectId,
      nextProductId,
      nextChannel,
      body.accountId ?? current.account_id,
      body.caption ?? current.caption,
      body.hashtags ?? current.hashtags,
      body.disclosureText ?? current.disclosure_text,
      body.affiliateLink ?? current.affiliate_link,
      compliance.stored,
      tracking.stored,
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
        external_id,
        compliance_json,
        tracking_params_json,
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
        external_id,
        compliance_json,
        tracking_params_json,
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
    externalId: row.external_id || undefined,
    complianceJson: mapComplianceJson(row.compliance_json),
    trackingParamsJson: mapTrackingParamsJson(row.tracking_params_json),
    scheduledAt: row.scheduled_at ?? undefined,
    status: row.status
  };
}
