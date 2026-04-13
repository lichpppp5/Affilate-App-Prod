import type { IncomingMessage } from "node:http";

import { readJsonBody } from "../lib/http";
import type { ProviderName } from "../providers";

export function buildMockAuthorizeRedirect(input: {
  provider: ProviderName;
  redirectUri?: string | null;
  state?: string | null;
}) {
  const redirect = new URL(input.redirectUri ?? "http://localhost:3000/channels");
  redirect.searchParams.set("code", `${input.provider}_code_${Date.now()}`);

  if (input.state) {
    redirect.searchParams.set("state", input.state);
  }

  return redirect.toString();
}

export async function mockTokenExchange(
  provider: ProviderName,
  request: IncomingMessage
) {
  const body = await readJsonBody<{
    grantType?: string;
    code?: string;
    refreshToken?: string;
    clientId?: string;
  }>(request);

  const suffix = body.code || body.refreshToken || `${Date.now()}`;

  return {
    statusCode: 200,
    payload: {
      access_token: `${provider}_access_${suffix}`,
      refresh_token: body.grantType === "client_credentials" ? "" : `${provider}_refresh_${suffix}`,
      expires_in: 7200,
      account_ref: `${provider}_acct_${body.clientId || "demo"}`,
      account_name: `${provider.toUpperCase()} Connected Account`,
      metadata: {
        provider,
        grantType: body.grantType ?? "authorization_code"
      }
    }
  };
}

export async function mockPublishDispatch(
  provider: ProviderName,
  request: IncomingMessage
) {
  const authorization = request.headers.authorization ?? "";
  const body = await readJsonBody<{
    publishJobId?: string;
    disclosureText?: string;
    caption?: string;
    hashtags?: string[];
    affiliateLink?: string;
  }>(request);

  if (!authorization.startsWith("Bearer ")) {
    return {
      statusCode: 401,
      payload: {
        message: "Missing bearer token"
      }
    };
  }

  if (provider === "tiktok" && !body.disclosureText?.trim()) {
    return {
      statusCode: 400,
      payload: {
        message: "Missing disclosureText"
      }
    };
  }

  if (provider === "facebook" && !body.affiliateLink?.trim()) {
    return {
      statusCode: 400,
      payload: {
        message: "Missing affiliateLink"
      }
    };
  }

  return {
    statusCode: 200,
    payload: {
      status:
        provider === "tiktok" ? "draft_uploaded" : "published",
      external_id: `${provider}_post_${body.publishJobId || Date.now()}`
    }
  };
}
