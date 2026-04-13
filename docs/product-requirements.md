# Product Requirements

## Muc tieu san pham

Xay dung mot nen tang trung tam giup team marketing va affiliate:

- Tao video quang cao AI tu anh san pham co san.
- Quan ly thu vien san pham, asset, campaign, template va ket qua video.
- Kiem soat quy trinh duyet, lap lich va dang len Shopee/TikTok.
- Theo doi hieu suat van hanh, tinh trang publish, KPI va chi phi.

## Thi truong muc tieu

- Thi truong uu tien: dong thoi Shopee va TikTok.
- Nhom nguoi dung ban dau: agency, team affiliate, seller van hanh nhieu SKU.
- Bai toan trung tam: giam thoi gian san xuat video va giam thao tac tay khi dang noi dung.

## Ho so nguoi dung

### Super Admin

- Quan ly toan bo he thong.
- Quan sat suc khoe queue, worker, tich hop va chi phi.

### Org Admin

- Quan ly nguoi dung trong to chuc.
- Cau hinh brand kit, template, tich hop Shopee/TikTok.

### Content Manager

- Tao project video.
- Quan ly asset, campaign, lich dang.

### Reviewer

- Kiem duyet noi dung AI, disclosure, caption, hashtag, CTA.

### Operator

- Theo doi publish job, xu ly fail, retry, cap nhat mapping san pham.

### Analyst

- Xem bao cao ROI, hieu suat campaign, ti le thanh cong va loi van hanh.

## Workflow nghiep vu cot loi

### 1. Ingest san pham

- Nguoi dung them san pham thu cong hoac import batch.
- Mỗi san pham co SKU, kenh, mo ta, gia, tag, danh sach anh.
- He thong kiem tra du lieu bat buoc va gan trang thai san sang render.

### 2. Tao video AI

- Chon san pham hoac nhom san pham.
- Chon template va brand kit.
- He thong tao script, subtitle, CTA, voiceover, timeline render.
- Worker render video, xuat thumbnail va metadata.

### 3. Duyet noi dung

- Reviewer xem ban preview.
- Kiem tra claim san pham, disclosure, nhac nen, caption, hashtag.
- Reject se quay lai re-render hoac chinh sua thu cong.

### 4. Lap lich va publish

- Chon kenh dich: Shopee, TikTok.
- Gan product mapping va link affiliate phu hop.
- He thong dua publish job vao queue.
- Ket qua publish duoc dong bo ve dashboard.

### 5. Bao cao va giamsat

- Theo doi ti le tao video thanh cong.
- Theo doi ti le publish thanh cong theo kenh.
- Theo doi chi phi trung binh/video, thoi gian xu ly/job, loi theo buoc.

## KPI ban dau

- Thoi gian tao 1 video tu anh: duoi 10 phut cho luong batch thong thuong.
- Ti le render thanh cong: tren 95%.
- Ti le publish job thanh cong sau retry: tren 90%.
- Thoi gian thao tac cua operator giam it nhat 60% so voi quy trinh tay.
- Muc do tai su dung template: tren 70% video sinh ra tu preset co san.

## Phi chuc nang

- Multi-tenant ngay tu dau.
- RBAC theo vai tro va hanh dong.
- Audit log cho cac thao tac nhay cam.
- Token OAuth va secret duoc luu an toan.
- Worker va publish job phai idempotent.

## Pham vi phase 1

- Web admin co dashboard, assets, projects, approvals, publish, reports.
- API scaffold cho auth, health, project, publish job.
- Worker scaffold cho render va publish orchestration.
- Tai lieu he thong day du de team phat trien song song.
