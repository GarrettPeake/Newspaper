const BASE = 'https://lobste.rs';
const HEADERS = { 'User-Agent': 'newspaper (personal reader; https://newspaper.gepeake.workers.dev)' };

// Trimmed story as carried in queue messages.
export interface LobstersStory {
  short_id: string;
  title: string;
  url: string;
  score: number;
  comment_count: number;
  description_plain: string;
  tags: string[];
}

export function lobstersUrl(shortId: string): string {
  return `${BASE}/s/${shortId}`;
}

export async function getHottest(pages: number): Promise<LobstersStory[]> {
  const out: LobstersStory[] = [];
  for (let p = 1; p <= pages; p++) {
    const res = await fetch(p === 1 ? `${BASE}/hottest.json` : `${BASE}/page/${p}.json`, {
      headers: HEADERS,
      cf: { cacheTtl: 60 },
    });
    if (!res.ok) throw new Error(`lobsters page ${p} ${res.status}`);
    const stories = (await res.json()) as LobstersStory[];
    for (const s of stories) {
      out.push({
        short_id: s.short_id,
        title: s.title,
        url: s.url,
        score: s.score,
        comment_count: s.comment_count,
        description_plain: (s.description_plain ?? '').slice(0, 8000),
        tags: s.tags ?? [],
      });
    }
  }
  return out;
}

interface LobstersComment {
  comment_plain?: string;
  commenting_user?: string | { username?: string };
  is_deleted?: boolean;
  is_moderated?: boolean;
}

export async function getCommentsText(shortId: string, maxComments = 30, maxChars = 6000): Promise<string> {
  try {
    const res = await fetch(`${BASE}/s/${shortId}.json`, { headers: HEADERS });
    if (!res.ok) return '';
    const story = (await res.json()) as { comments?: LobstersComment[] };
    const out: string[] = [];
    for (const c of story.comments ?? []) {
      if (out.length >= maxComments) break;
      if (c.is_deleted || c.is_moderated || !c.comment_plain) continue;
      const user = typeof c.commenting_user === 'string' ? c.commenting_user : c.commenting_user?.username ?? '?';
      const text = c.comment_plain.replace(/\s+/g, ' ').trim();
      if (text) out.push(`[${user}]: ${text}`);
    }
    let joined = out.join('\n\n');
    if (joined.length > maxChars) joined = joined.slice(0, maxChars) + '…';
    return joined;
  } catch {
    return '';
  }
}
