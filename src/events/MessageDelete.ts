import {
  type PartialMessage,
  type Message as DiscordMessage,
  Events,
  EmbedBuilder,
  Colors,
  messageLink,
  WebhookClient,
  APIMessage,
  Snowflake
} from 'discord.js';

import DatabaseManager from '@managers/database/DatabaseManager';
import EventListener from '@managers/events/EventListener';
import { GuildConfig } from '@/utils/Types';
import { channelMentionWithId, formatMessageContentForShortLog, userMentionWithId } from '@/utils';

export default class MessageDelete extends EventListener {
  constructor() {
    super(Events.MessageDelete);
  }

  async execute(deletedMessage: DiscordMessage | PartialMessage) {
    if (!deletedMessage.inGuild()) return;

    const config = await DatabaseManager.getGuildEntry(deletedMessage.guild.id);

    if (config.messageLoggingStoreMessages) {
      await DatabaseManager.deleteMessageEntry(deletedMessage.id);
      return MessageDelete.handleEnhancedLog(deletedMessage, config);
    }

    return MessageDelete.handleNormalLog(deletedMessage, config);
  }

  public static async handleNormalLog(message: DiscordMessage<true>, config: GuildConfig): Promise<APIMessage | null> {
    if (!message.author || message.author.bot || message.webhookId) {
      return null;
    }

    const { messageLoggingEnabled, messageLoggingWebhook, messageLoggingIgnoredChannels } = config;
    const channelId = message.channel.id ?? message.channel.parent?.id ?? message.channel.parent?.parentId;

    if (!messageLoggingEnabled || !messageLoggingWebhook || messageLoggingIgnoredChannels.includes(channelId)) {
      return null;
    }

    const stickerId = message.stickers?.first()?.id ?? null;
    const reference = message.reference && (await message.fetchReference().catch(() => null));

    let embeds: EmbedBuilder[] = [];

    const embed = await MessageDelete.buildLogEmbed(
      {
        guildId: message.guildId,
        messageId: message.id,
        authorId: message.author.id,
        channelId: message.channel.id,
        stickerId,
        createdAt: message.createdAt,
        content: message.content
      },
      false
    );

    if (reference) {
      const stickerId = reference.stickers?.first()?.id ?? null;

      const embed = await MessageDelete.buildLogEmbed(
        {
          guildId: reference.guildId,
          messageId: reference.id,
          authorId: reference.author.id,
          channelId: reference.channel.id,
          stickerId,
          createdAt: reference.createdAt,
          content: reference.content
        },
        true
      );

      embeds.push(embed);
    }

    embeds.push(embed);
    return new WebhookClient({ url: messageLoggingWebhook }).send({ embeds }).catch(() => null);
  }

  public static async handleEnhancedLog(deletedMessage: DiscordMessage<true>, config: GuildConfig) {
    const message = await DatabaseManager.deleteMessageEntry(deletedMessage.id);

    if (!message) {
      return MessageDelete.handleNormalLog(deletedMessage, config);
    }

    const { messageLoggingEnabled, messageLoggingWebhook, messageLoggingIgnoredChannels } = config;
    const channelId = message.channelId ?? message.channelParentId ?? message.channelParentParentId;

    if (!messageLoggingEnabled || !messageLoggingWebhook || messageLoggingIgnoredChannels.includes(channelId)) {
      return null;
    }

    const reference = message.referenceId && (await DatabaseManager.getMessageEntry(message.referenceId));
    let embeds: EmbedBuilder[] = [];

    const embed = await MessageDelete.buildLogEmbed(
      {
        guildId: message.guildId,
        messageId: message.id,
        authorId: message.authorId,
        channelId: message.channelId,
        stickerId: message.stickerId,
        createdAt: new Date(Number(message.createdAt)),
        content: message.content
      },
      false
    );

    if (reference) {
      const embed = await MessageDelete.buildLogEmbed(
        {
          guildId: reference.guildId,
          messageId: reference.id,
          authorId: reference.authorId,
          channelId: reference.channelId,
          stickerId: reference.stickerId,
          createdAt: new Date(Number(reference.createdAt)),
          content: reference.content
        },
        true
      );

      embeds.push(embed);
    }

    embeds.push(embed);

    return new WebhookClient({ url: messageLoggingWebhook }).send({ embeds }).catch(() => null);
  }

  private static async buildLogEmbed(
    data: {
      guildId: Snowflake;
      messageId: Snowflake;
      authorId: Snowflake;
      channelId: Snowflake;
      stickerId: Snowflake | null;
      createdAt: Date;
      content: string | null;
    },
    reference: boolean
  ): Promise<EmbedBuilder> {
    const url = messageLink(data.channelId, data.messageId, data.guildId);

    const embed = new EmbedBuilder()
      .setColor(reference ? Colors.NotQuiteBlack : Colors.Red)
      .setAuthor({ name: reference ? 'Message Reference' : 'Message Deleted' })
      .setFields([
        {
          name: 'Author',
          value: userMentionWithId(data.authorId)
        },
        {
          name: 'Channel',
          value: channelMentionWithId(data.channelId)
        },
        {
          name: 'Content',
          value: await formatMessageContentForShortLog(data.content, data.stickerId, url)
        }
      ])
      .setTimestamp(data.createdAt);

    return embed;
  }
}
