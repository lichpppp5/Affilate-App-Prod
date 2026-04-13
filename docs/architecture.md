# Architecture Blueprint

## Muc tieu kien truc

- Ho tro multi-tenant ngay tu phase dau.
- Tach ro control plane va worker plane.
- Cho phep doi AI provider ma khong pha domain logic.
- Ho tro publish da kenh theo mo hinh capability.
- Quan sat duoc moi job render/publish tu dau den cuoi.

## Thanh phan chinh

### Web admin

- Next.js app router.
- Dashboard cho van hanh, content, reviewer, analyst.
- Goi API thong qua BFF pattern.

### API/BFF

- Quan ly auth, tenant, RBAC va domain APIs.
- Orchestrate project, asset, render job, publish job.
- Xuat health endpoint va metadata cho UI.

### Worker plane

- Nhan job tu queue.
- Xu ly cac buoc:
  - preprocess asset
  - tao script
  - tao subtitle/voiceover
  - compose timeline
  - render/encode
  - publish/sync status

### Data plane

- PostgreSQL cho du lieu giao dich.
- Object storage cho media goc va output.
- Redis cho queue va cache nhe.

## Domain model cot loi

### Tenant va quyen

- `Tenant`
- `User`
- `Membership`
- `Role`
- `Permission`
- `ChannelAccount`

### Noi dung va san pham

- `Product`
- `Asset`
- `BrandKit`
- `VideoTemplate`
- `Campaign`

### Van hanh video

- `VideoProject`
- `RenderJob`
- `RenderStep`
- `Approval`
- `PublishJob`
- `PublishAttempt`

### Bao cao va kiem toan

- `AuditLog`
- `UsageMetric`
- `AlertEvent`

## Queue va worker strategy

- Moi job co `idempotencyKey`.
- `render` va `publish` su dung queue rieng de de scale doc lap.
- Job transition duoc luu vao DB va emit event cho dashboard.
- Retry co gioi han va can phan loai loi:
  - transient
  - provider
  - compliance
  - account

## Media pipeline

1. Asset duoc upload vao object storage.
2. API tao `VideoProject` va enqueue `RenderJob`.
3. Worker lay project config, brand kit va template.
4. Worker tao script, subtitle, voiceover va compose scenes.
5. FFmpeg render MP4, thumbnail va metadata.
6. Ket qua duoc luu vao object storage va cap nhat project.
7. Neu da approved, `PublishJob` co the duoc enqueue.

## Observability

- Moi request va job deu co `traceId`.
- Logs co `tenantId`, `projectId`, `jobId`, `channel`.
- Metrics toi thieu:
  - render_success_rate
  - publish_success_rate
  - queue_depth
  - worker_latency
  - token_expiry_count
  - ai_cost_estimate
- Alert khi:
  - queue backlog qua nguong
  - publish fail bat thuong
  - token sap het han
  - worker health check fail

## Nguyen tac ma nguon

- Domain types va enums dat trong package dung chung.
- Adapter tung kenh khong duoc lech domain model tong.
- Web chi hien thi state da duoc API tong hop.
- Worker la noi duy nhat chua logic bat dong bo va side effect lon.
