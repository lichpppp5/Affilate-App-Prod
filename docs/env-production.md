# Biến môi trường production (API, Web, Worker, Storage, TikTok, Shopee, Facebook)

Hướng dẫn **chỗ cần điền** và **service nào đọc** biến. Đặt cùng một bộ giá trị trên process chạy API và worker khi triển khai (Kubernetes secrets, PM2 env, v.v.).

## Bảng tổng quan

| Biến | Mục đích | Ai đọc | Ghi chú điền giá trị |
|------|----------|--------|----------------------|
| `DATABASE_URL` | Chuỗi kết nối Postgres | API, Worker | URL do RDS/Cloud SQL/self-host cấp. |
| `AUTH_SECRET` | Ký/verify session token | API | Chuỗi ngẫu nhiên dài, không commit. |
| `REDIS_URL` | Redis (tuỳ chọn) | API | Nếu có, `/health` ping Redis; chưa dùng làm queue chính trong code hiện tại. |
| `COST_RENDER_UNIT_USD` | Đơn giá ước tính mỗi render completed | API (reports) | Mặc định `0.03`. |
| `COST_PUBLISH_UNIT_USD` | Đơn giá mỗi publish attempt thành công | API (reports) | Mặc định `0.02`. |
| `USE_JOB_QUEUE` | `1` bật: API `LPUSH` job id sau khi ghi DB; worker `BRPOP` để đánh thức nhanh | API, Worker | Vẫn **giữ DB là nguồn thật**; worker vẫn poll nếu hàng Redis trống. Cần `REDIS_URL`. |
| `JOB_QUEUE_RENDER_KEY` / `JOB_QUEUE_PUBLISH_KEY` | Tên Redis list | API, Worker | Mặc định `appaffilate:queue:render` / `appaffilate:queue:publish`. |
| `JOB_QUEUE_BRPOP_SEC` | Timeout `BRPOP` (giây) | Worker | Mặc định `3`, tối đa `30`. |
| `METRICS_TOKEN` | Nếu đặt, `GET /metrics?token=...` | API | Prometheus scrape trong mạng riêng; để trống thì `/metrics` mở (chỉ dùng dev). |
| `ALERT_WEBHOOK_URL` | URL nhận POST JSON khi worker tạo notification escalation (job fail) | Worker | Tuỳ chọn (Slack incoming, n8n, v.v.). |
| `PROVIDER_WEBHOOK_SECRET` | Ký/verify webhook từ BFF/provider | API, BFF | Nếu đặt, BFF phải gửi header `x-appaffilate-signature`. |
| `PORT` | Cổng HTTP API | API | Ví dụ `4000` hoặc cổng reverse proxy nội bộ. |
| `API_BASE_URL` | URL công khai (hoặc nội bộ) của API | API (OAuth redirect, link), Worker (fallback mock URL) | Ví dụ `https://api.example.com`. Phải khớp URL browser/server gọi tới. |
| `WEB_BASE_URL` | URL web admin | API (OAuth callback redirect) | Ví dụ `https://app.example.com`. Callback OAuth redirect về đây. |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL API cho browser | Web (Next.js build/runtime) | Thường cùng giá trị public với `API_BASE_URL`. |
| `OBJECT_STORAGE_DRIVER` | `local` hoặc `s3` | API | Production nên `s3` (MinIO/S3/R2 tương thích). |
| `OBJECT_STORAGE_LOCAL_DIR` | Thư mục file local | API | Chỉ khi `local`. |
| `OBJECT_STORAGE_BUCKET` | Tên bucket | API | Tạo bucket trước hoặc để API tự tạo (S3 mode). |
| `OBJECT_STORAGE_REGION` | Region | API | Ví dụ `ap-southeast-1`. |
| `OBJECT_STORAGE_ENDPOINT` | Endpoint tùy chỉnh | API | MinIO/R2: URL gốc API S3. AWS S3 để trống. |
| `OBJECT_STORAGE_ACCESS_KEY_ID` | Access key | API | IAM user hoặc MinIO user. |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | Secret key | API | Không log, không commit. |
| `OBJECT_STORAGE_FORCE_PATH_STYLE` | `true`/`false` | API | MinIO thường `true`. |
| `TIKTOK_OAUTH_AUTHORIZE_URL` | Trang authorize OAuth TikTok | API | Lấy từ TikTok Developer / Login Kit / Open Platform (đúng sản phẩm bạn đăng ký). |
| `TIKTOK_OAUTH_TOKEN_URL` | Endpoint đổi code → token | API, Worker | API dùng khi callback; worker dùng khi refresh token (POST JSON như code hiện tại). |
| `TIKTOK_PUBLISH_URL` | Endpoint upload/publish video (adapter) | Worker | **URL do bạn bọc** (BFF) hoặc URL API TikTok nếu body/response đã map sang JSON `{ status, external_id?, message? }`. |
| `TIKTOK_CLIENT_ID` | Client key app TikTok | API, Worker | OAuth + refresh; có thể trùng client id trong DB `channel_accounts`. |
| `TIKTOK_CLIENT_SECRET` | Client secret | API, Worker | Giữ bí mật; worker chỉ cần nếu refresh dùng secret từ env. |
| `SHOPEE_OAUTH_AUTHORIZE_URL` | URL authorize Shopee | API | Theo portal Open Platform / Affiliate API bạn dùng. |
| `SHOPEE_OAUTH_TOKEN_URL` | Token endpoint | API, Worker | Giống TikTok: POST JSON, response có `access_token`… |
| `SHOPEE_PUBLISH_URL` | Endpoint publish (adapter) | Worker | Thường là BFF map sang format nội bộ worker. |
| `SHOPEE_CLIENT_ID` | Partner id / client id | API, Worker | |
| `SHOPEE_CLIENT_SECRET` | Partner key / secret | API, Worker | |
| `FACEBOOK_OAUTH_AUTHORIZE_URL` | URL authorize (Meta / BFF) | API | Đăng ký redirect `{API_BASE_URL}/oauth/facebook/callback`. |
| `FACEBOOK_OAUTH_TOKEN_URL` | Đổi code / refresh token | API, Worker | Cùng contract JSON như TikTok/Shopee trong worker. |
| `FACEBOOK_PUBLISH_URL` | Publish (BFF map sang Graph hoặc tool nội bộ) | Worker | Body mở rộng: `caption`, `hashtags`, `affiliateLink` — xem [provider-bff-contract.md](./provider-bff-contract.md). |
| `FACEBOOK_CLIENT_ID` | App id | API, Worker | |
| `FACEBOOK_CLIENT_SECRET` | App secret | API, Worker | |
| `API_WEBHOOK_URL` | Base URL API để BFF callback | BFF | Ví dụ `https://api.example.com`. |
| `FACEBOOK_GRAPH_BASE_URL` | Base Graph API | BFF | Mặc định `https://graph.facebook.com`. |
| `FACEBOOK_GRAPH_VERSION` | Version Graph | BFF | Mặc định `v20.0`. |
| `FACEBOOK_PAGE_ID` | Page ID để đăng bài | BFF | BFF post `/{pageId}/feed`. |

