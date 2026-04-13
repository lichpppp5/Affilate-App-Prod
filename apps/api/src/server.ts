import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { readSessionFromRequest, verifyToken } from "./auth";
import { requirePermission } from "./rbac";
import { loadConfig } from "./config";
import {
  getPathname,
  getRequestUrl,
  readJsonBody,
  sendRedirect,
  sendJson,
  sendNoContent,
  withCorsHeaders
} from "./lib/http";
import { login, me } from "./routes/auth";
import {
  listChannelCapabilities,
  upsertChannelCapability
} from "./routes/channel-capabilities";
import {
  createChannelAccount,
  deleteChannelAccount,
  getChannelAccount,
  listChannelAccounts,
  refreshChannelAccount,
  updateChannelAccount
} from "./routes/channel-accounts";
import {
  createApproval,
  deleteApproval,
  getApproval,
  listApprovals,
  updateApproval
} from "./routes/approvals";
import {
  completeAssetUpload,
  createAssetPresignedUpload,
  createAsset,
  deleteAsset,
  getAsset,
  getAssetContent,
  getStorageConfig,
  listAssets,
  uploadAsset,
  updateAsset
} from "./routes/assets";
import { listAuditLogs } from "./routes/audit-logs";
import { getDashboardSnapshot } from "./routes/dashboard";
import { getHealth } from "./routes/health";
import { getPrometheusMetrics } from "./routes/metrics";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "./routes/notifications";
import { handleOAuthCallback, startOAuthFlow } from "./routes/oauth";
import {
  listPublishAttempts,
  listPublishWebhookEvents,
  simulatePublishWebhook
} from "./routes/publish-events";
import {
  createUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  updateUser
} from "./routes/users";
import { createTenant, deleteTenant, listTenants, updateTenant } from "./routes/tenants";
import { ingestProviderWebhook } from "./routes/provider-webhooks";
import {
  buildMockAuthorizeRedirect,
  mockPublishDispatch,
  mockTokenExchange
} from "./routes/provider-mocks";
import {
  cancelPublishJob,
  createPublishJob,
  deletePublishJob,
  getPublishJob,
  listPublishJobs,
  retryPublishJob,
  updatePublishJob
} from "./routes/publish";
import {
  createBrandKit,
  deleteBrandKit,
  getBrandKit,
  listBrandKits,
  updateBrandKit
} from "./routes/brand-kits";
import {
  createComplianceItem,
  deleteComplianceItem,
  getComplianceItem,
  listComplianceItems,
  updateComplianceItem
} from "./routes/compliance-items";
import {
  createProductChannelMapping,
  deleteProductChannelMapping,
  listProductChannelMappings,
  updateProductChannelMapping
} from "./routes/product-channel-mappings";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct
} from "./routes/products";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject
} from "./routes/projects";
import {
  createVideoTemplate,
  deleteVideoTemplate,
  getVideoTemplate,
  listVideoTemplates,
  updateVideoTemplate
} from "./routes/video-templates";
import {
  cancelRenderJob,
  createRenderJob,
  deleteRenderJob,
  getRenderJob,
  getRenderJobMedia,
  listRenderJobs,
  retryRenderJob
} from "./routes/render";
import { getReportsSnapshot } from "./routes/reports";

const config = loadConfig();

const loginHitsByIp = new Map<string, number[]>();
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_PER_WINDOW = 40;

