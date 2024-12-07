import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ChatInputCommandInteraction,
  PermissionFlagsBits
} from 'discord.js';
import ms from 'ms';

import { InteractionReplyData, GuildConfig } from '@utils/Types';
import { isEphemeralReply, parseDuration } from '@utils/index';
import { MessageKeys } from '@utils/Keys';

import Command, { CommandCategory } from '@managers/commands/Command';
import InfractionManager, { DEFAULT_INFRACTION_REASON } from '@managers/database/InfractionManager';
import TaskManager from '@managers/database/TaskManager';

export default class Mute extends Command {
  constructor() {
    super({
      category: CommandCategory.Moderation,
      requiredPermissions: PermissionFlagsBits.ModerateMembers,
      usage: '<target> [duration] [reason]',
      data: {
        name: 'mute',
        description: 'Mute a member in the server.',
        type: ApplicationCommandType.ChatInput,
        defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
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
            required: false,
            autocomplete: true
          },
          {
            name: 'reason',
            description: 'The reason for muting the target.',
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
      action: 'Mute',
      reason: rawReason
    });

    if (!vResult.success) {
      return {
        error: vResult.message,
        temporary: true
      };
    }

    let duration = parseDuration(rawDuration);

    if (Number.isNaN(duration) && config.default_mute_duration === 0n) {
      return {
        error: MessageKeys.Errors.InvalidDuration(false),
        temporary: true
      };
    }

    if (duration < 1000) {
      return {
        error: MessageKeys.Errors.DurationTooShort('1 second'),
        temporary: true
      };
    }

    if (duration > ms('28d')) {
      return {
        error: MessageKeys.Errors.DurationTooLong('28 days'),
        temporary: true
      };
    }

    let expires_at: number | null;

    await interaction.deferReply({ ephemeral: isEphemeralReply(interaction, config) });

    let mResult = true;
    if (!duration) duration = Number(config.default_mute_duration);

    await InfractionManager.resolvePunishment({
      guild: interaction.guild,
      executor: interaction.member,
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

    const created_at = Date.now();

    if (duration) {
      expires_at = created_at + duration;
    } else {
      expires_at = created_at + Number(config.default_mute_duration);
    }

    const infraction = await InfractionManager.storeInfraction({
      id: InfractionManager.generateInfractionId(),
      guild_id: interaction.guildId,
      target_id: target.id,
      executor_id: interaction.user.id,
      type: 'Mute',
      created_at,
      expires_at,
      reason
    });

    await Promise.all([
      TaskManager.storeTask({
        guild_id: interaction.guildId,
        target_id: target.id,
        infraction_id: infraction.id,
        expires_at,
        type: 'Mute'
      }),
      InfractionManager.sendNotificationDM({ config, guild: interaction.guild, target, infraction }),
      InfractionManager.logInfraction({ config, infraction })
    ]);

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
