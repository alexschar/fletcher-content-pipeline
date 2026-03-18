export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'web';

interface DetectedLink {
  url: string;
  platform: Platform;
}

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

const PLATFORM_PATTERNS: [RegExp, Platform][] = [
  [/(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/i, 'youtube'],
  [/(?:tiktok\.com\/@|vm\.tiktok\.com\/)/i, 'tiktok'],
  [/(?:instagram\.com\/(?:p|reel|reels)\/)/i, 'instagram'],
  [/(?:twitter\.com\/|x\.com\/)/i, 'twitter'],
];

function detectPlatform(url: string): Platform {
  for (const [pattern, platform] of PLATFORM_PATTERNS) {
    if (pattern.test(url)) return platform;
  }
  return 'web';
}

export function extractLinks(text: string): DetectedLink[] {
  const urls = text.match(URL_REGEX);
  if (!urls) return [];

  return urls.map((url) => ({
    url: url.replace(/[.,;:!?)]+$/, ''), // Strip trailing punctuation
    platform: detectPlatform(url),
  }));
}
