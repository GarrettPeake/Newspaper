import { handleFetch } from './fetch';
import { handleScheduled } from './scheduled';
import { handleQueue } from './queue';

export interface Env {
  DB: D1Database;
  QUEUE: Queue<QueueMsg>;
  OPENROUTER_API_KEY: string;
  JINA_API_KEY: string;
  AUTH_USERNAME: string;
  AUTH_PASSWORD: string;
  INTEREST_THRESHOLD: string;
  OPENROUTER_MODEL: string;
}

export interface QueueMsg {
  id: number;
}

export default {
  fetch: handleFetch,
  scheduled: handleScheduled,
  queue: handleQueue,
} satisfies ExportedHandler<Env, QueueMsg>;
