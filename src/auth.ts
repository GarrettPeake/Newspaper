/**
 * Authentication: GAuth sign-in (src/gauth.ts) with Better Auth sessions.
 *
 * Better Auth and the SAML libraries are imported on demand, never at the top of
 * the Worker, so the cron and the queue consumer never load them.
 */
import type { Env } from './index';

type Auth = import('./gauth').Auth;

/** Where GAuth posts its answers: the one cross-site POST there is (see isCrossOriginPost). */
export const GAUTH_ACS_PATH = '/api/auth/sso/saml2/sp/acs/gauth';

/** Each Set-Cookie on a response (the runtime has getSetCookie; these types may predate it). */
const setCookies = (headers: Headers): string[] => (headers as Headers & { getSetCookie(): string[] }).getSetCookie();

/** GAuth sign-in, or null when it can't be set up (a missing secret, say). */
async function loadAuth(env: Env): Promise<Auth | null> {
  try {
    const { getAuth } = await import('./gauth');
    return getAuth(env);
  } catch (error) {
    console.error('GAuth sign-in unavailable', String(error));
    return null;
  }
}

/** Whether the request carries a Better Auth session cookie (`__Secure-` prefixed over https). */
function hasSessionCookie(req: Request): boolean {
  return (req.headers.get('Cookie') ?? '').includes('better-auth.session_token=');
}

/** Whether the request is from the signed-in owner (a GAuth session with the owner role). */
export async function isAuthenticated(req: Request, env: Env): Promise<boolean> {
  // Without a session cookie there's nothing to check, so don't pay to load Better Auth.
  if (!hasSessionCookie(req)) return false;
  const auth = await loadAuth(env);
  if (!auth) return false;
  try {
    const { isOwner } = await import('./gauth');
    return await isOwner(auth, req.headers);
  } catch (error) {
    console.error('Session check failed', String(error));
    return false;
  }
}

/** Better Auth's own endpoints (/api/auth/*): GAuth's answers, the session. */
export async function handleAuthRequest(req: Request, env: Env): Promise<Response> {
  const auth = await loadAuth(env);
  if (!auth) return new Response('Sign-in unavailable', { status: 503 });
  return auth.handler(req);
}

/**
 * Send the browser to GAuth to sign in, coming back to `callbackPath`.
 *
 * Starts the sign-in on the server (it's Better Auth's POST /sign-in/sso), so
 * opening any page goes to GAuth in one redirect with no page in between.
 * Returns null if sign-in can't start.
 */
export async function startSignIn(req: Request, env: Env, callbackPath: string): Promise<Response | null> {
  const auth = await loadAuth(env);
  if (!auth) return null;
  const headers = new Headers({ 'Content-Type': 'application/json', Origin: env.APP_ORIGIN });
  for (const name of ['Cookie', 'CF-Connecting-IP', 'User-Agent']) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const res = await auth.handler(
    new Request(`${env.APP_ORIGIN}/api/auth/sign-in/sso`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        providerId: 'gauth',
        callbackURL: callbackPath,
        // Better Auth adds ?error=<code>; /login shows it instead of redirecting again.
        errorCallbackURL: '/login',
      }),
    }),
  );
  const data = res.ok ? ((await res.json().catch(() => null)) as { url?: unknown } | null) : null;
  if (typeof data?.url !== 'string') {
    console.error('Starting GAuth sign-in failed', res.status);
    return null;
  }
  const redirect = new Headers({ Location: data.url, 'Cache-Control': 'no-store' });
  // The relay state cookie ties GAuth's answer to this browser.
  for (const cookie of setCookies(res.headers)) redirect.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers: redirect });
}

/** End the session (Better Auth's sign-out), returning its cookie-clearing Set-Cookie values. */
export async function signOut(req: Request, env: Env): Promise<string[]> {
  if (!hasSessionCookie(req)) return [];
  const auth = await loadAuth(env);
  if (!auth) return [];
  const headers = new Headers({ Origin: env.APP_ORIGIN });
  const cookie = req.headers.get('Cookie');
  if (cookie) headers.set('Cookie', cookie);
  const res = await auth.handler(new Request(`${env.APP_ORIGIN}/api/auth/sign-out`, { method: 'POST', headers }));
  return setCookies(res.headers);
}

/**
 * A state-changing request from another origin. On newspaper.gpeake.com every
 * other *.gpeake.com site is "same-site", so SameSite=Lax alone would let them
 * post here with the session cookie. GAuth's answer is the one cross-site POST
 * there is: Better Auth checks it (a signed assertion answering a request this
 * browser started).
 */
export function isCrossOriginPost(req: Request, env: Env): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return false;
  if (new URL(req.url).pathname === GAUTH_ACS_PATH) return false;
  const origin = req.headers.get('Origin');
  if (origin) return origin !== env.APP_ORIGIN;
  const site = req.headers.get('Sec-Fetch-Site');
  return site !== null && site !== 'same-origin' && site !== 'none';
}

export function isSafeNext(next: string): boolean {
  return next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !next.startsWith('/api/') && !next.startsWith('/login');
}
