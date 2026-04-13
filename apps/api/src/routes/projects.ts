import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { requirePermission } from "../rbac";
import { ensureTenantProduct } from "./helpers";

interface ProjectRow {
  id: string;
  tenant_id: string;
  product_id: string;
  template_id: string;
  brand_kit_id: string | null;
  status: string;
  title: string;
}

interface ProjectInput {
  productId?: string;
  templateId?: string;
  brandKitId?: string;
  status?: string;
  title?: string;
}

export async function listProjects(session: AuthSession) {
  const denied = requirePermission(session, "projects:read");
  if (denied) {
    return denied;
  }

  const result = await query<ProjectRow>(
    `
      select id, tenant_id, product_id, template_id, brand_kit_id, status, title
      from video_projects
      where tenant_id = $1
      order by created_at desc
    `,
    [session.tenantId]
  );

  return {
    statusCode: 200,
    payload: result.rows.map(mapProject)
  };
}

export async function getProject(session: AuthSession, id: string) {
  const denied = requirePermission(session, "projects:read");
  if (denied) {
    return denied;
  }

  const result = await query<ProjectRow>(
    `
      select id, tenant_id, product_id, template_id, brand_kit_id, status, title
      from video_projects
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (result.rows.length === 0) {
    return notFound();
  }

  return {
    statusCode: 200,
    payload: mapProject(result.rows[0])
  };
}

export async function createProject(session: AuthSession, body: ProjectInput) {
  const denied = requirePermission(session, "projects:write");
  if (denied) {
    return denied;
  }

  if (!body.productId || !body.templateId || !body.title) {
    return invalid("productId, templateId, and title are required");
  }

  if (!(await ensureTenantProduct(session, body.productId))) {
    return invalid("Referenced product does not belong to tenant");
  }

  const result = await query<ProjectRow>(
    `
      insert into video_projects (
        id,
        tenant_id,
        product_id,
        template_id,
        brand_kit_id,
        status,
        title
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      returning id, tenant_id, product_id, template_id, brand_kit_id, status, title
    `,
    [
      createId("proj"),
      session.tenantId,
      body.productId,
      body.templateId,
      body.brandKitId ?? null,
      body.status ?? "draft",
      body.title
    ]
  );

  const payload = mapProject(result.rows[0]);
  void recordAudit({
    session,
    action: "project.create",
    resourceType: "video_project",
    resourceId: payload.id
  });

  return {
    statusCode: 201,
    payload
  };
}

export async function updateProject(
  session: AuthSession,
  id: string,
  body: ProjectInput
) {
  const denied = requirePermission(session, "projects:write");
  if (denied) {
    return denied;
  }

  const existing = await query<ProjectRow>(
    `
      select id, tenant_id, product_id, template_id, brand_kit_id, status, title
      from video_projects
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (existing.rows.length === 0) {
    return notFound();
  }

  const current = existing.rows[0];
  const nextProductId = body.productId ?? current.product_id;

  if (!(await ensureTenantProduct(session, nextProductId))) {
    return invalid("Referenced product does not belong to tenant");
  }

  const result = await query<ProjectRow>(
    `
      update video_projects
      set product_id = $3,
          template_id = $4,
          brand_kit_id = $5,
          status = $6,
          title = $7,
          updated_at = now()
      where tenant_id = $1 and id = $2
      returning id, tenant_id, product_id, template_id, brand_kit_id, status, title
    `,
    [
      session.tenantId,
      id,
      nextProductId,
      body.templateId ?? current.template_id,
      body.brandKitId ?? current.brand_kit_id,
      body.status ?? current.status,
      body.title ?? current.title
    ]
  );

  void recordAudit({
    session,
    action: "project.update",
    resourceType: "video_project",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: mapProject(result.rows[0])
  };
}

export async function deleteProject(session: AuthSession, id: string) {
  const denied = requirePermission(session, "projects:delete");
  if (denied) {
    return denied;
  }

  const result = await query<{ id: string }>(
    `
      delete from video_projects
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
    action: "project.delete",
    resourceType: "video_project",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: { deleted: true, id }
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
      message: "Project not found"
    }
  };
}

function mapProject(row: ProjectRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id,
    templateId: row.template_id,
    brandKitId: row.brand_kit_id ?? undefined,
    status: row.status,
    title: row.title
  };
}
