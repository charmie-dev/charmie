import {
  AutocompleteInteraction,
  codeBlock,
  Colors,
  CommandInteraction,
  escapeCodeBlock,
  GuildMember,
  hyperlink,
  Interaction,
  InteractionReplyOptions,
  Snowflake,
  SnowflakeUtil,
  StickerFormatType
} from 'discord.js';
import { PermissionEnum } from '@prisma/client';

import YAML from 'yaml';
import fs from 'fs';
import ms from 'ms';

import { client } from '..';
import { EMPTY_MESSAGE_CONTENT } from './Constants';
import { GuildConfig, InteractionReplyData } from './Types';
import { ComponentInteraction } from '@managers/components/Component';

import ConfigManager from '@managers/config/ConfigManager';

/**
 * Pluralizes a word based on the given count
 *
 * @param count - The count used to determine the plural form
 * @param singular - The singular form of the word
 * @param plural - The plural form of the word, defaults to `{singular}s`
 * @returns The pluralized word
 */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/**
 * Wait a certain amount of time before proceeding with the next step
 *
 * @param ms The amount of time to wait in milliseconds
 * @returns A promise that resolves after the specified time has elapsed
 */

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Reads a YAML file from the given path and returns the parsed content.
 *
 * @param path - The path to the YAML file.
 * @template T - The type of the parsed content.
 * @returns {T} The parsed content of the YAML file.
 */
export function readYamlFile<T>(path: string): T {
  const raw = fs.readFileSync(path, 'utf-8');
  return YAML.parse(raw);
}

/**
 * Uploads data to hastebin.
 *
 * @param data - The data to upload
 * @param ext - The extension of the file (by default .js)
 * @returns string - The url of the document
 */

export async function uploadData(data: any, ext: string = 'js'): Promise<string> {
  const binReq = await fetch('https://hst.sh/documents', {
    method: 'POST',
    body: typeof data === 'object' ? JSON.stringify(data, null, 2) : data
  });

  if (!binReq.ok) throw `Error uploading to hastebin. Status code \`${binReq.status}\`.`;
  const bin = (await binReq.json()) as { key: string };
  return `https://hst.sh/${bin.key}.${ext}`;
}

/**
 * Converts a { Snowflake } to a formatted string with the format <@${Snowflake}}> (\`${Snowflake}\`).
 *
 * @param id - The user id to format
 * @returns string - The formatted string
 */

export function userMentionWithId(id: Snowflake): `<@${Snowflake}> (\`${Snowflake}\`)` {
  return `<@${id}> (\`${id}\`)`;
}

/**
 * Check if a member has a higher role than another member.
 *
 * @param executor The executor
 * @param target The target
 * @returns boolean (Whether the executor has a higher role than the target)
 */

