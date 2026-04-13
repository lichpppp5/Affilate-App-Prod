import { randomBytes } from "node:crypto";

import type { AuthSession } from "../auth";
import { hashPassword } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { requirePermission } from "../rbac";

type RoleName = "org_admin" | "content_manager" | "reviewer" | "operator" | "analyst";

interface UserRow {
  user_id: string;
  email: string;
  display_name: string;
  role_name: string;
  created_at: string;
}

interface CreateUserInput {
  email?: string;
  displayName?: string;
  roleName?: string;
  password?: string;
}

interface UpdateUserInput {
  displayName?: string;
  roleName?: string;
}

interface ResetPasswordInput {
  password?: string;
}

export async function listUsers(session: AuthSession) {
  const denied = requirePermission(session, "users:read");
  if (denied) {
    return denied;
  }

  const result = await query<UserRow>(
    `
      select
        users.id as user_id,
        users.email,
        users.display_name,
        memberships.role_name,
        users.created_at::text
      from memberships
      inner join users on users.id = memberships.user_id
      where memberships.tenant_id = $1
      order by users.created_at desc
    `,
    [session.tenantId]
  );

  return {
    statusCode: 200,
    payload: result.rows.map(mapRow)
  };
}

export async function createUser(session: AuthSession, body: CreateUserInput) {
  const denied = requirePermission(session, "users:write");
  if (denied) {
    return denied;
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const displayName = String(body.displayName ?? "").trim();
  const roleName = String(body.roleName ?? "").trim();

  if (!email || !email.includes("@")) {
    return invalid("email is required");
  }
  if (!displayName) {
    return invalid("displayName is required");
  }
  if (!isRoleName(roleName)) {
    return invalid("roleName must be org_admin, content_manager, reviewer, operator, or analyst");
  }

  const generatedPassword = !String(body.password ?? "").trim()
    ? generatePassword()
    : null;
  const password = generatedPassword ?? String(body.password ?? "").trim();

  if (password.length < 6) {
    return invalid("password must be at least 6 characters");
  }

  const userId = createId("user");
  const membershipId = createId("membership");

  try {
    await query(
      `
        insert into users (id, email, password_hash, display_name)
        values ($1, $2, $3, $4)
      `,
      [userId, email, hashPassword(password), displayName]
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
      return invalid("email already exists");
    }
    throw e;
  }

  await query(
    `
      insert into memberships (id, tenant_id, user_id, role_name)
      values ($1, $2, $3, $4)
    `,
    [membershipId, session.tenantId, userId, roleName]
  );

  void recordAudit({
    session,
    action: "user.create",
    resourceType: "user",
    resourceId: userId,
    metadata: { email, roleName }
  });

  return {
    statusCode: 201,
    payload: {
      id: userId,
      email,
      displayName,
      roleName,
      generatedPassword: generatedPassword ?? undefined
    }
  };
}

export async function updateUser(session: AuthSession, id: string, body: UpdateUserInput) {
  const denied = requirePermission(session, "users:write");
  if (denied) {
    return denied;
  }

  const existing = await query<UserRow>(
    `
      select
        users.id as user_id,
        users.email,
        users.display_name,
        memberships.role_name,
        users.created_at::text
      from memberships
      inner join users on users.id = memberships.user_id
      where memberships.tenant_id = $1 and users.id = $2
      limit 1
    `,
    [session.tenantId, id]
  );

  const current = existing.rows[0];
  if (!current) {
    return notFound();
  }

  const nextDisplayName = body.displayName !== undefined ? String(body.displayName).trim() : current.display_name;
  const nextRoleName = body.roleName !== undefined ? String(body.roleName).trim() : current.role_name;

  if (!nextDisplayName) {
    return invalid("displayName cannot be empty");
  }
  if (!isRoleName(nextRoleName)) {
    return invalid("roleName must be org_admin, content_manager, reviewer, operator, or analyst");
  }

  await query(
    `
      update users
      set display_name = $3
      where id = $2
    `,
    [session.tenantId, id, nextDisplayName]
  );

  await query(
    `
      update memberships
      set role_name = $3
      where tenant_id = $1 and user_id = $2
    `,
    [session.tenantId, id, nextRoleName]
  );

  void recordAudit({
    session,
    action: "user.update",
    resourceType: "user",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: {
      id,
      email: current.email,
      displayName: nextDisplayName,
      roleName: nextRoleName
    }
  };
}

export async function deleteUser(session: AuthSession, id: string) {
  const denied = requirePermission(session, "users:delete");
  if (denied) {
    return denied;
  }

  if (id === session.userId) {
    return invalid("You cannot delete your own user");
  }

  const membership = await query<{ user_id: string }>(
    `
      delete from memberships
      where tenant_id = $1 and user_id = $2
      returning user_id
    `,
    [session.tenantId, id]
  );

  if (membership.rows.length === 0) {
    return notFound();
  }

  // Remove user record if no memberships remain (safe for multi-tenant future).
  await query(
    `
      delete from users
      where id = $1
        and not exists (select 1 from memberships where user_id = $1)
    `,
    [id]
  );

  void recordAudit({
    session,
    action: "user.delete",
    resourceType: "user",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: { deleted: true, id }
  };
}

export async function resetUserPassword(
  session: AuthSession,
  id: string,
  body: ResetPasswordInput
) {
  const denied = requirePermission(session, "users:write");
  if (denied) {
    return denied;
  }

  const exists = await query<{ id: string }>(
    `
      select users.id
      from memberships
      inner join users on users.id = memberships.user_id
      where memberships.tenant_id = $1 and users.id = $2
      limit 1
    `,
    [session.tenantId, id]
  );

  if (exists.rows.length === 0) {
    return notFound();
  }

  const generatedPassword = !String(body.password ?? "").trim()
    ? generatePassword()
    : null;
  const nextPassword = generatedPassword ?? String(body.password ?? "").trim();

  if (nextPassword.length < 6) {
    return invalid("password must be at least 6 characters");
  }

  await query(
    `
      update users
      set password_hash = $2
      where id = $1
    `,
    [id, hashPassword(nextPassword)]
  );

  void recordAudit({
    session,
    action: "user.reset_password",
    resourceType: "user",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: {
      ok: true,
      id,
      password: generatedPassword ?? nextPassword
    }
  };
}

function isRoleName(value: string): value is RoleName {
  return (
    value === "org_admin" ||
    value === "content_manager" ||
    value === "reviewer" ||
    value === "operator" ||
    value === "analyst"
  );
}

function generatePassword() {
  return randomBytes(9).toString("base64url");
}

function mapRow(row: UserRow) {
  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    roleName: row.role_name,
    createdAt: row.created_at
  };
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
    payload: { message: "User not found" }
  };
}

