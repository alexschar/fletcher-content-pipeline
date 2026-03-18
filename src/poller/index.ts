import { config } from '../config.js';
import { mc } from '../mission-control.js';
import { logger } from '../utils/logger.js';
import { checkRateLimit, LIMITS } from '../utils/rate-limit.js';
import { fetchInstagramMetrics } from './instagram-metrics.js';
import { fetchYouTubeMetrics } from './youtube-metrics.js';
import { fetchTikTokMetrics } from './tiktok-metrics.js';

async function runPoller() {
  if (!checkRateLimit('poller', LIMITS.poller)) {
    logger.warn('Poller rate limited — already ran within the last hour');
    return;
  }

  logger.info('Starting social metrics poll...');

  const fetchers = [fetchInstagramMetrics, fetchYouTubeMetrics, fetchTikTokMetrics];
  const results = await Promise.allSettled(fetchers.map((fn) => fn()));

  let posted = 0;
  let skipped = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error(`Metrics fetch error: ${result.reason}`);
      failed++;
      continue;
    }

    const metrics = result.value;
    if (!metrics) {
      skipped++;
      continue;
    }

    try {
      await mc.postSocialMetrics(metrics as unknown as Record<string, unknown>);
      logger.info(`Posted ${metrics.platform} metrics (${metrics.metrics.length} values)`);
      posted++;
    } catch (err) {
      logger.error(`Failed to post ${metrics.platform} metrics: ${err}`);
      failed++;
    }
  }

  logger.info(`Poll complete: ${posted} posted, ${skipped} skipped, ${failed} failed`);
}

// Run immediately when called
runPoller().catch((err) => {
  logger.error(`Poller crashed: ${err}`);
  process.exit(1);
});
