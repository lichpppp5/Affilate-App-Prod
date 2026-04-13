import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import { createId } from "../lib/ids";
import { requirePermission } from "../rbac";
import { refreshProviderAccessToken, type ProviderName } from "../providers";

interface ChannelAccountRow {
  id: string;
  tenant_id: string;
  channel: string;
  account_name: string;
  account_ref: string;
  auth_type: string;
  status: string;
  client_id: string;
  client_secret: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  metadata_json: string;
  last_refreshed_at: string | null;
}

interface ChannelAccountInput {
  channel?: ProviderName;
  accountName?: string;
  accountRef?: string;
  authType?: "oauth" | "service_account" | "manual";
  status?: "connected" | "expired" | "error" | "disconnected";
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  metadataJson?: string;
}

export async function listChannelAccounts(session: AuthSession) {
  const denied = requirePermission(session, "channels:read");
  if (denied) {
    return denied;
  }

  const result = await query<ChannelAccountRow>(
    `
      select
        id,
        tenant_id,
        channel,
        account_name,
        account_ref,
        auth_type,
        status,
        client_id,
        client_secret,
        access_token,
        refresh_token,
        token_expires_at::text,
        metadata_json,
        last_refreshed_at::text
      from channel_accounts
      where tenant_id = $1
      order by created_at desc
    `,
    [session.tenantId]
  );

  return {
    statusCode: 200,
    payload: result.rows.map(mapChannelAccount)
  };
}

export async function getChannelAccount(session: AuthSession, id: string) {
  const denied = requirePermission(session, "channels:read");
  if (denied) {
    return denied;
  }

  const row = await getChannelAccountRow(session, id);

  if (!row) {
    return notFound();
  }

  return {
    statusCode: 200,
    payload: mapChannelAccount(row)
  };
}

export async function createChannelAccount(
  session: AuthSession,
  body: ChannelAccountInput
) {
  const denied = requirePermission(session, "channels:write");
  if (denied) {
    return denied;
  }

  if (!body.channel || !body.accountName || !body.accountRef || !body.authType) {
    return invalid("channel, accountName, accountRef, and authType are required");
  }

  const result = await query<ChannelAccountRow>(
    `
      insert into channel_accounts (
        id,
        tenant_id,
        channel,
        account_name,
        account_ref,
        auth_type,
        status,
        client_id,
        client_secret,
        access_token,
        refresh_token,
        token_expires_at,
        metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      returning
        id,
        tenant_id,
        channel,
        account_name,
        account_ref,
        auth_type,
        status,
        client_id,
        client_secret,
        access_token,
        refresh_token,
        token_expires_at::text,
        metadata_json,
        last_refreshed_at::text
    `,
    [
      createId("channel"),
      session.tenantId,
      body.channel,
      body.accountName,
      body.accountRef,
      body.authType,
      body.status ?? "connected",
      body.clientId ?? "",
      body.clientSecret ?? "",
      body.accessToken ?? "",
      body.refreshToken ?? "",
      body.tokenExpiresAt ?? null,
      body.metadataJson ?? "{}"
    ]
  );

  const payload = mapChannelAccount(result.rows[0]);
  void recordAudit({
    session,
    action: "channel_account.create",
    resourceType: "channel_account",
    resourceId: payload.id,
    metadata: { channel: payload.channel }
  });

  return {
    statusCode: 201,
    payload
  };
}

