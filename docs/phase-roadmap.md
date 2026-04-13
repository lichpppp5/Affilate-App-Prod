# Phase Roadmap

**Tổng quan có sơ đồ luồng + trạng thái theo code:** [roadmap-overview.md](./roadmap-overview.md).

## Tong quan

Roadmap nay chia du an thanh cac phan co the giao song song giua product, frontend, backend, worker va platform.

## Phase 0 - Discovery

- Hoan thanh PRD, UX direction, architecture blueprint.
- Chot risk register cho Shopee/TikTok.
- Chot KPI, vai tro nguoi dung va operating model.

### Deliverables

- `docs/product-requirements.md`
- `docs/integration-audit.md`
- `docs/architecture.md`
- `docs/admin-ux.md`

### Rui ro

- Sai ky vong ve full automation.
- Scope phinh to truoc khi co core flow.

## Phase 1 - Foundation

- Scaffold monorepo.
- Tao web admin shell.
- Tao API va worker bootstrap.
- Dung domain model chung.
- Dung local infra cho Postgres, Redis, object storage.

### Deliverables

- `README.md`
- `apps/web`
- `apps/api`
- `apps/worker`
- `packages/domain`
- `infra/docker-compose.yml`

### Rui ro

- Chon stack qua nang tu dau.
- Chua co env va auth thuc te.

## Phase 2 - Core product

- Them auth va tenant isolation.
- CRUD cho product, asset, project; **template** trong MVP hien la **chuoi template_id** tren project (chua bat buoc bang quan ly template rieng).
- Enqueue render jobs va luu state trong DB.
- Hien dashboard thong tin thuc.

### Deliverables

- API modules cho assets, products, projects.
- Web forms cho import, project creation, review queue.
- Worker render pipeline co step status.

### Bo sung co the (sau MVP)

- Bang/API **video_templates** + UI chon mau; **brand_kits** neu can dong bo thuong hieu.

### Rui ro

- Domain model doi nhieu neu import flow chua ro.
- Chi phi AI/FFmpeg vuot du kien.

## Phase 3 - Workflow va compliance

- Approval gate.
- Comment va audit log.
- Compliance: **disclosure** tren publish + human review; **checklist nhieu muc** (theo kenh) co the bo sung sau.
- Notification va escalation.

### Deliverables

- Review queue hoan chinh.
- Approve/reject/re-render flow.
- Alert va notification primitives.
- (Trong repo) RBAC, audit log API, notification khi job fail.

### Rui ro

- Chinh sach kenh thay doi.
- Reviewer workflow lam cham throughput neu UX chua tot.

## Phase 4 - Channel integrations

- Shopee / TikTok / **Facebook** (OAuth + publish qua URL cau hinh hoac mock).
- TikTok: huong draft/inbox uu tien (tuy BFF).
- **Affiliate:** truong tren product + affiliate link tren publish job; mapping SKU–kenh sau neu can.
- Publish retry va sync status (webhook/BFF thuc).

### Deliverables

- Channel account settings.
- Publish center hoan chinh.
- Logs cho tung publish attempt.
- Tai lieu: [provider-bff-contract.md](./provider-bff-contract.md), [affiliate-crosspost.md](./affiliate-crosspost.md).

### Rui ro

- API approval tre.
- Khac biet capability theo khu vuc/tai khoan.

## Phase 5 - Reports va scale

- Operational dashboards.
- Cost attribution.
- Queue scaling.
- SLA va alerting nang cao.

### Deliverables

- Reports service.
- Monitoring stack va runbooks.
- Forecast cost va utilization dashboard.

### Rui ro

- Metrics khong dong nhat giua cac channel.
- Noi dung du lieu phan tan lam kho tinh toan ROI.

## Moc thoi gian khuyen nghi

- Phase 0: 2 tuan.
- Phase 1: 2-3 tuan.
- Phase 2: 4-6 tuan.
- Phase 3: 3-4 tuan.
- Phase 4: 4-10 tuan, phu thuoc phe duyet va capability API.
- Phase 5: lien tuc sau pilot.

## Uu tien thuc thi tiep theo

1. Cai dependencies va chuan hoa stack.
2. Them auth va DB schema.
3. Noi web dashboard voi API.
4. Implement queue that cho render/publish.
5. Bat dau channel integration bang mock capability va sandbox.
