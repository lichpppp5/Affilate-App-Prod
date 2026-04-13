export type WorkerProviderName = "tiktok" | "shopee" | "facebook";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:4000";

export function getWorkerProviderConfig(provider: WorkerProviderName) {
  const upper = provider.toUpperCase();

  return {
    tokenUrl:
      process.env[`${upper}_OAUTH_TOKEN_URL`] ||
      `${apiBaseUrl}/provider-mocks/${provider}/oauth/token`,
    publishUrl:
      process.env[`${upper}_PUBLISH_URL`] ||
      `${apiBaseUrl}/provider-mocks/${provider}/publish`,
    clientId: process.env[`${upper}_CLIENT_ID`] || "",
    clientSecret: process.env[`${upper}_CLIENT_SECRET`] || ""
  };
}

export async function refreshWorkerProviderToken(input: {
  provider: WorkerProviderName;
  authType: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}) {
  const provider = getWorkerProviderConfig(input.provider);
  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      grantType:
        input.authType === "service_account" ? "client_credentials" : "refresh_token",
      refreshToken: input.refreshToken,
      clientId: input.clientId || provider.clientId,
      clientSecret: input.clientSecret || provider.clientSecret
    })
  });

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    message?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.message || `Token refresh failed for ${input.provider}`);
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? "",
    tokenExpiresAt: payload.expires_in
      ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
      : undefined
  };
}

export async function dispatchWorkerPublish(input: {
  provider: WorkerProviderName;
  accessToken: string;
  payload: Record<string, unknown>;
}) {
  const provider = getWorkerProviderConfig(input.provider);
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
