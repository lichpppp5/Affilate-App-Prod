import type { AuthSession } from "./auth";

export type Permission =
  | "dashboard:read"
  | "reports:read"
  | "audit:read"
  | "notifications:read"
  | "notifications:write"
  | "products:read"
  | "products:write"
  | "products:delete"
  | "assets:read"
  | "assets:write"
  | "assets:delete"
  | "projects:read"
  | "projects:write"
  | "projects:delete"
  | "approvals:read"
  | "approvals:write"
  | "approvals:delete"
  | "publish:read"
  | "publish:write"
  | "publish:operate"
  | "channels:read"
  | "channels:write"
  | "channels:delete"
  | "render:read"
  | "render:write"
  | "render:operate";

const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  org_admin: [],
  content_manager: [
    "dashboard:read",
    "notifications:read",
    "notifications:write",
    "products:read",
    "products:write",
    "products:delete",
    "assets:read",
    "assets:write",
    "assets:delete",
    "projects:read",
    "projects:write",
    "projects:delete",
    "approvals:read",
    "publish:read",
    "publish:write",
    "channels:read",
    "channels:write",
    "render:read",
    "render:write",
    "render:operate"
  ],
  reviewer: [
    "dashboard:read",
    "notifications:read",
    "notifications:write",
    "products:read",
    "assets:read",
    "projects:read",
    "approvals:read",
    "approvals:write",
    "approvals:delete"
  ],
  operator: [
    "dashboard:read",
    "notifications:read",
    "notifications:write",
    "products:read",
    "assets:read",
    "projects:read",
    "publish:read",
    "publish:write",
    "publish:operate",
    "channels:read",
    "render:read",
    "render:write",
    "render:operate",
    "approvals:read"
  ],
  analyst: [
    "dashboard:read",
    "reports:read",
    "notifications:read",
    "notifications:write",
    "products:read",
    "projects:read",
    "publish:read",
    "render:read",
    "approvals:read"
  ]
};

export function hasPermission(roleName: string, permission: Permission): boolean {
  if (roleName === "org_admin") {
    return true;
  }

  const list = ROLE_PERMISSIONS[roleName];
  if (!list) {
    return false;
  }

  return list.includes(permission);
}

export function listPermissions(roleName: string): Permission[] {
  if (roleName === "org_admin") {
    return [
      "dashboard:read",
      "reports:read",
      "audit:read",
      "notifications:read",
      "notifications:write",
      "products:read",
      "products:write",
      "products:delete",
      "assets:read",
      "assets:write",
      "assets:delete",
      "projects:read",
      "projects:write",
      "projects:delete",
      "approvals:read",
      "approvals:write",
      "approvals:delete",
      "publish:read",
      "publish:write",
      "publish:operate",
      "channels:read",
      "channels:write",
      "channels:delete",
      "render:read",
      "render:write",
      "render:operate"
    ];
  }

  return [...(ROLE_PERMISSIONS[roleName] ?? [])];
}

export function enrichSession(session: AuthSession) {
  return {
    ...session,
    permissions: listPermissions(session.roleName)
  };
}

export function forbidden() {
  return {
    statusCode: 403 as const,
    payload: { message: "Forbidden" }
  };
}

export function requirePermission(session: AuthSession, permission: Permission) {
  if (!hasPermission(session.roleName, permission)) {
    return forbidden();
  }

  return null;
}
