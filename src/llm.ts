import type { Env } from './index';

export const DEFAULT_SYSTEM_PROMPT = `You score Hacker News articles for personal relevance to a specific reader. Read the title, article body, and top comments, then judge how interested the reader would be.

Reader profile:

I'm very interested in things that have broad impact like updates from large companies, the release of new software (especially in the realms of visual arts and graphics, finance, and generally things that bring new capabilities to open source or to the public), the release of new LLMs or AI technologies. I love reading about good being done in the world. I love reading about new inventions and the random musings of interesting people. I'm interested in anything political.

I'm not interested in truly boring things like semver updates to programming languages, operating systems, or open source projects. I'm not interested in well known but esoteric language updates like Haskell and Lisp.

One caveat to all of my non-interests is if they are generating really good discussion — if the comments are people discussing interesting ideas then I'm very interested to read those.

Scoring:
- 0-2: definitely skip
- 3-5: borderline / niche
- 6-8: likely interested
- 9-10: must-read for this reader

Be honest. Don't inflate scores. The point is to filter noise.`;

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    interest_level: {
      type: 'integer',
      minimum: 0,
      maximum: 10,
      description: 'How interested the reader would be in this article, from 0 (skip) to 10 (must-read).',
    },
    interest_reason: {
      type: 'string',
      description: 'One short sentence explaining the score.',
    },
  },
  required: ['interest_level', 'interest_reason'],
  additionalProperties: false,
} as const;

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'article_interest',
    strict: true,
    schema: RESPONSE_SCHEMA,
  },
};

export interface AnalysisResult {
  interest_level: number;
  interest_reason: string;
}

export async function getSystemPrompt(env: Env): Promise<string> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
    .bind('system_prompt')
    .first<{ value: string }>();
  return row?.value ?? DEFAULT_SYSTEM_PROMPT;
}

export async function setSystemPrompt(env: Env, value: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  )
    .bind('system_prompt', value, now)
    .run();
}

export interface AnalyzeParams {
  title: string;
  url: string | null;
  hnScore: number;
  hnComments: number;
  body: string;
  comments: string;
}

export async function analyzeArticle(env: Env, p: AnalyzeParams): Promise<AnalysisResult> {
  const systemPrompt = await getSystemPrompt(env);
  const userContent = buildUserMessage(p);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://newspaper.gepeake.workers.dev',
          'X-Title': 'newspaper',
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          response_format: RESPONSE_FORMAT,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        console.error('openrouter error', res.status, await res.text());
        continue;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        console.error('openrouter empty content');
        continue;
      }

      const parsed = JSON.parse(content) as { interest_level: number; interest_reason: string };
      return {
        interest_level: Math.round(parsed.interest_level),
        interest_reason: parsed.interest_reason.trim(),
      };
    } catch (e) {
      console.error('openrouter attempt failed', e);
    }
  }

  return { interest_level: 5, interest_reason: 'Analysis failed' };
}

function buildUserMessage(p: AnalyzeParams): string {
  let s = `Title: ${p.title}\n`;
  if (p.url) s += `URL: ${p.url}\n`;
  s += `HN score: ${p.hnScore}  Comments: ${p.hnComments}\n`;
  if (p.body) s += `\n--- Article ---\n${p.body}\n`;
  if (p.comments) s += `\n--- Top HN comments ---\n${p.comments}\n`;
  return s;
}
