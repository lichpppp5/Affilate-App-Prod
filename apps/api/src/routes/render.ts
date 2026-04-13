import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { enqueueRenderJobId } from "../lib/job-queue";
import { requirePermission } from "../rbac";
import { ensureTenantProject } from "./helpers";
import { markProjectStatus } from "../worker";

interface RenderRow {
  id: string;
  tenant_id: string;
  project_id: string;
  status: string;
  step: string;
  progress: number;
  error_message: string;
  output_video_url: string;
  output_thumbnail_url: string;
  started_at: string | null;
  completed_at: string | null;
}

interface RenderInput {
  projectId?: string;
  status?: string;
}

export async function listRenderJobs(session: AuthSession) {
  const denied = requirePermission(session, "render:read");
  if (denied) {
    return denied;
  }

  const result = await query<RenderRow>(
    `
      select
        id,
        tenant_id,
        project_id,
        status,
        step,
        progress,
        error_message,
        output_video_url,
        output_thumbnail_url,
        started_at::text,
        completed_at::text
      from render_jobs
      where tenant_id = $1
      order by created_at desc
    `,
    [session.tenantId]
  );

  return {
    statusCode: 200,
    payload: result.rows.map(mapRenderJob)
  };
}

export async function createRenderJob(session: AuthSession, body: RenderInput) {
  const denied = requirePermission(session, "render:write");
  if (denied) {
    return denied;
  }

  if (!body.projectId) {
    return invalid("projectId is required");
  }

  if (!(await ensureTenantProject(session, body.projectId))) {
    return invalid("Referenced project does not belong to tenant");
  }

  const result = await query<RenderRow>(
    `
      insert into render_jobs (
        id,
        tenant_id,
        project_id,
        status,
        step,
        progress
      )
      values ($1, $2, $3, $4, 'queued', 0)
      returning
        id,
        tenant_id,
        project_id,
        status,
        step,
        progress,
        error_message,
        output_video_url,
        output_thumbnail_url,
        started_at::text,
        completed_at::text
    `,
    [createId("render"), session.tenantId, body.projectId, body.status ?? "queued"]
  );

  await query(
    `
      update video_projects
      set status = 'generating',
          updated_at = now()
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, body.projectId]
  );

  const payload = mapRenderJob(result.rows[0]);
  void recordAudit({
    session,
    action: "render_job.create",
    resourceType: "render_job",
    resourceId: payload.id
  });

  void enqueueRenderJobId(payload.id);

  return {
    statusCode: 201,
    payload
  };
}

export async function getRenderJob(session: AuthSession, id: string) {
  const denied = requirePermission(session, "render:read");
  if (denied) {
    return denied;
  }

  const result = await query<RenderRow>(
    `
      select
        id,
        tenant_id,
        project_id,
        status,
        step,
        progress,
        error_message,
        output_video_url,
        output_thumbnail_url,
        started_at::text,
        completed_at::text
      from render_jobs
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (result.rows.length === 0) {
    return notFound();
  }

  return {
    statusCode: 200,
    payload: mapRenderJob(result.rows[0])
  };
}

export async function getRenderJobMedia(
  session: AuthSession,
  id: string,
  kind: "video" | "thumbnail"
) {
  const result = await query<RenderRow>(
    `
      select
        id,
        tenant_id,
        project_id,
        status,
        step,
        progress,
        error_message,
        output_video_url,
        output_thumbnail_url,
        started_at::text,
        completed_at::text
      from render_jobs
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const filePath =
    kind === "video" ? row.output_video_url : row.output_thumbnail_url;

  if (!filePath) {
    return null;
  }

  return {
    filePath,
    job: mapRenderJob(row)
  };
}

export async function deleteRenderJob(session: AuthSession, id: string) {
  const denied = requirePermission(session, "render:write");
  if (denied) {
    return denied;
  }

  const result = await query<{ id: string }>(
    `
      delete from render_jobs
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
    action: "render_job.delete",
    resourceType: "render_job",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: { deleted: true, id }
  };
}

export async function retryRenderJob(session: AuthSession, id: string) {
  const denied = requirePermission(session, "render:operate");
  if (denied) {
    return denied;
  }

  const result = await query<RenderRow>(
    `
      select
        id,
        tenant_id,
        project_id,
        status,
        step,
        progress,
        error_message,
        output_video_url,
        output_thumbnail_url,
        started_at::text,
        completed_at::text
      from render_jobs
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  const row = result.rows[0];

  if (!row) {
    return notFound();
  }

  if (!["failed", "canceled", "completed"].includes(row.status)) {
    return invalid("Only failed, canceled, or completed jobs can be retried");
  }

  return createRenderJob(session, {
    projectId: row.project_id,
    status: "queued"
  });
}

export async function cancelRenderJob(session: AuthSession, id: string) {
  const denied = requirePermission(session, "render:operate");
  if (denied) {
    return denied;
  }

  const result = await query<RenderRow>(
    `
      update render_jobs
      set status = 'canceled',
          step = 'canceled',
          updated_at = now()
      where tenant_id = $1
        and id = $2
        and status in ('queued', 'processing')
      returning
        id,
        tenant_id,
        project_id,
        status,
        step,
        progress,
        error_message,
        output_video_url,
        output_thumbnail_url,
        started_at::text,
        completed_at::text
    `,
    [session.tenantId, id]
  );

  const row = result.rows[0];

  if (!row) {
    return invalid("Only queued or processing jobs can be canceled");
  }

  await markProjectStatus(session.tenantId, row.project_id, "draft");

  void recordAudit({
    session,
    action: "render_job.cancel",
    resourceType: "render_job",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: mapRenderJob(row)
  };
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
      message: "Render job not found"
    }
  };
}

function mapRenderJob(row: RenderRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    status: row.status,
    step: row.step,
    progress: Number(row.progress),
    errorMessage: row.error_message,
    outputVideoUrl: row.output_video_url,
    outputThumbnailUrl: row.output_thumbnail_url,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined
  };
}
