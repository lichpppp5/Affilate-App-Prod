import type { WorkflowStatus } from "@appaffilate/domain";

export interface Session {
  userId: string;
  email: string;
  displayName: string;
  tenantId: string;
  roleName: string;
  permissions: string[];
}

export function sessionCan(session: Session | null, permission: string) {
  return Boolean(session?.permissions?.includes(permission));
}

export interface ProductRecord {
  id: string;
  tenantId: string;
  sku: string;
  title: string;
  description: string;
  price: number;
  channels: string[];
  affiliateSourceUrl: string;
  affiliateProgram: string;
}

export interface AssetRecord {
  id: string;
  tenantId: string;
  productId?: string;
  kind: "image" | "audio" | "video";
  storageKey: string;
  mimeType: string;
  checksum: string;
  title: string;
  originalFilename: string;
  sizeBytes: number;
  storageProvider: string;
}

export interface ChannelAccountRecord {
  id: string;
  tenantId: string;
  channel: "tiktok" | "shopee" | "facebook";
  accountName: string;
  accountRef: string;
  authType: "oauth" | "service_account" | "manual";
  status: "connected" | "expired" | "error" | "disconnected";
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt?: string;
  metadataJson: string;
  lastRefreshedAt?: string;
}

export interface StorageConfig {
  driver: string;
  directUploadEnabled: boolean;
}

export interface PresignedUploadPayload {
  assetId: string;
  fileName: string;
  uploadUrl: string;
  method: string;
  storageKey: string;
}

export interface ProjectRecord {
  id: string;
  tenantId: string;
  productId: string;
  templateId: string;
  brandKitId?: string;
  status: string;
  title: string;
}

export interface ApprovalRecord {
  id: string;
  tenantId: string;
  projectId: string;
  reviewerId?: string;
  reviewerName: string;
  decision: string;
  comment: string;
  createdAt: string;
}

export interface PublishJobRecord {
  id: string;
  tenantId: string;
  projectId: string;
  productId: string;
  channel: string;
  accountId: string;
  caption: string;
  hashtags: string[];
  disclosureText: string;
  affiliateLink: string;
  scheduledAt?: string;
  status: string;
}

export interface RenderJobRecord {
  id: string;
  tenantId: string;
  projectId: string;
  status: string;
  step: string;
  progress: number;
  errorMessage: string;
  outputVideoUrl: string;
  outputThumbnailUrl: string;
  startedAt?: string;
  completedAt?: string;
}

export interface PublishAttemptRecord {
  id: string;
  tenantId: string;
  publishJobId: string;
  stage: string;
  status: string;
  responsePayload: string;
  errorMessage: string;
  startedAt: string;
  completedAt?: string;
}

export interface PublishWebhookRecord {
  id: string;
  tenantId: string;
  publishJobId: string;
  eventType: string;
  payload: string;
  processedStatus: string;
  createdAt: string;
}

export interface DashboardSnapshot {
  workflowStates: Record<WorkflowStatus, number>;
  productCount: number;
  assetCount: number;
  projectCount: number;
  approvalCount: number;
  publishJobCount: number;
  alerts: Array<{
    label: string;
    value: number;
  }>;
  oauthHealth: {
    connectedCount: number;
    expiredCount: number;
    expiringSoonCount: number;
  };
  providerHealth: Array<{
    provider: string;
    mode: string;
    configured: boolean;
  }>;
}

export interface ReportsSnapshot {
  avgProductPrice: number;
  publishedJobs: number;
  approvedReviews: number;
  projectStatuses: Array<{
    status: string;
    count: number;
  }>;
  channels: Array<{
    channel: string;
    count: number;
  }>;
  operations: {
    completedRenders: number;
    successfulPublishAttempts: number;
    estimatedRenderCostUsd: number;
    estimatedPublishCostUsd: number;
    estimatedTotalCostUsd: number;
    unitAssumptions: {
      renderUsd: number;
      publishAttemptUsd: number;
    };
  };
  filter?: {
    from?: string;
    to?: string;
  };
}

export interface AuditLogRecord {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  tenantId: string;
  userId: string | null;
  kind: string;
  severity: string;
  title: string;
  body: string;
  refType: string;
  refId: string;
  readAt: string | null;
  createdAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
  tenantId: string;
}

