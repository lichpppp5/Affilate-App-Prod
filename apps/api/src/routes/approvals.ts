import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { requirePermission } from "../rbac";
import { ensureTenantProject } from "./helpers";
import { markProjectStatus } from "../worker";

interface ApprovalRow {
  id: string;
  tenant_id: string;
  project_id: string;
  reviewer_id: string | null;
  reviewer_name: string;
  decision: string;
  comment: string;
  created_at: string;
}

interface ApprovalInput {
  projectId?: string;
  decision?: string;
  comment?: string;
}

export async function listApprovals(session: AuthSession) {
  const denied = requirePermission(session, "approvals:read");
  if (denied) {
    return denied;
  }

  const result = await query<ApprovalRow>(
    `
      select id, tenant_id, project_id, reviewer_id, reviewer_name, decision, comment, created_at::text
      from approvals
      where tenant_id = $1
      order by created_at desc
    `,
    [session.tenantId]
  );

  return {
    statusCode: 200,
    payload: result.rows.map(mapApproval)
  };
}

export async function getApproval(session: AuthSession, id: string) {
  const denied = requirePermission(session, "approvals:read");
  if (denied) {
    return denied;
  }

  const result = await query<ApprovalRow>(
    `
      select id, tenant_id, project_id, reviewer_id, reviewer_name, decision, comment, created_at::text
      from approvals
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (result.rows.length === 0) {
    return notFound();
  }

  return {
    statusCode: 200,
    payload: mapApproval(result.rows[0])
  };
}

export async function createApproval(session: AuthSession, body: ApprovalInput) {
  const denied = requirePermission(session, "approvals:write");
  if (denied) {
    return denied;
  }

  if (!body.projectId || !body.decision) {
    return invalid("projectId and decision are required");
  }

  if (!(await ensureTenantProject(session, body.projectId))) {
    return invalid("Referenced project does not belong to tenant");
  }

  const result = await query<ApprovalRow>(
    `
      insert into approvals (
        id,
        tenant_id,
        project_id,
        reviewer_id,
        reviewer_name,
        decision,
        comment
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      returning id, tenant_id, project_id, reviewer_id, reviewer_name, decision, comment, created_at::text
    `,
    [
      createId("approval"),
      session.tenantId,
      body.projectId,
      session.userId,
      session.displayName,
      body.decision,
      body.comment ?? ""
    ]
  );

  await syncProjectStatus(session, body.projectId, body.decision);

  const payload = mapApproval(result.rows[0]);
  void recordAudit({
    session,
    action: "approval.create",
    resourceType: "approval",
    resourceId: payload.id,
    metadata: { decision: body.decision }
  });

  return {
    statusCode: 201,
    payload
  };
}

export async function updateApproval(
  session: AuthSession,
  id: string,
  body: ApprovalInput
) {
  const denied = requirePermission(session, "approvals:write");
  if (denied) {
    return denied;
  }

  const existing = await query<ApprovalRow>(
    `
      select id, tenant_id, project_id, reviewer_id, reviewer_name, decision, comment, created_at::text
      from approvals
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  if (existing.rows.length === 0) {
    return notFound();
  }

  const current = existing.rows[0];
  const nextProjectId = body.projectId ?? current.project_id;

  if (!(await ensureTenantProject(session, nextProjectId))) {
    return invalid("Referenced project does not belong to tenant");
  }

  const result = await query<ApprovalRow>(
    `
      update approvals
      set project_id = $3,
          reviewer_id = $4,
          reviewer_name = $5,
          decision = $6,
          comment = $7,
          updated_at = now()
      where tenant_id = $1 and id = $2
      returning id, tenant_id, project_id, reviewer_id, reviewer_name, decision, comment, created_at::text
    `,
    [
      session.tenantId,
      id,
      nextProjectId,
      session.userId,
      session.displayName,
      body.decision ?? current.decision,
      body.comment ?? current.comment
    ]
  );

  await syncProjectStatus(session, nextProjectId, body.decision ?? current.decision);

  void recordAudit({
    session,
    action: "approval.update",
    resourceType: "approval",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: mapApproval(result.rows[0])
  };
}

export async function deleteApproval(session: AuthSession, id: string) {
  const denied = requirePermission(session, "approvals:delete");
  if (denied) {
    return denied;
  }

  const result = await query<{ id: string }>(
    `
      delete from approvals
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
    action: "approval.delete",
    resourceType: "approval",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: { deleted: true, id }
  };
}

async function syncProjectStatus(
  session: AuthSession,
  projectId: string,
  decision: string
) {
  let nextStatus = "review";

  if (decision === "approved") {
    nextStatus = "approved";
  }

  if (decision === "rejected" || decision === "changes_requested") {
    nextStatus = "draft";
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
      message: "Approval not found"
    }
  };
}

function mapApproval(row: ApprovalRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    reviewerId: row.reviewer_id ?? undefined,
    reviewerName: row.reviewer_name,
    decision: row.decision,
    comment: row.comment,
    createdAt: row.created_at
  };
}
