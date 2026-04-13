import type { IncomingMessage } from "node:http";

import type { AuthSession } from "../auth";
import { loginWithPassword } from "../auth";
import { readJsonBody } from "../lib/http";
import { recordAudit } from "../audit";
import { enrichSession } from "../rbac";

interface LoginInput {
  email?: string;
  password?: string;
  tenantId?: string;
}

export async function login(request: IncomingMessage) {
  const body = await readJsonBody<LoginInput>(request);

  if (!body.email || !body.password || !body.tenantId) {
    return {
      statusCode: 400,
      payload: {
        message: "email, password, and tenantId are required"
      }
    };
  }

  const result = await loginWithPassword({
    email: body.email,
    password: body.password,
    tenantId: body.tenantId
  });

  if (!result) {
    return {
      statusCode: 401,
      payload: {
        message: "Invalid credentials"
      }
    };
  }

  void recordAudit({
    session: result.session,
    action: "auth.login",
    metadata: { email: body.email }
  });

  return {
    statusCode: 200,
    payload: {
      token: result.token,
      session: enrichSession(result.session)
    }
  };
}

export function me(session: AuthSession) {
  return {
    statusCode: 200,
    payload: enrichSession(session)
  };
}
