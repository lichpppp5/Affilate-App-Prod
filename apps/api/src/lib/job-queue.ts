import { createClient } from "redis";

type RedisC = ReturnType<typeof createClient>;

export function jobQueueEnabled(): boolean {
  return process.env.USE_JOB_QUEUE === "1" && Boolean(process.env.REDIS_URL?.trim());
}

export function renderQueueKey(): string {
  return process.env.JOB_QUEUE_RENDER_KEY ?? "appaffilate:queue:render";
}

export function publishQueueKey(): string {
  return process.env.JOB_QUEUE_PUBLISH_KEY ?? "appaffilate:queue:publish";
}

let client: RedisC | null = null;
let connectPromise: Promise<RedisC | null> | null = null;

async function getClient(): Promise<RedisC | null> {
  if (!jobQueueEnabled()) {
    return null;
  }

  if (client?.isOpen) {
    return client;
  }

  if (!connectPromise) {
    connectPromise = (async () => {
      const url = process.env.REDIS_URL!;
      const next = createClient({ url });
      next.on("error", (err) => {
        console.error("[job-queue] redis error", err);
      });
      try {
        await next.connect();
        client = next;
        return next;
      } catch (e) {
        console.error("[job-queue] redis connect failed", e);
        connectPromise = null;
        return null;
      }
    })();
  }

  return connectPromise;
}

export async function enqueueRenderJobId(jobId: string): Promise<void> {
  const c = await getClient();
  if (!c) {
    return;
  }

  try {
    await c.lPush(renderQueueKey(), jobId);
  } catch (e) {
    console.error("[job-queue] lPush render failed", e);
  }
}

export async function enqueuePublishJobId(jobId: string): Promise<void> {
  const c = await getClient();
  if (!c) {
    return;
  }

  try {
    await c.lPush(publishQueueKey(), jobId);
  } catch (e) {
    console.error("[job-queue] lPush publish failed", e);
  }
}
