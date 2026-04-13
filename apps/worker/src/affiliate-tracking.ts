export function mergeAffiliateUrl(
  baseUrl: string,
  defaultParams: Record<string, string>,
  jobParams: Record<string, string>
): string {
  const merged: Record<string, string> = { ...defaultParams, ...jobParams };
  if (Object.keys(merged).length === 0) {
    return baseUrl;
  }

  try {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(merged)) {
      if (!key || value === "") {
        continue;
      }
      url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return baseUrl;
  }
}

export function parseFlatParamsJson(raw: string | null | undefined): Record<string, string> {
  if (!raw?.trim()) {
    return {};
  }

  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) {
        continue;
      }
      out[String(k)] = typeof v === "string" ? v : String(v);
    }
    return out;
  } catch {
    return {};
  }
}
