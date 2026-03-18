import { logger } from '../utils/logger.js';

export async function processTwitter(url: string) {
  logger.info('Processing Twitter/X URL', { url });

  let title = 'Tweet';
  let author = 'Unknown';
  let tweetText = '';

  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const data = (await res.json()) as Record<string, string>;
      author = data.author_name || author;
      // Extract text from the HTML embed
      tweetText = extractTextFromEmbed(data.html || '');
      title = `Tweet by ${author}`;
    }
  } catch (err) {
    logger.warn(`Twitter oEmbed failed: ${err}`);
  }

  const rawContent = tweetText
    ? `# ${title}\n\n${tweetText}`
    : `Tweet — content extraction unavailable. URL: ${url}`;

  return {
    platform: 'twitter' as const,
    content_type: 'post' as const,
    title,
    raw_content: rawContent,
    metadata: { author, url },
  };
}

function extractTextFromEmbed(html: string): string {
  // Twitter oEmbed HTML has the tweet text in <p> tags within the blockquote
  const match = html.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
  if (!match) return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Get text from <p> tags inside blockquote
  const pMatches = match[1].match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  if (!pMatches) return '';

  return pMatches
    .map((p) => p.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean)
    .join('\n\n');
}
