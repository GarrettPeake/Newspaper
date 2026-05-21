const FIREBASE = 'https://hacker-news.firebaseio.com/v0';

export interface HnItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  text?: string;
  type?: string;
  by?: string;
  time?: number;
  kids?: number[];
  dead?: boolean;
  deleted?: boolean;
}

export async function getTopStoryIds(limit: number): Promise<number[]> {
  const res = await fetch(`${FIREBASE}/topstories.json`, { cf: { cacheTtl: 60 } });
  if (!res.ok) throw new Error(`topstories ${res.status}`);
  const ids = (await res.json()) as number[];
  return ids.slice(0, limit);
}

export async function getItem(id: number): Promise<HnItem | null> {
  const res = await fetch(`${FIREBASE}/item/${id}.json`);
  if (!res.ok) return null;
  return (await res.json()) as HnItem | null;
}

interface AlgoliaItem {
  id: number;
  author?: string;
  text?: string | null;
  children?: AlgoliaItem[];
}

export async function getCommentsText(id: number, maxComments = 30, maxChars = 6000): Promise<string> {
  try {
    const res = await fetch(`https://hn.algolia.com/api/v1/items/${id}`);
    if (!res.ok) return '';
    const item = (await res.json()) as AlgoliaItem;
    const out: string[] = [];
    const walk = (c: AlgoliaItem) => {
      if (out.length >= maxComments) return;
      if (c.text && c.author) {
        const stripped = decodeAndStrip(c.text);
        if (stripped) out.push(`[${c.author}]: ${stripped}`);
      }
      for (const child of c.children ?? []) walk(child);
    };
    for (const child of item.children ?? []) walk(child);
    let joined = out.join('\n\n');
    if (joined.length > maxChars) joined = joined.slice(0, maxChars) + '…';
    return joined;
  } catch {
    return '';
  }
}

export function decodeAndStrip(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
