import { spawn } from "node:child_process";
import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { Pool } from "pg";

import {
  blockingPopNextJobId,
  jobQueueKeys,
  workerJobQueueEnabled
} from "./job-queue-consumer";
import { mergeAffiliateUrl, parseFlatParamsJson } from "./affiliate-tracking";
import { parseWorkerChannelCaps } from "./channel-caps";
import {
  dispatchWorkerPublish,
  refreshWorkerProviderToken,
  type WorkerProviderName
} from "./providers";
import {
  DEFAULT_VEO_PROMPT_TEMPLATE,
  interpolatePromptTemplate,
  parseVeoRenderConfig,
  pickVeoReferenceImages,
  type ReferenceImageInput
} from "./veo-render-config";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://appaffilate:appaffilate@localhost:5432/appaffilate";
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 3000);
const GENERATED_MEDIA_DIR = resolve(
  process.env.GENERATED_MEDIA_DIR ?? resolve(process.cwd(), "generated-media")
);

const pool = new Pool({
  connectionString: DATABASE_URL
});

async function notifyEscalation(input: {
  tenantId: string;
  kind: string;
  severity: "warning" | "critical";
  title: string;
  body: string;
  refType: string;
  refId: string;
}) {
  const id = `notif_${randomUUID().replaceAll("-", "")}`;
  try {
    await pool.query(
      `
        insert into notification_events (
          id,
          tenant_id,
          user_id,
          kind,
          severity,
          title,
          body,
          ref_type,
          ref_id
        )
        values ($1, $2, null, $3, $4, $5, $6, $7, $8)
      `,
      [
        id,
        input.tenantId,
        input.kind,
        input.severity,
        input.title,
        input.body,
        input.refType,
        input.refId
      ]
    );
  } catch (error) {
    console.error("[worker] notification insert failed", error);
    return;
  }

  void postAlertWebhook({
    source: "appaffilate-worker",
    kind: input.kind,
    severity: input.severity,
    title: input.title,
    body: input.body,
    tenantId: input.tenantId,
    refType: input.refType,
    refId: input.refId,
    notificationId: id
  });
}

async function postAlertWebhook(payload: Record<string, unknown>) {
  const url = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!url) {
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error("[worker] ALERT_WEBHOOK_URL request failed", error);
  }
}

async function startWorkerLoop() {
  if (workerJobQueueEnabled()) {
    const keys = jobQueueKeys();
    console.log(
      "[worker] bootstrap — USE_JOB_QUEUE=1, Redis keys:",
      keys.render,
      keys.publish
    );
  } else {
    console.log("[worker] bootstrap complete (DB poll only; set USE_JOB_QUEUE=1 + REDIS_URL for wake)");
  }

  while (true) {
    try {
      if (workerJobQueueEnabled()) {
        const next = await blockingPopNextJobId();
        if (next) {
          if (next.type === "render") {
            const byId = await claimRenderJobById(next.id);
            if (byId) {
              await processRenderJob(byId);
              continue;
            }
          } else {
            const pj = await claimPublishJobById(next.id);
            if (pj) {
              await processPublishJob(pj);
              continue;
            }
          }
        }
      }

      const renderJob = await claimNextRenderJob();

      if (renderJob) {
        await processRenderJob(renderJob);
        continue;
      }

      const publishJob = await claimNextPublishJob();

      if (publishJob) {
        await processPublishJob(publishJob);
        continue;
      }
    } catch (error) {
      console.error("[worker] loop error", error);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

async function claimNextRenderJob() {
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    project_id: string;
  }>(
    `
      update render_jobs
      set status = 'processing',
          step = 'preprocess',
          progress = 10,
          started_at = coalesce(started_at, now()),
          updated_at = now()
      where id = (
        select id
        from render_jobs
        where status = 'queued'
        order by created_at asc
        limit 1
      )
      returning id, tenant_id, project_id
    `
  );

  return result.rows[0] ?? null;
}

async function claimRenderJobById(id: string) {
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    project_id: string;
  }>(
    `
      update render_jobs
      set status = 'processing',
          step = 'preprocess',
          progress = 10,
          started_at = coalesce(started_at, now()),
          updated_at = now()
      where id = $1 and status = 'queued'
      returning id, tenant_id, project_id
    `,
    [id]
  );

  return result.rows[0] ?? null;
}

async function claimPublishJobById(id: string) {
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    project_id: string;
    channel: string;
    disclosure_text: string;
    account_id: string;
    caption: string;
    hashtags: string[];
    affiliate_link: string;
  }>(
    `
      update publish_jobs
      set status = 'processing',
          updated_at = now()
      where id = $1
        and status in ('queued', 'scheduled')
        and (scheduled_at is null or scheduled_at <= now())
      returning
        id,
        tenant_id,
        project_id,
        channel,
        disclosure_text,
        account_id,
        caption,
        hashtags,
        affiliate_link
    `,
    [id]
  );

  return result.rows[0] ?? null;
}

