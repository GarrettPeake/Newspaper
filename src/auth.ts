import type { Env } from './index';

const COOKIE_NAME = 'newspaper_session';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64url(sig);
}

async function makeToken(env: Env): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const payload = `${env.AUTH_USERNAME}.${expires}`;
  const sig = await sign(payload, env.AUTH_PASSWORD);
  return `${payload}.${sig}`;
}

async function verifyToken(token: string, env: Env): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [user, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  if (user !== env.AUTH_USERNAME) return false;
  const expected = await sign(`${user}.${expStr}`, env.AUTH_PASSWORD);
  return timingSafeEqual(sig, expected);
}

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get('Cookie');
  if (!header) return null;
  for (const pair of header.split(';')) {
    const [k, ...rest] = pair.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export async function isAuthenticated(req: Request, env: Env): Promise<boolean> {
  const token = getCookie(req, COOKIE_NAME);
  if (!token) return false;
  return verifyToken(token, env);
}

export async function sessionCookieHeader(env: Env): Promise<string> {
  const token = await makeToken(env);
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`;
}

export function clearCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function checkLogin(env: Env, username: string, password: string): boolean {
  return timingSafeEqual(username, env.AUTH_USERNAME) && timingSafeEqual(password, env.AUTH_PASSWORD);
}

export function isSafeNext(next: string): boolean {
  return next.startsWith('/') && !next.startsWith('//');
}
