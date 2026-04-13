# AppAffilate

Nen tang tao video quang cao AI tu anh san pham, quan ly workflow noi dung va van hanh publish da kenh.

## Monorepo layout

- `apps/web`: web admin cho team van hanh.
- `apps/api`: API/BFF va orchestration layer.
- `apps/worker`: worker xu ly AI/media/publish jobs.
- `packages/domain`: types va domain model dung chung.
- `docs`: discovery, integration audit, architecture, admin UX, roadmap; xem [docs/roadmap-overview.md](./docs/roadmap-overview.md) cho cấu trúc + luồng hoạt động + trạng thái phase.
- `infra`: ha tang local de phat trien.

## Khoi dong du an

1. Cai dat dependencies cho tung workspace bang `npm install`.
2. Khoi dong Postgres, Redis, MinIO bang `docker compose -f infra/docker-compose.yml up -d`.
3. Chay migration va seed cho API:
   - `npm --workspace @appaffilate/api run db:migrate`
   - `npm --workspace @appaffilate/api run db:seed`
4. Chay tung service:
   - `npm run dev:web`
   - `npm run dev:api`
   - `npm run dev:worker`
5. Neu muon bat nhanh toan bo stack dev trong mot lenh:
   - `npm run start:all`

Runbook demo (tai khoan chuan, reset DB): [docs/demo-runbook.md](./docs/demo-runbook.md) — reset sach roi seed: `npm run db:reset-demo`.  
Bien moi truong production / TikTok Shopee: [docs/env-production.md](./docs/env-production.md).

## Lenh nhanh

- Bat ha tang local: `npm run infra:up`
- Tat ha tang local: `npm run infra:down`
- Bat ca `Postgres + Redis + MinIO + api + worker + web`: `npm run start:all`
- Neu da co ha tang roi va chi muon bat 3 service dev: `npm run dev:all`
- Xoa du lieu tenant demo va seed lai: `npm run db:reset-demo`

## API auth va CRUD

- Tai khoan seed mac dinh:
  - `email`: `admin@appaffilate.local`
  - `password`: `admin123`
  - `tenantId`: `tenant_demo`
- Dang nhap:
  - `POST /auth/login`
- Lay session hien tai:
  - `GET /auth/me`
- CRUD tenant-aware:
  - `GET|POST|GET:id|PUT:id|DELETE:id /products`
  - `GET|POST|GET:id|PUT:id|DELETE:id /assets`
  - `GET|POST|GET:id|PUT:id|DELETE:id /projects`

## Bien moi truong

- Copy `.env.example` thanh `.env` neu can.
- Gia tri quan trong:
  - `DATABASE_URL`
  - `AUTH_SECRET`
  - `PORT`
  - `API_BASE_URL`
  - `WEB_BASE_URL`
  - `NEXT_PUBLIC_API_BASE_URL`
  - `OBJECT_STORAGE_DRIVER`
  - `OBJECT_STORAGE_LOCAL_DIR`
  - `OBJECT_STORAGE_BUCKET`
  - `OBJECT_STORAGE_ENDPOINT`
  - `OBJECT_STORAGE_ACCESS_KEY_ID`
  - `OBJECT_STORAGE_SECRET_ACCESS_KEY`
  - `TIKTOK_OAUTH_AUTHORIZE_URL`
  - `TIKTOK_OAUTH_TOKEN_URL`
  - `TIKTOK_PUBLISH_URL`
  - `TIKTOK_CLIENT_ID`
  - `TIKTOK_CLIENT_SECRET`
  - `SHOPEE_OAUTH_AUTHORIZE_URL`
  - `SHOPEE_OAUTH_TOKEN_URL`
  - `SHOPEE_PUBLISH_URL`
  - `SHOPEE_CLIENT_ID`
  - `SHOPEE_CLIENT_SECRET`

## Web admin

- Web admin da co login screen noi truc tiep vao API; RBAC theo `role_name` (menu an hien theo `permissions` tu `/auth/me`).
- Audit log (`/audit-logs`, trang `/audit`) va thong bao (`/notifications`) cho operator; worker tu ghi notification khi render/publish fail.
- Tuy chon: `USE_JOB_QUEUE=1` + `REDIS_URL` de API day job id vao Redis va worker BRPOP (van co DB poll); `GET /metrics` (Prometheus); `ALERT_WEBHOOK_URL` cho canh bao ngoai. Chi tiet: `docs/env-production.md`, `docs/provider-bff-contract.md`.
- Sau khi dang nhap, co the CRUD that tren:
  - `/products`
  - `/assets`
  - `/channels`
  - `/projects`
- Dashboard `/` doc du lieu that tu `/dashboard`.
- `/assets` da ho tro upload file that vao storage backend va mo lai noi dung asset qua API.
- `/assets` co them direct upload qua presigned URL khi `OBJECT_STORAGE_DRIVER=s3`.
- `/channels` da ho tro onboarding tai khoan publish, luu token/service account, va refresh token thu cong.
- `/channels` co them nut OAuth, callback ve web admin, va cap nhat token that vao `channel_accounts`.

## Worker orchestration

- Worker da poll DB that cho:
  - `render_jobs`
  - `publish_jobs`
- Render pipeline da dung `ffmpeg` de tao video va thumbnail that vao thu muc `generated-media`.
- Operator co the `retry` va `cancel` truc tiep tren:
  - `POST /render-jobs/:id/retry`
  - `POST /render-jobs/:id/cancel`
  - `POST /publish-jobs/:id/retry`
  - `POST /publish-jobs/:id/cancel`
- Worker se ton trong trang thai `canceled` trong luc dang xu ly de tranh chot sai state sau khi team van hanh huy job.
- Publish workflow da co:
  - `publish_attempts`
  - `publish_webhook_events`
  - webhook simulation qua API
  - chon `channel account` that tu DB thay vi nhap `accountId` thu cong
  - auto refresh token qua token endpoint neu account het han va co `refresh_token` hoac `service_account`
  - publish adapter HTTP theo kenh thay vi chot status noi bo trong worker
  - mock provider endpoints local duoc bat lam mac dinh de test end-to-end khi chua co credential TikTok/Shopee production

## Luu y FFmpeg

- Moi truong `ffmpeg` local da duoc sua va worker dang render duoc video that end-to-end.
- Neu gap loi tuong tu tren may khac, uu tien kiem tra Homebrew links/dependencies (`libarchive`, `xz`, `ffmpeg`) truoc khi debug code.

## Trang thai hien tai

Repo da duoc scaffold theo plan goc:

- Tai lieu discovery va roadmap de chot pham vi.
- Audit tích hop Shopee/TikTok de giam rui ro account va API.
- Kien truc domain, queue-worker, media pipeline va observability.
- Web admin khung cho cac man hinh cot loi.
- API/worker scaffold de team bat dau trien khai phase 1.
