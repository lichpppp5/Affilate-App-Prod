# alluser.md — Danh sách user để quản lý

Tài liệu này tập trung vào:
- **Các user seed/demo** có sẵn trong code (có thể đăng nhập ngay sau khi chạy seed)
- **Cách xem/toàn quyền quản lý user đang có thật** trong DB qua trang **Người dùng**

> Lưu ý bảo mật: hệ thống lưu mật khẩu dạng **hash** trong DB (`users.password_hash`). Vì vậy **không thể** “lấy ra mật khẩu plaintext đang dùng” từ DB để ghi vào file. Cách đúng là **reset password** (admin).

---

## 1) Các user seed/demo (nếu bạn chạy `db:seed` / `db:reset-demo`)

### Tenant demo
- **TenantId**: `tenant_demo`

### Mật khẩu dùng chung (demo)
- **Password**: `admin123`

### Danh sách tài khoản demo
- **Admin (full quyền)**:
  - Email: `admin@appaffilate.local`
  - Role: `org_admin`
  - TenantId: `tenant_demo`
  - Password: `admin123`

- **Content manager**:
  - Email: `content@appaffilate.local`
  - Role: `content_manager`
  - TenantId: `tenant_demo`
  - Password: `admin123`

- **Reviewer**:
  - Email: `reviewer@appaffilate.local`
  - Role: `reviewer`
  - TenantId: `tenant_demo`
  - Password: `admin123`

- **Operator**:
  - Email: `operator@appaffilate.local`
  - Role: `operator`
  - TenantId: `tenant_demo`
  - Password: `admin123`

- **Analyst**:
  - Email: `analyst@appaffilate.local`
  - Role: `analyst`
  - TenantId: `tenant_demo`
  - Password: `admin123`

Nguồn: `apps/api/src/scripts/seed.ts` (DEMO users).

---

## 2) Danh sách user “thật” trong DB (mọi tenant)

### Cách xem user hiện có
Đăng nhập bằng admin, vào menu:
- **Người dùng** (`/users`)

Trang này hiển thị:
- Email
- Display name
- Role

### Cách tạo user mới
Tại trang **Người dùng**:
- Nhập `email`, `displayName`, `role`
- Mật khẩu:
  - Nếu để trống: hệ thống sẽ **tự generate** và hiển thị **1 lần** để bạn copy.
  - Nếu nhập: password phải >= 6 ký tự

### Cách reset password (khuyến nghị thay vì “trích DB”)
Tại trang **Người dùng** → bấm **Reset pass**
- Hệ thống trả về mật khẩu mới và hiển thị **1 lần** để bạn copy.

---

## 3) Tạo tenant mới + admin cho tenant (để đăng nhập được)

Vào menu:
- **Tenants** (`/tenants`)

Khi tạo tenant mới, hệ thống sẽ tạo luôn:
- Bản ghi `tenants`
- 1 user (nếu email chưa tồn tại) + membership role `org_admin` cho tenant đó

---

## 4) Gợi ý quản trị nội bộ

- Đổi ngay password demo sau khi triển khai nội bộ thật.
- Không chia sẻ password qua kênh không an toàn; dùng reset password và gửi 1 lần.

