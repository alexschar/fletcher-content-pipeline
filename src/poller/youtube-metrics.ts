import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface YouTubeMetrics {
  platform: 'youtube';
  metrics: Array<{ metric_type: string; metric_value: number; metadata?: Record<string, unknown> }>;
}

export async function fetchYouTubeMetrics(): Promise<YouTubeMetrics | null> {
  if (!config.youtube.apiKey) {
    logger.info('YouTube metrics skipped — no API key configured');
    return null;
  }

  const key = config.youtube.apiKey;
  const metrics: YouTubeMetrics['metrics'] = [];

  try {
    // We need a channel ID — search for it using the API key with forMine won't work without OAuth
    // Instead, get channel stats for a configured channel
    // For now, use search to find the user's channel via a separate env var or use channels list
    // The plan says we just need the API key, so let's use the channels.list with managedByMe or
    // more practically, the user would configure YOUTUBE_CHANNEL_ID

    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    if (!channelId) {
      logger.warn('YouTube metrics: YOUTUBE_CHANNEL_ID not set, skipping');
      return null;
    }

    // Get channel statistics
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${key}`,
      { signal: AbortSignal.timeout(30_000) },
    );

    if (!channelRes.ok) throw new Error(`YouTube API returned ${channelRes.status}`);
    const channelData = (await channelRes.json()) as { items: Array<{ statistics: Record<string, string> }> };

    if (channelData.items?.length) {
      const stats = channelData.items[0].statistics;
      metrics.push(
        { metric_type: 'subscriber_count', metric_value: Number(stats.subscriberCount ?? 0) },
        { metric_type: 'total_view_count', metric_value: Number(stats.viewCount ?? 0) },
        { metric_type: 'video_count', metric_value: Number(stats.videoCount ?? 0) },
      );
    }

    // Get most recent video
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=1&type=video&key=${key}`,
      { signal: AbortSignal.timeout(30_000) },
    );

    if (searchRes.ok) {
      const searchData = (await searchRes.json()) as {
        items: Array<{ id: { videoId: string }; snippet: { title: string } }>;
      };

      if (searchData.items?.length) {
        const videoId = searchData.items[0].id.videoId;
        const videoTitle = searchData.items[0].snippet.title;

        // Get video stats
        const videoRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${key}`,
          { signal: AbortSignal.timeout(30_000) },
        );

        if (videoRes.ok) {
          const videoData = (await videoRes.json()) as {
            items: Array<{ statistics: Record<string, string> }>;
          };
          if (videoData.items?.length) {
            metrics.push({
              metric_type: 'last_video_views',
              metric_value: Number(videoData.items[0].statistics.viewCount ?? 0),
              metadata: { title: videoTitle, videoId },
            });
          }
        }
      }
    }
  } catch (err) {
    logger.error(`YouTube metrics fetch failed: ${err}`);
    return null;
  }

  return { platform: 'youtube', metrics };
}
