import { Pool } from "pg";
import type { QueryResultRow } from "pg";

import { loadConfig } from "./config";

const config = loadConfig();

export const pool = new Pool({
  connectionString: config.databaseUrl
});

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  return pool.query<T>(text, values);
}
