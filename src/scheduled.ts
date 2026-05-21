import type { Env } from './index';
import { getTopStoryIds } from './hn';

export async function handleScheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(enqueueTopStories(env));
}

async function enqueueTopStories(env: Env): Promise<void> {
  try {
    const ids = await getTopStoryIds(30);
    if (ids.length === 0) return;
    const messages = ids.map((id) => ({ body: { id } }));
    await env.QUEUE.sendBatch(messages);
    console.log(`enqueued ${messages.length} stories`);
  } catch (e) {
    console.error('scheduled failed', e);
    throw e;
  }
}
