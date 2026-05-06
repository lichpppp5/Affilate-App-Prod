import { createServer } from "node:http";

import { loadBffConfig } from "./config";
import { getPathname, readJsonBody, sendJson, sendNoContent } from "./http";

type Provider = "tiktok" | "shopee" | "facebook";

type TokenRequest = {
  grantType?: "authorization_code" | "refresh_token" | "client_credentials" | string;
  code?: string;
  refreshToken?: string;
  redirectUri?: string;
  clientId?: string;
  clientSecret?: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  account_ref?: string;
  account_name?: string;
  metadata?: Record<string, unknown>;
};

type PublishRequest = {
  publishJobId?: string;
  projectId?: string;
  channel?: Provider | string;
  disclosureText?: string;
  caption?: string;
  hashtags?: string[];
  affiliateLink?: string;
  externalProductId?: string;
};

type PublishResponse = {
  status: string;
  external_id?: string;
  message?: string;
};

const cfg = loadBffConfig();

function jsonError(message: string) {
  return { message };
}

async function passthroughToken(provider: Provider, body: TokenRequest): Promise<TokenResponse> {
  const upstreamUrl =
    provider === "tiktok"
      ? cfg.providers.tiktok.tokenUpstreamUrl
      : provider === "shopee"
        ? cfg.providers.shopee.tokenUpstreamUrl
        : cfg.providers.facebook.tokenUpstreamUrl;

  if (!upstreamUrl) {
    throw new Error(`Token upstream is not configured for ${provider}`);
  }

  const res = await fetch(upstreamUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & {
    message?: string;
  };

  if (!res.ok || !payload.access_token) {
    throw new Error(payload.message || `Upstream token failed for ${provider} (HTTP ${res.status})`);
  }

  return payload as TokenResponse;
}

async function passthroughPublish(
  provider: Provider,
  accessToken: string,
  body: PublishRequest
): Promise<PublishResponse> {
  const upstreamUrl =
    provider === "tiktok"
      ? cfg.providers.tiktok.publishUpstreamUrl
      : provider === "shopee"
        ? cfg.providers.shopee.publishUpstreamUrl
        : cfg.providers.facebook.publishUpstreamUrl;

  if (!upstreamUrl) {
    throw new Error(`Publish upstream is not configured for ${provider}`);
  }

  const res = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  });

  const payload = (await res.json().catch(() => ({}))) as Partial<PublishResponse> & {
    message?: string;
  };

  if (!res.ok || !payload.status) {
    throw new Error(payload.message || `Upstream publish failed for ${provider} (HTTP ${res.status})`);
  }

  return payload as PublishResponse;
}

async function publishFacebookGraph(accessToken: string, body: PublishRequest): Promise<PublishResponse> {
  const pageId = cfg.providers.facebook.pageId;
  if (!pageId) {
    throw new Error("FACEBOOK_PAGE_ID is required for Facebook Graph publish mode");
  }

  const graphBaseUrl = cfg.providers.facebook.graphBaseUrl ?? "https://graph.facebook.com";
  const graphVersion = cfg.providers.facebook.graphVersion ?? "v20.0";
  const endpoint = `${graphBaseUrl.replace(/\/$/, "")}/${graphVersion}/${encodeURIComponent(pageId)}/feed`;

  const messageParts = [
    body.caption?.trim() || "",
    (body.hashtags ?? []).filter(Boolean).join(" "),
    body.disclosureText?.trim() || "",
    body.affiliateLink?.trim() || ""
  ].filter(Boolean);

  const message = messageParts.join("\n").trim();
  if (!message) {
    throw new Error("Facebook publish requires at least one of caption/hashtags/disclosureText/affiliateLink");
  }

  const params = new URLSearchParams();
  params.set("message", message);
  params.set("access_token", accessToken);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !json?.id) {
    const msg = json?.error?.message || `Facebook Graph publish failed (HTTP ${res.status})`;
    throw new Error(msg);
  }

  return {
    status: "published",
    external_id: String(json.id)
  };
}

const server = createServer(async (req, res) => {
  const path = getPathname(req.url);

  if (req.method === "OPTIONS") {
    sendNoContent(res, 204);
    return;
  }

  if (req.method === "GET" && path === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const m = path.match(/^\/(tiktok|shopee|facebook)\/oauth\/token$/);
  if (req.method === "POST" && m) {
    const provider = m[1] as Provider;
    try {
      const body = await readJsonBody<TokenRequest>(req);
      const payload = await passthroughToken(provider, body);
      sendJson(res, 200, payload);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Token request failed";
      sendJson(res, 400, jsonError(msg));
    }
    return;
  }

  const p = path.match(/^\/(tiktok|shopee|facebook)\/publish$/);
  if (req.method === "POST" && p) {
    const provider = p[1] as Provider;
    const auth = req.headers.authorization ?? "";
    const accessToken = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
    if (!accessToken) {
      sendJson(res, 401, jsonError("Missing bearer token"));
      return;
    }

    try {
      const body = await readJsonBody<PublishRequest>(req);

      if (provider === "facebook" && !cfg.providers.facebook.publishUpstreamUrl) {
        const payload = await publishFacebookGraph(accessToken, body);
        sendJson(res, 200, payload);
        return;
      }

      const payload = await passthroughPublish(provider, accessToken, body);
      sendJson(res, 200, payload);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Publish failed";
      sendJson(res, 400, jsonError(msg));
    }
    return;
  }

  sendJson(res, 404, jsonError("Not found"));
});

server.listen(cfg.port, "0.0.0.0", () => {
  console.log(`[provider-bff] listening on 0.0.0.0:${cfg.port}`);
});

