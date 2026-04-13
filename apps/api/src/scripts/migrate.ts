import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { pool } from "../db";

async function main() {
  const schemaPath = resolve(process.cwd(), "db/schema.sql");
  const sql = await readFile(schemaPath, "utf8");

  await pool.query(sql);
  console.log("[db] migration complete");
}

main()
  .catch((error) => {
    console.error("[db] migration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
