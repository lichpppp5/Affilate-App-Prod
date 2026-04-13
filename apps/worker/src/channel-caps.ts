export type WorkerChannelCaps = {
  affiliateLinkRequired: boolean;
  disclosureRequired: boolean;
};

const BASE: Record<string, WorkerChannelCaps> = {
  facebook: { affiliateLinkRequired: true, disclosureRequired: false },
  tiktok: { affiliateLinkRequired: false, disclosureRequired: true },
  shopee: { affiliateLinkRequired: false, disclosureRequired: false }
};

export function parseWorkerChannelCaps(
  channel: string,
  raw: string | null | undefined
): WorkerChannelCaps {
  const base = BASE[channel] ?? BASE.shopee!;
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
          : base.disclosureRequired
    };
  } catch {
    return base;
  }
}
