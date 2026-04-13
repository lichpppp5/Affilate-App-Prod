# Hợp đồng BFF / proxy cho TikTok, Shopee và Facebook

Worker gọi thẳng URL trong `TIKTOK_PUBLISH_URL` / `SHOPEE_PUBLISH_URL` / `FACEBOOK_PUBLISH_URL` và `*_OAUTH_TOKEN_URL`. API nền tảng thường **không** trùng JSON mà code mặc định mong đợi. Giải pháp khuyến nghị: **một service nhỏ** (BFF) do bạn host, map giữa AppAffilate và API chính thức.

## 1. Token refresh (`POST` → `*_OAUTH_TOKEN_URL`)

**Request body** (worker gửi):

```json
{
  "grantType": "refresh_token | client_credentials",
  "refreshToken": "…",
  "clientId": "…",
  "clientSecret": "…"
}
```

**Response** (BFF phải trả về JSON):

```json
{
  "access_token": "…",
  "refresh_token": "…",
  "expires_in": 3600
}
```

`expires_in` là giây (tuỳ chọn). Nếu thiếu, worker không set hạn token từ phản hồi.

BFF nhận body trên, dịch sang form/query/header mà TikTok/Shopee/Facebook yêu cầu, gọi upstream, rồi **chuẩn hoá** lại JSON như trên.

## 2. Publish (`POST` → `*_PUBLISH_URL`)

**Headers:** `Authorization: Bearer <access_token>`, `Content-Type: application/json`

**Body** (worker gửi — có thể mở rộng theo domain):

```json
{
  "publishJobId": "…",
  "projectId": "…",
  "channel": "tiktok | shopee | facebook",
  "disclosureText": "…",
  "caption": "…",
  "hashtags": ["#ad", "#beauty"],
  "affiliateLink": "https://…"
}
```

`caption`, `hashtags`, `affiliateLink` là tuỳ chọn ở tầng worker nhưng **mock Facebook** trong API từ chối nếu thiếu `affiliateLink`. BFF production nên map các field này sang payload Graph API hoặc endpoint đăng bài thực tế.

**Response** (BFF phải trả JSON):

```json
{
  "status": "draft_uploaded | published | failed | …",
  "external_id": "…",
  "message": "…"
}
```

`status` là bắt buộc (worker dùng cập nhật job). `external_id` và `message` tuỳ chọn.

BFF có thể thêm upload multipart, poll job, v.v. — miễn cuối cùng trả đúng dạng trên (hoặc lỗi HTTP + `message` trong JSON).

## 3. OAuth authorize / callback

API đã redirect tới URL authorize của nền tảng và callback tại `{API_BASE_URL}/oauth/{tiktok|shopee|facebook}/callback`. Phần đổi `code` → token trên API AppAffilate dùng `*_OAUTH_TOKEN_URL`; có thể trỏ cùng BFF với path khác (ví dụ `/oauth/token`) miễn request/response tương thích với route OAuth trong `apps/api` (kiểm tra `providers.ts` / `routes/oauth.ts` cho `application/json` vs `x-www-form-urlencoded`).

## 4. Kiểm thử nhanh

1. Chạy mock nội bộ (không set env URL) — luồng end-to-end.
2. Trỏ `*_PUBLISH_URL` tới BFF stub trả `{ "status": "published", "external_id": "test" }`.
3. Bật URL thật từng phần (sandbox) sau khi BFF map xong.

Chi tiết biến môi trường: [env-production.md](./env-production.md).
