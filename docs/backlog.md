# Execution Backlog

## Phase 1 - Foundation backlog

- [ ] Khoi tao env strategy cho web/api/worker.
- [ ] Cau hinh package manager va shared scripts.
- [ ] Dung auth skeleton va tenant context.
- [ ] Dung DB schema ban dau cho tenant, user, product, asset, project.
- [ ] Ket noi Redis va tao queue abstraction.
- [ ] Tao object storage client.

## Phase 2 - Core product backlog

- [ ] CRUD product va asset.
- [ ] Upload anh va dedupe checksum.
- [ ] Tao template va brand kit entities.
- [ ] Tao project creation flow.
- [ ] Enqueue render job tu UI/API.
- [ ] Luu ket qua render output va preview metadata.

## Phase 3 - Workflow backlog

- [ ] Approval entity va state transitions.
- [ ] Reviewer comments va reject reasons.
- [ ] Compliance checklist templates.
- [ ] Notification khi job fail hoac can review.
- [ ] Audit log cho cac thao tac approval/publish.

## Phase 4 - Publishing backlog

- [ ] Channel account onboarding.
- [ ] Token refresh service.
- [ ] Shopee capability discovery va sandbox test.
- [ ] TikTok draft upload sandbox test.
- [ ] Publish retry strategy va error taxonomy.
- [ ] Affiliate link va product mapping manager.

## Phase 5 - Monitoring backlog

- [ ] Metrics schema cho render/publish jobs.
- [ ] Alert rules cho queue backlog, worker fail, token expiry.
- [ ] Cost dashboard theo campaign va tenant.
- [ ] Runbook cho publish fail va token revoke.
