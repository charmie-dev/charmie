import { Events, Guild } from 'discord.js';

import { GuildCache } from '@utils/cache';

import EventListener from '@managers/events/EventListener';
import Logger from '@utils/logger';

export default class GuildCreate extends EventListener {
  constructor() {
    super(Events.GuildCreate);
  }

  async execute(guild: Guild) {
    await GuildCache.confirm(guild.id);
    Logger.debug(`Confirmed database guild entry for guild ${guild.name} with ID ${guild.id}.`);
  }
}