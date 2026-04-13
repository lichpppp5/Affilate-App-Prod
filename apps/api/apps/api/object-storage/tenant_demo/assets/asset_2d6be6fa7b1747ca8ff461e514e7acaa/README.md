# AppAffilate

Nen tang tao video quang cao AI tu anh san pham, quan ly workflow noi dung va van hanh publish da kenh.

## Monorepo layout

- `apps/web`: web admin cho team van hanh.
- `apps/api`: API/BFF va orchestration layer.
- `apps/worker`: worker xu ly AI/media/publish jobs.
- `packages/domain`: types va domain model dung chung.
- `docs`: discovery, integration audit, architecture, admin UX, roadmap.
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
  - `NEXT_PUBLIC_API_BASE_URL`

## Web admin

- Web admin da co login screen noi truc tiep vao API.
- Sau khi dang nhap, co the CRUD that tren:
  - `/products`
  - `/assets`
  - `/projects`
- Dashboard `/` doc du lieu that tu `/dashboard`.

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
