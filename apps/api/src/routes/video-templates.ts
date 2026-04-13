import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { requirePermission } from "../rbac";

type Channel = "tiktok" | "shopee" | "facebook";
type RenderProvider = "ffmpeg" | "veo3";

interface VideoTemplateRow {
  id: string;
  tenant_id: string;
  name: string;
  channel: string;
  render_provider: string;
  render_config_json: string;
  aspect_ratio: string;
  duration_seconds: number;
}

interface VideoTemplateInput {
  name?: string;
  channel?: string;
  renderProvider?: string;
  renderConfigJson?: Record<string, unknown>;
  aspectRatio?: string;
  durationSeconds?: number;
}

export async function listVideoTemplates(session: AuthSession) {
  const denied = requirePermission(session, "projects:read");
  if (denied) {
    return denied;
  }

  const result = await query<VideoTemplateRow>(
    `
      select id, tenant_id, name, channel, render_provider, render_config_json, aspect_ratio, duration_seconds
      from video_templates
      where tenant_id = $1
      order by name asc
    `,
    [session.tenantId]
  );

  return {
    statusCode: 200,
    payload: result.rows.map(mapRow)
  };
}

export async function getVideoTemplate(session: AuthSession, id: string) {
  const denied = requirePermission(session, "projects:read");
  if (denied) {
    return denied;
  }

  const result = await query<VideoTemplateRow>(
    `
      select id, tenant_id, name, channel, render_provider, render_config_json, aspect_ratio, duration_seconds
      from video_templates
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (result.rows.length === 0) {
    return notFound();
  }

  return {
    statusCode: 200,
    payload: mapRow(result.rows[0])
  };
}

export async function createVideoTemplate(session: AuthSession, body: VideoTemplateInput) {
  const denied = requirePermission(session, "projects:write");
  if (denied) {
    return denied;
  }

  if (!body.name?.trim() || !isChannel(body.channel)) {
    return invalid("name and channel (tiktok|shopee|facebook) are required");
  }

  const id = createId("vtpl");
  const result = await query<VideoTemplateRow>(
    `
      insert into video_templates (
        id,
        tenant_id,
        name,
        channel,
        render_provider,
        render_config_json,
        aspect_ratio,
        duration_seconds
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      returning id, tenant_id, name, channel, render_provider, render_config_json, aspect_ratio, duration_seconds
    `,
    [
      id,
      session.tenantId,
      body.name.trim(),
      body.channel,
      isRenderProvider(body.renderProvider) ? body.renderProvider : "ffmpeg",
      JSON.stringify(body.renderConfigJson ?? {}),
      body.aspectRatio?.trim() || "9:16",
      body.durationSeconds != null && Number.isFinite(body.durationSeconds)
        ? Math.max(1, Math.floor(body.durationSeconds))
        : 30
    ]
  );

  const payload = mapRow(result.rows[0]);
  void recordAudit({
    session,
    action: "video_template.create",
    resourceType: "video_template",
    resourceId: payload.id
  });

  return {
    statusCode: 201,
    payload
  };
}

export async function updateVideoTemplate(
  session: AuthSession,
  id: string,
  body: VideoTemplateInput
) {
  const denied = requirePermission(session, "projects:write");
  if (denied) {
    return denied;
  }

  const existing = await query<VideoTemplateRow>(
    `
      select id, tenant_id, name, channel, render_provider, render_config_json, aspect_ratio, duration_seconds
      from video_templates
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (existing.rows.length === 0) {
    return notFound();
  }

  const current = existing.rows[0];
  const nextChannel = body.channel ?? current.channel;
  if (!isChannel(nextChannel)) {
    return invalid("channel must be tiktok, shopee, or facebook");
  }

  const nextProvider = body.renderProvider ?? current.render_provider;
  if (!isRenderProvider(nextProvider)) {
    return invalid("renderProvider must be ffmpeg or veo3");
  }

  const result = await query<VideoTemplateRow>(
    `
      update video_templates
      set name = $3,
          channel = $4,
          render_provider = $5,
          render_config_json = $6,
          aspect_ratio = $7,
          duration_seconds = $8,
          updated_at = now()
      where tenant_id = $1 and id = $2
      returning id, tenant_id, name, channel, render_provider, render_config_json, aspect_ratio, duration_seconds
    `,
    [
      session.tenantId,
      id,
      body.name?.trim() || current.name,
      nextChannel,
      nextProvider,
      body.renderConfigJson ? JSON.stringify(body.renderConfigJson) : current.render_config_json,
      body.aspectRatio?.trim() || current.aspect_ratio,
      body.durationSeconds != null && Number.isFinite(body.durationSeconds)
        ? Math.max(1, Math.floor(body.durationSeconds))
        : current.duration_seconds
    ]
  );

  void recordAudit({
    session,
    action: "video_template.update",
    resourceType: "video_template",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: mapRow(result.rows[0])
  };
}

export async function deleteVideoTemplate(session: AuthSession, id: string) {
  const denied = requirePermission(session, "projects:delete");
  if (denied) {
    return denied;
  }

  const result = await query<{ id: string }>(
    `
      delete from video_templates
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
    action: "video_template.delete",
    resourceType: "video_template",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: { deleted: true, id }
  };
}

function isChannel(value: string | undefined): value is Channel {
  return value === "tiktok" || value === "shopee" || value === "facebook";
}

function isRenderProvider(value: string | undefined): value is RenderProvider {
  return value === "ffmpeg" || value === "veo3";
}

function mapRow(row: VideoTemplateRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    channel: row.channel,
    renderProvider: row.render_provider,
    renderConfigJson: safeJson(row.render_config_json),
    aspectRatio: row.aspect_ratio,
    durationSeconds: row.duration_seconds
  };
}

function safeJson(input: string) {
  try {
    const value = JSON.parse(input || "{}");
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function invalid(message: string) {
  return {
    statusCode: 400 as const,
    payload: { message }
  };
}

function notFound() {
  return {
    statusCode: 404 as const,
    payload: { message: "Video template not found" }
  };
}
