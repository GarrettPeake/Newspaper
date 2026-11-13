import { handleFetch } from './fetch';
import { handleScheduled } from './scheduled';
import { handleQueue } from './queue';
import type { LobstersStory } from './lobsters';

export interface Env {
  DB: D1Database;
  QUEUE: Queue<QueueMsg>;
  OPENROUTER_API_KEY: string;
  JINA_API_KEY: string;
  /** https://newspaper.gpeake.com: the one address sign-in works on. */
  APP_ORIGIN: string;
  GAUTH_ORIGIN: string;
  /** GAuth's SAML signing certificate(s), PEM (public, so a var). */
  GAUTH_CERTS: string;
  BETTER_AUTH_SECRET: string;
  INTEREST_THRESHOLD: string;
  OPENROUTER_MODEL: string;
}

export type QueueMsg =
  | { source?: 'hn'; id: number }
  | { source: 'lobsters'; story: LobstersStory };

export default {
  fetch: handleFetch,
  scheduled: handleScheduled,
  queue: handleQueue,
} satisfies ExportedHandler<Env, QueueMsg>;
