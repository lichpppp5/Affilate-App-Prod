import { pool } from "../db";

const INTERVAL_MS = 2000;
const TIMEOUT_MS = 120_000;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const start = Date.now();
  let attempt = 0;
  let lastErr: unknown;

  while (Date.now() - start < TIMEOUT_MS) {
    try {
      await pool.query("select 1 as ok");
      console.log("[db] postgres is accepting connections");
      return;
    } catch (e) {
      lastErr = e;
      attempt += 1;
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 1 || attempt % 5 === 0) {
        console.warn(`[db] waiting for postgres (attempt ${attempt}): ${msg}`);
      }
      await sleep(INTERVAL_MS);
    }
  }

  console.error("[db] gave up waiting for postgres after", TIMEOUT_MS / 1000, "s", lastErr);
  process.exitCode = 1;
}

main().finally(async () => {
  await pool.end();
});
