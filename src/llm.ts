import type { Env } from './index';

export const DEFAULT_SYSTEM_PROMPT = `You decide whether a specific reader would want to read a Hacker News article. Read the title, article body, and top comments, then decide.

Reader profile:

I'm very interested in things that have broad impact like updates from large companies, the release of new software (especially in the realms of visual arts and graphics, finance, and generally things that bring new capabilities to open source or to the public), the release of new LLMs or AI technologies. I love reading about good being done in the world. I love reading about new inventions and the random musings of interesting people. I'm interested in anything political.

I'm not interested in truly boring things like semver updates to programming languages, operating systems, or open source projects. I'm not interested in well known but esoteric language updates like Haskell and Lisp.

One caveat to all of my non-interests is if they are generating really good discussion — if the comments are people discussing interesting ideas then I'm very interested to read those.`;

// Appended to the (editable) system prompt so the output contract can't be edited away.
export const DECISION_INSTRUCTIONS = `Answer one question: would this reader want to read this article?
- would_read: true for yes, false for no.
- confidence: how sure you are of that answer, an integer from 50 (coin flip) to 100 (certain).
Be honest and calibrated. The point is to filter noise.`;

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    would_read: {
      type: 'boolean',
      description: 'Whether the reader would want to read this article.',
    },
    confidence: {
      type: 'integer',
      description: 'Confidence in the decision, 50 (coin flip) to 100 (certain).',
    },
  },
  required: ['would_read', 'confidence'],
  additionalProperties: false,
} as const;

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'read_decision',
    strict: true,
    schema: RESPONSE_SCHEMA,
  },
};

export interface Decision {
  would_read: boolean;
  confidence: number;
}

// Score is the probability (0-100) that the reader wants the article:
// a confident yes is near 100, a confident no near 0, a coin flip 50.
export function decisionScore(d: Decision): number {
  const conf = Math.max(50, Math.min(100, Math.round(d.confidence)));
  return d.would_read ? conf : 100 - conf;
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

export async function getInterestThreshold(env: Env): Promise<number> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
    .bind('interest_threshold')
    .first<{ value: string }>();
  const stored = row ? parseInt(row.value, 10) : NaN;
  if (Number.isFinite(stored) && stored >= 0 && stored <= 100) return stored;
  const fromEnv = parseInt(env.INTEREST_THRESHOLD, 10);
  return Number.isFinite(fromEnv) ? fromEnv : 50;
}

export async function setInterestThreshold(env: Env, value: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  )
    .bind('interest_threshold', String(value), now)
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

const MAX_RETRIES = 5;
const REQUEST_TIMEOUT_MS = 45000;
const MAX_BACKOFF_MS = 20000;
// Auth/credit problems won't fix themselves on retry.
const NON_RETRYABLE_STATUS = new Set([401, 402, 403]);

class NonRetryableError extends Error {}

// Returns the 0-100 score. Throws if OpenRouter fails after all retries so the
// queue retries the message later instead of storing a bogus score.
export async function analyzeArticle(env: Env, p: AnalyzeParams): Promise<number> {
  const systemPrompt = `${await getSystemPrompt(env)}\n\n${DECISION_INSTRUCTIONS}`;
  const userContent = buildUserMessage(p);

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let retryAfterMs = 0;
    try {
      const decision = await requestDecision(env, systemPrompt, userContent, (ms) => (retryAfterMs = ms));
      return decisionScore(decision);
    } catch (e) {
      lastError = e;
      console.error(`openrouter attempt ${attempt + 1}/${MAX_RETRIES + 1} failed`, e instanceof Error ? e.message : e);
      if (e instanceof NonRetryableError) break;
    }
    if (attempt < MAX_RETRIES) {
      const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
      await sleep(Math.max(backoff, Math.min(retryAfterMs, MAX_BACKOFF_MS)));
    }
  }
  throw new Error(`openrouter failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function requestDecision(
  env: Env,
  systemPrompt: string,
  userContent: string,
  setRetryAfter: (ms: number) => void
): Promise<Decision> {
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
      // Only route to providers that actually honor structured outputs.
      provider: { require_parameters: true },
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) {
    const retryAfter = parseFloat(res.headers.get('Retry-After') ?? '');
    if (Number.isFinite(retryAfter)) setRetryAfter(retryAfter * 1000);
    const msg = `HTTP ${res.status}: ${text.slice(0, 300)}`;
    throw NON_RETRYABLE_STATUS.has(res.status) ? new NonRetryableError(msg) : new Error(msg);
  }

  // OpenRouter can return 200 with an error body (e.g. upstream provider failure).
  let data: { error?: { message?: string }; choices?: Array<{ message?: { content?: string | null } }> };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response: ${text.slice(0, 300)}`);
  }
  if (data.error) throw new Error(`provider error: ${data.error.message ?? JSON.stringify(data.error)}`);

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('empty content');
  return parseDecision(content);
}

function parseDecision(content: string): Decision {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`no JSON object in content: ${content.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  let wouldRead = parsed.would_read;
  if (wouldRead === 'true' || wouldRead === 'yes') wouldRead = true;
  if (wouldRead === 'false' || wouldRead === 'no') wouldRead = false;
  const confidence = Number(parsed.confidence);
  if (typeof wouldRead !== 'boolean' || !Number.isFinite(confidence)) {
    throw new Error(`invalid decision: ${match[0].slice(0, 200)}`);
  }
  // Tolerate a 0-1 scale.
  return { would_read: wouldRead, confidence: confidence <= 1 ? confidence * 100 : confidence };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUserMessage(p: AnalyzeParams): string {
  let s = `Title: ${p.title}\n`;
  if (p.url) s += `URL: ${p.url}\n`;
  s += `HN score: ${p.hnScore}  Comments: ${p.hnComments}\n`;
  if (p.body) s += `\n--- Article ---\n${p.body}\n`;
  if (p.comments) s += `\n--- Top HN comments ---\n${p.comments}\n`;
  return s;
}
