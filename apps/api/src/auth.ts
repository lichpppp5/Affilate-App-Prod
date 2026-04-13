import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import type { IncomingMessage } from "node:http";

import { loadConfig } from "./config";
import { query } from "./db";

const config = loadConfig();

export interface AuthSession {
  userId: string;
  email: string;
  displayName: string;
  tenantId: string;
  roleName: string;
}

interface AuthTokenPayload {
  sub: string;
  email: string;
  displayName: string;
  tenantId: string;
  roleName: string;
  exp: number;
}

interface LoginRow {
  user_id: string;
  email: string;
  display_name: string;
  tenant_id: string;
  role_name: string;
  password_hash: string;
}

export async function loginWithPassword(input: {
  email: string;
  password: string;
  tenantId: string;
}) {
  const result = await query<LoginRow>(
    `
      select
        users.id as user_id,
        users.email,
        users.display_name,
        memberships.tenant_id,
        memberships.role_name,
        users.password_hash
      from users
      inner join memberships on memberships.user_id = users.id
      where lower(users.email) = lower($1)
        and memberships.tenant_id = $2
      limit 1
    `,
    [input.email, input.tenantId]
  );

  const row = result.rows[0];

  if (!row || !verifyPassword(input.password, row.password_hash)) {
    return null;
  }

  const session: AuthSession = {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    tenantId: row.tenant_id,
    roleName: row.role_name
  };

  return {
    token: signToken(session),
    session
  };
}

export function signToken(session: AuthSession) {
  const payload: AuthTokenPayload = {
    sub: session.userId,
    email: session.email,
    displayName: session.displayName,
    tenantId: session.tenantId,
    roleName: session.roleName,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", config.authSecret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function readSessionFromRequest(request: IncomingMessage) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length);
  return verifyToken(token);
}

export function verifyToken(token: string): AuthSession | null {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = createHmac("sha256", config.authSecret)
    .update(encodedPayload)
    .digest("base64url");

  if (signature.length !== expected.length) {
    return null;
  }

  const signatureMatches = timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );

  if (!signatureMatches) {
    return null;
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8")
  ) as AuthTokenPayload;

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    userId: payload.sub,
    email: payload.email,
    displayName: payload.displayName,
    tenantId: payload.tenantId,
    roleName: payload.roleName
  };
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, savedHash] = storedHash.split(":");

  if (!salt || !savedHash) {
    return false;
  }

  const derived = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(derived), Buffer.from(savedHash));
}