export async function updateChannelAccount(
  session: AuthSession,
  id: string,
  body: ChannelAccountInput
) {
  const denied = requirePermission(session, "channels:write");
  if (denied) {
    return denied;
  }

  const current = await getChannelAccountRow(session, id);

  if (!current) {
    return notFound();
  }

  const result = await query<ChannelAccountRow>(
    `
      update channel_accounts
      set channel = $3,
          account_name = $4,
          account_ref = $5,
          auth_type = $6,
          status = $7,
          client_id = $8,
          client_secret = $9,
          access_token = $10,
          refresh_token = $11,
          token_expires_at = $12,
          metadata_json = $13,
          updated_at = now()
      where tenant_id = $1 and id = $2
      returning
        id,
        tenant_id,
        channel,
        account_name,
        account_ref,
        auth_type,
        status,
        client_id,
        client_secret,
        access_token,
        refresh_token,
        token_expires_at::text,
        metadata_json,
        last_refreshed_at::text
    `,
    [
      session.tenantId,
      id,
      body.channel ?? current.channel,
      body.accountName ?? current.account_name,
      body.accountRef ?? current.account_ref,
      body.authType ?? current.auth_type,
      body.status ?? current.status,
      body.clientId ?? current.client_id,
      body.clientSecret ?? current.client_secret,
      body.accessToken ?? current.access_token,
      body.refreshToken ?? current.refresh_token,
      body.tokenExpiresAt ?? current.token_expires_at,
      body.metadataJson ?? current.metadata_json
    ]
  );

  void recordAudit({
    session,
    action: "channel_account.update",
    resourceType: "channel_account",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: mapChannelAccount(result.rows[0])
  };
}

export async function deleteChannelAccount(session: AuthSession, id: string) {
  const denied = requirePermission(session, "channels:delete");
  if (denied) {
    return denied;
  }

  const result = await query<{ id: string }>(
    `
      delete from channel_accounts
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
    action: "channel_account.delete",
    resourceType: "channel_account",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: { deleted: true, id }
  };
}

export async function refreshChannelAccount(session: AuthSession, id: string) {
  const denied = requirePermission(session, "channels:write");
  if (denied) {
    return denied;
  }

  const current = await getChannelAccountRow(session, id);

  if (!current) {
    return notFound();
  }

  if (!current.refresh_token && current.auth_type !== "service_account") {
    return invalid("Account does not have a refresh token or service account credentials");
  }
  const refreshed = await refreshProviderAccessToken({
    provider: current.channel as ProviderName,
    refreshToken: current.refresh_token,
    authType: current.auth_type,
    clientId: current.client_id,
    clientSecret: current.client_secret
  });

  const result = await query<ChannelAccountRow>(
    `
      update channel_accounts
      set access_token = $3,
          token_expires_at = $4,
          refresh_token = $5,
          status = 'connected',
          last_refreshed_at = now(),
          updated_at = now()
      where tenant_id = $1 and id = $2
      returning
        id,
        tenant_id,
        channel,
        account_name,
        account_ref,
        auth_type,
        status,
        client_id,
        client_secret,
        access_token,
        refresh_token,
        token_expires_at::text,
        metadata_json,
        last_refreshed_at::text
    `,
    [
      session.tenantId,
      id,
      refreshed.accessToken,
      refreshed.tokenExpiresAt ?? null,
      refreshed.refreshToken || current.refresh_token
    ]
  );

  void recordAudit({
    session,
    action: "channel_account.refresh_token",
    resourceType: "channel_account",
    resourceId: id
  });

  return {
    statusCode: 200,
    payload: mapChannelAccount(result.rows[0])
  };
}

async function getChannelAccountRow(session: AuthSession, id: string) {
  const result = await query<ChannelAccountRow>(
    `
      select
        id,
        tenant_id,
        channel,
        account_name,
        account_ref,
        auth_type,
        status,
        client_id,
        client_secret,
        access_token,
        refresh_token,
        token_expires_at::text,
        metadata_json,
        last_refreshed_at::text
      from channel_accounts
      where tenant_id = $1 and id = $2
    `,
    [session.tenantId, id]
  );

  return result.rows[0] ?? null;
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
      message: "Channel account not found"
    }
  };
}

function mapChannelAccount(row: ChannelAccountRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    channel: row.channel,
    accountName: row.account_name,
    accountRef: row.account_ref,
    authType: row.auth_type,
    status: row.status,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at ?? undefined,
    metadataJson: row.metadata_json,
    lastRefreshedAt: row.last_refreshed_at ?? undefined
  };
}
