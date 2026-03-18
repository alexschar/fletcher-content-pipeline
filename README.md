# Fletcher Content Pipeline

A host-side content ingestion and social media metrics service for the [Fletcher multi-agent system](https://github.com/alexschar/fletcher-mission-control-live). Drop a link in Telegram — YouTube, TikTok, Instagram, Twitter, or any webpage — and the pipeline extracts transcripts, captions, and metadata, then delivers processed content to your AI agents via [Mission Control](https://github.com/alexschar/fletcher-mission-control).

## Architecture

This service runs on the **host machine** (Mac Mini), not inside the agent VM. This is a deliberate security boundary — all API tokens and credentials stay on the host. The AI agents inside the VM only read processed text and JSON through the Mission Control API. They never access external services directly.

```
You drop a link in Telegram
  → Telegram Bot catches the URL
  → Content Processor extracts transcript/caption/content
  → POSTs processed data to Mission Control API
  → Agents read from Mission Control on their heartbeat cycle

Social Metrics Poller (daily cron)
  → Pulls metrics from YouTube, Instagram, TikTok
  → POSTs snapshots to Mission Control API
  → Agents track trends and alert on significant changes
```

## Related Repositories

| Repo | Purpose |
|---|---|
| [fletcher-mission-control-live](https://github.com/alexschar/fletcher-mission-control-live) | Production Mission Control deployment on Vercel — the API this pipeline POSTs to |
| [fletcher-mission-control](https://github.com/alexschar/fletcher-mission-control) | Mission Control source — Next.js dashboard with task board, cost tracking, reports, and content pipeline endpoints |

## Components

### Telegram Link Drop Bot

A Telegram bot that listens for URLs from a single authorized user. When a link is received, it detects the platform, routes to the appropriate processor, extracts content, and POSTs the result to Mission Control.

Supported platforms:
- **YouTube** — full transcript extraction via yt-dlp (auto-generated subtitles), plus title, description, duration, view count
- **TikTok** — caption and metadata via oEmbed, with Apify fallback for richer data
- **Instagram** — post caption and metadata via oEmbed, with Apify fallback
- **Twitter/X** — tweet text via oEmbed
- **Web** — article extraction via Mozilla Readability (any URL)

### Social Metrics Poller

A scheduled job that pulls follower counts, engagement rates, video performance, and other metrics from social media platforms. Runs on a daily cron and POSTs snapshots to Mission Control, where agents can read trends and generate alerts.

Supported platforms:
- **YouTube** — subscribers, total views, video count, recent video performance (requires YouTube Data API v3 key)
- **Instagram** — followers, media count, engagement rate (requires Apify token or Instagram Graph API token)
- **TikTok** — followers, total likes, video count, top video performance (requires Apify token)

## Prerequisites

### System Dependencies

```bash
# Node.js 20+
node --version

# yt-dlp (required for YouTube transcript extraction)
brew install yt-dlp

# Verify yt-dlp is available
yt-dlp --version
```

### API Keys and Tokens

| Token | Required | Purpose | How to Get |
|---|---|---|---|
| Telegram Bot Token | Yes | Content drop bot | Create a bot via [@BotFather](https://t.me/BotFather) on Telegram |
| Telegram User ID | Yes | Restrict bot to your account only | Send a message to [@userinfobot](https://t.me/userinfobot) |
| YouTube Data API v3 Key | For YouTube metrics | Channel subscriber/view counts | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — restrict to YouTube Data API v3 only |
| Apify API Token | For TikTok + Instagram | Social metrics + content fallback | [apify.com](https://apify.com) — free tier available |
| Instagram Graph API Token | Optional | Official Instagram metrics | [Facebook Developer Console](https://developers.facebook.com) — requires Business/Creator account |
| Mission Control API Token | Yes | POST data to Mission Control | Set in your Mission Control deployment |

### Mission Control Setup

This pipeline requires the content pipeline endpoints in your Mission Control deployment. If you haven't set these up yet, apply the following Supabase migration in your Mission Control project's SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS content_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok', 'instagram', 'twitter', 'web', 'other')),
  content_type TEXT NOT NULL CHECK (content_type IN ('transcript', 'caption', 'article', 'post', 'other')),
  title TEXT,
  raw_content TEXT NOT NULL,
  summary TEXT,
  topics TEXT[],
  relevant_agents TEXT[],
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok', 'instagram', 'twitter')),
  metric_type TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  previous_value NUMERIC,
  delta NUMERIC,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_drops_created_idx ON content_drops(created_at DESC);
CREATE INDEX IF NOT EXISTS content_drops_platform_idx ON content_drops(platform);
CREATE INDEX IF NOT EXISTS content_drops_processed_idx ON content_drops(processed);
CREATE INDEX IF NOT EXISTS social_metrics_platform_date_idx ON social_metrics(platform, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS social_metrics_type_idx ON social_metrics(metric_type);

ALTER TABLE content_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON content_drops FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON social_metrics FOR ALL USING (true) WITH CHECK (true);
```

## Installation

```bash
git clone https://github.com/alexschar/fletcher-content-pipeline.git
cd fletcher-content-pipeline
npm install
```

## Configuration

```bash
cp .env.example .env
```

Edit `.env` with your tokens:

```env
# Mission Control
MC_API_URL=https://fletcher-mission-control-live.vercel.app
MC_API_TOKEN=your_mission_control_token

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_ALLOWED_USER_ID=your_telegram_user_id

# YouTube
YOUTUBE_API_KEY=your_youtube_data_api_v3_key
YOUTUBE_CHANNEL_ID=UCxxxxxxxx

# Social Metrics (Apify — covers Instagram + TikTok)
APIFY_API_TOKEN=your_apify_token
TIKTOK_USERNAME=your_tiktok_handle

# Instagram (optional — use Apify fallback if not available)
# INSTAGRAM_ACCESS_TOKEN=your_instagram_graph_api_token
# INSTAGRAM_USER_ID=your_instagram_business_account_id
```

**Security**: `.env` is gitignored and must never be committed. The Telegram bot silently drops all messages from user IDs other than `TELEGRAM_ALLOWED_USER_ID`.

## Usage

### Build

```bash
npm run build
```

### Run the Telegram Bot

```bash
# Development (with auto-reload)
npm run dev:bot

# Production (background process)
nohup npm run dev:bot >> /path/to/logs/content-bot.log 2>&1 &
```

Send any supported URL to your Telegram bot. It will reply with a confirmation showing the title and content length.

### Run the Social Metrics Poller

```bash
# One-shot (manual or cron)
npm run dev:poller
```

The poller checks which platform tokens are configured in `.env` and only fetches metrics for those platforms.

### Cron Setup

Add to your host machine's crontab (`crontab -e`):

```cron
# Social metrics poller — daily at 7 AM
0 7 * * * cd /path/to/fletcher-content-pipeline && node dist/poller/index.js >> /path/to/logs/social-poller.log 2>&1
```

## API Endpoints

This pipeline POSTs to the following Mission Control endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/content-drops` | Create a new content drop (transcript, caption, article) |
| GET | `/api/content-drops` | List recent content drops |
| PATCH | `/api/content-drops/:id` | Update a drop (mark processed, add summary) |
| POST | `/api/social-metrics` | Submit a batch of platform metrics |
| GET | `/api/social-metrics` | Query metrics with filters |
| GET | `/api/content-pipeline/summary` | Human-readable summary for agent heartbeats |

## Error Handling

- If a transcript or content extraction fails, the pipeline still POSTs to Mission Control with the error noted — agents see the failure and can ask for context.
- If Mission Control is unreachable, requests are retried 3 times with exponential backoff, then saved to a local `.pending/` directory for manual retry.
- The bot never crashes on a single failed extraction — it logs the error and continues listening.

## Security

- All API tokens live in `.env` on the host machine only — never inside the agent VM
- The Telegram bot rejects all messages from unauthorized user IDs (silent drop, no response)
- yt-dlp runs with `--no-exec` to prevent post-processing script execution
- Web processor only follows HTTPS URLs
- All external API calls have 30-second timeouts
- The bot extracts text content only — it never executes code from fetched URLs
- Rate limiting: max 10 content drops per hour, max 1 poller run per hour

## Part of the Fletcher System

This pipeline is one component of a three-agent AI system:

- **Fletcher** (governance) — Claude Sonnet, policy authority and weekly calibrator
- **Sawyer** (operations) — GPT-5.4, daily operator and task dispatcher
- **Celeste** (execution) — GPT-5.4 via Codex OAuth, builder and implementation specialist

The agents run inside an isolated VM on a Mac Mini M4 via [OpenClaw](https://openclaw.ai). This content pipeline runs on the host, outside the VM, feeding processed data to the agents through Mission Control. The agents never access external services directly — this separation is a core security principle of the system.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
