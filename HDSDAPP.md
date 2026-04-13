# HDSDAPP.md — Hướng dẫn sử dụng AppAffilate (nội bộ)

Tài liệu này mô tả cách sử dụng hệ thống AppAffilate cho vận hành nội bộ: quản lý sản phẩm/asset, dự án video, phê duyệt, publish đa kênh (Facebook ưu tiên, sau đó TikTok), theo dõi trạng thái và log.

> Gợi ý: Nếu bạn đang chạy demo seed mặc định, hãy dùng tài khoản ở mục **1.2** để đăng nhập ngay.

---

## 1) Bắt đầu nhanh

### 1.1 Truy cập hệ thống

- **Web admin**: `http://<IP>:3000`
- **API**: `http://<IP>:4000`

### 1.2 Tài khoản demo (nếu đã seed)

- **Email**: `admin@appaffilate.local`
- **Password**: `admin123`
- **TenantId**: `tenant_demo`

Ngoài ra seed có thêm các role: `content@appaffilate.local`, `reviewer@appaffilate.local`, `operator@appaffilate.local`, `analyst@appaffilate.local` (cùng mật khẩu `admin123`).

---

## 2) Tổng quan tính năng theo menu

### 2.1 Tổng quan (Dashboard)

Mục tiêu: xem nhanh sức khoẻ vận hành.
- Thống kê số lượng theo trạng thái workflow (draft/review/approved/scheduled/published/failed…)
- Đếm số sản phẩm, asset, dự án, phê duyệt, publish jobs
- Tình trạng OAuth/token theo kênh (connected/expired/expiring soon)
- Các cảnh báo (alerts) phát sinh từ worker

### 2.2 Sản phẩm

Mục tiêu: tạo “nguồn dữ liệu” cho dự án video và publish.
- Tạo/cập nhật **SKU**, tên, mô tả, giá
- Chọn **channels** (shopee/tiktok/facebook) mà sản phẩm có thể dùng
- Lưu **affiliateSourceUrl** (link affiliate gốc) và **affiliateProgram**

Thực hành khuyến nghị:
- Với **Facebook**: luôn nhập `affiliateSourceUrl` để tự điền nhanh vào publish job.

### 2.3 Tài nguyên (Assets)

Mục tiêu: lưu hình ảnh/video/audio phục vụ dựng video.
- Upload asset và gắn vào sản phẩm
- Xem danh sách asset theo tenant/product

### 2.4 Kênh bán (Channel accounts)

Mục tiêu: kết nối tài khoản kênh (TikTok/Shopee/Facebook) để worker có token publish.
- Tạo channel account (oauth/service_account/manual)
- Bắt đầu OAuth và refresh token

Lưu ý:
- Nếu token hết hạn, bạn sẽ thấy trạng thái `expired/error` và cần refresh/reconnect.

### 2.5 Năng lực kênh (Channel capabilities)

Mục tiêu: cấu hình ràng buộc theo kênh và **tracking mặc định** (ưu tiên Facebook, rồi TikTok).

Bạn có thể cấu hình cho từng kênh:
- `affiliateLinkRequired`: kênh có bắt buộc link affiliate không
- `disclosureRequired`: kênh có bắt buộc disclosure (#ad) không
- `maxCaptionLength`: giới hạn độ dài caption
- `requireProductMapping`: bắt buộc mapping sản phẩm theo kênh (xem mục 2.6)

Và tracking mặc định:
- `defaultTrackingParams`: object key→value, được gộp vào query string của link affiliate khi publish.

### 2.6 Mapping sản phẩm (Product mappings)

Mục tiêu: ánh xạ sản phẩm nội bộ → ID sản phẩm trên nền tảng (Facebook Catalog / TikTok Shop).

- Tạo mapping theo `(productId, channel)`
- Nhập `externalProductId` (ID phía nền tảng)

Worker sẽ:
- Lấy mapping (nếu có) và gửi kèm `externalProductId` trong payload publish (BFF có thể dùng để tag đúng sản phẩm).

### 2.7 Dự án video

Mục tiêu: gom “một video” thành một dự án vận hành.

Mỗi dự án gồm:
- `title` (tên dự án)
- `product` (sản phẩm gốc)
- `video template`
- `brand kit` (tuỳ chọn)
- `status` (draft/review/approved/…)

Ngoài ra có phần **Render jobs**:
- Xếp hàng render
- Theo dõi tiến độ/step, preview thumbnail/video nếu có output

### 2.8 Mẫu video (Video templates)

Mục tiêu: định nghĩa preset dựng video theo kênh.
- `channel`
- `aspectRatio` (9:16, 1:1, 16:9…)
- `durationSeconds`

Khuyến nghị:
- Facebook thường dùng `1:1` hoặc `4:5` (tuỳ chiến dịch). Hiện hệ thống lưu dạng text, bạn có thể đặt `1:1`.

### 2.9 Bộ nhận diện (Brand kits)

Mục tiêu: chuẩn hoá nhận diện khi render.
- `primaryColor`, `fontFamily`
- `logoAssetId` (tuỳ chọn)

### 2.10 Tuân thủ kênh (Compliance checklist)

Mục tiêu: checklist compliance theo kênh, bắt buộc tick trước khi publish (theo cấu hình).

- Mỗi item có `channel`, `code`, `label`, `required`, `sortOrder`
- Khi tạo/cập nhật publish job, hệ thống sẽ **validate**:
  - Nếu item `required=true` thì `complianceJson.items[code]` phải là `true`

### 2.11 Phê duyệt (Approvals)

Mục tiêu: reviewer ghi nhận quyết định phê duyệt nội dung dự án.
- Tạo approval theo `projectId`
- Quyết định: approve/changes_requested (tuỳ UI)
- Comment để phản hồi cho content team

### 2.12 Xuất bản (Publish center)

Mục tiêu: tạo job publish, lên lịch, theo dõi attempt, xử lý fail/retry/cancel.

Mỗi publish job gồm:
- `projectId`, `productId`
- `channel` (facebook/tiktok/shopee)
- `accountId` (channel account)
- `caption`, `hashtags`
- `disclosureText`
- `affiliateLink`
- `trackingParamsJson` (JSON object)
- `complianceJson` (checklist tick theo kênh)
- `scheduledAt` (tuỳ chọn)
- `status` (queued/processing/draft_uploaded/published/failed/…)

Hành động vận hành:
- **Retry**: đưa job về `queued` để worker xử lý lại (chỉ cho một số trạng thái)
- **Cancel**: huỷ job đang queued/processing/scheduled…
- **Simulate webhook** (mô phỏng): tạo sự kiện webhook nội bộ để test luồng cập nhật trạng thái

### 2.13 Báo cáo (Reports)

Mục tiêu: xem snapshot KPI vận hành.
- Published jobs, approvals, trạng thái dự án theo thống kê
- Ước lượng chi phí render/publish theo unit assumptions (nếu cấu hình)

### 2.14 Thông báo (Notifications)

Mục tiêu: nhận cảnh báo vận hành từ worker (job fail, escalation).
- Xem danh sách thông báo
- Mark read / mark all read

### 2.15 Nhật ký kiểm tra (Audit logs)

Mục tiêu: theo dõi thao tác quan trọng (tạo/sửa/xoá).
- Ghi log theo action/resource/user/metadata

---

## 3) Luồng thao tác chuẩn (khuyến nghị cho team)

### 3.1 Thiết lập ban đầu (1 lần)

1) **Tạo Video templates** cho Facebook/TikTok
2) **Tạo Brand kits** (nếu cần)
3) **Cấu hình Tuân thủ kênh** (compliance checklist)
4) **Kết nối Channel accounts** (OAuth/token)
5) (Tuỳ chọn) **Năng lực kênh** + default tracking params
6) (Tuỳ chọn) **Mapping sản phẩm** (externalProductId)

