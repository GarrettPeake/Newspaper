import type { Env } from './index';
import {
  isAuthenticated,
  isCrossOriginPost,
  isSafeNext,
  handleAuthRequest,
  signOut,
  startSignIn,
} from './auth';
import { listPage, promptPage, problemPage, signedOutPage, feedPage } from './views';
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
  type Article,
  type Source,
} from './db';
import { lobstersUrl } from './lobsters';
import {
  getSystemPrompt,
  setSystemPrompt,
  getInterestThreshold,
  setInterestThreshold,
  RESPONSE_SCHEMA,
  DECISION_INSTRUCTIONS,
} from './llm';

/** Quick sign-in attempts in a row, so a broken sign-in shows a page instead of looping. */
const TRIES_COOKIE = 'np_signin_tries';
const MAX_TRIES = 3;
const tries = (req: Request) => Number(/(?:^|;\s*)np_signin_tries=(\d+)/.exec(req.headers.get('Cookie') ?? '')?.[1] ?? 0);
const triesCookie = (n: number) =>
  `${TRIES_COOKIE}=${n || ''}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${n ? 60 : 0}`;

const SIGN_IN_ERRORS: Record<string, string> = {
  no_role: "Your GAuth account doesn't have the owner role for newspaper.",
};

export async function handleFetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  // One address (newspaper.gpeake.com), so sessions (host-only cookies) and
  // GAuth's answers line up. workers.dev links land there.
  if (url.origin !== env.APP_ORIGIN) return Response.redirect(`${env.APP_ORIGIN}${url.pathname}${url.search}`, 302);
  if (isCrossOriginPost(req, env)) return new Response('Cross-origin request refused', { status: 403 });

  const signedIn = await isAuthenticated(req, env);
  const res = await route(req, env, url, signedIn);
  if (signedIn && tries(req) > 0) {
    const out = new Response(res.body, res);
    out.headers.append('Set-Cookie', triesCookie(0));
    return out;
  }
  return res;
}

/**
 * Send a signed-out browser to GAuth (no page in between), coming back to `next`;
 * or, when GAuth answered with ?error= or this keeps happening, say so instead.
 */
async function signIn(req: Request, env: Env, url: URL, next: string): Promise<Response> {
  const retryHref = `/login?retry=1&next=${encodeURIComponent(next)}`;
  const error = url.searchParams.get('error');
  if (error !== null) {
    return html(problemPage(SIGN_IN_ERRORS[error] ?? `Signing in with GAuth failed (${error}).`, retryHref));
  }
  const n = url.pathname === '/login' && url.searchParams.get('retry') === '1' ? 0 : tries(req);
  if (n >= MAX_TRIES) return html(problemPage("Signing in didn't complete.", retryHref));
  const start = await startSignIn(req, env, next);
  if (!start) return html(problemPage('Sign-in is unavailable right now.', retryHref), 503);
  start.headers.append('Set-Cookie', triesCookie(n + 1));
  return start;
}

async function route(req: Request, env: Env, url: URL, signedIn: boolean): Promise<Response> {
  const path = url.pathname;

  // Better Auth's endpoints: GAuth's answers (the ACS), the session.
  if (path.startsWith('/api/auth/')) return handleAuthRequest(req, env);

  if (path === '/signed-out') return html(signedOutPage());
  if (path === '/logout') {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    const headers = new Headers({ Location: '/signed-out' });
    for (const cookie of await signOut(req, env)) headers.append('Set-Cookie', cookie);
    return new Response(null, { status: 303, headers });
  }

  // There is no login page: /login is where to send a browser to sign in (?next=).
  if (path === '/login') {
    const nextRaw = url.searchParams.get('next') ?? '/';
    const next = isSafeNext(nextRaw) ? nextRaw : '/';
    if (signedIn) return Response.redirect(new URL(next, req.url).toString(), 303);
    return signIn(req, env, url, next);
  }

  // Everything else needs the signed-in owner. Pages go to GAuth and come back;
  // a script's fetch (the feed's refill, its buttons) just gets a 401.
  if (!signedIn) {
    if (req.headers.get('Sec-Fetch-Mode') === 'navigate' || (req.method === 'GET' && !req.headers.has('Sec-Fetch-Mode'))) {
      return req.method === 'GET'
        ? signIn(req, env, url, path + url.search)
        : Response.redirect(new URL('/login', req.url).toString(), 303);
    }
    return new Response('Signed out', { status: 401 });
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
      return Response.redirect(a.url ?? discussionUrl(a) ?? '/', 302);
    }
    const comments = path.match(/^\/comments\/(\d+)(?:\/(hn|lobsters))?$/);
    if (comments) {
      const id = parseInt(comments[1], 10);
      const a = await getArticle(env, id);
      if (!a) return new Response('Not found', { status: 404 });
      const target = discussionUrl(a, comments[2] as Source | undefined);
      if (!target) return new Response('Not found', { status: 404 });
      await markRead(env, id);
      return Response.redirect(target, 302);
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

// Discussion page for the given source, or the first one the article has.
function discussionUrl(a: Article, source?: Source): string | null {
  if (a.hn_id !== null && source !== 'lobsters') return `https://news.ycombinator.com/item?id=${a.hn_id}`;
  if (a.lobsters_id !== null && source !== 'hn') return lobstersUrl(a.lobsters_id);
  return null;
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
