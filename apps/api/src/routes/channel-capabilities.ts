import type { AuthSession } from "../auth";
import { recordAudit } from "../audit";
import { query } from "../db";
import {
  defaultCapabilitiesForChannel,
  parseCapabilitiesJson,
  parseTrackingParamsObject
} from "../lib/channel-capabilities";
import { requirePermission } from "../rbac";

const CHANNEL_ORDER = ["facebook", "tiktok", "shopee"] as const;

type Channel = (typeof CHANNEL_ORDER)[number];

interface CapabilityRow {
  tenant_id: string;
  channel: string;
  capabilities_json: string;
  default_tracking_params_json: string;
}

interface UpsertInput {
  capabilitiesJson?: Record<string, unknown>;
  defaultTrackingParamsJson?: Record<string, unknown>;
}

export async function listChannelCapabilities(session: AuthSession) {
  const denied = requirePermission(session, "channels:read");
  if (denied) {
    return denied;
  }

  const result = await query<CapabilityRow>(
    `
      select tenant_id, channel, capabilities_json, default_tracking_params_json
      from channel_capabilities
      where tenant_id = $1
    `,
    [session.tenantId]
  );

  const byChannel = new Map(result.rows.map((r) => [r.channel, r]));

  const payload = CHANNEL_ORDER.map((channel) => {
    const row = byChannel.get(channel);
    const effective = parseCapabilitiesJson(channel, row?.capabilities_json);
    let defaultTracking: Record<string, string> = {};
    if (row?.default_tracking_params_json?.trim()) {
      try {
        defaultTracking = parseTrackingParamsObject(
          JSON.parse(row.default_tracking_params_json)
        );
      } catch {
        defaultTracking = {};
      }
    }

    let capabilitiesObject: Record<string, unknown> = {};
    try {
      capabilitiesObject = row?.capabilities_json?.trim()
        ? (JSON.parse(row.capabilities_json) as Record<string, unknown>)
        : {};
    } catch {
      capabilitiesObject = {};
    }

    return {
      channel,
      configured: Boolean(row),
      capabilitiesJson: capabilitiesObject,
      effective,
      defaults: defaultCapabilitiesForChannel(channel),
      defaultTrackingParams: defaultTracking
    };
  });

  return {
    statusCode: 200,
    payload
  };
}

export async function upsertChannelCapability(
  session: AuthSession,
  channel: string,
  body: UpsertInput
) {
  const denied = requirePermission(session, "channels:write");
  if (denied) {
    return denied;
  }

  if (!isChannel(channel)) {
    return invalid("channel must be facebook, tiktok, or shopee");
  }

  const existing = await query<CapabilityRow>(
    `
      select capabilities_json, default_tracking_params_json
      from channel_capabilities
      where tenant_id = $1 and channel = $2
    `,
    [session.tenantId, channel]
  );

  const current = existing.rows[0];
  let nextCapsJson = current?.capabilities_json?.trim() ? current.capabilities_json : "{}";
  let nextTrackJson = current?.default_tracking_params_json?.trim()
    ? current.default_tracking_params_json
    : "{}";

  if (body.capabilitiesJson !== undefined) {
    try {
      nextCapsJson = JSON.stringify(body.capabilitiesJson);
      JSON.parse(nextCapsJson);
    } catch {
      return invalid("capabilitiesJson must be JSON-serializable");
    }
  }

  if (body.defaultTrackingParamsJson !== undefined) {
    const flat = parseTrackingParamsObject(body.defaultTrackingParamsJson);
    nextTrackJson = JSON.stringify(flat);
  }

  await query(
    `
      insert into channel_capabilities (
        tenant_id,
        channel,
        capabilities_json,
        default_tracking_params_json
      )
      values ($1, $2, $3::text, $4::text)
      on conflict (tenant_id, channel) do update
      set capabilities_json = excluded.capabilities_json,
          default_tracking_params_json = excluded.default_tracking_params_json,
          updated_at = now()
    `,
    [session.tenantId, channel, nextCapsJson, nextTrackJson]
  );

  void recordAudit({
    session,
    action: "channel_capabilities.upsert",
    resourceType: "channel_capabilities",
    resourceId: channel
  });

  const refreshed = await query<CapabilityRow>(
    `
      select tenant_id, channel, capabilities_json, default_tracking_params_json
      from channel_capabilities
      where tenant_id = $1 and channel = $2
    `,
    [session.tenantId, channel]
  );

  const row = refreshed.rows[0]!;
  const effective = parseCapabilitiesJson(channel, row.capabilities_json);
  const defaultTracking = parseTrackingParamsObject(
    JSON.parse(row.default_tracking_params_json || "{}")
  );

  return {
    statusCode: 200,
    payload: {
      channel,
      capabilitiesJson: JSON.parse(row.capabilities_json || "{}") as Record<string, unknown>,
      effective,
      defaultTrackingParams: defaultTracking
    }
  };
}

function isChannel(value: string): value is Channel {
  return (CHANNEL_ORDER as readonly string[]).includes(value);
}

function invalid(message: string) {
  return {
    statusCode: 400 as const,
    payload: { message }
  };
}
