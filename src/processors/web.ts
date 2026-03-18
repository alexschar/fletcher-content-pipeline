import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { logger } from '../utils/logger.js';

export async function processWeb(url: string) {
  logger.info('Processing web URL', { url });

  let title = 'Web article';
  let content = '';

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Only HTTPS URLs are allowed');
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });

    // Verify we didn't get redirected to non-HTTPS
    const finalUrl = new URL(res.url);
    if (finalUrl.protocol !== 'https:') {
      throw new Error(`Redirected to non-HTTPS URL: ${res.url}`);
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article) {
      title = article.title || title;
      content = article.textContent?.trim() || '';
    } else {
      // Fallback: extract text from body
      const body = dom.window.document.body;
      content = body?.textContent?.replace(/\s+/g, ' ').trim() || '';
      title = dom.window.document.title || title;
    }
  } catch (err) {
    logger.error(`Web extraction failed: ${err}`);
    return {
      platform: 'web' as const,
      content_type: 'article' as const,
      title: 'Web page (extraction failed)',
      raw_content: `Failed to extract content from ${url}: ${err instanceof Error ? err.message : String(err)}`,
      metadata: { url, error: true },
    };
  }

  const rawContent = `# ${title}\nSource: ${url}\n\n${content}`;

  return {
    platform: 'web' as const,
    content_type: 'article' as const,
    title,
    raw_content: rawContent,
    metadata: {
      url,
      word_count: content.split(/\s+/).length,
    },
  };
}
