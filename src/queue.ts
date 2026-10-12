import type { Env, QueueMsg } from './index';
import { getItem, getCommentsText, decodeAndStrip } from './hn';
import { fetchArticleBody } from './extract';
import { analyzeArticle } from './llm';
import { getExisting, updateCommentBurst, updateCounts, insertArticle } from './db';

export async function handleQueue(batch: MessageBatch<QueueMsg>, env: Env, _ctx: ExecutionContext): Promise<void> {
  // Concurrent so one message's OpenRouter retries/backoff don't stall the rest of the batch.
  await Promise.all(
    batch.messages.map(async (msg) => {
      try {
        await processOne(env, msg.body.id);
        msg.ack();
      } catch (e) {
        console.error('queue process failed', msg.body.id, e);
        msg.retry({ delaySeconds: 60 });
      }
    })
  )
}

async function processOne(env: Env, id: number): Promise<void> {
  const item = await getItem(id);
  if (!item || item.dead || item.deleted || !item.title) return;
  if (item.type && item.type !== 'story') return;

  const hnScore = item.score ?? 0;
  const hnComments = item.descendants ?? 0;
  const url = item.url ?? null;
  const hnUrl = `https://news.ycombinator.com/item?id=${id}`;

  const existing = await getExisting(env, id);

  if (existing) {
    const burst = hnComments > 3 * existing.hn_comments && hnComments > 50;
    if (burst) {
      await updateCommentBurst(env, id, hnScore, hnComments);
      console.log(`burst-bumped ${id}: ${existing.hn_comments} -> ${hnComments}`);
    } else {
      await updateCounts(env, id, hnScore, hnComments);
    }
    return;
  }

  let body = '';
  if (url) {
    body = await fetchArticleBody(url, env.JINA_API_KEY);
  } else if (item.text) {
    body = decodeAndStrip(item.text).slice(0, 8000);
  }
  const comments = await getCommentsText(id);

  const score = await analyzeArticle(env, {
    title: item.title,
    url,
    hnScore,
    hnComments,
    body,
    comments,
  });

  await insertArticle(env, {
    id,
    title: item.title,
    url,
    hn_url: hnUrl,
    hn_score: hnScore,
    hn_comments: hnComments,
    interest_level: score,
    processed_at: Math.floor(Date.now() / 1000),
  });

  console.log(`analyzed ${id}: ${score}`);
}
