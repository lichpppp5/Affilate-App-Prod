import { pool } from "../db";

/** Canonical demo tenant removed so the next `db:seed` repopulates a known-good snapshot. */
const DEMO_TENANT_ID = "tenant_demo";

async function main() {
  const result = await pool.query(`delete from tenants where id = $1 returning id`, [
    DEMO_TENANT_ID
  ]);
  if (result.rowCount === 0) {
    console.log(`[db] reset-demo: no tenant "${DEMO_TENANT_ID}" (nothing to delete)`);
  } else {
    console.log(`[db] reset-demo: removed tenant "${DEMO_TENANT_ID}" and cascaded demo data`);
  }
}

main()
  .catch((error) => {
    console.error("[db] reset-demo failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
