import { createHmac, randomBytes } from "node:crypto";

import { loadConfig } from "./config";

export type ProviderName = "tiktok" | "shopee" | "facebook";

interface OAuthStatePayload {
  provider: ProviderName;
  tenantId: string;
  accountId: string;
  createdAt: number;
  nonce: string;
}

interface ProviderTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt?: string;
  accountRef?: string;
  accountName?: string;
  metadataJson?: string;
}

const config = loadConfig();

export function getProviderConfig(provider: ProviderName) {
  const upper = provider.toUpperCase();
  const envAuthorizeUrl = process.env[`${upper}_OAUTH_AUTHORIZE_URL`] || "";
  const envTokenUrl = process.env[`${upper}_OAUTH_TOKEN_URL`] || "";
  const envPublishUrl = process.env[`${upper}_PUBLISH_URL`] || "";
  const defaults = {
    authorizeUrl: `${config.apiBaseUrl}/provider-mocks/${provider}/oauth/authorize`,
    tokenUrl: `${config.apiBaseUrl}/provider-mocks/${provider}/oauth/token`,
    publishUrl: `${config.apiBaseUrl}/provider-mocks/${provider}/publish`
  };

  return {
    authorizeUrl: envAuthorizeUrl || defaults.authorizeUrl,
    tokenUrl: envTokenUrl || defaults.tokenUrl,
    publishUrl: envPublishUrl || defaults.publishUrl,
    clientId: process.env[`${upper}_CLIENT_ID`] || "",
    clientSecret: process.env[`${upper}_CLIENT_SECRET`] || "",
    callbackUrl: `${config.apiBaseUrl}/oauth/${provider}/callback`,
    isMock:
      !envAuthorizeUrl && !envTokenUrl && !envPublishUrl,
    hasExplicitEndpoints: Boolean(envAuthorizeUrl && envTokenUrl && envPublishUrl)
  };
}

export function createOAuthState(input: {
  provider: ProviderName;
  tenantId: string;
  accountId: string;
}) {
  const payload: OAuthStatePayload = {
    provider: input.provider,
    tenantId: input.tenantId,
    accountId: input.accountId,
    createdAt: Date.now(),
    nonce: randomBytes(8).toString("hex")
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(state: string) {
  const [encoded, signature] = state.split(".");

  if (!encoded || !signature || sign(encoded) !== signature) {
    return null;
  }

  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8")
  ) as OAuthStatePayload;

  if (Date.now() - payload.createdAt > 10 * 60 * 1000) {
    return null;
  }

  return payload;
}

export function buildOAuthAuthorizationUrl(input: {
  provider: ProviderName;
  state: string;
  clientId?: string;
}) {
  const provider = getProviderConfig(input.provider);
  const params = new URLSearchParams({
    client_id: input.clientId || provider.clientId,
    redirect_uri: provider.callbackUrl,
    response_type: "code",
    state: input.state
  });

  return `${provider.authorizeUrl}?${params.toString()}`;
}

export async function exchangeAuthorizationCode(input: {
  provider: ProviderName;
  code: string;
  clientId?: string;
  clientSecret?: string;
}) {
  return callTokenEndpoint(input.provider, {
    grantType: "authorization_code",
    code: input.code,
    redirectUri: getProviderConfig(input.provider).callbackUrl,
    clientId: input.clientId,
    clientSecret: input.clientSecret
  });
}

export async function refreshProviderAccessToken(input: {
  provider: ProviderName;
  refreshToken?: string;
  authType: string;
  clientId?: string;
  clientSecret?: string;
}) {
  return callTokenEndpoint(input.provider, {
    grantType:
      input.authType === "service_account" ? "client_credentials" : "refresh_token",
    refreshToken: input.refreshToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret
  });
}

export async function publishToProvider(input: {
  provider: ProviderName;
  accessToken: string;
  payload: Record<string, unknown>;
}) {
  const provider = getProviderConfig(input.provider);
  const response = await fetch(provider.publishUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.accessToken}`
    },
    body: JSON.stringify(input.payload)
  });

  const payload = (await response.json()) as {
    status?: string;
    external_id?: string;
    message?: string;
  };

  if (!response.ok || !payload.status) {
    throw new Error(payload.message || `Publish failed for ${input.provider}`);
  }

  return payload;
}

async function callTokenEndpoint(
  providerName: ProviderName,
  body: {
    grantType: string;
    code?: string;
    refreshToken?: string;
    redirectUri?: string;
    clientId?: string;
    clientSecret?: string;
  }
) {
  const provider = getProviderConfig(providerName);
  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      ...body,
      clientId: body.clientId || provider.clientId,
      clientSecret: body.clientSecret || provider.clientSecret
    })
  });

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    account_ref?: string;
    account_name?: string;
    metadata?: Record<string, unknown>;
    message?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.message || `OAuth token exchange failed for ${providerName}`);
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? "",
    tokenExpiresAt: payload.expires_in
      ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
      : undefined,
    accountRef: payload.account_ref,
    accountName: payload.account_name,
    metadataJson: payload.metadata ? JSON.stringify(payload.metadata) : undefined
  } satisfies ProviderTokenResponse;
}

function sign(value: string) {
  return createHmac("sha256", config.authSecret).update(value).digest("base64url");
}
