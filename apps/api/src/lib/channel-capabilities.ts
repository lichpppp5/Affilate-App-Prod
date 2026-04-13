import { query } from "../db";

export type EffectiveChannelCapabilities = {
  affiliateLinkRequired: boolean;
  disclosureRequired: boolean;
  maxCaptionLength: number | null;
  requireProductMapping: boolean;
};

export function defaultCapabilitiesForChannel(channel: string): EffectiveChannelCapabilities {
  if (channel === "facebook") {
    return {
      affiliateLinkRequired: true,
      disclosureRequired: false,
      maxCaptionLength: 8000,
      requireProductMapping: false
    };
  }

  if (channel === "tiktok") {
    return {
      affiliateLinkRequired: false,
      disclosureRequired: true,
      maxCaptionLength: 2200,
      requireProductMapping: false
    };
  }

  return {
    affiliateLinkRequired: false,
    disclosureRequired: false,
    maxCaptionLength: null,
    requireProductMapping: false
  };
}

export function parseCapabilitiesJson(
  channel: string,
  raw: string | null | undefined
): EffectiveChannelCapabilities {
  const base = defaultCapabilitiesForChannel(channel);
  if (!raw?.trim()) {
    return base;
  }

  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      affiliateLinkRequired:
        typeof o.affiliateLinkRequired === "boolean"
          ? o.affiliateLinkRequired
          : base.affiliateLinkRequired,
      disclosureRequired:
        typeof o.disclosureRequired === "boolean"
          ? o.disclosureRequired
          : base.disclosureRequired,
      maxCaptionLength:
        typeof o.maxCaptionLength === "number" && Number.isFinite(o.maxCaptionLength)
          ? Math.max(0, Math.floor(o.maxCaptionLength))
          : o.maxCaptionLength === null
            ? null
            : base.maxCaptionLength,
      requireProductMapping:
        typeof o.requireProductMapping === "boolean"
          ? o.requireProductMapping
          : base.requireProductMapping
    };
  } catch {
    return base;
  }
}

export function parseTrackingParamsObject(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) {
      continue;
    }
    out[String(k)] = typeof v === "string" ? v : String(v);
  }
  return out;
}

export async function loadChannelCapabilitySettings(
  tenantId: string,
  channel: string
): Promise<{
  capabilities: EffectiveChannelCapabilities;
  defaultTrackingParams: Record<string, string>;
}> {
  const result = await query<{
    capabilities_json: string;
    default_tracking_params_json: string;
  }>(
    `
      select capabilities_json, default_tracking_params_json
      from channel_capabilities
      where tenant_id = $1 and channel = $2
    `,
    [tenantId, channel]
  );

  const row = result.rows[0];
  const capabilities = parseCapabilitiesJson(channel, row?.capabilities_json);

  let defaultTrackingParams: Record<string, string> = {};
  if (row?.default_tracking_params_json?.trim()) {
    try {
      defaultTrackingParams = parseTrackingParamsObject(
        JSON.parse(row.default_tracking_params_json)
      );
    } catch {
      defaultTrackingParams = {};
    }
  }

  return { capabilities, defaultTrackingParams };
}
