import type { Env } from './index';
import {
  isAuthenticated,
  checkLogin,
  sessionCookieHeader,
  clearCookieHeader,
  isSafeNext,
} from './auth';
import { listPage, promptPage, loginPage, feedPage } from './views';
import {
  getFeedBatch,
  getUninterestingUnread,
  getRead,
  getSaved,
  getArticle,
  markRead,
  markSaved,
  unmarkSaved,
  markDismissed,
  unmarkDismissed,
} from './db';
import {
  getSystemPrompt,
  setSystemPrompt,
  getInterestThreshold,
  setInterestThreshold,
  RESPONSE_SCHEMA,
  DECISION_INSTRUCTIONS,
} from './llm';

export async function handleFetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // Public routes: login / logout
  if (path === '/login') {
    if (req.method === 'GET') {
      if (await isAuthenticated(req, env)) {
        return Response.redirect(new URL('/', req.url).toString(), 303);
      }
      const next = url.searchParams.get('next') ?? '/';
      return html(loginPage(isSafeNext(next) ? next : '/', false));
    }
    if (req.method === 'POST') {
      const form = await req.formData();
      const user = String(form.get('username') ?? '');
      const pass = String(form.get('password') ?? '');
      const nextRaw = String(form.get('next') ?? '/');
      const next = isSafeNext(nextRaw) ? nextRaw : '/';
      if (!checkLogin(env, user, pass)) {
        return html(loginPage(next, true), 401);
      }
      return new Response(null, {
        status: 303,
        headers: {
          Location: new URL(next, req.url).toString(),
          'Set-Cookie': await sessionCookieHeader(env),
        },
      });
    }
    return new Response('Method not allowed', { status: 405 });
  }
  if (path === '/logout') {
    return new Response(null, {
      status: 303,
      headers: {
        Location: new URL('/login', req.url).toString(),
        'Set-Cookie': clearCookieHeader(),
      },
    });
  }

  // All other routes require an authenticated session
  if (!(await isAuthenticated(req, env))) {
    const next = encodeURIComponent(path + url.search);
    return Response.redirect(new URL(`/login?next=${next}`, req.url).toString(), 303);
  }

  if (req.method === 'GET') {
    if (path === '/') {
      const threshold = await getInterestThreshold(env);
      const since = Math.floor(Date.now() / 1000) - 3 * 86400;
      const items = await getFeedBatch(env, threshold, since, [], FEED_BATCH_SIZE);
      return html(feedPage(items));
    }
    if (path === '/feed/batch') {
      const threshold = await getInterestThreshold(env);
      const since = Math.floor(Date.now() / 1000) - 3 * 86400;
      const exclude = parseExclude(url.searchParams.get('exclude'));
      const items = await getFeedBatch(env, threshold, since, exclude, FEED_BATCH_SIZE);
      return json({ items });
    }
    if (path === '/uninteresting') {
      const page = parsePage(url);
      const threshold = await getInterestThreshold(env);
      const result = await getUninterestingUnread(env, threshold, page);
      return html(listPage('uninteresting', '/uninteresting', page, result.items, result.hasMore, 'No filtered-out articles yet.'));
    }
    if (path === '/read') {
      const page = parsePage(url);
      const result = await getRead(env, page);
      return html(listPage('read', '/read', page, result.items, result.hasMore, 'No read articles yet.'));
    }
    if (path === '/saved') {
      const page = parsePage(url);
      const result = await getSaved(env, page);
      return html(listPage('saved', '/saved', page, result.items, result.hasMore, 'No saved articles yet.'));
    }
    if (path === '/prompt') {
      const current = await getSystemPrompt(env);
      const threshold = await getInterestThreshold(env);
      const saved = url.searchParams.has('saved');
      return html(promptPage(current, threshold, DECISION_INSTRUCTIONS, RESPONSE_SCHEMA, saved));
    }
    const open = path.match(/^\/open\/(\d+)$/);
    if (open) {
      const id = parseInt(open[1], 10);
      const a = await getArticle(env, id);
      if (!a) return new Response('Not found', { status: 404 });
      await markRead(env, id);
      return Response.redirect(a.url ?? a.hn_url, 302);
    }
    const comments = path.match(/^\/comments\/(\d+)$/);
    if (comments) {
      const id = parseInt(comments[1], 10);
      await markRead(env, id);
      return Response.redirect(`https://news.ycombinator.com/item?id=${id}`, 302);
    }
  }

  if (req.method === 'POST') {
    if (path === '/prompt') {
      const form = await req.formData();
      const value = String(form.get('system_prompt') ?? '').trim();
      if (value) await setSystemPrompt(env, value);
      const thresholdRaw = String(form.get('interest_threshold') ?? '');
      const thresholdNum = parseInt(thresholdRaw, 10);
      if (Number.isFinite(thresholdNum) && thresholdNum >= 0 && thresholdNum <= 100) {
        await setInterestThreshold(env, thresholdNum);
      }
      return Response.redirect(new URL('/prompt?saved=1', req.url).toString(), 303);
    }
    const mark = path.match(/^\/mark-read\/(\d+)$/);
    if (mark) {
      const id = parseInt(mark[1], 10);
      await markRead(env, id);
      const referer = req.headers.get('Referer') ?? '/';
      return Response.redirect(referer, 303);
    }
    const save = path.match(/^\/save\/(\d+)$/);
    if (save) {
      const id = parseInt(save[1], 10);
      await markSaved(env, id);
      const referer = req.headers.get('Referer') ?? '/';
      return Response.redirect(referer, 303);
    }
    const unsave = path.match(/^\/unsave\/(\d+)$/);
    if (unsave) {
      const id = parseInt(unsave[1], 10);
      await unmarkSaved(env, id);
      const referer = req.headers.get('Referer') ?? '/';
      return Response.redirect(referer, 303);
    }
    const dismiss = path.match(/^\/dismiss\/(\d+)$/);
    if (dismiss) {
      const id = parseInt(dismiss[1], 10);
      await markDismissed(env, id);
      const referer = req.headers.get('Referer') ?? '/';
      return Response.redirect(referer, 303);
    }
    const undismiss = path.match(/^\/undismiss\/(\d+)$/);
    if (undismiss) {
      const id = parseInt(undismiss[1], 10);
      await unmarkDismissed(env, id);
      const referer = req.headers.get('Referer') ?? '/';
      return Response.redirect(referer, 303);
    }
  }

  return new Response('Not found', { status: 404 });
}

const FEED_BATCH_SIZE = 5;
const FEED_EXCLUDE_LIMIT = 50;

function parsePage(url: URL): number {
  const raw = url.searchParams.get('page');
  const n = raw ? parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function parseExclude(raw: string | null): number[] {
  if (!raw) return [];
  const ids: number[] = [];
  for (const part of raw.split(',')) {
    const n = parseInt(part, 10);
    if (Number.isFinite(n) && n > 0) ids.push(n);
    if (ids.length >= FEED_EXCLUDE_LIMIT) break;
  }
  return ids;
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
