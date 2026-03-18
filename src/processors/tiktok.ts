import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export async function processTikTok(url: string) {
  logger.info('Processing TikTok URL', { url });

  let title = 'TikTok video';
  let author = 'Unknown';
  let caption = '';

  // Try oEmbed first
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const data = (await res.json()) as Record<string, string>;
      title = data.title || title;
      author = data.author_name || author;
      caption = data.title || ''; // oEmbed title is usually the caption
    }
  } catch (err) {
    logger.warn(`TikTok oEmbed failed: ${err}`);
  }

  // If Apify token available, try richer extraction
  if (config.apify.apiToken && !caption) {
    try {
      const apifyResult = await fetchFromApify(url);
      if (apifyResult) {
        title = apifyResult.title || title;
        author = apifyResult.author || author;
        caption = apifyResult.caption || caption;
      }
    } catch (err) {
      logger.warn(`Apify TikTok fallback failed: ${err}`);
    }
  }

  const rawContent = caption
    ? `# ${title}\nAuthor: @${author}\n\n${caption}`
    : `TikTok video by @${author} — caption extraction unavailable. URL: ${url}`;

  return {
    platform: 'tiktok' as const,
    content_type: 'caption' as const,
    title,
    raw_content: rawContent,
    metadata: { author, url },
  };
}

async function fetchFromApify(url: string): Promise<{ title?: string; author?: string; caption?: string } | null> {
  const res = await fetch('https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apify.apiToken}`,
    },
    body: JSON.stringify({
      postURLs: [url],
      resultsPerPage: 1,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as Array<Record<string, unknown>>;
  if (!data.length) return null;

  const authorMeta = data[0].authorMeta as Record<string, string> | undefined;
  return {
    title: data[0].text as string | undefined,
    author: authorMeta?.name,
    caption: data[0].text as string | undefined,
  };
}
