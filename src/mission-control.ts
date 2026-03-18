import { config } from './config.js';
import { logger } from './utils/logger.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const PENDING_DIR = join(process.cwd(), '.pending');

interface PostOptions {
  path: string;
  body: Record<string, unknown>;
  retries?: number;
}

async function postWithRetry({ path, body, retries = 3 }: PostOptions): Promise<Response> {
  const url = `${config.mc.apiUrl}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.mc.apiToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        throw new Error(`MC API returned ${res.status}: ${res.statusText}`);
      }

      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(`MC POST ${path} attempt ${attempt}/${retries} failed: ${lastError.message}`);

      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // All retries exhausted — save to .pending/
  savePending(path, body);
  throw lastError!;
}

function savePending(path: string, body: Record<string, unknown>) {
  try {
    mkdirSync(PENDING_DIR, { recursive: true });
    const filename = `${Date.now()}-${path.replace(/\//g, '_')}.json`;
    writeFileSync(
      join(PENDING_DIR, filename),
      JSON.stringify({ path, body, savedAt: new Date().toISOString() }, null, 2),
    );
    logger.info(`Saved pending request to ${filename}`);
  } catch (err) {
    logger.error(`Failed to save pending request: ${err}`);
  }
}

async function get(path: string): Promise<unknown> {
  const url = `${config.mc.apiUrl}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.mc.apiToken}`,
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`MC API GET ${path} returned ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

export const mc = {
  postContentDrop: (body: Record<string, unknown>) =>
    postWithRetry({ path: '/api/content-drops', body }),

  postSocialMetrics: (body: Record<string, unknown>) =>
    postWithRetry({ path: '/api/social-metrics', body }),

  get,
};
