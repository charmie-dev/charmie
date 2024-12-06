import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ChatInputCommandInteraction,
  PermissionFlagsBits
} from 'discord.js';

import ms from 'ms';

import { MessageKeys, DurationKeys } from '@utils/Keys';
import { isEphemeralReply, parseDuration } from '@utils/index';
import { MAX_DURATION_STR } from '@utils/Constants';
import { InteractionReplyData, GuildConfig } from '@utils/Types';

import Command, { CommandCategory } from '@managers/commands/Command';
import InfractionManager, { DEFAULT_INFRACTION_REASON } from '@managers/database/InfractionManager';

export default class Warn extends Command {
  constructor() {
    super({
      category: CommandCategory.Moderation,
      usage: '<target> [duration] [reason]',
      data: {
        name: 'warn',
        description: 'Issue a warning to a member.',
        type: ApplicationCommandType.ChatInput,
        defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
        options: [
          {
            name: 'target',
            description: 'The member to warn.',
            type: ApplicationCommandOptionType.User,
            required: true
          },
          {
            name: 'duration',
            description: 'How long the warning should be valid for.',
            type: ApplicationCommandOptionType.String,
            required: false,
            autocomplete: true
          },
          {
            name: 'reason',
            description: 'The reason for warning the target.',
            type: ApplicationCommandOptionType.String,
            required: false,
            max_length: 1024
          }
        ]
      }
    });
  }

  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
    config: GuildConfig
  ): Promise<InteractionReplyData> {
    const target = interaction.options.getMember('target');
    const rawDuration = interaction.options.getString('duration', false);
    const rawReason = interaction.options.getString('reason', false);
    const reason = rawReason ?? DEFAULT_INFRACTION_REASON;

    if (!target) {
      return {
        error: MessageKeys.Errors.MemberNotFound,
        temporary: true
      };
    }

    const vResult = InfractionManager.validateAction({
      config,
      guild: interaction.guild,
      target,
      executor: interaction.member,
      action: 'Warn',
      reason: rawReason
    });

    if (!vResult.success) {
      return {
        error: vResult.message,
        temporary: true
      };
    }

    const duration = rawDuration ? parseDuration(rawDuration) : null;

    if (Number.isNaN(duration) && !DurationKeys.Permanent.includes(rawDuration?.toLowerCase() ?? '')) {
      return {
        error: MessageKeys.Errors.InvalidDuration(),
        temporary: true
      };
    }

    if (duration) {
      if (duration < 1000) {
        return {
          error: MessageKeys.Errors.DurationTooShort('1 second'),
          temporary: true
        };
      }

      if (duration > ms(MAX_DURATION_STR)) {
        return {
          error: MessageKeys.Errors.DurationTooLong('5 years'),
          temporary: true
        };
      }
    }

    let expires_at: number | null = null;

    await interaction.deferReply({ ephemeral: isEphemeralReply(interaction, config) });

    const created_at = Date.now();

    if (duration) {
      expires_at = created_at + duration;
    } else if (
      !DurationKeys.Permanent.includes(rawDuration?.toLowerCase() ?? '') &&
      config.default_warn_duration !== 0n
    ) {
      expires_at = created_at + Number(config.default_warn_duration);
    }

    const infraction = await InfractionManager.storeInfraction({
      id: InfractionManager.generateInfractionId(),
      guild_id: interaction.guildId,
      target_id: target.id,
      executor_id: interaction.user.id,
      type: 'Warn',
      reason,
      created_at,
      expires_at
    });

    await InfractionManager.sendNotificationDM({ config, guild: interaction.guild, target, infraction });
    await InfractionManager.logInfraction({ config, infraction });

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
