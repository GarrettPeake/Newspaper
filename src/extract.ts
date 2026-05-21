export async function fetchArticleBody(url: string, jinaKey: string, maxChars = 8000): Promise<string> {
  try {
    const headers: Record<string, string> = { 'X-Return-Format': 'markdown' };
    if (jinaKey) headers['Authorization'] = `Bearer ${jinaKey}`;
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.error('jina error', res.status, url);
      return '';
    }
    const text = await res.text();
    return text.length > maxChars ? text.slice(0, maxChars) + '…' : text;
  } catch (e) {
    console.error('jina fetch failed', url, e);
    return '';
  }
}
