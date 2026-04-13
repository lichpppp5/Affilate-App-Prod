create extension if not exists "pgcrypto";

create table if not exists tenants (
  id text primary key,
  name text not null,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  created_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role_name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists products (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  sku text not null,
  title text not null,
  description text not null default '',
  price numeric(12, 2) not null default 0,
  channels text[] not null default '{}',
  affiliate_source_url text not null default '',
  affiliate_program text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create table if not exists assets (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  product_id text references products(id) on delete set null,
  kind text not null check (kind in ('image', 'audio', 'video')),
  storage_key text not null,
  mime_type text not null,
  checksum text not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table assets
  add column if not exists original_filename text not null default '',
  add column if not exists size_bytes bigint not null default 0,
  add column if not exists storage_provider text not null default 'local';

create table if not exists video_projects (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  template_id text not null,
  brand_kit_id text,
  status text not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists render_jobs (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  project_id text not null references video_projects(id) on delete cascade,
  status text not null,
  step text not null default 'queued',
  progress integer not null default 0,
  error_message text not null default '',
  output_video_url text not null default '',
  output_thumbnail_url text not null default '',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists approvals (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  project_id text not null references video_projects(id) on delete cascade,
  reviewer_id text references users(id) on delete set null,
  reviewer_name text not null,
  decision text not null,
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists publish_jobs (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  project_id text not null references video_projects(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  channel text not null,
  account_id text not null,
  caption text not null default '',
  hashtags text[] not null default '{}',
  disclosure_text text not null default '',
  affiliate_link text not null default '',
  scheduled_at timestamptz,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists channel_accounts (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  channel text not null check (channel in ('tiktok', 'shopee', 'facebook')),
  account_name text not null,
  account_ref text not null,
  auth_type text not null check (auth_type in ('oauth', 'service_account', 'manual')),
  status text not null default 'connected' check (status in ('connected', 'expired', 'error', 'disconnected')),
  client_id text not null default '',
  client_secret text not null default '',
  access_token text not null default '',
  refresh_token text not null default '',
  token_expires_at timestamptz,
  metadata_json text not null default '{}',
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel, account_ref)
);

create table if not exists publish_attempts (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  publish_job_id text not null references publish_jobs(id) on delete cascade,
  stage text not null,
  status text not null,
  response_payload text not null default '',
  error_message text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists publish_webhook_events (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  publish_job_id text not null references publish_jobs(id) on delete cascade,
  event_type text not null,
  payload text not null default '',
  processed_status text not null default 'received',
  created_at timestamptz not null default now()
);

create index if not exists idx_memberships_user_id on memberships(user_id);
create index if not exists idx_products_tenant_id on products(tenant_id);
create index if not exists idx_assets_tenant_id on assets(tenant_id);
create index if not exists idx_assets_product_id on assets(product_id);
create index if not exists idx_projects_tenant_id on video_projects(tenant_id);
create index if not exists idx_render_jobs_tenant_id on render_jobs(tenant_id);
create index if not exists idx_approvals_tenant_id on approvals(tenant_id);
create index if not exists idx_publish_jobs_tenant_id on publish_jobs(tenant_id);
create index if not exists idx_channel_accounts_tenant_id on channel_accounts(tenant_id);
create index if not exists idx_publish_attempts_tenant_id on publish_attempts(tenant_id);
create index if not exists idx_publish_webhooks_tenant_id on publish_webhook_events(tenant_id);

create table if not exists audit_logs (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  user_id text references users(id) on delete set null,
  action text not null,
  resource_type text not null default '',
  resource_id text not null default '',
  metadata_json text not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_tenant_created on audit_logs(tenant_id, created_at desc);

create table if not exists notification_events (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  user_id text references users(id) on delete set null,
  kind text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title text not null,
  body text not null default '',
  ref_type text not null default '',
  ref_id text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_events_tenant_created on notification_events(tenant_id, created_at desc);

alter table products
  add column if not exists affiliate_source_url text not null default '',
  add column if not exists affiliate_program text not null default '';

alter table channel_accounts drop constraint if exists channel_accounts_channel_check;
alter table channel_accounts add constraint channel_accounts_channel_check
  check (channel in ('tiktok', 'shopee', 'facebook'));