async function processRenderJob(job: {
  id: string;
  tenant_id: string;
  project_id: string;
}) {
  console.log("[worker][render] processing", job.id, job.project_id);
  try {
    await mkdir(GENERATED_MEDIA_DIR, { recursive: true });

    if (await isJobCanceled("render_jobs", job.id)) {
      await markRenderCanceled(job);
      return;
    }

    await updateRenderStep(job.id, "script", 20);
    await sleep(250);

    if (await isJobCanceled("render_jobs", job.id)) {
      await markRenderCanceled(job);
      return;
    }

    await updateRenderStep(job.id, "compose", 45);

    const outputVideoPath = resolve(GENERATED_MEDIA_DIR, `${job.project_id}.mp4`);
    const outputThumbnailPath = resolve(GENERATED_MEDIA_DIR, `${job.project_id}.jpg`);

    const context = await pool.query<{
      template_id: string;
      product_id: string;
      brand_kit_id: string | null;
      project_title: string;
      product_title: string;
      product_description: string;
      product_sku: string;
      brand_name: string | null;
      brand_primary_color: string | null;
      brand_font_family: string | null;
      brand_logo_asset_id: string | null;
      template_render_provider: string | null;
      template_render_config_json: string | null;
      template_aspect_ratio: string | null;
      template_duration_seconds: number | null;
    }>(
      `
        select
          vp.template_id,
          vp.product_id,
          vp.brand_kit_id,
          vp.title as project_title,
          p.title as product_title,
          p.description as product_description,
          p.sku as product_sku,
          bk.name as brand_name,
          bk.primary_color as brand_primary_color,
          bk.font_family as brand_font_family,
          nullif(trim(bk.logo_asset_id), '') as brand_logo_asset_id,
          vt.render_provider as template_render_provider,
          vt.render_config_json as template_render_config_json,
          vt.aspect_ratio as template_aspect_ratio,
          vt.duration_seconds as template_duration_seconds
        from video_projects vp
        join products p
          on p.tenant_id = vp.tenant_id and p.id = vp.product_id
        left join brand_kits bk
          on bk.tenant_id = vp.tenant_id and bk.id = vp.brand_kit_id
        left join video_templates vt
          on vt.tenant_id = vp.tenant_id and vt.id = vp.template_id
        where vp.tenant_id = $1 and vp.id = $2
        limit 1
      `,
      [job.tenant_id, job.project_id]
    );

    const row = context.rows[0];
    const renderProvider = row?.template_render_provider ?? "ffmpeg";
    const aspectRatio = row?.template_aspect_ratio ?? "9:16";
    const durationSeconds = Math.max(4, Number(row?.template_duration_seconds ?? 8));
    const size = aspectRatio === "1:1" ? "1080x1080" : aspectRatio === "16:9" ? "1920x1080" : "1080x1920";

    // Pull product images. If files are missing (seed/demo), fallback to color clips.
    const images = row
      ? await pool.query<{ storage_key: string; mime_type: string }>(
          `
            select storage_key, mime_type
            from assets
            where tenant_id = $1
              and product_id = $2
              and kind = 'image'
            order by created_at asc
            limit 6
          `,
          [job.tenant_id, row.product_id]
        )
      : { rows: [] as { storage_key: string; mime_type: string }[] };

    const objectStorageDir = resolveRepoRootPath(
      process.env.OBJECT_STORAGE_LOCAL_DIR ?? "./apps/api/object-storage"
    );

    const imagePaths: string[] = [];
    const productImageInputs: ReferenceImageInput[] = [];
    for (const img of images.rows) {
      const p = resolve(objectStorageDir, img.storage_key);
      if (await existsFile(p)) {
        imagePaths.push(p);
        productImageInputs.push({
          absolutePath: p,
          mimeType: img.mime_type?.trim() || "image/jpeg"
        });
      }
    }

    if (renderProvider === "veo3") {
      const veoCfg = parseVeoRenderConfig(row?.template_render_config_json);
      let brandLogo: ReferenceImageInput | null = null;
      const logoId = row?.brand_logo_asset_id?.trim();
      if (logoId) {
        const logoRow = await pool.query<{ storage_key: string; mime_type: string }>(
          `
            select storage_key, mime_type
            from assets
            where tenant_id = $1 and id = $2
            limit 1
          `,
          [job.tenant_id, logoId]
        );
        const la = logoRow.rows[0];
        if (la) {
          const lp = resolve(objectStorageDir, la.storage_key);
          if (await existsFile(lp)) {
            brandLogo = {
              absolutePath: lp,
              mimeType: la.mime_type?.trim() || "image/png"
            };
          }
        }
      }

      const vars: Record<string, string> = {
        projectTitle: row?.project_title ?? "",
        productTitle: row?.product_title ?? "",
        productDescription: (row?.product_description ?? "").slice(0, 2000),
        productSku: row?.product_sku ?? "",
        brandName: row?.brand_name ?? "",
        primaryColor: row?.brand_primary_color ?? "",
        fontFamily: row?.brand_font_family ?? ""
      };

      const template = veoCfg.promptTemplate?.trim() || DEFAULT_VEO_PROMPT_TEMPLATE;
      const prompt = interpolatePromptTemplate(template, vars).trim();

      const pickedRefs = pickVeoReferenceImages({
        config: veoCfg,
        productImages: productImageInputs,
        brandLogo
      });

      if (veoCfg.referenceImages?.require && pickedRefs.length === 0) {
        throw new Error("Veo3: reference images are required but none were available on disk");
      }

      await renderWithVeo3({
        tenantId: job.tenant_id,
        prompt: prompt || vars.projectTitle || "Product video",
        aspectRatio,
        templateDurationSeconds: durationSeconds,
        referenceImages: pickedRefs,
        veoOverrides: veoCfg.veo ?? {},
        outputVideoPath
      });
    } else if (imagePaths.length === 0) {
      await runFfmpeg([
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=0x1d4ed8:s=${size}:d=${Math.max(2, Math.floor(durationSeconds / 2))}`,
        "-f",
        "lavfi",
        "-i",
        `color=c=0x111827:s=${size}:d=${Math.max(2, Math.ceil(durationSeconds / 2))}`,
        "-filter_complex",
        "[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p",
        outputVideoPath
      ]);
    } else {
      const perSlide = Math.max(1.5, durationSeconds / imagePaths.length);
      const args: string[] = ["-y"];
      for (const p of imagePaths) {
        args.push("-loop", "1", "-t", String(perSlide), "-i", p);
      }

      const chains: string[] = [];
      const refs: string[] = [];
      for (let i = 0; i < imagePaths.length; i += 1) {
        // cover-fit into target size
        chains.push(
          `[${i}:v]scale=${size}:force_original_aspect_ratio=increase,crop=${size},format=yuv420p[v${i}]`
        );
        refs.push(`[v${i}]`);
      }

      chains.push(`${refs.join("")}concat=n=${imagePaths.length}:v=1:a=0,format=yuv420p[v]`);
      args.push("-filter_complex", chains.join(";"), "-map", "[v]", "-r", "30", "-movflags", "+faststart", outputVideoPath);

      await runFfmpeg(args);
    }

    if (await isJobCanceled("render_jobs", job.id)) {
      await markRenderCanceled(job);
      return;
    }

    await updateRenderStep(job.id, "encode", 85);

    await runFfmpeg([
      "-y",
      "-ss",
      "00:00:01",
      "-i",
      outputVideoPath,
      "-frames:v",
      "1",
      outputThumbnailPath
    ]);

    if (await isJobCanceled("render_jobs", job.id)) {
      await markRenderCanceled(job);
      return;
    }

    await pool.query(
      `
        update render_jobs
        set status = 'completed',
            step = 'finalized',
            progress = 100,
            output_video_url = $2,
            output_thumbnail_url = $3,
            completed_at = now(),
            updated_at = now()
        where id = $1
      `,
      [job.id, outputVideoPath, outputThumbnailPath]
    );

    await pool.query(
      `
        update video_projects
        set status = 'review',
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [job.tenant_id, job.project_id]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Render failed";
    await pool.query(
      `
        update render_jobs
        set status = 'failed',
            step = 'error',
            error_message = $2,
            updated_at = now()
        where id = $1
      `,
      [job.id, message]
    );

    await pool.query(
      `
        update video_projects
        set status = 'failed',
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [job.tenant_id, job.project_id]
    );

    void notifyEscalation({
      tenantId: job.tenant_id,
      kind: "render_failed",
      severity: "critical",
      title: "Render job failed",
      body: message.slice(0, 500),
      refType: "render_job",
      refId: job.id
    });
  }
}

function templateDurationToVeoSlot(seconds: number): "4" | "6" | "8" {
  const s = Math.round(seconds);
  if (s <= 4) return "4";
  if (s <= 6) return "6";
  return "8";
}

function veoAspectRatioParam(ratio: string): "9:16" | "16:9" {
  return ratio === "16:9" ? "16:9" : "9:16";
}

async function renderWithVeo3(input: {
  tenantId: string;
  prompt: string;
  aspectRatio: string;
  templateDurationSeconds: number;
  referenceImages: ReferenceImageInput[];
  veoOverrides: {
    personGeneration?: string;
    resolution?: string;
    durationSeconds?: string;
  };
  outputVideoPath: string;
}) {
  const creds = await pool.query<{
    api_key_encrypted: string;
    base_url: string;
    model: string;
  }>(
    `
      select api_key_encrypted, base_url, model
      from ai_provider_credentials
      where tenant_id = $1 and provider = 'veo3'
      limit 1
    `,
    [input.tenantId]
  );

  const row = creds.rows[0];
  if (!row?.api_key_encrypted?.trim()) {
    throw new Error("Veo3 is not configured: missing API key");
  }

  const apiKey = decryptSecret(process.env.AUTH_SECRET ?? "dev-auth-secret", row.api_key_encrypted);
  const baseUrl = row.base_url?.trim() || "https://generativelanguage.googleapis.com/v1beta";
  const model = row.model?.trim() || "veo-3.1-generate-preview";

  const hasRefs = input.referenceImages.length > 0;
  const durationParam = hasRefs
    ? "8"
    : input.veoOverrides.durationSeconds === "4" ||
        input.veoOverrides.durationSeconds === "6" ||
        input.veoOverrides.durationSeconds === "8"
      ? input.veoOverrides.durationSeconds
      : templateDurationToVeoSlot(input.templateDurationSeconds);

  const personGeneration = hasRefs
    ? input.veoOverrides.personGeneration ?? "allow_adult"
    : input.veoOverrides.personGeneration ?? "allow_all";

  const instance: Record<string, unknown> = {
    prompt: input.prompt
  };

  if (hasRefs) {
    const referenceImages = [];
    for (const ref of input.referenceImages) {
      const buf = await readFile(ref.absolutePath);
      referenceImages.push({
        image: {
          inlineData: {
            mimeType: ref.mimeType,
            data: buf.toString("base64")
          }
        },
        referenceType: "asset"
      });
    }
    instance.referenceImages = referenceImages;
  }

  const reqBody: Record<string, unknown> = {
    instances: [instance],
    parameters: {
      aspectRatio: veoAspectRatioParam(input.aspectRatio),
      durationSeconds: durationParam,
      personGeneration,
      ...(input.veoOverrides.resolution ? { resolution: input.veoOverrides.resolution } : {})
    }
  };

  const start = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:predictLongRunning`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify(reqBody)
  });

  if (!start.ok) {
    const text = await start.text().catch(() => "");
    throw new Error(`Veo3 start failed: HTTP ${start.status} ${text.slice(0, 200)}`);
  }

  const startJson = (await start.json()) as { name?: string };
  if (!startJson.name) {
    throw new Error("Veo3 start failed: missing operation name");
  }

  const opName = startJson.name;
  const deadline = Date.now() + 10 * 60_000;

  while (true) {
    if (Date.now() > deadline) {
      throw new Error("Veo3 generation timed out");
    }

    await sleep(8000);
    const status = await fetch(`${baseUrl}/${opName}`, {
      headers: { "x-goog-api-key": apiKey }
    });

    if (!status.ok) {
      const text = await status.text().catch(() => "");
      throw new Error(`Veo3 status failed: HTTP ${status.status} ${text.slice(0, 200)}`);
    }

    const statusJson = (await status.json()) as any;
    if (!statusJson?.done) continue;

    const videoUri =
      statusJson?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!videoUri || typeof videoUri !== "string") {
      throw new Error("Veo3 done but missing video uri");
    }

    const videoRes = await fetch(videoUri, { headers: { "x-goog-api-key": apiKey } });
    if (!videoRes.ok) {
      const text = await videoRes.text().catch(() => "");
      throw new Error(`Veo3 download failed: HTTP ${videoRes.status} ${text.slice(0, 200)}`);
    }

    const buf = Buffer.from(await videoRes.arrayBuffer());
    await writeFile(input.outputVideoPath, buf);
    break;
  }
}

function decryptSecret(secretKey: string, encoded: string) {
  if (!encoded) return "";
  const parts = encoded.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") {
    return encoded;
  }

  const [, ivB64, tagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const ciphertext = Buffer.from(ciphertextB64, "base64url");
  const key = createHash("sha256").update(secretKey).digest();

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

async function existsFile(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function resolveRepoRootPath(input: string) {
  if (!input.trim()) {
    return resolve(process.cwd(), "..", "api", "object-storage");
  }

  // Worker runs from apps/worker; repo root is two levels up.
  if (input.startsWith("./")) {
    return resolve(process.cwd(), "..", "..", input.slice(2));
  }

  return resolve(input);
}

async function claimNextPublishJob() {
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    project_id: string;
    channel: string;
    disclosure_text: string;
    account_id: string;
    caption: string;
    hashtags: string[];
    affiliate_link: string;
  }>(
    `
      update publish_jobs
      set status = 'processing',
          updated_at = now()
      where id = (
        select id
        from publish_jobs
        where status in ('queued', 'scheduled')
          and (scheduled_at is null or scheduled_at <= now())
        order by created_at asc
        limit 1
      )
      returning
        id,
        tenant_id,
        project_id,
        channel,
        disclosure_text,
        account_id,
        caption,
        hashtags,
        affiliate_link
    `
  );

  return result.rows[0] ?? null;
}

async function processPublishJob(job: {
  id: string;
  tenant_id: string;
  project_id: string;
  channel: string;
  disclosure_text: string;
  account_id: string;
  caption: string;
  hashtags: string[];
  affiliate_link: string;
}) {
  console.log("[worker][publish] processing", job.id, job.channel);
  const attemptId = await createPublishAttempt(job);
  try {
    await sleep(500);

    if (await isJobCanceled("publish_jobs", job.id)) {
      await completePublishAttempt(attemptId, "canceled", "", "Canceled by operator");
      await markPublishCanceled(job);
      return;
    }

    const enrich = await pool.query<{
      tracking_params_json: string;
      default_tracking_params_json: string | null;
      external_product_id: string | null;
      capabilities_json: string | null;
    }>(
      `
        select pj.tracking_params_json,
               cc.default_tracking_params_json,
               pm.external_product_id,
               cc.capabilities_json
        from publish_jobs pj
        left join channel_capabilities cc
          on cc.tenant_id = pj.tenant_id and cc.channel = pj.channel
        left join product_channel_mappings pm
          on pm.tenant_id = pj.tenant_id
         and pm.product_id = pj.product_id
         and pm.channel = pj.channel
        where pj.id = $1
      `,
      [job.id]
    );

    const enrichRow = enrich.rows[0];
    const caps = parseWorkerChannelCaps(job.channel, enrichRow?.capabilities_json ?? null);

    if (caps.disclosureRequired && !job.disclosure_text.trim()) {
      throw new Error("Missing disclosure_text");
    }

    if (caps.affiliateLinkRequired && !job.affiliate_link.trim()) {
      throw new Error("Missing affiliate_link");
    }

    const defaultParams = parseFlatParamsJson(enrichRow?.default_tracking_params_json ?? null);
    const jobParams = parseFlatParamsJson(enrichRow?.tracking_params_json ?? null);
    const mergedAffiliateLink = mergeAffiliateUrl(
      job.affiliate_link,
      defaultParams,
      jobParams
    );

    const externalProductId = enrichRow?.external_product_id?.trim() ?? "";

    const account = await ensurePublishAccountReady(job);
    const publishPayload: Record<string, unknown> = {
      publishJobId: job.id,
      projectId: job.project_id,
      channel: job.channel,
      disclosureText: job.disclosure_text,
      caption: job.caption,
      hashtags: job.hashtags,
      affiliateLink: mergedAffiliateLink
    };

    if (externalProductId) {
      publishPayload.externalProductId = externalProductId;
    }

    const providerResponse = await dispatchWorkerPublish({
      provider: job.channel as WorkerProviderName,
      accessToken: account.accessToken,
      payload: publishPayload
    });

    const nextStatus = providerResponse.status;
    const responsePayload = JSON.stringify({
      provider: job.channel,
      status: nextStatus,
      publishJobId: job.id,
      accountId: job.account_id,
      externalId: providerResponse.external_id
    });

    if (await isJobCanceled("publish_jobs", job.id)) {
      await completePublishAttempt(attemptId, "canceled", "", "Canceled by operator");
      await markPublishCanceled(job);
      return;
    }

    await pool.query(
      `
        update publish_jobs
        set status = $2,
            external_id = $3,
            updated_at = now()
        where id = $1
      `,
      [job.id, nextStatus, providerResponse.external_id ?? ""]
    );

    await completePublishAttempt(attemptId, "success", responsePayload, "");

    await pool.query(
      `
        update video_projects
        set status = $3,
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [job.tenant_id, job.project_id, nextStatus === "published" ? "published" : "scheduled"]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish failed";

    await pool.query(
      `
        update publish_jobs
        set status = 'failed',
            updated_at = now()
        where id = $1
      `,
      [job.id]
    );

    await completePublishAttempt(attemptId, "failed", "", message);

    await pool.query(
      `
        update video_projects
        set status = 'failed',
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [job.tenant_id, job.project_id]
    );

    void notifyEscalation({
      tenantId: job.tenant_id,
      kind: "publish_failed",
      severity: "critical",
      title: "Publish job failed",
      body: message.slice(0, 500),
      refType: "publish_job",
      refId: job.id
    });
  }
}

async function updateRenderStep(id: string, step: string, progress: number) {
  await pool.query(
    `
      update render_jobs
      set step = $2,
          progress = $3,
          updated_at = now()
      where id = $1
    `,
    [id, step, progress]
  );
}

async function isJobCanceled(table: "render_jobs" | "publish_jobs", id: string) {
  const result = await pool.query<{ status: string }>(
    `select status from ${table} where id = $1`,
    [id]
  );

  return result.rows[0]?.status === "canceled";
}

async function markRenderCanceled(job: {
  id: string;
  tenant_id: string;
  project_id: string;
}) {
  await pool.query(
    `
      update render_jobs
      set status = 'canceled',
          step = 'canceled',
          updated_at = now()
      where id = $1
    `,
    [job.id]
  );

  await pool.query(
    `
      update video_projects
      set status = 'draft',
          updated_at = now()
      where tenant_id = $1 and id = $2
    `,
    [job.tenant_id, job.project_id]
  );
}

async function markPublishCanceled(job: {
  id: string;
  tenant_id: string;
  project_id: string;
}) {
  await pool.query(
    `
      update publish_jobs
      set status = 'canceled',
          updated_at = now()
      where id = $1
    `,
    [job.id]
  );

  await pool.query(
    `
      update video_projects
      set status = 'approved',
          updated_at = now()
      where tenant_id = $1 and id = $2
    `,
    [job.tenant_id, job.project_id]
  );
}

async function createPublishAttempt(job: {
  id: string;
  tenant_id: string;
  channel: string;
}) {
  const result = await pool.query<{ id: string }>(
    `
      insert into publish_attempts (
        id,
        tenant_id,
        publish_job_id,
        stage,
        status
      )
      values (
        concat('attempt_', replace(gen_random_uuid()::text, '-', '')),
        $1,
        $2,
        $3,
        'processing'
      )
      returning id
    `,
    [job.tenant_id, job.id, `${job.channel}_dispatch`]
  );

  return result.rows[0].id;
}

async function ensurePublishAccountReady(job: {
  id: string;
  tenant_id: string;
  channel: string;
  account_id: string;
}) {
  const result = await pool.query<{
    id: string;
    status: string;
    auth_type: string;
    access_token: string;
    refresh_token: string;
    token_expires_at: string | null;
    client_id: string;
    client_secret: string;
  }>(
    `
      select
        id,
        status,
        auth_type,
        access_token,
        refresh_token,
        token_expires_at::text,
        client_id,
        client_secret
      from channel_accounts
      where tenant_id = $1 and id = $2 and channel = $3
    `,
    [job.tenant_id, job.account_id, job.channel]
  );

  const account = result.rows[0];

  if (!account) {
    throw new Error("Channel account not found for publish job");
  }

  if (account.status === "disconnected") {
    throw new Error("Channel account is disconnected");
  }

  const expired =
    !account.access_token ||
    (account.token_expires_at ? new Date(account.token_expires_at).getTime() <= Date.now() : false);

  if (!expired) {
    return {
      accessToken: account.access_token
    };
  }

  if (!account.refresh_token && account.auth_type !== "service_account") {
    await pool.query(
      `
        update channel_accounts
        set status = 'expired',
            updated_at = now()
        where id = $1
      `,
      [account.id]
    );
    throw new Error("Channel account token expired and cannot refresh");
  }

  const refreshed = await refreshWorkerProviderToken({
    provider: job.channel as WorkerProviderName,
    refreshToken: account.refresh_token,
    authType: account.auth_type,
    clientId: account.client_id,
    clientSecret: account.client_secret
  });

  await pool.query(
    `
      update channel_accounts
      set access_token = $2,
          token_expires_at = $3,
          refresh_token = $4,
          status = 'connected',
          last_refreshed_at = now(),
          updated_at = now()
      where id = $1
    `,
    [
      account.id,
      refreshed.accessToken,
      refreshed.tokenExpiresAt ?? null,
      refreshed.refreshToken || account.refresh_token
    ]
  );

  return {
    accessToken: refreshed.accessToken
  };
}

async function completePublishAttempt(
  attemptId: string,
  status: string,
  responsePayload: string,
  errorMessage: string
) {
  await pool.query(
    `
      update publish_attempts
      set status = $2,
          response_payload = $3,
          error_message = $4,
          completed_at = now()
      where id = $1
    `,
    [attemptId, status, responsePayload, errorMessage]
  );
}

async function runFfmpeg(args: string[]) {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const process = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";

    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    process.on("error", (error) => {
      rejectPromise(error);
    });

    process.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}`)
      );
    });
  });
}

void startWorkerLoop();
