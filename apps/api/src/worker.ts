import { query } from "./db";

export async function markProjectStatus(
  tenantId: string,
  projectId: string,
  status: string
) {
  await query(
    `
      update video_projects
      set status = $3,
          updated_at = now()
      where tenant_id = $1 and id = $2
    `,
    [tenantId, projectId, status]
  );
}
