import { Bot } from 'grammy';
import { config } from '../config.js';
import { handleMessage } from './handlers.js';
import { logger } from '../utils/logger.js';

const bot = new Bot(config.telegram.botToken);
const allowedUserId = Number(config.telegram.allowedUserId);

// Security: reject all messages not from the allowed user
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== allowedUserId) {
    // Silent drop — no response, no logging of who tried
    return;
  }
  await next();
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;

  try {
    const reply = await handleMessage(text);
    await ctx.reply(reply);
  } catch (err) {
    logger.error(`Handler error: ${err instanceof Error ? err.message : String(err)}`);
    await ctx.reply('Something went wrong processing that link. Check the logs.');
  }
});

bot.catch((err) => {
  logger.error(`Bot error: ${err.message}`);
});

logger.info('Starting Telegram content-drop bot...');
bot.start();
