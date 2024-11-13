import { ActivityType } from 'discord.js';
import { z } from 'zod';

// ————————————————————————————————————————————————————————————————————————————————
// Miscellaneous
// ————————————————————————————————————————————————————————————————————————————————

/**
 * Discord snowflake ID schema
 */
const zSnowflake = z.string().regex(/^\d{17,19}$/gm);

/**
 * Discord emoji regex.
 */

const discordEmojiRegex = z.string().regex(/<(a)?:([a-zA-Z0-9_]+):(\d{17,19})>/);

/**
 * Cron schema
 */

const zCron = z
  .string()
  .regex(
    /^(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(@every (\d+(ns|us|µs|ms|s|m|h))+)|((((\d+,)+\d+|([\d*]+[/-]\d+)|\d+|\*) ?){5,7})$/gm
  );

// ————————————————————————————————————————————————————————————————————————————————
// Global Configuration
// ————————————————————————————————————————————————————————————————————————————————

/**
 * The global configuration schema exported for parsing.
 */

export const globalConfigSchema = z.object({
  bot: z.object({
    developers: z.array(zSnowflake).default([]),
    activity: z
      .object({
        name: z.string().default('Watching messages zoom by'),
        type: z.nativeEnum(ActivityType).default(ActivityType.Custom)
      })
      .optional()
  }),

  database: z.object({
    task_runner_cron: zCron,
    report_disregard_cron: zCron,
    message_insert_cron: zCron,
    message_delete_cron: zCron,
    message_ttl: z.number().min(1000).default(86400000)
  }),
  commands: z.object({
    error_ttl: z.number().default(7500),
    reply_ttl: z.number().default(10000)
  }),
  emojis: z.object({
    error: discordEmojiRegex.min(1)
  })
});

export type GlobalConfig = z.infer<typeof globalConfigSchema>;
