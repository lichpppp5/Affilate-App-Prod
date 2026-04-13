import type { AuthSession } from "../auth";
import { loadConfig } from "../config";
import { query } from "../db";
import { requirePermission } from "../rbac";
import {
  buildOAuthAuthorizationUrl,
  createOAuthState,
  exchangeAuthorizationCode,
  type ProviderName,
  verifyOAuthState
} from "../providers";

const config = loadConfig();

export async function startOAuthFlow(
  session: AuthSession,
  input: {
    tenantId: string;
    provider: ProviderName;
    accountId: string;
  }
) {
  const denied = requirePermission(session, "channels:write");
  if (denied) {
    return denied;
  }

  const result = await query<{
    id: string;
    client_id: string;
    client_secret: string;
    auth_type: string;
  }>(
    `
      select id, client_id, client_secret, auth_type
      from channel_accounts
      where tenant_id = $1 and id = $2 and channel = $3
    `,
    [input.tenantId, input.accountId, input.provider]
  );

  const account = result.rows[0];

  if (!account) {
    return {
      statusCode: 404,
      payload: {
        message: "Channel account not found"
      }
    };
  }

  if (account.auth_type !== "oauth") {
    return {
      statusCode: 400,
      payload: {
        message: "OAuth flow is only available for oauth accounts"
      }
    };
  }

  const state = createOAuthState({
    provider: input.provider,
    tenantId: input.tenantId,
    accountId: input.accountId
  });

  return {
    statusCode: 200,
    payload: {
      authorizationUrl: buildOAuthAuthorizationUrl({
        provider: input.provider,
        state,
        clientId: account.client_id
      })
    }
  };
}

export async function handleOAuthCallback(input: {
  provider: ProviderName;
  code?: string | null;
  state?: string | null;
  error?: string | null;
}) {
  if (input.error) {
    return {
      redirectUrl: `${config.webBaseUrl}/channels?oauth=error&provider=${input.provider}`
    };
  }

  if (!input.code || !input.state) {
    return {
      redirectUrl: `${config.webBaseUrl}/channels?oauth=error&provider=${input.provider}`
    };
  }

  const state = verifyOAuthState(input.state);

  if (!state || state.provider !== input.provider) {
    return {
      redirectUrl: `${config.webBaseUrl}/channels?oauth=invalid_state&provider=${input.provider}`
    };
  }

  const result = await query<{
    id: string;
    client_id: string;
    client_secret: string;
    account_ref: string;
    account_name: string;
    metadata_json: string;
  }>(
    `
      select
        id,
        client_id,
        client_secret,
        account_ref,
        account_name,
        metadata_json
      from channel_accounts
      where tenant_id = $1 and id = $2 and channel = $3
    `,
    [state.tenantId, state.accountId, input.provider]
  );

  const account = result.rows[0];

  if (!account) {
    return {
      redirectUrl: `${config.webBaseUrl}/channels?oauth=account_missing&provider=${input.provider}`
    };
  }

  const token = await exchangeAuthorizationCode({
    provider: input.provider,
    code: input.code,
    clientId: account.client_id,
    clientSecret: account.client_secret
  });

  await query(
    `
      update channel_accounts
      set access_token = $4,
          refresh_token = $5,
          token_expires_at = $6,
          account_ref = $7,
          account_name = $8,
          metadata_json = $9,
          status = 'connected',
          last_refreshed_at = now(),
          updated_at = now()
      where tenant_id = $1 and id = $2 and channel = $3
    `,
    [
      state.tenantId,
      state.accountId,
      input.provider,
      token.accessToken,
      token.refreshToken,
      token.tokenExpiresAt ?? null,
      token.accountRef || account.account_ref,
      token.accountName || account.account_name,
      token.metadataJson || account.metadata_json
    ]
  );

  return {
    redirectUrl: `${config.webBaseUrl}/channels?oauth=success&provider=${input.provider}`
  };
}