## TikTok / Shopee / Facebook “thật”: kỳ vọng kỹ thuật hiện tại

Code không hard-code host TikTok/Shopee/Facebook; nó gọi **URL bạn cấu hình**.

1. **OAuth (API)**  
   - `GET /oauth/tiktok/start` và `.../callback` (tương tự Shopee, Facebook) dùng `*_OAUTH_AUTHORIZE_URL` và `*_OAUTH_TOKEN_URL`.  
   - Body/token exchange phải tương thích với implementation trong API (thường là `application/x-www-form-urlencoded` hoặc JSON tùy route — kiểm tra `apps/api/src` routes oauth).

2. **Refresh token (Worker)**  
   - `apps/worker/src/providers.ts` gửi POST JSON: `grantType`, `refreshToken`, `clientId`, `clientSecret`.  
   - Response JSON cần có `access_token`; tuỳ chọn `refresh_token`, `expires_in`.  
   - Nếu Shopee/TikTok thật khác format, cần **một lớp proxy** (nhỏ) hoặc chỉnh worker cho đúng spec — env chỉ trỏ tới URL đó.

3. **Publish (Worker)**  
   - POST JSON tới `*_PUBLISH_URL`, header `Authorization: Bearer <access_token>`.  
   - Response JSON cần có `status` (và có thể `external_id`, `message`).  
   - API thật của TikTok Shop / Shopee thường khác schema → **khuyến nghị**: đặt `TIKTOK_PUBLISH_URL` / `SHOPEE_PUBLISH_URL` trỏ tới **service nội bộ** của bạn dịch sang format này.

## Triển khai thực tế (checklist)

1. Copy `.env.example` → `.env` (local) hoặc inject secrets trên server.  
2. Đặt `API_BASE_URL` và `WEB_BASE_URL` đúng domain HTTPS.  
3. Trong TikTok/Shopee/Meta developer console, đăng ký **redirect URI** trỏ thẳng vào API (handler callback nằm trên API):
   - TikTok: `{API_BASE_URL}/oauth/tiktok/callback`
   - Shopee: `{API_BASE_URL}/oauth/shopee/callback`
   - Facebook: `{API_BASE_URL}/oauth/facebook/callback`  
   Thay `{API_BASE_URL}` bằng URL public của API (ví dụ `https://api.example.com`). `WEB_BASE_URL` vẫn cần đúng để API redirect browser về web admin sau khi lưu token (luồng cụ thể trong `apps/api/src/server.ts` / routes OAuth).  
4. Worker và API **cùng** `*_OAUTH_TOKEN_URL`, `*_PUBLISH_URL`, `*_CLIENT_*` nếu worker refresh/publish không đọc secret từ DB.  
5. Web build cần `NEXT_PUBLIC_API_BASE_URL` tại thời điểm build (Next) hoặc runtime tùy cách deploy.

Chi tiết demo và reset DB: [demo-runbook.md](./demo-runbook.md).
