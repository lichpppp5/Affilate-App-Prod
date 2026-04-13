import type { AppConfig } from "../config";
import { createClient } from "redis";
import { query } from "../db";

export async function getHealth(config: AppConfig) {
  const dbCheck = await query<{ now: string }>("select now()::text as now");

  const redisUrl = process.env.REDIS_URL ?? "";
  let redis: { ok: boolean; detail: string };

  if (!redisUrl) {
    redis = { ok: true, detail: "not_configured" };
  } else {
    const client = createClient({ url: redisUrl });
    try {
      await client.connect();
      const pong = await client.ping();
      await client.quit();
      redis = { ok: pong === "PONG", detail: pong === "PONG" ? "ok" : "unexpected_response" };
    } catch (error) {
      redis = {
        ok: false,
        detail: error instanceof Error ? error.message : "redis_unreachable"
      };
      try {
        await client.quit();
      } catch {
        // ignore
      }
    }
  }

  const dbOk = Boolean(dbCheck.rows[0]?.now);
  const allOk = dbOk && (redis.detail === "not_configured" || redis.ok);

  return {
    service: config.appName,
    status: allOk ? "ok" : "degraded",
    environment: config.environment,
    timestamp: dbCheck.rows[0]?.now ?? new Date().toISOString(),
    checks: {
      database: dbOk ? "ok" : "error",
      redis: redis
    }
  };
}
