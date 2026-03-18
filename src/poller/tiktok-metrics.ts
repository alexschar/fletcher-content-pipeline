import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface TikTokMetrics {
  platform: 'tiktok';
  metrics: Array<{ metric_type: string; metric_value: number; metadata?: Record<string, unknown> }>;
}

export async function fetchTikTokMetrics(): Promise<TikTokMetrics | null> {
  if (!config.tiktok.accessToken && !config.apify.apiToken) {
    logger.info('TikTok metrics skipped — no access token or Apify token configured');
    return null;
  }

  const metrics: TikTokMetrics['metrics'] = [];

  // Try official API first
  if (config.tiktok.accessToken) {
    try {
      const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=follower_count,likes_count,video_count', {
        headers: {
          Authorization: `Bearer ${config.tiktok.accessToken}`,
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (res.ok) {
        const data = (await res.json()) as { data: { user: Record<string, number> } };
        const user = data.data?.user;
        if (user) {
          metrics.push(
            { metric_type: 'follower_count', metric_value: user.follower_count ?? 0 },
            { metric_type: 'total_likes', metric_value: user.likes_count ?? 0 },
            { metric_type: 'video_count', metric_value: user.video_count ?? 0 },
          );
          return { platform: 'tiktok', metrics };
        }
      }
    } catch (err) {
      logger.warn(`TikTok official API failed: ${err}`);
    }
  }

  // Apify fallback
  if (config.apify.apiToken) {
    try {
      const tiktokUsername = process.env.TIKTOK_USERNAME;
      if (!tiktokUsername) {
        logger.warn('TikTok metrics: TIKTOK_USERNAME not set for Apify fallback');
        return null;
      }

      const res = await fetch(
        'https://api.apify.com/v2/acts/clockworks~tiktok-profile-scraper/run-sync-get-dataset-items',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apify.apiToken}`,
          },
          body: JSON.stringify({ profiles: [tiktokUsername] }),
          signal: AbortSignal.timeout(60_000),
        },
      );

      if (res.ok) {
        const data = (await res.json()) as Array<Record<string, number>>;
        if (data.length) {
          const profile = data[0];
          metrics.push(
            { metric_type: 'follower_count', metric_value: profile.fans ?? 0 },
            { metric_type: 'total_likes', metric_value: profile.heart ?? 0 },
            { metric_type: 'video_count', metric_value: profile.video ?? 0 },
          );
        }
      }
    } catch (err) {
      logger.error(`Apify TikTok metrics fallback failed: ${err}`);
      return null;
    }
  }

  if (metrics.length === 0) return null;
  return { platform: 'tiktok', metrics };
}
