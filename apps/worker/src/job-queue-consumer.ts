import { commandOptions, createClient } from "redis";

const ENABLED = process.env.USE_JOB_QUEUE === "1" && Boolean(process.env.REDIS_URL?.trim());
const RENDER_KEY = process.env.JOB_QUEUE_RENDER_KEY ?? "appaffilate:queue:render";
const PUBLISH_KEY = process.env.JOB_QUEUE_PUBLISH_KEY ?? "appaffilate:queue:publish";
const BRPOP_SEC = Math.min(30, Math.max(1, Number(process.env.JOB_QUEUE_BRPOP_SEC ?? "3")));

let redis: ReturnType<typeof createClient> | null = null;

export function workerJobQueueEnabled(): boolean {
  return ENABLED;
}

export function jobQueueKeys() {
  return { render: RENDER_KEY, publish: PUBLISH_KEY };
}

async function getRedis() {
  if (!ENABLED) {
    return null;
  }

  if (redis?.isOpen) {
    return redis;
  }

  const c = createClient({ url: process.env.REDIS_URL! });
  c.on("error", (e) => {
    console.error("[worker][redis]", e);
  });
  await c.connect();
  redis = c;
  return c;
}

/** Một lần BRPOP trên cả hai list — job nào có sẵn trước thì lấy. */
export async function blockingPopNextJobId(): Promise<
  { type: "render"; id: string } | { type: "publish"; id: string } | null
> {
  const c = await getRedis();
  if (!c) {
    return null;
  }

  try {
    const r = await c.brPop(
      commandOptions({ isolated: true }),
      [RENDER_KEY, PUBLISH_KEY],
      BRPOP_SEC
    );
    if (!r) {
      return null;
    }

    const id = String(r.element);
    const key = String(r.key);

    if (key === RENDER_KEY) {
      return { type: "render", id };
    }

    return { type: "publish", id };
  } catch (e) {
    console.error("[worker] brPop job queue", e);
    return null;
  }
}