### 3.2 Workflow sản xuất & xuất bản nội dung

1) **Tạo sản phẩm**
2) **Upload assets** (ảnh/video) cho sản phẩm
3) **Tạo dự án video** (chọn product + template + brand kit)
4) **Render** (xếp hàng render, theo dõi output)
5) **Reviewer phê duyệt** (Approvals)
6) **Tạo publish job** (chọn kênh Facebook trước; tick compliance; điền link affiliate + tracking)
7) **Theo dõi publish attempts** và trạng thái
8) **Retry/Cancel** nếu lỗi

---

## 4) Tracking params (UTM) hoạt động thế nào?

Hệ thống gộp tracking vào link affiliate theo thứ tự ưu tiên:

1) `channel_capabilities.default_tracking_params_json` (mặc định theo kênh)
2) `publish_jobs.tracking_params_json` (theo job)

Rule:
- Param trong job sẽ **ghi đè** param trùng key ở mặc định kênh.

Ví dụ:
- Default Facebook: `{ "utm_source": "facebook", "utm_medium": "affiliate" }`
- Job: `{ "utm_campaign": "sale_04", "utm_medium": "cpc" }`
- Kết quả: `utm_source=facebook&utm_medium=cpc&utm_campaign=sale_04`

---

## 5) Quyền (RBAC) — ai làm được gì?

Tuỳ hệ thống RBAC, UI sẽ ẩn/hiện menu theo quyền.
Các vai trò seed demo:
- **org_admin**: full quyền (vận hành nội bộ)
- **content_manager**: sản phẩm, assets, projects, publish (tạo), render
- **reviewer**: approvals
- **operator**: theo dõi publish/render và thao tác retry/cancel
- **analyst**: dashboard/reports/audit (read)

---

## 6) Xử lý sự cố thường gặp

### 6.1 Web không gọi được API (lỗi 500/Network)

Nguyên nhân phổ biến: `NEXT_PUBLIC_API_BASE_URL` đang để `localhost` trong môi trường LAN.

Cách kiểm tra:
- Mở `.env` trên server
- Đảm bảo:
  - `NEXT_PUBLIC_API_BASE_URL=http://<LAN-IP>:4000`

### 6.2 Publish Facebook failed vì thiếu affiliate link

Facebook mặc định yêu cầu `affiliateLink`.
- Điền `affiliateSourceUrl` ở sản phẩm để tự động điền vào publish job
- Hoặc điền tay `affiliateLink` trong publish job

### 6.3 Publish TikTok failed vì thiếu disclosure

TikTok thường yêu cầu `disclosureText` (ví dụ `#ad`).

### 6.4 Bị chặn do Compliance checklist

Nếu checklist có item `required=true`, bạn phải tick đủ trong publish job.
- Vào **Tuân thủ kênh** để xem các mục bắt buộc cho kênh đó

### 6.5 Worker không xử lý job (job kẹt ở queued)

Checklist nhanh:
- Worker có đang chạy không
- Redis có đang chạy không (nếu bật queue)
- `USE_JOB_QUEUE=1` và `REDIS_URL=...` (nếu dùng Redis queue)

---

## 7) Gợi ý vận hành nội bộ (LAN)

- Không mở Postgres/Redis ra LAN trừ khi thật sự cần
- Định kỳ backup DB (pg_dump) nếu dùng thật
- Khi cập nhật phiên bản: stop service → pull → npm install → db:migrate → start

