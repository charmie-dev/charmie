import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ChatInputCommandInteraction,
  PermissionFlagsBits
} from 'discord.js';

import { MessageKeys } from '@utils/Keys';
import { InteractionReplyData, GuildConfig } from '@utils/Types';

import Command, { CommandCategory } from '@managers/commands/Command';
import InfractionManager, { DEFAULT_INFRACTION_REASON } from '@managers/database/InfractionManager';
import TaskManager from '@managers/database/TaskManager';

export default class Unban extends Command {
  constructor() {
    super({
      category: CommandCategory.Moderation,
      requiredPermissions: PermissionFlagsBits.BanMembers,
      usage: '<target> [reason]',
      data: {
        name: 'unban',
        description: 'Unban a user from the server.',
        defaultMemberPermissions: PermissionFlagsBits.BanMembers,
        type: ApplicationCommandType.ChatInput,
        options: [
          {
            name: 'target',
            description: 'The user to unban.',
            type: ApplicationCommandOptionType.User,
            required: true
          },
          {
            name: 'reason',
            description: 'The reason for unbanning the target.',
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
    config: GuildConfig,
    ephemeral: boolean
  ): Promise<InteractionReplyData> {
    const target = interaction.options.getUser('target');
    const rawReason = interaction.options.getString('reason', false);

    if (!target) {
      return {
        error: MessageKeys.Errors.TargetNotFound,
        temporary: true
      };
    }

    const vResult = InfractionManager.validateAction({
      config,
      guild: interaction.guild,
      target,
      executor: interaction.member,
      action: 'Unban',
      reason: rawReason
    });

    if (!vResult.success) {
      return {
        error: vResult.message,
        temporary: true
      };
    }

    if (!(await interaction.guild.bans.fetch(target.id).catch(() => null))) {
      return {
        error: 'You cannot unban someone who is not banned.',
        temporary: true
      };
    }

    const createdAt = Date.now();
    const reason = rawReason ?? DEFAULT_INFRACTION_REASON;

    await interaction.deferReply({ ephemeral });

    let uResult = true;

    const infraction = await InfractionManager.storeInfraction({
      id: InfractionManager.generateInfractionId(),
      guildId: interaction.guildId,
      targetId: target.id,
      executorId: interaction.user.id,
      type: 'Unban',
      reason,
      createdAt
    });

    await InfractionManager.resolvePunishment({
      guild: interaction.guild,
      executor: interaction.member,
      target,
      reason,
      action: 'Unban',
      duration: null
    }).catch(() => {
      uResult = false;
    });

    if (!uResult) {
      await InfractionManager.deleteInfraction({ id: infraction.id });
      return {
        error: MessageKeys.Errors.PunishmentFailed('Unban', target),
        temporary: true
      };
    }

    await TaskManager.deleteTask({
      targetId_guildId_type: { guildId: interaction.guildId, targetId: target.id, type: 'Ban' }
    });

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
