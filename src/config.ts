import 'dotenv/config';

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const config = {
  mc: {
    apiUrl: required('MC_API_URL'),
    apiToken: required('MC_API_TOKEN'),
  },
  telegram: {
    botToken: required('TELEGRAM_BOT_TOKEN'),
    allowedUserId: required('TELEGRAM_ALLOWED_USER_ID'),
  },
  youtube: {
    apiKey: optional('YOUTUBE_API_KEY'),
  },
  instagram: {
    accessToken: optional('INSTAGRAM_ACCESS_TOKEN'),
    userId: optional('INSTAGRAM_USER_ID'),
  },
  tiktok: {
    accessToken: optional('TIKTOK_ACCESS_TOKEN'),
  },
  apify: {
    apiToken: optional('APIFY_API_TOKEN'),
  },
} as const;
