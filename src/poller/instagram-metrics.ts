import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface InstagramMetrics {
  platform: 'instagram';
  metrics: Array<{ metric_type: string; metric_value: number; metadata?: Record<string, unknown> }>;
}

export async function fetchInstagramMetrics(): Promise<InstagramMetrics | null> {
  if (!config.instagram.accessToken || !config.instagram.userId) {
    logger.info('Instagram metrics skipped — no token or user ID configured');
    return null;
  }

  const token = config.instagram.accessToken;
  const userId = config.instagram.userId;
  const metrics: InstagramMetrics['metrics'] = [];

  try {
    // Get user profile metrics
    const profileRes = await fetch(
      `https://graph.facebook.com/v19.0/${userId}?fields=followers_count,media_count&access_token=${token}`,
      { signal: AbortSignal.timeout(30_000) },
    );

    if (!profileRes.ok) throw new Error(`Profile API returned ${profileRes.status}`);
    const profile = (await profileRes.json()) as Record<string, number>;

    metrics.push(
      { metric_type: 'followers_count', metric_value: profile.followers_count ?? 0 },
      { metric_type: 'media_count', metric_value: profile.media_count ?? 0 },
    );

    // Get recent media for engagement calculation
    const mediaRes = await fetch(
      `https://graph.facebook.com/v19.0/${userId}/media?fields=like_count,comments_count,permalink,timestamp&limit=25&access_token=${token}`,
      { signal: AbortSignal.timeout(30_000) },
    );

    if (mediaRes.ok) {
      const mediaData = (await mediaRes.json()) as { data: Array<Record<string, unknown>> };
      const posts = mediaData.data || [];

      if (posts.length > 0 && profile.followers_count > 0) {
        const totalEngagement = posts.reduce(
          (sum, p) => sum + ((p.like_count as number) ?? 0) + ((p.comments_count as number) ?? 0),
          0,
        );
        const engagementRate = (totalEngagement / posts.length / profile.followers_count) * 100;
        metrics.push({ metric_type: 'engagement_rate', metric_value: Math.round(engagementRate * 100) / 100 });

        // Find top post in last 7 days
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recentPosts = posts.filter(
          (p) => new Date(p.timestamp as string).getTime() > weekAgo,
        );
        if (recentPosts.length > 0) {
          const top = recentPosts.reduce((best, p) =>
            ((p.like_count as number) ?? 0) > ((best.like_count as number) ?? 0) ? p : best,
          );
          metrics.push({
            metric_type: 'top_post_last_7d',
            metric_value: (top.like_count as number) ?? 0,
            metadata: { permalink: top.permalink },
          });
        }
      }
    }
  } catch (err) {
    logger.error(`Instagram metrics fetch failed: ${err}`);
    return null;
  }

  return { platform: 'instagram', metrics };
}
