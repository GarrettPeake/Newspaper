import type { Env, QueueMsg } from './index';
import { getTopStoryIds } from './hn';
import { getHottest } from './lobsters';

export async function handleScheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(enqueueAll(env));
}

const SEND_BATCH_LIMIT = 100;

async function enqueueAll(env: Env): Promise<void> {
  const results = await Promise.allSettled([enqueueHn(env), enqueueLobsters(env)]);
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  for (const f of failed) console.error('scheduled failed', f.reason);
  if (failed.length) throw failed[0].reason;
}

async function enqueueHn(env: Env): Promise<void> {
  const ids = await getTopStoryIds(90);
  await sendAll(env, ids.map((id) => ({ source: 'hn', id })));
  console.log(`enqueued ${ids.length} hn stories`);
}

async function enqueueLobsters(env: Env): Promise<void> {
  const stories = await getHottest(3);
  await sendAll(env, stories.map((story) => ({ source: 'lobsters', story })));
  console.log(`enqueued ${stories.length} lobsters stories`);
}

async function sendAll(env: Env, msgs: QueueMsg[]): Promise<void> {
  for (let i = 0; i < msgs.length; i += SEND_BATCH_LIMIT) {
    await env.QUEUE.sendBatch(msgs.slice(i, i + SEND_BATCH_LIMIT).map((body) => ({ body })));
  }
}
