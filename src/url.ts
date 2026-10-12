// Query params that only track where a click came from; dropped when deduping.
const TRACKING_PARAM = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|source)$/i;

// Key used to dedupe the same link across sources: hostname (sans www) + path +
// non-tracking query params. Scheme, fragment and trailing slashes are ignored.
// The query is kept so e.g. youtube.com/watch?v=... links don't all collide.
export function canonicalUrl(raw: string | null): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  const params = [...u.searchParams].filter(([k]) => !TRACKING_PARAM.test(k));
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = params.length ? '?' + new URLSearchParams(params).toString() : '';
  return host + path + query;
}
