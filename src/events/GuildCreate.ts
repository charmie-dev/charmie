import { Events, Listener } from '@sapphire/framework';
import { Guild } from 'discord.js';

import GuildCache from '@managers/db/GuildCache';
import Logger from '@utils/logger';

export default class GuildCreate extends Listener<typeof Events.GuildCreate> {
  private constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.GuildCreate });
  }

  public async run(guild: Guild) {
    await GuildCache.confirm(guild.id);
    Logger.info(`Guild created with name ${guild.name} and ID ${guild.id}.`);
  }
}
