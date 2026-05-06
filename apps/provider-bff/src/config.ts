type Provider = "tiktok" | "shopee" | "facebook";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  return value || undefined;
}

export function loadBffConfig() {
  const port = Number(process.env.PROVIDER_BFF_PORT ?? 4100);

  return {
    port: Number.isFinite(port) ? port : 4100,
    providers: {
      tiktok: {
        tokenUpstreamUrl: optionalEnv("TIKTOK_UPSTREAM_TOKEN_URL"),
        publishUpstreamUrl: optionalEnv("TIKTOK_UPSTREAM_PUBLISH_URL")
      },
      shopee: {
        tokenUpstreamUrl: optionalEnv("SHOPEE_UPSTREAM_TOKEN_URL"),
        publishUpstreamUrl: optionalEnv("SHOPEE_UPSTREAM_PUBLISH_URL")
      },
      facebook: {
        tokenUpstreamUrl: optionalEnv("FACEBOOK_UPSTREAM_TOKEN_URL"),
        publishUpstreamUrl: optionalEnv("FACEBOOK_UPSTREAM_PUBLISH_URL"),
        graphBaseUrl: optionalEnv("FACEBOOK_GRAPH_BASE_URL") ?? "https://graph.facebook.com",
        graphVersion: optionalEnv("FACEBOOK_GRAPH_VERSION") ?? "v20.0",
        pageId: optionalEnv("FACEBOOK_PAGE_ID")
      }
    } satisfies Record<
      Provider,
      {
        tokenUpstreamUrl?: string;
        publishUpstreamUrl?: string;
        graphBaseUrl?: string;
        graphVersion?: string;
        pageId?: string;
      }
    >,
    requiredEnv
  };
}

