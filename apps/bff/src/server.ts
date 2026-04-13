import { createHash } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 5001);
const API_WEBHOOK_URL = (process.env.API_WEBHOOK_URL ?? "").trim();
const PROVIDER_WEBHOOK_SECRET = (process.env.PROVIDER_WEBHOOK_SECRET ?? "").trim();

const FACEBOOK_GRAPH_BASE_URL =
  (process.env.FACEBOOK_GRAPH_BASE_URL ?? "https://graph.facebook.com").trim();
const FACEBOOK_GRAPH_VERSION = (process.env.FACEBOOK_GRAPH_VERSION ?? "v20.0").trim();
const FACEBOOK_PAGE_ID = (process.env.FACEBOOK_PAGE_ID ?? "").trim();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    // Facebook token endpoint adapter (JSON -> form/query)
    if (req.method === "POST" && url.pathname === "/facebook/oauth/token") {
      const body = await readJson(req);
      const response = await facebookTokenAdapter(body);
      sendJson(res, 200, response);
      return;
    }

    // Facebook publish adapter (worker JSON -> Graph API call)
    if (req.method === "POST" && url.pathname === "/facebook/publish") {
      const bearer = req.headers.authorization ?? "";
      if (!bearer.startsWith("Bearer ")) {
        sendJson(res, 401, { message: "Missing bearer token" });
        return;
      }
      const accessToken = bearer.slice("Bearer ".length).trim();
      const body = await readJson(req);
      const response = await facebookPublishAdapter({ accessToken, body });
      sendJson(res, 200, response);
      return;
    }

    sendJson(res, 404, { message: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    sendJson(res, 500, { message });
  }
}).listen(PORT, () => {
  console.log(`[bff] listening on :${PORT}`);
});

async function facebookTokenAdapter(input: any) {
  const grantType = String(input?.grantType ?? "");

  // Contract: worker/API sends JSON. Facebook does not issue refresh_token in the same way;
  // we map "refresh_token" to long-lived token exchange.
  if (grantType === "authorization_code") {
    const code = String(input?.code ?? "");
    const redirectUri = String(input?.redirectUri ?? "");
    const clientId = String(input?.clientId ?? "");
    const clientSecret = String(input?.clientSecret ?? "");

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code
    });

    const url = `${FACEBOOK_GRAPH_BASE_URL}/${FACEBOOK_GRAPH_VERSION}/oauth/access_token?${params.toString()}`;
    const response = await fetch(url, { method: "GET" });
    const payload = await response.json();

    if (!response.ok || !payload.access_token) {
      throw new Error(payload?.error?.message || payload?.message || "Facebook token exchange failed");
    }

    return {
      access_token: payload.access_token,
      refresh_token: "",
      expires_in: payload.expires_in ?? 0
    };
  }

  if (grantType === "refresh_token") {
    const clientId = String(input?.clientId ?? "");
    const clientSecret = String(input?.clientSecret ?? "");
    const refreshToken = String(input?.refreshToken ?? "");

    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: refreshToken
    });

    const url = `${FACEBOOK_GRAPH_BASE_URL}/${FACEBOOK_GRAPH_VERSION}/oauth/access_token?${params.toString()}`;
    const response = await fetch(url, { method: "GET" });
    const payload = await response.json();

    if (!response.ok || !payload.access_token) {
      throw new Error(payload?.error?.message || payload?.message || "Facebook token refresh failed");
    }

    return {
      access_token: payload.access_token,
      refresh_token: refreshToken,
      expires_in: payload.expires_in ?? 0
    };
  }

  throw new Error(`Unsupported grantType: ${grantType}`);
}

async function facebookPublishAdapter(input: {
  accessToken: string;
  body: any;
}) {
  const publishJobId = String(input.body?.publishJobId ?? "");
  const caption = String(input.body?.caption ?? "");
  const hashtags = Array.isArray(input.body?.hashtags) ? input.body.hashtags : [];
  const affiliateLink = String(input.body?.affiliateLink ?? "");
  const externalProductId = String(input.body?.externalProductId ?? "").trim();

  if (!publishJobId) {
    return { status: "failed", message: "Missing publishJobId" };
  }
  if (!affiliateLink.trim()) {
    return { status: "failed", message: "Missing affiliateLink" };
  }

  const pageId = FACEBOOK_PAGE_ID;
  if (!pageId) {
    return { status: "failed", message: "Missing FACEBOOK_PAGE_ID" };
  }

  const message = [
    caption.trim(),
    hashtags.join(" ").trim(),
    affiliateLink.trim(),
    externalProductId ? `(product:${externalProductId})` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const url = `${FACEBOOK_GRAPH_BASE_URL}/${FACEBOOK_GRAPH_VERSION}/${pageId}/feed`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      message,
      access_token: input.accessToken
    })
  });

  const payload = await response.json();

  if (!response.ok || !payload?.id) {
    const message = payload?.error?.message || payload?.message || "Facebook publish failed";
    await notifyApiWebhook({
      provider: "facebook",
      publishJobId,
      status: "failed",
      externalId: "",
      payload: { error: payload }
    });
    return { status: "failed", message };
  }

  const externalId = String(payload.id);
  await notifyApiWebhook({
    provider: "facebook",
    publishJobId,
    status: "published",
    externalId,
    payload: { graphId: externalId }
  });

  return { status: "published", external_id: externalId };
}

async function notifyApiWebhook(input: {
  provider: "facebook";
  publishJobId: string;
  status: string;
  externalId: string;
  payload: Record<string, unknown>;
}) {
  if (!API_WEBHOOK_URL) {
    return;
  }

  const body = {
    providerEventId: createHash("sha256")
      .update(`bff:${input.provider}:${input.publishJobId}:${input.status}:${input.externalId}`)
      .digest("hex"),
    publishJobId: input.publishJobId,
    status: input.status,
    externalId: input.externalId,
    payload: input.payload
  };

  await fetch(`${API_WEBHOOK_URL}/provider-webhooks/${input.provider}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(PROVIDER_WEBHOOK_SECRET
        ? { "x-appaffilate-signature": signWebhook(PROVIDER_WEBHOOK_SECRET, body) }
        : {})
    },
    body: JSON.stringify(body)
  }).catch(() => null);
}

function signWebhook(secret: string, body: unknown) {
  return createHash("sha256").update(`${secret}.${JSON.stringify(body)}`).digest("hex");
}

async function readJson(req: RequestLike) {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve());
    req.on("error", reject);
  });
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  return JSON.parse(raw) as unknown;
}

type RequestLike = {
  on: (event: "data" | "end" | "error", cb: any) => any;
};

function sendJson(res: any, statusCode: number, payload: any) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