function isLoginRateLimited(remoteAddress: string | undefined) {
  const ip = remoteAddress ?? "unknown";
  const now = Date.now();
  const windowStart = now - LOGIN_WINDOW_MS;
  const next = (loginHitsByIp.get(ip) ?? []).filter((t) => t > windowStart);
  next.push(now);
  loginHitsByIp.set(ip, next);
  return next.length > LOGIN_MAX_PER_WINDOW;
}

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  try {
    const requestUrl = getRequestUrl(request.url);
    const pathname = getPathname(request.url);
    const method = request.method ?? "GET";

    if (method === "OPTIONS") {
      sendNoContent(response);
      return;
    }

    const session =
      readSessionFromRequest(request) ??
      readSessionFromQueryToken(requestUrl.searchParams.get("access_token"));

    if (method === "POST" && pathname === "/auth/login") {
      if (isLoginRateLimited(request.socket.remoteAddress)) {
        sendJson(response, 429, {
          message: "Too many login attempts, try again shortly"
        });
        return;
      }

      const result = await login(request);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/health") {
      const result = await getHealth(config);
      sendJson(response, 200, result);
      return;
    }

    if (method === "GET" && pathname === "/metrics") {
      const metricsToken = process.env.METRICS_TOKEN;
      if (
        metricsToken &&
        requestUrl.searchParams.get("token") !== metricsToken
      ) {
        sendJson(response, 401, { message: "Invalid or missing metrics token" });
        return;
      }

      const body = await getPrometheusMetrics();
      response.writeHead(200, {
        ...withCorsHeaders(),
        "content-type": "text/plain; charset=utf-8"
      });
      response.end(body);
      return;
    }

    const oauthCallback = matchOAuthCallback(pathname);
    if (method === "GET" && oauthCallback) {
      const result = await handleOAuthCallback({
        provider: oauthCallback.provider,
        code: requestUrl.searchParams.get("code"),
        state: requestUrl.searchParams.get("state"),
        error: requestUrl.searchParams.get("error")
      });
      sendRedirect(response, result.redirectUrl);
      return;
    }

    const providerAuthorize = matchProviderMockAuthorize(pathname);
    if (method === "GET" && providerAuthorize) {
      sendRedirect(
        response,
        buildMockAuthorizeRedirect({
          provider: providerAuthorize.provider,
          redirectUri: requestUrl.searchParams.get("redirect_uri"),
          state: requestUrl.searchParams.get("state")
        })
      );
      return;
    }

    const providerToken = matchProviderMockToken(pathname);
    if (method === "POST" && providerToken) {
      const result = await mockTokenExchange(providerToken.provider, request);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    const providerPublish = matchProviderMockPublish(pathname);
    if (method === "POST" && providerPublish) {
      const result = await mockPublishDispatch(providerPublish.provider, request);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    const providerWebhook = matchProviderWebhook(pathname);
    if (method === "POST" && providerWebhook) {
      const result = await ingestProviderWebhook({
        provider: providerWebhook.provider,
        request
      });
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (!session) {
      sendJson(response, 401, {
        message: "Authentication required"
      });
      return;
    }

    if (method === "GET" && pathname === "/auth/me") {
      const result = me(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/dashboard") {
      const result = await getDashboardSnapshot(session);
      if ("statusCode" in result) {
        sendJson(response, result.statusCode, result.payload);
        return;
      }
      sendJson(response, 200, result);
      return;
    }

    if (method === "GET" && pathname === "/reports") {
      const result = await getReportsSnapshot(session, {
        from: requestUrl.searchParams.get("from") ?? undefined,
        to: requestUrl.searchParams.get("to") ?? undefined
      });
      if ("statusCode" in result) {
        sendJson(response, result.statusCode, result.payload);
        return;
      }
      sendJson(response, 200, result);
      return;
    }

    if (method === "GET" && pathname === "/audit-logs") {
      const result = await listAuditLogs(session, {
        limit: requestUrl.searchParams.get("limit")
          ? Number(requestUrl.searchParams.get("limit"))
          : undefined,
        offset: requestUrl.searchParams.get("offset")
          ? Number(requestUrl.searchParams.get("offset"))
          : undefined
      });
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/users") {
      const result = await listUsers(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/users") {
      const result = await createUser(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/tenants") {
      const result = await listTenants(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/tenants") {
      const result = await createTenant(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/notifications") {
      const result = await listNotifications(session, {
        unreadOnly: requestUrl.searchParams.get("unreadOnly") === "1",
        limit: requestUrl.searchParams.get("limit")
          ? Number(requestUrl.searchParams.get("limit"))
          : undefined
      });
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/notifications/mark-all-read") {
      const result = await markAllNotificationsRead(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    const notificationId = matchResource(pathname, "/notifications/");
    if (notificationId && method === "PATCH") {
      const result = await markNotificationRead(session, notificationId);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/products") {
      const result = await listProducts(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/products") {
      const result = await createProduct(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/video-templates") {
      const result = await listVideoTemplates(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/video-templates") {
      const result = await createVideoTemplate(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/brand-kits") {
      const result = await listBrandKits(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/brand-kits") {
      const result = await createBrandKit(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/compliance-items") {
      const result = await listComplianceItems(session, requestUrl.searchParams.get("channel"));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/compliance-items") {
      const result = await createComplianceItem(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/assets") {
      const result = await listAssets(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/storage/config") {
      const result = getStorageConfig(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/storage/presign-upload") {
      const result = await createAssetPresignedUpload(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/assets/upload") {
      const result = await uploadAsset(session, request);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/assets/complete-upload") {
      const result = await completeAssetUpload(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/assets") {
      const result = await createAsset(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/channel-accounts") {
      const result = await listChannelAccounts(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    const oauthStart = matchOAuthStart(pathname);
    if (method === "GET" && oauthStart) {
      const accountId = requestUrl.searchParams.get("accountId");

      if (!accountId) {
        sendJson(response, 400, {
          message: "accountId is required"
        });
        return;
      }

      const result = await startOAuthFlow(session, {
        tenantId: session.tenantId,
        provider: oauthStart.provider,
        accountId
      });

      const authorizationUrl =
        typeof result.payload === "object" &&
        result.payload !== null &&
        "authorizationUrl" in result.payload &&
        typeof result.payload.authorizationUrl === "string"
          ? result.payload.authorizationUrl
          : null;

      if (authorizationUrl) {
        sendRedirect(response, authorizationUrl);
        return;
      }

      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/channel-accounts") {
      const result = await createChannelAccount(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/channel-capabilities") {
      const result = await listChannelCapabilities(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/product-channel-mappings") {
      const result = await listProductChannelMappings(
        session,
        requestUrl.searchParams.get("productId")
      );
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/product-channel-mappings") {
      const result = await createProductChannelMapping(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/projects") {
      const result = await listProjects(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/projects") {
      const result = await createProject(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/render-jobs") {
      const result = await listRenderJobs(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/render-jobs") {
      const result = await createRenderJob(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/approvals") {
      const result = await listApprovals(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/approvals") {
      const result = await createApproval(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/publish-jobs") {
      const result = await listPublishJobs(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/publish-attempts") {
      const result = await listPublishAttempts(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "GET" && pathname === "/publish-webhooks") {
      const result = await listPublishWebhookEvents(session);
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/publish-jobs") {
      const result = await createPublishJob(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    if (method === "POST" && pathname === "/publish-webhooks/simulate") {
      const result = await simulatePublishWebhook(session, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    const renderMediaMatch = matchRenderMedia(pathname);
    if (method === "GET" && renderMediaMatch) {
      await handleRenderMediaResource(
        response,
        session,
        renderMediaMatch.renderJobId,
        renderMediaMatch.kind,
        requestUrl.searchParams.get("download") === "1"
      );
      return;
    }

    const videoTemplateId = matchResource(pathname, "/video-templates/");
    if (videoTemplateId) {
      await handleVideoTemplateResource(request, response, session, videoTemplateId);
      return;
    }

    const brandKitId = matchResource(pathname, "/brand-kits/");
    if (brandKitId) {
      await handleBrandKitResource(request, response, session, brandKitId);
      return;
    }

    const complianceItemId = matchResource(pathname, "/compliance-items/");
    if (complianceItemId) {
      await handleComplianceItemResource(request, response, session, complianceItemId);
      return;
    }

    const productId = matchResource(pathname, "/products/");
    if (productId) {
      await handleProductResource(request, response, session, productId);
      return;
    }

    const assetId = matchResource(pathname, "/assets/");
    if (assetId) {
      await handleAssetResource(request, response, session, assetId);
      return;
    }

    const assetContentId = matchAssetContent(pathname);
    if (method === "GET" && assetContentId) {
      await handleAssetContentResource(response, session, assetContentId);
      return;
    }

    const projectId = matchResource(pathname, "/projects/");
    if (projectId) {
      await handleProjectResource(request, response, session, projectId);
      return;
    }

    const renderJobId = matchResource(pathname, "/render-jobs/");
    if (renderJobId) {
      await handleRenderResource(request, response, session, renderJobId);
      return;
    }

    const renderAction = matchResourceAction(pathname, "/render-jobs/");
    if (renderAction) {
      await handleRenderActionResource(
        request,
        response,
        session,
        renderAction.id,
        renderAction.action
      );
      return;
    }

    const approvalId = matchResource(pathname, "/approvals/");
    if (approvalId) {
      await handleApprovalResource(request, response, session, approvalId);
      return;
    }

    const publishJobId = matchResource(pathname, "/publish-jobs/");
    if (publishJobId) {
      await handlePublishJobResource(request, response, session, publishJobId);
      return;
    }

    const channelCapabilityChannel = matchResource(pathname, "/channel-capabilities/");
    if (channelCapabilityChannel && method === "PUT") {
      const result = await upsertChannelCapability(
        session,
        channelCapabilityChannel,
        await readJsonBody(request)
      );
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    const productChannelMappingId = matchResource(pathname, "/product-channel-mappings/");
    if (productChannelMappingId) {
      await handleProductChannelMappingResource(
        request,
        response,
        session,
        productChannelMappingId
      );
      return;
    }

    const channelAccountId = matchResource(pathname, "/channel-accounts/");
    if (channelAccountId) {
      await handleChannelAccountResource(request, response, session, channelAccountId);
      return;
    }

    const userAction = matchResourceAction(pathname, "/users/");
    if (userAction && userAction.action === "reset-password" && method === "POST") {
      const result = await resetUserPassword(session, userAction.id, await readJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
      return;
    }

    const userId = matchResource(pathname, "/users/");
    if (userId) {
      if (method === "PUT") {
        const result = await updateUser(session, userId, await readJsonBody(request));
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (method === "DELETE") {
        const result = await deleteUser(session, userId);
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      sendJson(response, 405, { message: "Method not allowed" });
      return;
    }

    const tenantId = matchResource(pathname, "/tenants/");
    if (tenantId) {
      if (method === "PUT") {
        const result = await updateTenant(session, tenantId, await readJsonBody(request));
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (method === "DELETE") {
        const result = await deleteTenant(session, tenantId);
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      sendJson(response, 405, { message: "Method not allowed" });
      return;
    }

    const publishAction = matchResourceAction(pathname, "/publish-jobs/");
    if (publishAction) {
      await handlePublishActionResource(
        request,
        response,
        session,
        publishAction.id,
        publishAction.action
      );
      return;
    }

    const channelAction = matchResourceAction(pathname, "/channel-accounts/");
    if (channelAction) {
      await handleChannelAccountActionResource(
        request,
        response,
        session,
        channelAction.id,
        channelAction.action
      );
      return;
    }

    sendJson(response, 404, {
      message: "Route not found"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    sendJson(response, 500, {
      message
    });
  }
});

server.listen(config.port, () => {
  console.log(`[api] listening on :${config.port}`);
});

function matchResource(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const id = pathname.slice(prefix.length);
  return id.length > 0 && !id.includes("/") ? id : null;
}

function matchResourceAction(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const rest = pathname.slice(prefix.length);
  const parts = rest.split("/");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return {
    id: parts[0],
    action: parts[1]
  };
}

function matchRenderMedia(pathname: string) {
  const match = pathname.match(/^\/media\/render-jobs\/([^/]+)\/(video|thumbnail)$/);

  if (!match) {
    return null;
  }

  return {
    renderJobId: match[1],
    kind: match[2] as "video" | "thumbnail"
  };
}

function matchAssetContent(pathname: string) {
  const match = pathname.match(/^\/media\/assets\/([^/]+)$/);
  return match?.[1] ?? null;
}

function matchOAuthStart(pathname: string) {
  const match = pathname.match(/^\/oauth\/(tiktok|shopee|facebook)\/start$/);
  return match
    ? { provider: match[1] as "tiktok" | "shopee" | "facebook" }
    : null;
}

function matchOAuthCallback(pathname: string) {
  const match = pathname.match(/^\/oauth\/(tiktok|shopee|facebook)\/callback$/);
  return match
    ? { provider: match[1] as "tiktok" | "shopee" | "facebook" }
    : null;
}

function matchProviderMockAuthorize(pathname: string) {
  const match = pathname.match(
    /^\/provider-mocks\/(tiktok|shopee|facebook)\/oauth\/authorize$/
  );
  return match
    ? { provider: match[1] as "tiktok" | "shopee" | "facebook" }
    : null;
}

function matchProviderMockToken(pathname: string) {
  const match = pathname.match(
    /^\/provider-mocks\/(tiktok|shopee|facebook)\/oauth\/token$/
  );
  return match
    ? { provider: match[1] as "tiktok" | "shopee" | "facebook" }
    : null;
}

function matchProviderMockPublish(pathname: string) {
  const match = pathname.match(
    /^\/provider-mocks\/(tiktok|shopee|facebook)\/publish$/
  );
  return match
    ? { provider: match[1] as "tiktok" | "shopee" | "facebook" }
    : null;
}

function matchProviderWebhook(pathname: string) {
  const match = pathname.match(/^\/provider-webhooks\/(tiktok|shopee|facebook)$/);
  return match
    ? { provider: match[1] as "tiktok" | "shopee" | "facebook" }
    : null;
}

function readSessionFromQueryToken(token: string | null) {
  if (!token) {
    return null;
  }

  return verifyToken(token);
}

async function handleProductResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  productId: string
) {
  if (request.method === "GET") {
    const result = await getProduct(session, productId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "PUT") {
    const result = await updateProduct(session, productId, await readJsonBody(request));
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "DELETE") {
    const result = await deleteProduct(session, productId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}

async function handleVideoTemplateResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  id: string
) {
  if (request.method === "GET") {
    const result = await getVideoTemplate(session, id);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "PUT") {
    const result = await updateVideoTemplate(session, id, await readJsonBody(request));
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "DELETE") {
    const result = await deleteVideoTemplate(session, id);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}

async function handleBrandKitResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  id: string
) {
  if (request.method === "GET") {
    const result = await getBrandKit(session, id);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "PUT") {
    const result = await updateBrandKit(session, id, await readJsonBody(request));
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "DELETE") {
    const result = await deleteBrandKit(session, id);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}

async function handleComplianceItemResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  id: string
) {
  if (request.method === "GET") {
    const result = await getComplianceItem(session, id);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "PUT") {
    const result = await updateComplianceItem(session, id, await readJsonBody(request));
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "DELETE") {
    const result = await deleteComplianceItem(session, id);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}


async function handleProductChannelMappingResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  id: string
) {
  if (request.method === "PUT") {
    const result = await updateProductChannelMapping(session, id, await readJsonBody(request));
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "DELETE") {
    const result = await deleteProductChannelMapping(session, id);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}

async function handleAssetResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  assetId: string
) {
  if (request.method === "GET") {
    const result = await getAsset(session, assetId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "PUT") {
    const result = await updateAsset(session, assetId, await readJsonBody(request));
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "DELETE") {
    const result = await deleteAsset(session, assetId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}

async function handleAssetContentResource(
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  assetId: string
) {
  const contentDenied = requirePermission(session, "assets:read");
  if (contentDenied) {
    sendJson(response, contentDenied.statusCode, contentDenied.payload);
    return;
  }

  try {
    const asset = await getAssetContent(session, assetId);

    if (!asset) {
      sendJson(response, 404, {
        message: "Asset content not found"
      });
      return;
    }

    response.writeHead(200, {
      ...withCorsHeaders(),
      "content-type": asset.content.contentType,
      "content-length": String(asset.content.contentLength),
      "content-disposition": `inline; filename="${asset.asset.originalFilename || asset.asset.id}"`
    });
    response.end(asset.content.body);
  } catch {
    sendJson(response, 404, {
      message: "Asset content not found"
    });
  }
}

async function handleProjectResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  projectId: string
) {
  if (request.method === "GET") {
    const result = await getProject(session, projectId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "PUT") {
    const result = await updateProject(session, projectId, await readJsonBody(request));
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "DELETE") {
    const result = await deleteProject(session, projectId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}

async function handleApprovalResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  approvalId: string
) {
  if (request.method === "GET") {
    const result = await getApproval(session, approvalId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "PUT") {
    const result = await updateApproval(session, approvalId, await readJsonBody(request));
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "DELETE") {
    const result = await deleteApproval(session, approvalId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}

async function handleRenderResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  renderJobId: string
) {
  if (request.method === "GET") {
    const result = await getRenderJob(session, renderJobId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "DELETE") {
    const result = await deleteRenderJob(session, renderJobId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}

async function handleRenderActionResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  renderJobId: string,
  action: string
) {
  if (request.method === "POST" && action === "retry") {
    const result = await retryRenderJob(session, renderJobId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "POST" && action === "cancel") {
    const result = await cancelRenderJob(session, renderJobId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}

async function handlePublishJobResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  publishJobId: string
) {
  if (request.method === "GET") {
    const result = await getPublishJob(session, publishJobId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "PUT") {
    const result = await updatePublishJob(
      session,
      publishJobId,
      await readJsonBody(request)
    );
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "DELETE") {
    const result = await deletePublishJob(session, publishJobId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}

async function handleChannelAccountResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  channelAccountId: string
) {
  if (request.method === "GET") {
    const result = await getChannelAccount(session, channelAccountId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "PUT") {
    const result = await updateChannelAccount(
      session,
      channelAccountId,
      await readJsonBody(request)
    );
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "DELETE") {
    const result = await deleteChannelAccount(session, channelAccountId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}

async function handleChannelAccountActionResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  channelAccountId: string,
  action: string
) {
  if (request.method === "POST" && action === "refresh") {
    const result = await refreshChannelAccount(session, channelAccountId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}

async function handlePublishActionResource(
  request: IncomingMessage,
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  publishJobId: string,
  action: string
) {
  if (request.method === "POST" && action === "retry") {
    const result = await retryPublishJob(session, publishJobId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  if (request.method === "POST" && action === "cancel") {
    const result = await cancelPublishJob(session, publishJobId);
    sendJson(response, result.statusCode, result.payload);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
}

async function handleRenderMediaResource(
  response: ServerResponse,
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>,
  renderJobId: string,
  kind: "video" | "thumbnail",
  shouldDownload: boolean
) {
  const mediaDenied = requirePermission(session, "render:read");
  if (mediaDenied) {
    sendJson(response, mediaDenied.statusCode, mediaDenied.payload);
    return;
  }

  const media = await getRenderJobMedia(session, renderJobId, kind);

  if (!media) {
    sendJson(response, 404, {
      message: "Render media not found"
    });
    return;
  }

  try {
    const fileStats = await stat(media.filePath);
    const mimeType = getMimeType(media.filePath);
    const stream = createReadStream(media.filePath);
    const extension = extname(media.filePath);
    const fileName = `${renderJobId}-${kind}${extension}`;

    response.writeHead(200, {
      ...withCorsHeaders(),
      "content-type": mimeType,
      "content-length": String(fileStats.size),
      "content-disposition": `${shouldDownload ? "attachment" : "inline"}; filename="${fileName}"`
    });

    stream.pipe(response);
  } catch {
    sendJson(response, 404, {
      message: "Media file missing on disk"
    });
  }
}

function getMimeType(filePath: string) {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".mp4") {
    return "video/mp4";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".png") {
    return "image/png";
  }

  return "application/octet-stream";
}
