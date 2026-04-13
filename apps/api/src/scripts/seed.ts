import { hashPassword } from "../auth";
import { pool } from "../db";

/** Canonical demo snapshot — dùng chung với docs/demo-runbook.md */
const DEMO = {
  tenantId: "tenant_demo",
  tenantName: "Demo Tenant",
  userId: "user_demo_admin",
  email: "admin@appaffilate.local",
  password: "admin123",
  displayName: "Demo Admin",
  membershipId: "membership_demo_admin"
} as const;

function printDemoBanner() {
  const line = "─".repeat(56);
  console.log(`\n┌${line}┐`);
  console.log("│ Demo đã khóa — dùng đúng các giá trị sau cho team QA/demo │");
  console.log(`├${line}┤`);
  console.log(`│ Email:     ${DEMO.email.padEnd(44)}│`);
  console.log(`│ Password:  ${DEMO.password.padEnd(44)}│`);
  console.log(`│ TenantId:  ${DEMO.tenantId.padEnd(44)}│`);
  console.log(`├${line}┤`);
  console.log("│ Thêm (cùng mật khẩu): content / reviewer / operator / analyst │");
  console.log("│ @appaffilate.local — RBAC demo                                   │");
  console.log(`└${line}┘\n`);
}

async function main() {
  await pool.query("begin");

  try {
    await pool.query(
      `
        insert into tenants (id, name, timezone)
        values ($1, $2, 'Asia/Ho_Chi_Minh')
        on conflict (id) do update
        set name = excluded.name,
            timezone = excluded.timezone
      `,
      [DEMO.tenantId, DEMO.tenantName]
    );

    await pool.query(
      `
        insert into users (id, email, password_hash, display_name)
        values ($1, $2, $3, $4)
        on conflict (email) do update
        set password_hash = excluded.password_hash,
            display_name = excluded.display_name
      `,
      [DEMO.userId, DEMO.email, hashPassword(DEMO.password), DEMO.displayName]
    );

    await pool.query(
      `
        insert into memberships (id, tenant_id, user_id, role_name)
        values ($1, $2, $3, 'org_admin')
        on conflict (tenant_id, user_id) do update
        set role_name = excluded.role_name
      `,
      [DEMO.membershipId, DEMO.tenantId, DEMO.userId]
    );

    const demoRoleUsers: {
      userId: string;
      email: string;
      displayName: string;
      membershipId: string;
      roleName: string;
    }[] = [
      {
        userId: "user_demo_content",
        email: "content@appaffilate.local",
        displayName: "Demo Content Manager",
        membershipId: "membership_demo_content",
        roleName: "content_manager"
      },
      {
        userId: "user_demo_reviewer",
        email: "reviewer@appaffilate.local",
        displayName: "Demo Reviewer",
        membershipId: "membership_demo_reviewer",
        roleName: "reviewer"
      },
      {
        userId: "user_demo_operator",
        email: "operator@appaffilate.local",
        displayName: "Demo Operator",
        membershipId: "membership_demo_operator",
        roleName: "operator"
      },
      {
        userId: "user_demo_analyst",
        email: "analyst@appaffilate.local",
        displayName: "Demo Analyst",
        membershipId: "membership_demo_analyst",
        roleName: "analyst"
      }
    ];

    const passwordHash = hashPassword(DEMO.password);
    for (const u of demoRoleUsers) {
      await pool.query(
        `
          insert into users (id, email, password_hash, display_name)
          values ($1, $2, $3, $4)
          on conflict (email) do update
          set password_hash = excluded.password_hash,
              display_name = excluded.display_name
        `,
        [u.userId, u.email, passwordHash, u.displayName]
      );
      await pool.query(
        `
          insert into memberships (id, tenant_id, user_id, role_name)
          values ($1, $2, $3, $4)
          on conflict (tenant_id, user_id) do update
          set role_name = excluded.role_name
        `,
        [u.membershipId, DEMO.tenantId, u.userId, u.roleName]
      );
    }

    await pool.query(
      `
        insert into products (
          id,
          tenant_id,
          sku,
          title,
          description,
          price,
          channels,
          affiliate_source_url,
          affiliate_program
        )
        values
          (
            'prod_demo_serum',
            $1,
            'SKU-SERUM-01',
            'Glow Serum',
            'Serum duong am',
            199000,
            array['shopee', 'tiktok', 'facebook']::text[],
            'https://shopee.vn/product/example-affiliate-serum',
            'Shopee Affiliate (demo)'
          ),
          (
            'prod_demo_shampoo',
            $1,
            'SKU-SHAMPOO-01',
            'Silk Shampoo',
            'Dau goi phuc hoi toc',
            249000,
            array['shopee']::text[],
            '',
            ''
          )
        on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            sku = excluded.sku,
            title = excluded.title,
            description = excluded.description,
            price = excluded.price,
            channels = excluded.channels,
            affiliate_source_url = excluded.affiliate_source_url,
            affiliate_program = excluded.affiliate_program,
            updated_at = now()
      `,
      [DEMO.tenantId]
    );

    await pool.query(
      `
        insert into assets (
          id,
          tenant_id,
          product_id,
          kind,
          storage_key,
          mime_type,
          checksum,
          title,
          original_filename,
          size_bytes,
          storage_provider
        )
        values
          ('asset_demo_serum_1', $1, 'prod_demo_serum', 'image', 'products/serum/1.jpg', 'image/jpeg', 'checksum-serum-1', 'Serum front packshot', 'serum-front.jpg', 102400, 'seed'),
          ('asset_demo_serum_2', $1, 'prod_demo_serum', 'image', 'products/serum/2.jpg', 'image/jpeg', 'checksum-serum-2', 'Serum lifestyle shot', 'serum-lifestyle.jpg', 122880, 'seed')
        on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            product_id = excluded.product_id,
            kind = excluded.kind,
            storage_key = excluded.storage_key,
            mime_type = excluded.mime_type,
            checksum = excluded.checksum,
            title = excluded.title,
            original_filename = excluded.original_filename,
            size_bytes = excluded.size_bytes,
            storage_provider = excluded.storage_provider,
            updated_at = now()
      `,
      [DEMO.tenantId]
    );

    await pool.query(
      `
        insert into channel_accounts (
          id,
          tenant_id,
          channel,
          account_name,
          account_ref,
          auth_type,
          status,
          client_id,
          client_secret,
          access_token,
          refresh_token,
          token_expires_at,
          metadata_json,
          last_refreshed_at
        )
        values
          (
            'channel_demo_tiktok',
            $1,
            'tiktok',
            'TikTok Shop Demo',
            'tt_demo_shop',
            'oauth',
            'connected',
            'tt_client_demo',
            'tt_secret_demo',
            'tt_access_demo',
            'tt_refresh_demo',
            now() + interval '2 hours',
            '{"shopRegion":"VN"}',
            now() - interval '10 minutes'
          ),
          (
            'channel_demo_shopee',
            $1,
            'shopee',
            'Shopee Affiliate Demo',
            'sp_demo_shop',
            'service_account',
            'connected',
            'sp_client_demo',
            'sp_secret_demo',
            'sp_access_demo',
            '',
            now() + interval '2 hours',
            '{"partnerId":"partner_demo"}',
            now() - interval '10 minutes'
          ),
          (
            'channel_demo_facebook',
            $1,
            'facebook',
            'Facebook Page Demo',
            'fb_demo_page',
            'oauth',
            'connected',
            'fb_client_demo',
            'fb_secret_demo',
            'fb_access_demo',
            'fb_refresh_demo',
            now() + interval '2 hours',
            '{"pageId":"page_demo"}',
            now() - interval '10 minutes'
          )
        on conflict (tenant_id, channel, account_ref) do update
        set account_name = excluded.account_name,
            auth_type = excluded.auth_type,
            status = excluded.status,
            client_id = excluded.client_id,
            client_secret = excluded.client_secret,
            access_token = excluded.access_token,
            refresh_token = excluded.refresh_token,
            token_expires_at = excluded.token_expires_at,
            metadata_json = excluded.metadata_json,
            last_refreshed_at = excluded.last_refreshed_at,
            updated_at = now()
      `,
      [DEMO.tenantId]
    );

    await pool.query(
      `
        insert into video_projects (id, tenant_id, product_id, template_id, brand_kit_id, status, title)
        values
          ('proj_demo_serum', $1, 'prod_demo_serum', 'template_tiktok_ugc', null, 'review', 'Glow Serum short UGC')
        on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            product_id = excluded.product_id,
            template_id = excluded.template_id,
            brand_kit_id = excluded.brand_kit_id,
            status = excluded.status,
            title = excluded.title,
            updated_at = now()
      `,
      [DEMO.tenantId]
    );

    await pool.query(
      `
        insert into render_jobs (
          id,
          tenant_id,
          project_id,
          status,
          step,
          progress,
          output_video_url,
          output_thumbnail_url,
          completed_at
        )
        values
          (
            'render_demo_serum',
            $1,
            'proj_demo_serum',
            'completed',
            'finalized',
            100,
            'https://cdn.example.com/videos/glow-serum.mp4',
            'https://cdn.example.com/videos/glow-serum.jpg',
            now() - interval '1 hour'
          )
        on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            project_id = excluded.project_id,
            status = excluded.status,
            step = excluded.step,
            progress = excluded.progress,
            output_video_url = excluded.output_video_url,
            output_thumbnail_url = excluded.output_thumbnail_url,
            completed_at = excluded.completed_at,
            updated_at = now()
      `,
      [DEMO.tenantId]
    );

    await pool.query(
      `
        insert into approvals (id, tenant_id, project_id, reviewer_id, reviewer_name, decision, comment)
        values
          ('approval_demo_serum', $1, 'proj_demo_serum', $2, 'Demo Admin', 'changes_requested', 'Them disclosure #ad ro hon')
        on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            project_id = excluded.project_id,
            reviewer_id = excluded.reviewer_id,
            reviewer_name = excluded.reviewer_name,
            decision = excluded.decision,
            comment = excluded.comment,
            updated_at = now()
      `,
      [DEMO.tenantId, DEMO.userId]
    );

    await pool.query(
      `
        insert into publish_jobs (
          id,
          tenant_id,
          project_id,
          product_id,
          channel,
          account_id,
          caption,
          hashtags,
          disclosure_text,
          affiliate_link,
          scheduled_at,
          status
        )
        values
          (
            'publish_demo_serum',
            $1,
            'proj_demo_serum',
            'prod_demo_serum',
            'tiktok',
            'channel_demo_tiktok',
            'Glow Serum routine trong 15 giay',
            array['#beauty', '#tiktokshop']::text[],
            '#ad',
            'https://example.com/affiliate/glow-serum',
            now() + interval '1 day',
            'draft_uploaded'
          )
        on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            project_id = excluded.project_id,
            product_id = excluded.product_id,
            channel = excluded.channel,
            account_id = excluded.account_id,
            caption = excluded.caption,
            hashtags = excluded.hashtags,
            disclosure_text = excluded.disclosure_text,
            affiliate_link = excluded.affiliate_link,
            scheduled_at = excluded.scheduled_at,
            status = excluded.status,
            updated_at = now()
      `,
      [DEMO.tenantId]
    );

    await pool.query(
      `
        insert into publish_attempts (
          id,
          tenant_id,
          publish_job_id,
          stage,
          status,
          response_payload,
          completed_at
        )
        values
          (
            'publish_attempt_demo_1',
            $1,
            'publish_demo_serum',
            'draft_upload',
            'success',
            '{"provider":"tiktok","result":"draft_uploaded"}',
            now() - interval '30 minutes'
          )
        on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            publish_job_id = excluded.publish_job_id,
            stage = excluded.stage,
            status = excluded.status,
            response_payload = excluded.response_payload,
            completed_at = excluded.completed_at
      `,
      [DEMO.tenantId]
    );

    await pool.query(
      `
        insert into publish_webhook_events (
          id,
          tenant_id,
          publish_job_id,
          event_type,
          payload,
          processed_status
        )
        values
          (
            'publish_webhook_demo_1',
            $1,
            'publish_demo_serum',
            'draft_uploaded',
            '{"publishJobId":"publish_demo_serum","status":"draft_uploaded"}',
            'processed'
          )
        on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            publish_job_id = excluded.publish_job_id,
            event_type = excluded.event_type,
            payload = excluded.payload,
            processed_status = excluded.processed_status
      `,
      [DEMO.tenantId]
    );

    await pool.query("commit");
    console.log("[db] seed complete");
    printDemoBanner();
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

main()
  .catch((error) => {
    console.error("[db] seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
