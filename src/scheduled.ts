import type { Env } from './index';
import { getTopStoryIds } from './hn';

export async function handleScheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(enqueueTopStories(env));
}

const SEND_BATCH_LIMIT = 100;

async function enqueueTopStories(env: Env): Promise<void> {
  try {
    const ids = await getTopStoryIds(150);
    if (ids.length === 0) return;
    for (let i = 0; i < ids.length; i += SEND_BATCH_LIMIT) {
      const slice = ids.slice(i, i + SEND_BATCH_LIMIT);
      await env.QUEUE.sendBatch(slice.map((id) => ({ body: { id } })));
    }
    console.log(`enqueued ${ids.length} stories`);
  } catch (e) {
    console.error('scheduled failed', e);
    throw e;
  }
}
