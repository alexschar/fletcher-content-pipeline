import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

interface YouTubeResult {
  title: string;
  description: string;
  channel: string;
  duration: number;
  view_count: number;
  transcript: string | null;
}

export async function processYouTube(url: string): Promise<{
  platform: 'youtube';
  content_type: 'transcript';
  title: string;
  raw_content: string;
  metadata: Record<string, unknown>;
}> {
  logger.info('Processing YouTube URL', { url });

  const tempDir = tmpdir();
  const subFile = join(tempDir, `yt-sub-${Date.now()}`);

  let info: YouTubeResult;

  try {
    // Get video info + subtitles
    const { stdout } = await execFileAsync(
      'yt-dlp',
      [
        '--no-exec',
        '--write-auto-sub',
        '--sub-lang', 'en',
        '--skip-download',
        '--print-json',
        '-o', subFile,
        url,
      ],
      { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 },
    );

    const json = JSON.parse(stdout);
    info = {
      title: json.title ?? 'Untitled',
      description: json.description ?? '',
      channel: json.channel ?? json.uploader ?? 'Unknown',
      duration: json.duration ?? 0,
      view_count: json.view_count ?? 0,
      transcript: null,
    };

    // Try to read the subtitle file
    const vttPath = `${subFile}.en.vtt`;
    try {
      const vtt = await readFile(vttPath, 'utf-8');
      info.transcript = parseVtt(vtt);
      await unlink(vttPath).catch(() => {});
    } catch {
      logger.warn('No subtitle file found, falling back to description');
    }
  } catch (err) {
    logger.error(`yt-dlp failed: ${err}`);
    return {
      platform: 'youtube',
      content_type: 'transcript',
      title: 'YouTube video (extraction failed)',
      raw_content: `Failed to extract content from ${url}: ${err instanceof Error ? err.message : String(err)}`,
      metadata: { url, error: true },
    };
  }

  const rawContent = info.transcript
    ? `# ${info.title}\nChannel: ${info.channel}\nDuration: ${formatDuration(info.duration)}\n\n## Transcript\n${info.transcript}`
    : `# ${info.title}\nChannel: ${info.channel}\nDuration: ${formatDuration(info.duration)}\n\n## Description\n${info.description}\n\n(Transcript unavailable)`;

  return {
    platform: 'youtube',
    content_type: 'transcript',
    title: info.title,
    raw_content: rawContent,
    metadata: {
      channel: info.channel,
      duration: info.duration,
      view_count: info.view_count,
      has_transcript: !!info.transcript,
      word_count: rawContent.split(/\s+/).length,
    },
  };
}

function parseVtt(vtt: string): string {
  return vtt
    .split('\n')
    .filter((line) => {
      // Skip VTT headers, timestamps, and blank lines
      if (!line.trim()) return false;
      if (line.startsWith('WEBVTT')) return false;
      if (line.startsWith('Kind:')) return false;
      if (line.startsWith('Language:')) return false;
      if (/^\d{2}:\d{2}/.test(line)) return false;
      if (/^<\d{2}:\d{2}/.test(line)) return false;
      if (/^\d+$/.test(line.trim())) return false;
      return true;
    })
    .map((line) => line.replace(/<[^>]+>/g, '').trim()) // Strip HTML tags
    .filter((line, i, arr) => line && line !== arr[i - 1]) // Remove duplicates
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

// Allow direct CLI testing: npx tsx src/processors/youtube.ts "URL"
if (process.argv[1]?.endsWith('youtube.ts') && process.argv[2]) {
  processYouTube(process.argv[2]).then((r) => console.log(JSON.stringify(r, null, 2)));
}