export interface LoginResponse {
  token: string;
  session: Session;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export async function login(input: LoginInput) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getCurrentSession(token: string) {
  return request<Session>("/auth/me", {
    token
  });
}

export async function getDashboard(token: string) {
  return request<DashboardSnapshot>("/dashboard", { token });
}

export async function getReports(
  token: string,
  filter?: { from?: string; to?: string }
) {
  const params = new URLSearchParams();

  if (filter?.from) {
    params.set("from", filter.from);
  }

  if (filter?.to) {
    params.set("to", filter.to);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<ReportsSnapshot>(`/reports${suffix}`, { token });
}

export async function listAuditLogs(token: string, params?: { limit?: number; offset?: number }) {
  const search = new URLSearchParams();
  if (params?.limit != null) {
    search.set("limit", String(params.limit));
  }
  if (params?.offset != null) {
    search.set("offset", String(params.offset));
  }
  const q = search.toString() ? `?${search.toString()}` : "";
  return request<AuditLogRecord[]>(`/audit-logs${q}`, { token });
}

export async function listNotifications(
  token: string,
  params?: { unreadOnly?: boolean; limit?: number }
) {
  const search = new URLSearchParams();
  if (params?.unreadOnly) {
    search.set("unreadOnly", "1");
  }
  if (params?.limit != null) {
    search.set("limit", String(params.limit));
  }
  const q = search.toString() ? `?${search.toString()}` : "";
  return request<NotificationRecord[]>(`/notifications${q}`, { token });
}

export async function markNotificationRead(token: string, id: string) {
  return request<{ ok: boolean; id: string }>(`/notifications/${id}`, {
    method: "PATCH",
    token
  });
}

export async function markAllNotificationsRead(token: string) {
  return request<{ ok: boolean }>("/notifications/mark-all-read", {
    method: "POST",
    token
  });
}

export async function listProducts(token: string) {
  return request<ProductRecord[]>("/products", { token });
}

export async function createProduct(
  token: string,
  input: Omit<ProductRecord, "id" | "tenantId">
) {
  return request<ProductRecord>("/products", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export async function updateProduct(
  token: string,
  id: string,
  input: Partial<Omit<ProductRecord, "id" | "tenantId">>
) {
  return request<ProductRecord>(`/products/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(input)
  });
}

export async function deleteProduct(token: string, id: string) {
  return request<{ deleted: boolean; id: string }>(`/products/${id}`, {
    method: "DELETE",
    token
  });
}

export async function listAssets(token: string) {
  return request<AssetRecord[]>("/assets", { token });
}

export async function createAsset(
  token: string,
  input: Omit<AssetRecord, "id" | "tenantId">
) {
  return request<AssetRecord>("/assets", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export async function updateAsset(
  token: string,
  id: string,
  input: Partial<Omit<AssetRecord, "id" | "tenantId">>
) {
  return request<AssetRecord>(`/assets/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(input)
  });
}

export async function deleteAsset(token: string, id: string) {
  return request<{ deleted: boolean; id: string }>(`/assets/${id}`, {
    method: "DELETE",
    token
  });
}

export async function uploadAsset(
  token: string,
  input: {
    file: File;
    title?: string;
    productId?: string;
    kind?: AssetRecord["kind"];
  }
) {
  const form = new FormData();
  form.set("file", input.file);

  if (input.title) {
    form.set("title", input.title);
  }

  if (input.productId) {
    form.set("productId", input.productId);
  }

  if (input.kind) {
    form.set("kind", input.kind);
  }

  return request<AssetRecord>("/assets/upload", {
    method: "POST",
    token,
    body: form
  });
}

export async function getStorageConfig(token: string) {
  return request<StorageConfig>("/storage/config", { token });
}

export async function createPresignedAssetUpload(
  token: string,
  input: {
    fileName: string;
    mimeType: string;
  }
) {
  return request<PresignedUploadPayload>("/storage/presign-upload", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export async function completePresignedAssetUpload(
  token: string,
  input: {
    assetId: string;
    productId?: string;
    kind: AssetRecord["kind"];
    storageKey: string;
    mimeType: string;
    checksum: string;
    title?: string;
    originalFilename: string;
    sizeBytes: number;
  }
) {
  return request<AssetRecord>("/assets/complete-upload", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export async function listChannelAccounts(token: string) {
  return request<ChannelAccountRecord[]>("/channel-accounts", { token });
}

export async function createChannelAccount(
  token: string,
  input: Omit<ChannelAccountRecord, "id" | "tenantId" | "lastRefreshedAt">
) {
  return request<ChannelAccountRecord>("/channel-accounts", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export async function updateChannelAccount(
  token: string,
  id: string,
  input: Partial<Omit<ChannelAccountRecord, "id" | "tenantId" | "lastRefreshedAt">>
) {
  return request<ChannelAccountRecord>(`/channel-accounts/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(input)
  });
}

export async function deleteChannelAccount(token: string, id: string) {
  return request<{ deleted: boolean; id: string }>(`/channel-accounts/${id}`, {
    method: "DELETE",
    token
  });
}

export async function refreshChannelAccount(token: string, id: string) {
  return request<ChannelAccountRecord>(`/channel-accounts/${id}/refresh`, {
    method: "POST",
    token
  });
}

export function getOAuthStartUrl(
  provider: ChannelAccountRecord["channel"],
  accountId: string,
  token: string
) {
  const params = new URLSearchParams({
    accountId,
    access_token: token
  });

  return `${API_BASE_URL}/oauth/${provider}/start?${params.toString()}`;
}

export async function listProjects(token: string) {
  return request<ProjectRecord[]>("/projects", { token });
}

export async function createProject(
  token: string,
  input: Omit<ProjectRecord, "id" | "tenantId">
) {
  return request<ProjectRecord>("/projects", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export async function updateProject(
  token: string,
  id: string,
  input: Partial<Omit<ProjectRecord, "id" | "tenantId">>
) {
  return request<ProjectRecord>(`/projects/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(input)
  });
}

export async function deleteProject(token: string, id: string) {
  return request<{ deleted: boolean; id: string }>(`/projects/${id}`, {
    method: "DELETE",
    token
  });
}

export async function listRenderJobs(token: string) {
  return request<RenderJobRecord[]>("/render-jobs", { token });
}

export async function createRenderJob(token: string, input: { projectId: string }) {
  return request<RenderJobRecord>("/render-jobs", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export async function deleteRenderJob(token: string, id: string) {
  return request<{ deleted: boolean; id: string }>(`/render-jobs/${id}`, {
    method: "DELETE",
    token
  });
}

export async function retryRenderJob(token: string, id: string) {
  return request<RenderJobRecord>(`/render-jobs/${id}/retry`, {
    method: "POST",
    token
  });
}

export async function cancelRenderJob(token: string, id: string) {
  return request<RenderJobRecord>(`/render-jobs/${id}/cancel`, {
    method: "POST",
    token
  });
}

export async function listApprovals(token: string) {
  return request<ApprovalRecord[]>("/approvals", { token });
}

export async function createApproval(
  token: string,
  input: Omit<
    ApprovalRecord,
    "id" | "tenantId" | "reviewerId" | "reviewerName" | "createdAt"
  >
) {
  return request<ApprovalRecord>("/approvals", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export async function updateApproval(
  token: string,
  id: string,
  input: Partial<
    Omit<
      ApprovalRecord,
      "id" | "tenantId" | "reviewerId" | "reviewerName" | "createdAt"
    >
  >
) {
  return request<ApprovalRecord>(`/approvals/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(input)
  });
}

export async function deleteApproval(token: string, id: string) {
  return request<{ deleted: boolean; id: string }>(`/approvals/${id}`, {
    method: "DELETE",
    token
  });
}

export async function listPublishJobs(token: string) {
  return request<PublishJobRecord[]>("/publish-jobs", { token });
}

export async function createPublishJob(
  token: string,
  input: Omit<PublishJobRecord, "id" | "tenantId">
) {
  return request<PublishJobRecord>("/publish-jobs", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export async function updatePublishJob(
  token: string,
  id: string,
  input: Partial<Omit<PublishJobRecord, "id" | "tenantId">>
) {
  return request<PublishJobRecord>(`/publish-jobs/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(input)
  });
}

export async function deletePublishJob(token: string, id: string) {
  return request<{ deleted: boolean; id: string }>(`/publish-jobs/${id}`, {
    method: "DELETE",
    token
  });
}

export async function retryPublishJob(token: string, id: string) {
  return request<PublishJobRecord>(`/publish-jobs/${id}/retry`, {
    method: "POST",
    token
  });
}

export async function cancelPublishJob(token: string, id: string) {
  return request<PublishJobRecord>(`/publish-jobs/${id}/cancel`, {
    method: "POST",
    token
  });
}

export async function listPublishAttempts(token: string) {
  return request<PublishAttemptRecord[]>("/publish-attempts", { token });
}

export async function listPublishWebhooks(token: string) {
  return request<PublishWebhookRecord[]>("/publish-webhooks", { token });
}

export async function simulatePublishWebhook(
  token: string,
  input: {
    publishJobId: string;
    eventType: string;
    payload?: Record<string, unknown>;
  }
) {
  return request<{
    id: string;
    publishJobId: string;
    eventType: string;
    publishStatus: string;
  }>("/publish-webhooks/simulate", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export function getRenderMediaUrl(
  renderJobId: string,
  kind: "video" | "thumbnail",
  token: string,
  download = false
) {
  const params = new URLSearchParams({
    access_token: token
  });

  if (download) {
    params.set("download", "1");
  }

  return `${API_BASE_URL}/media/render-jobs/${renderJobId}/${kind}?${params.toString()}`;
}

export function getAssetContentUrl(assetId: string, token: string) {
  const params = new URLSearchParams({
    access_token: token
  });

  return `${API_BASE_URL}/media/assets/${assetId}?${params.toString()}`;
}

interface RequestOptions {
  method?: string;
  body?: BodyInit;
  token?: string;
}

async function request<T>(path: string, options: RequestOptions = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.token
        ? {
            authorization: `Bearer ${options.token}`
          }
        : {}),
      ...(typeof options.body === "string"
        ? {
            "content-type": "application/json"
          }
        : {})
    },
    body: options.body,
    cache: "no-store"
  });

  const payload = (await response.json()) as T | { message: string };

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : "Request failed";
    throw new Error(message);
  }

  return payload as T;
}