export function hierarchyCheck(executor: GuildMember, target: GuildMember): boolean {
  if (executor.guild.ownerId === executor.id) return true;
  if (target.guild.ownerId === target.id) return false;
  return executor.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

/**
 * Capitalize the first letter of a string.
 *
 * @param str The string to capitalize
 * @returns The capitalized string
 */

export function capitalize(str: string): string {
  if (str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Parse a duration string into a number of milliseconds.
 *
 * @param durationStr The duration string to parse
 * @returns The duration in milliseconds
 */

export function parseDuration(durationStr: string | null): number {
  if (durationStr === null) return NaN;

  const numericValue = Number(durationStr);

  if (!isNaN(numericValue)) return numericValue * 1000;
  return ms(durationStr) ?? NaN;
}

/**
 * Crops a string if it exceeds the given length
 *
 * @param str - The string to crop
 * @param maxLength - The maximum length of the string
 * @returns The cropped string (if it exceeds the maximum length)
 */
export function elipsify(str: string, maxLength: number): string {
  if (str.length > maxLength) {
    const croppedStr = str.slice(0, maxLength - 23);
    return `${croppedStr}…(${str.length - croppedStr.length} more characters)`;
  }

  return str;
}

/**
 * Crops a string to a maximum number of lines.
 *
 * - Appends the number of lines cropped if the string exceeds the maximum number of lines.
 *
 * @param str - The string to crop
 * @param maxLines - The maximum number of lines to keep
 * @returns The cropped string
 */
export function cropLines(str: string, maxLines: number): string {
  const lines = str.split('\n');
  const diff = lines.length - maxLines;

  if (diff > 0) {
    const croppedLines = lines.slice(0, maxLines - 1);
    croppedLines.push(`(${diff} more ${pluralize(diff, 'line')})`);

    return croppedLines.join('\n');
  }

  return str;
}

export async function formatMessageContentForShortLog(
  content: string | null,
  stickerId: string | null,
  url: string | null
): Promise<string> {
  let rawContent = url ? hyperlink('Jump to message', url) : '';

  if (stickerId) {
    const sticker = await client.fetchSticker(stickerId);

    if (sticker.format !== StickerFormatType.Lottie) {
      rawContent += ` \`|\` ${hyperlink(`Sticker: ${sticker.name}`, sticker.url)}`;
    } else {
      rawContent += ` \`|\` Lottie Sticker: ${sticker.name}`;
    }
  }

  if (content) {
    // Escape code blocks
    content = escapeCodeBlock(content);
    // Truncate the content if it's too long (account for the formatting characters)
    content = elipsify(content, 1024 - rawContent.length - 6);
  } else {
    content = EMPTY_MESSAGE_CONTENT;
  }

  return rawContent + codeBlock(content);
}

/**
 * Checks if a member has a specific permission.
 * @param member The member to check
 * @param config The guild config ( with permissions )
 * @param permission The permission to check for
 */
export function hasPermission(member: GuildMember, config: GuildConfig, permission: PermissionEnum): boolean {
  return member.roles.cache.some(role => {
    return config.permissions.some(permissions => {
      return permissions.roleIds.includes(role.id) && permissions.permissions.includes(permission);
    });
  });
}

/**
 * Handle replying for interaction
 *
 * @param interaction The interaction to reply to
 * @param options The options to reply with
 */

export function handleInteractionReply(
  interaction: ComponentInteraction | CommandInteraction,
  options: InteractionReplyOptions
): unknown {
  const { ephemeral, ...parsedOptions } = options;

  return !interaction.deferred && !interaction.replied
    ? interaction.reply(options).catch(() => {})
    : interaction.editReply({ ...parsedOptions }).catch(() => {});
}

/**
 * Reply with an error message to an interaction
 *
 * @param data The data for the error
 * @returns unknown
 */

export function handleInteractionErrorReply(data: {
  interaction: ComponentInteraction | CommandInteraction;
  error: string;
}): unknown {
  const { interaction, error } = data;

  return handleInteractionReply(interaction, {
    embeds: [{ description: `${ConfigManager.global_config.emojis.error} ${error}`, color: Colors.NotQuiteBlack }],
    ephemeral: true
  });
}

/**
 * Get the TTL for the interaction reply.
 *
 * @param interaction The interaction to get the TTL for
 * @param config The guild configuration
 * @param options The reply options
 * @returns The TTL for the interaction reply
 */

export function getInteractionTTL(
  interaction: Exclude<Interaction, AutocompleteInteraction> | CommandInteraction,
  config: GuildConfig,
  options: InteractionReplyData
): number {
  if (interaction.isCommand()) {
    return options.temporary ? config.commandTemporaryReplyTTL : config.commandErrorTTL;
  } else {
    return options.temporary ? config.componentTemporaryReplyTTL : config.componentErrorTTL;
  }
}

/**
 * Generate a discord Snowflake ID based on the current time.
 * @returns Generated Snowflake
 */

export function generateSnowflakeId(): string {
  const currentDate = new Date();
  return String(SnowflakeUtil.generate({ timestamp: currentDate.getTime() }));
}
