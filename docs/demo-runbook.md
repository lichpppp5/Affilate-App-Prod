# Runbook demo cho team

Tài liệu này mô tả cách chạy bản **demo khóa** (dữ liệu và tài khoản cố định) để onboard nhanh hoặc reset sau khi thử nghiệm.

## Tài khoản demo chuẩn (không đổi)

| Trường | Giá trị |
|--------|---------|
| Email | `admin@appaffilate.local` |
| Mật khẩu | `admin123` |
| Tenant | `tenant_demo` (chọn sau khi đăng nhập nếu UI hỏi) |

User id nội bộ: `user_demo_admin`. Mọi bản ghi mẫu (sản phẩm, project, publish job, kênh demo) đều thuộc tenant này.

### Tài khoản RBAC demo (cùng mật khẩu `admin123`, tenant `tenant_demo`)

| Email | Vai trò | Ghi chú menu |
|-------|---------|----------------|
| `content@appaffilate.local` | `content_manager` | Gần full nội dung, không xóa kênh / không audit |
| `reviewer@appaffilate.local` | `reviewer` | Approvals + xem project/asset/product |
| `operator@appaffilate.local` | `operator` | Publish/retry, render, không CRUD sản phẩm |
| `analyst@appaffilate.local` | `analyst` | Chủ yếu Reports + xem (read-only) |

## Lần đầu trên máy local

1. Cài dependency: `npm install` ở root repo.
2. Bật Postgres (và tuỳ chọn Redis, MinIO): `npm run infra:up`.
3. Migrate: `npm --workspace @appaffilate/api run db:migrate` (thêm bảng `audit_logs`, `notification_events` nếu upgrade từ bản cũ).
4. Seed: `npm --workspace @appaffilate/api run db:seed`.
5. Chạy stack: `npm run dev:all` hoặc `npm run start:all` (kèm Docker infra).

Web: `WEB_BASE_URL` (mặc định `http://localhost:3000`). API: `API_BASE_URL` (mặc định `http://localhost:4000`).

## Làm sạch demo và seed lại (khuyến nghị trước demo cho khách)

Lệnh một chuỗi (xóa toàn bộ dữ liệu thuộc `tenant_demo` nhờ `ON DELETE CASCADE`, rồi seed lại):

```bash
npm run db:reset-demo
```

Tương đương:

```bash
npm --workspace @appaffilate/api run db:reset-demo
```

**Lưu ý:** Chỉ an toàn khi bạn chắc `tenant_demo` không chứa dữ liệu production. Nếu team dùng chung một DB và đã đổi tenant id demo, cần điều chỉnh script hoặc không dùng reset này.

## Chỉ chạy lại seed (không xóa tenant)

`db:seed` dùng upsert cho tenant, user, membership và các bản ghi demo theo id cố định: chạy lại sẽ **đồng bộ lại** nội dung demo (ví dụ reset mật khẩu demo, token giả trên channel_accounts) mà không xóa các hàng bạn tự tạo thêm trong cùng tenant (các id khác seed vẫn giữ nguyên).

```bash
npm --workspace @appaffilate/api run db:seed
```

## TikTok / Shopee trên demo

- Không set URL OAuth/publish thật → API dùng mock nội bộ (`/provider-mocks/...`).
- Khi nối production/sandbox thật, xem [env-production.md](./env-production.md) và đặt biến môi trường giống nhau trên **API** và **worker**.

## Checklist trước khi demo

- [ ] `db:migrate` đã chạy trên DB đích.
- [ ] `npm run db:reset-demo` (hoặc ít nhất `db:seed`) để dữ liệu khớp runbook.
- [ ] `ffmpeg` có trên máy chạy worker (render thật).
- [ ] `.env` có `API_BASE_URL` / `WEB_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` trỏ đúng host demo.
