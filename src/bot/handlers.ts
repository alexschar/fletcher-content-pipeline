import { extractLinks, type Platform } from './link-detector.js';
import { processYouTube } from '../processors/youtube.js';
import { processTikTok } from '../processors/tiktok.js';
import { processInstagram } from '../processors/instagram.js';
import { processTwitter } from '../processors/twitter.js';
import { processWeb } from '../processors/web.js';
import { mc } from '../mission-control.js';
import { logger } from '../utils/logger.js';
import { checkRateLimit, LIMITS } from '../utils/rate-limit.js';

type ProcessorResult = {
  platform: string;
  content_type: string;
  title: string;
  raw_content: string;
  metadata: Record<string, unknown>;
};

const processors: Record<Platform, (url: string) => Promise<ProcessorResult>> = {
  youtube: processYouTube,
  tiktok: processTikTok,
  instagram: processInstagram,
  twitter: processTwitter,
  web: processWeb,
};

export async function handleMessage(text: string): Promise<string> {
  const links = extractLinks(text);

  if (links.length === 0) {
    return 'No links detected in your message.';
  }

  const results: string[] = [];

  for (const link of links) {
    if (!checkRateLimit('contentDrop', LIMITS.contentDrop)) {
      results.push(`Rate limited — skipping ${link.url}`);
      logger.warn('Content drop rate limit hit');
      continue;
    }

    try {
      logger.info(`Processing ${link.platform} link`, { url: link.url });
      const result = await processors[link.platform](link.url);

      const wordCount = result.raw_content.split(/\s+/).length;

      await mc.postContentDrop({
        source_url: link.url,
        platform: result.platform,
        content_type: result.content_type,
        title: result.title,
        raw_content: result.raw_content,
        relevant_agents: ['sawyer'],
      });

      results.push(
        `Got it — ${result.title}. ${capitalize(result.content_type)} extracted (${wordCount.toLocaleString()} words). Sawyer will pick this up on next heartbeat.`,
      );
    } catch (err) {
      logger.error(`Failed to process ${link.url}: ${err}`);
      results.push(`Failed to process ${link.url} — logged for retry.`);
    }
  }

  return results.join('\n\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
