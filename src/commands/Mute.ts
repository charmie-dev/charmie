import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ChatInputCommandInteraction,
  PermissionFlagsBits
} from 'discord.js';
import { Guild as Config } from '@prisma/client';

import ms from 'ms';

import { InteractionReplyData } from '@/utils/Types';
import { parseDuration } from '@utils/index';

import Command, { CommandCategory } from '@/managers/commands/Command';
import InfractionManager, { DEFAULT_INFRACTION_REASON } from '@/managers/database/InfractionManager';
import TaskManager from '@/managers/database/TaskManager';

export default class Mute extends Command<ChatInputCommandInteraction<'cached'>> {
  constructor() {
    super({
      category: CommandCategory.Moderation,
      requiredPermissions: PermissionFlagsBits.ModerateMembers,
      usage: '<target> <duration> [reason]',
      data: {
        name: 'mute',
        description: 'Mute a member in the server.',
        type: ApplicationCommandType.ChatInput,
        options: [
          {
            name: 'target',
            description: 'The member to mute.',
            type: ApplicationCommandOptionType.User,
            required: true
          },
          {
            name: 'duration',
            description: 'The duration of the mute.',
            type: ApplicationCommandOptionType.String,
            required: true
          },
          {
            name: 'reason',
            description: 'The reason for muting the target.',
            type: ApplicationCommandOptionType.String,
            required: false,
            max_length: 1000
          }
        ]
      }
    });
  }

  async execute(interaction: ChatInputCommandInteraction<'cached'>, config: Config): Promise<InteractionReplyData> {
    const target = interaction.options.getMember('target');
    const rawDuration = interaction.options.getString('duration', true);
    const rawReason = interaction.options.getString('reason', false);

    if (!target) {
      return {
        error: 'The provided user is not a member of this server.',
        temporary: true
      };
    }

    const vResult = await InfractionManager.validateAction({
      guild: interaction.guild,
      target,
      executor: interaction.member!,
      action: 'Mute'
    });

    if (!vResult.success) {
      return {
        error: vResult.message,
        temporary: true
      };
    }

    const duration = parseDuration(rawDuration);

    if (!duration) {
      return {
        error: 'Invalid duration. The valid format is `<number>[s/m/h/d]` (`<number> [second/minute/hour/day]`).',
        temporary: true
      };
    }

    if (duration < 1000) {
      return {
        error: 'The duration must be at least 1 second.',
        temporary: true
      };
    }

    if (duration > ms('28d')) {
      return {
        error: 'The duration must not exceed 28 days.',
        temporary: true
      };
    }

    const createdAt = Date.now();
    const expiresAt = createdAt + duration;
    const reason = rawReason ?? DEFAULT_INFRACTION_REASON;

    await interaction.deferReply({ ephemeral: true });

    let mResult = true;

    await InfractionManager.resolvePunishment({
      guild: interaction.guild,
      executor: interaction.member!,
      target,
      action: 'Mute',
      reason,
      duration
    }).catch(() => {
      mResult = false;
    });

    if (!mResult) {
      return {
        error: `Failed to mute ${target}; ensure the duration is correct and does not exceed 28 days.`
      };
    }

    const infraction = await InfractionManager.storeInfraction({
      guildId: interaction.guildId,
      targetId: target.id,
      executorId: interaction.user.id,
      type: 'Mute',
      createdAt,
      expiresAt,
      reason
    });

    await TaskManager.storeTask({
      guildId: interaction.guildId,
      targetId: target.id,
      infractionId: infraction.id,
      expiresAt,
      type: 'Mute'
    });

    InfractionManager.sendNotificationDM({ guild: interaction.guild, config, target, infraction });
    InfractionManager.logInfraction({ config, infraction });

    return {
      embeds: [
        {
          description: InfractionManager.getSuccessMessage({ target, infraction }),
          color: InfractionManager.mapActionToColor({ infraction })
        }
      ]
    };
  }
}
