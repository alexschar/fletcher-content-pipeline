import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export async function processInstagram(url: string) {
  logger.info('Processing Instagram URL', { url });

  let title = 'Instagram post';
  let author = 'Unknown';
  let caption = '';

  // Try oEmbed via Graph API
  if (config.instagram.accessToken) {
    try {
      const oembedUrl = `https://graph.facebook.com/v19.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${config.instagram.accessToken}`;
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) {
        const data = (await res.json()) as Record<string, string>;
        title = data.title || title;
        author = data.author_name || author;
        // The HTML field contains the caption in the embed
        caption = extractCaptionFromHtml(data.html || '');
      }
    } catch (err) {
      logger.warn(`Instagram oEmbed failed: ${err}`);
    }
  }

  // Apify fallback
  if (config.apify.apiToken && !caption) {
    try {
      const result = await fetchFromApify(url);
      if (result) {
        caption = result.caption || caption;
        author = result.author || author;
      }
    } catch (err) {
      logger.warn(`Apify Instagram fallback failed: ${err}`);
    }
  }

  const rawContent = caption
    ? `# ${title}\nAuthor: @${author}\n\n${caption}`
    : `Instagram post by @${author} — caption extraction unavailable. URL: ${url}`;

  return {
    platform: 'instagram' as const,
    content_type: 'post' as const,
    title,
    raw_content: rawContent,
    metadata: { author, url },
  };
}

function extractCaptionFromHtml(html: string): string {
  // oEmbed HTML contains the caption as text content
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchFromApify(url: string): Promise<{ caption?: string; author?: string } | null> {
  const res = await fetch('https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apify.apiToken}`,
    },
    body: JSON.stringify({
      directUrls: [url],
      resultsLimit: 1,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as Array<Record<string, string>>;
  if (!data.length) return null;

  return {
    caption: data[0].caption,
    author: data[0].ownerUsername,
  };
}
