export type Channel = "shopee" | "tiktok" | "facebook";

export type WorkflowStatus =
  | "draft"
  | "generating"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | "failed";

export type JobType = "render" | "publish";

export type RoleName =
  | "super_admin"
  | "org_admin"
  | "content_manager"
  | "reviewer"
  | "operator"
  | "analyst";

export interface Tenant {
  id: string;
  name: string;
  timezone: string;
}

export interface BrandKit {
  id: string;
  tenantId: string;
  name: string;
  primaryColor: string;
  fontFamily: string;
  logoAssetId?: string;
}

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  title: string;
  description: string;
  price: number;
  channels: Channel[];
  assetIds: string[];
  affiliateSourceUrl?: string;
  affiliateProgram?: string;
}

export interface Asset {
  id: string;
  tenantId: string;
  productId?: string;
  kind: "image" | "audio" | "video";
  storageKey: string;
  mimeType: string;
  checksum: string;
}

export interface VideoTemplate {
  id: string;
  tenantId: string;
  name: string;
  channel: Channel;
  aspectRatio: "9:16" | "1:1" | "16:9";
  durationSeconds: number;
}

export interface VideoProject {
  id: string;
  tenantId: string;
  productId: string;
  templateId: string;
  brandKitId?: string;
  status: WorkflowStatus;
  title: string;
}

export interface RenderJob {
  id: string;
  tenantId: string;
  projectId: string;
  type: "render";
  status: WorkflowStatus;
  idempotencyKey: string;
}

export interface PublishJob {
  id: string;
  tenantId: string;
  projectId: string;
  channel: Channel;
  type: "publish";
  status: WorkflowStatus;
  accountId: string;
  affiliateLink?: string;
}

export interface PublishAttempt {
  id: string;
  publishJobId: string;
  startedAt: string;
  endedAt?: string;
  status: "queued" | "success" | "failed";
  errorCode?: string;
}

export interface QueueEnvelope<TPayload> {
  jobId: string;
  traceId: string;
  tenantId: string;
  payload: TPayload;
}

export interface RenderPayload {
  projectId: string;
  templateId: string;
  assetIds: string[];
}

export interface PublishPayload {
  projectId: string;
  channel: Channel;
  accountId: string;
  caption: string;
  hashtags: string[];
  disclosureText?: string;
}
