import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { loadConfig } from "../config";
import { query } from "../db";
import { decryptSecret, encryptSecret, secretFingerprint } from "../lib/crypto";
import { requirePermission } from "../rbac";

const config = loadConfig();

type ProviderName = "veo3";

interface Row {
  tenant_id: string;
  provider: string;
  api_key_encrypted: string;
  base_url: string;
  model: string;
}

interface UpsertInput {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export async function listAiProviders(session: AuthSession) {
  const denied = requirePermission(session, "channels:read");
  if (denied) return denied;

  const result = await query<Row>(
    `
      select tenant_id, provider, api_key_encrypted, base_url, model
      from ai_provider_credentials
      where tenant_id = $1
      order by provider asc
    `,
    [session.tenantId]
  );

  const byProvider = new Map(result.rows.map((r) => [r.provider, r]));
  const veo = byProvider.get("veo3");
  const veoKey = veo?.api_key_encrypted ? decryptSecret(config.authSecret, veo.api_key_encrypted) : "";

  return {
    statusCode: 200,
    payload: [
      {
        provider: "veo3",
        configured: Boolean(veo?.api_key_encrypted?.trim()),
        baseUrl: veo?.base_url ?? "https://generativelanguage.googleapis.com/v1beta",
        model: veo?.model ?? "veo-3.1-generate-preview",
        apiKeyFingerprint: veoKey ? secretFingerprint(veoKey) : undefined
      }
    ]
  };
}

export async function upsertAiProvider(
  session: AuthSession,
  provider: string,
  body: UpsertInput
) {
  const denied = requirePermission(session, "channels:write");
  if (denied) return denied;

  if (!isProvider(provider)) {
    return invalid("provider must be veo3");
  }

  const current = await query<Row>(
    `
      select tenant_id, provider, api_key_encrypted, base_url, model
      from ai_provider_credentials
      where tenant_id = $1 and provider = $2
    `,
    [session.tenantId, provider]
  );

  const row = current.rows[0];
  const nextBaseUrl = (body.baseUrl ?? row?.base_url ?? "https://generativelanguage.googleapis.com/v1beta").trim();
  const nextModel = (body.model ?? row?.model ?? "veo-3.1-generate-preview").trim();

  let nextApiKeyEncrypted = row?.api_key_encrypted ?? "";
  if (body.apiKey !== undefined) {
    const apiKey = String(body.apiKey).trim();
    nextApiKeyEncrypted = apiKey ? encryptSecret(config.authSecret, apiKey) : "";
  }

  await query(
    `
      insert into ai_provider_credentials (tenant_id, provider, api_key_encrypted, base_url, model)
      values ($1, $2, $3, $4, $5)
      on conflict (tenant_id, provider) do update
      set api_key_encrypted = excluded.api_key_encrypted,
          base_url = excluded.base_url,
          model = excluded.model,
          updated_at = now()
    `,
    [session.tenantId, provider, nextApiKeyEncrypted, nextBaseUrl, nextModel]
  );

  void recordAudit({
    session,
    action: "ai_provider.upsert",
    resourceType: "ai_provider",
    resourceId: provider
  });

  const apiKey = nextApiKeyEncrypted ? decryptSecret(config.authSecret, nextApiKeyEncrypted) : "";
  return {
    statusCode: 200,
    payload: {
      provider,
      configured: Boolean(apiKey),
      baseUrl: nextBaseUrl,
      model: nextModel,
      apiKeyFingerprint: apiKey ? secretFingerprint(apiKey) : undefined
    }
  };
}

export async function testAiProvider(session: AuthSession, provider: string) {
  const denied = requirePermission(session, "channels:read");
  if (denied) return denied;

  if (!isProvider(provider)) {
    return invalid("provider must be veo3");
  }

  const result = await query<Row>(
    `
      select tenant_id, provider, api_key_encrypted, base_url, model
      from ai_provider_credentials
      where tenant_id = $1 and provider = $2
    `,
    [session.tenantId, provider]
  );

  const row = result.rows[0];
  if (!row?.api_key_encrypted?.trim()) {
    return invalid("API key is not configured");
  }

  const apiKey = decryptSecret(config.authSecret, row.api_key_encrypted);
  const baseUrl = row.base_url?.trim() || "https://generativelanguage.googleapis.com/v1beta";
  const model = row.model?.trim() || "veo-3.1-generate-preview";

  // Lightweight connectivity check: fetch model metadata (no generation cost).
  const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}`, {
    headers: {
      "x-goog-api-key": apiKey
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      statusCode: 400,
      payload: {
        ok: false,
        message: `Provider test failed: HTTP ${response.status}`,
        details: text.slice(0, 500)
      }
    };
  }

  return {
    statusCode: 200,
    payload: {
      ok: true,
      provider,
      model
    }
  };
}

export async function getAiProviderSecretForWorker(tenantId: string, provider: ProviderName) {
  const result = await query<Row>(
    `
      select tenant_id, provider, api_key_encrypted, base_url, model
      from ai_provider_credentials
      where tenant_id = $1 and provider = $2
    `,
    [tenantId, provider]
  );

  const row = result.rows[0];
  if (!row?.api_key_encrypted?.trim()) {
    return null;
  }

  return {
    apiKey: decryptSecret(config.authSecret, row.api_key_encrypted),
    baseUrl: row.base_url,
    model: row.model
  };
}

function isProvider(value: string): value is ProviderName {
  return value === "veo3";
}

function invalid(message: string) {
  return {
    statusCode: 400 as const,
    payload: { message }
  };
}

