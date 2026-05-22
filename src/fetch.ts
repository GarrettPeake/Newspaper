import type { Env } from './index';
import {
  isAuthenticated,
  checkLogin,
  sessionCookieHeader,
  clearCookieHeader,
  isSafeNext,
} from './auth';
import { listPage, promptPage, loginPage } from './views';
import {
  getInterestingUnread,
  getUninterestingUnread,
  getRead,
  getArticle,
  markRead,
} from './db';
import { getSystemPrompt, setSystemPrompt, RESPONSE_SCHEMA } from './llm';

export async function handleFetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const threshold = parseInt(env.INTEREST_THRESHOLD, 10) || 3;

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
      const page = parsePage(url);
      const result = await getInterestingUnread(env, threshold, page);
      return html(listPage('feed', '/', page, result.items, result.hasMore, 'Nothing in the feed yet — give the cron a few cycles.', true));
    }
    if (path === '/uninteresting') {
      const page = parsePage(url);
      const result = await getUninterestingUnread(env, threshold, page);
      return html(listPage('uninteresting', '/uninteresting', page, result.items, result.hasMore, 'No filtered-out articles yet.', true));
    }
    if (path === '/read') {
      const page = parsePage(url);
      const result = await getRead(env, page);
      return html(listPage('read', '/read', page, result.items, result.hasMore, 'No read articles yet.', false));
    }
    if (path === '/prompt') {
      const current = await getSystemPrompt(env);
      const saved = url.searchParams.has('saved');
      return html(promptPage(current, RESPONSE_SCHEMA, saved));
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
      return Response.redirect(new URL('/prompt?saved=1', req.url).toString(), 303);
    }
    const mark = path.match(/^\/mark-read\/(\d+)$/);
    if (mark) {
      const id = parseInt(mark[1], 10);
      await markRead(env, id);
      const referer = req.headers.get('Referer') ?? '/';
      return Response.redirect(referer, 303);
    }
  }

  return new Response('Not found', { status: 404 });
}

function parsePage(url: URL): number {
  const raw = url.searchParams.get('page');
  const n = raw ? parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
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
