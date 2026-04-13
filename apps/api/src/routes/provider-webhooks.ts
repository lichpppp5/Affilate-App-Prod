import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

import { query } from "../db";
import { createId } from "../lib/ids";
import { readJsonBody } from "../lib/http";
import { markProjectStatus } from "../worker";

type ProviderName = "facebook" | "tiktok" | "shopee";

interface ProviderWebhookInput {
  providerEventId?: string;
  publishJobId?: string;
  status?: string;
  externalId?: string;
  payload?: Record<string, unknown>;
}

export async function ingestProviderWebhook(input: {
  provider: ProviderName;
  request: IncomingMessage;
}) {
  const secret = (process.env.PROVIDER_WEBHOOK_SECRET || "").trim();
  const signature = String(input.request.headers["x-appaffilate-signature"] || "");
  const raw = await readJsonBody<ProviderWebhookInput>(input.request);

  if (secret) {
    if (!signature) {
      return { statusCode: 401, payload: { message: "Missing signature" } };
    }
    if (!verifySignature(secret, signature, raw)) {
      return { statusCode: 401, payload: { message: "Invalid signature" } };
    }
  }

  if (!raw.publishJobId) {
    return { statusCode: 400, payload: { message: "publishJobId is required" } };
  }
  if (!raw.status) {
    return { statusCode: 400, payload: { message: "status is required" } };
  }

  const jobResult = await query<{
    id: string;
    tenant_id: string;
    project_id: string;
  }>(
    `
      select id, tenant_id, project_id
      from publish_jobs
      where id = $1
    `,
    [raw.publishJobId]
  );

  const job = jobResult.rows[0];
  if (!job) {
    return { statusCode: 404, payload: { message: "Publish job not found" } };
  }

  const providerEventId =
    raw.providerEventId ||
    stableEventId({
      provider: input.provider,
      publishJobId: raw.publishJobId,
      status: raw.status,
      externalId: raw.externalId ?? ""
    });

  const payloadJson = JSON.stringify(raw.payload ?? raw);

  await query(
    `
      insert into provider_webhook_events (
        id,
        provider,
        provider_event_id,
        tenant_id,
        publish_job_id,
        status,
        external_id,
        payload
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (provider, provider_event_id) do nothing
    `,
    [
      createId("provider_webhook"),
      input.provider,
      providerEventId,
      job.tenant_id,
      raw.publishJobId,
      raw.status,
      raw.externalId ?? "",
      payloadJson
    ]
  );

  const publishStatus = mapProviderStatusToPublishStatus(raw.status);

  await query(
    `
      update publish_jobs
      set status = $3,
          external_id = case when $4 <> '' then $4 else external_id end,
          updated_at = now()
      where tenant_id = $1 and id = $2
    `,
    [job.tenant_id, raw.publishJobId, publishStatus, raw.externalId ?? ""]
  );

  await markProjectStatus(
    job.tenant_id,
    job.project_id,
    publishStatus === "published"
      ? "published"
      : publishStatus === "failed"
        ? "failed"
        : "scheduled"
  );

  return {
    statusCode: 202,
    payload: {
      accepted: true,
      provider: input.provider,
      providerEventId,
      publishJobId: raw.publishJobId,
      status: publishStatus
    }
  };
}

function stableEventId(input: {
  provider: string;
  publishJobId: string;
  status: string;
  externalId: string;
}) {
  return createHash("sha256")
    .update(`${input.provider}:${input.publishJobId}:${input.status}:${input.externalId}`)
    .digest("hex");
}

function mapProviderStatusToPublishStatus(status: string) {
  const value = status.trim().toLowerCase();
  if (value === "published") return "published";
  if (value === "failed") return "failed";
  if (value === "draft_uploaded") return "draft_uploaded";
  if (value === "scheduled") return "scheduled";
  return status;
}

function verifySignature(secret: string, signature: string, body: unknown) {
  const expected = createHash("sha256")
    .update(`${secret}.${JSON.stringify(body)}`)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

