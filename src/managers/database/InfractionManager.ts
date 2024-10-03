import { APIMessage, EmbedBuilder, GuildMember, Snowflake, WebhookClient, Guild, User, Colors, time } from 'discord.js';
import { Infraction, InfractionType, Prisma, Guild as Config } from '@prisma/client';

import { client, prisma } from '@/index';
import { capitalize, hierarchyCheck, userMentionWithId } from '@/utils';
import { Result } from '@/utils/types';

export default class InfractionManager {
  static async storeInfraction(data: Prisma.InfractionCreateArgs['data']): Promise<Infraction> {
    return prisma.infraction.create({ data });
  }

  static async getInfraction(options: Prisma.InfractionFindUniqueArgs): Promise<Infraction | null> {
    return prisma.infraction.findUnique({
      where: options.where,
      include: options.include
    });
  }

  static async deleteInfraction(options: Prisma.InfractionDeleteArgs): Promise<Infraction | null> {
    return prisma.infraction.delete({ where: options.where, include: options.include });
  }

  static async getActiveMute(options: { guildId: Snowflake; targetId: Snowflake }): Promise<Infraction | null> {
    return prisma.infraction.findFirst({
      where: {
        guildId: options.guildId,
        targetId: options.targetId,
        type: 'Mute'
      }
    });
  }

  static async logInfraction(data: { config: Config; infraction: Infraction }): Promise<APIMessage | null> {
    const { config, infraction } = data;

    if (!config.infractionLoggingEnabled || !config.infractionLoggingWebhook) return null;
    const webhook = new WebhookClient({ url: config.infractionLoggingWebhook });

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${infraction.type} #${infraction.id}` })
      .setColor(INFRACTION_COLORS[infraction.type])
      .setFields([
        { name: 'Executor', value: userMentionWithId(infraction.executorId) },
        { name: 'Target', value: userMentionWithId(infraction.targetId) },
        { name: 'Reason', value: infraction.reason }
      ])
      .setTimestamp(Number(infraction.createdAt));

    if (infraction.expiresAt)
      embed.addFields({
        name: 'Expiration',
        value: InfractionManager.formatExpiration(infraction.expiresAt)
      });

    return webhook.send({ embeds: [embed] }).catch(() => null);
  }

  public static async validateAction(data: {
    guild: Guild;
    target: GuildMember | User;
    executor: GuildMember;
    action: InfractionType;
  }): Promise<Result> {
    const { target, executor, action, guild } = data;
    const lAction = action.toLowerCase();

    if (executor.id === target.id) return { success: false, message: `You cannot ${lAction} yourself.` };
    if (target.id === client.user!.id) return { success: false, message: `You cannot ${lAction} me.` };

    if (target.id === guild.ownerId) return { success: false, message: `You cannot ${lAction} the server owner.` };
    if (action === InfractionType.Unban && !(await guild.bans.fetch(target.id).catch(() => null)))
      return { success: false, message: `You cannot ${lAction} someone who is not banned.` };

    if (target instanceof GuildMember) {
      if (!hierarchyCheck(executor, target))
        return { success: false, message: `You cannot ${lAction} someone with higher or equal roles than you.` };

      if (action !== InfractionType.Warn && !hierarchyCheck(guild.members.me!, target))
        return { success: false, message: `I cannot ${lAction} someone with higher or equal roles than me.` };

      if (action === InfractionType.Unmute && !target.isCommunicationDisabled())
        return { success: false, message: `You cannot ${lAction} someone who is not muted.` };

      if (target.permissions.has('Administrator') && action === 'Mute')
        return { success: false, message: `You cannot mute an administrator.` };
    }

    return { success: true };
  }

  public static async resolvePunishment(data: {
    guild: Guild;
    executor: GuildMember;
    target: GuildMember | User;
    action: Exclude<InfractionType, 'Warn'>;
    reason: string;
    duration: number | null;
  }) {
    const { guild, executor, target, action, duration, reason } = data;

    switch (action) {
      case 'Mute':
        return await (target as GuildMember).timeout(
          duration,
          InfractionManager.formatAuditLogReason(executor, action, reason)
        );

      case 'Kick':
        return await guild.members.kick(target.id, InfractionManager.formatAuditLogReason(executor, action, reason));

      case 'Ban':
        return await guild.members.ban(target.id, {
          reason: InfractionManager.formatAuditLogReason(executor, action, reason)
        });

      case 'Unban':
        return await guild.members.unban(target.id, InfractionManager.formatAuditLogReason(executor, action, reason));

      case 'Unmute':
        return await (target as GuildMember).timeout(
          null,
          InfractionManager.formatAuditLogReason(executor, action, reason)
        );
    }
  }

  private static formatAuditLogReason(
    executor: GuildMember,
    punishment: Exclude<InfractionType, 'Warn'>,
    reason: string
  ): string {
    return `[${capitalize(
      PAST_TENSE_INFRACTIONS[punishment.toLowerCase() as keyof typeof PAST_TENSE_INFRACTIONS]
    )} by ${executor.user.username} (${executor.id})] ${reason}`;
  }

  public static formatExpiration(expiration: bigint | number | null): string {
    return expiration === null
      ? 'Never'
      : `${time(Math.floor(Number(expiration) / 1000))} (${time(Math.floor(Number(expiration) / 1000), 'R')})`;
  }
}

export const PAST_TENSE_INFRACTIONS = {
  ban: 'banned',
  kick: 'kicked',
  mute: 'muted',
  warn: 'warned',
  unban: 'unbanned',
  unmute: 'unmuted'
};

export const INFRACTION_COLORS = {
  Warn: Colors.Yellow,
  Mute: 0xef975c,
  Kick: Colors.Orange,
  Ban: Colors.Red,
  Unmute: Colors.Green,
  Unban: Colors.Green
};

export const DEFAULT_INFRACTION_REASON = 'No reason provided.';