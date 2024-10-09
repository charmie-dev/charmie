import { Guild } from '@prisma/client';
import { Collection } from 'discord.js';

import { prisma } from '@/index';

export default class CacheManager {
  /**
   * Collection cache for guilds to avoid database queries.
   */

  private static guild_cache = new Collection<string, Guild>();

  /**
   * Guild cache methods.
   */

  static guilds = {
    /**
     * Retrieves the guild model for the specified guild from the database.
     *
     * @param guildId - The ID of the guild
     * @returns Guild - The guild model
     */

    async get(guildId: string): Promise<Guild> {
      if (CacheManager.guild_cache.has(guildId)) return CacheManager.guild_cache.get(guildId)!;
      return this.confirm(guildId);
    },

    /**
     * Confirms that the guild is in the database.
     *
     * @param guildId - The ID of the guild
     * @returns Guild - The guild model
     */

    async confirm(guildId: string): Promise<Guild> {
      const guild = await prisma.guild.findUnique({
        where: {
          id: guildId
        }
      });

      if (guild) {
        CacheManager.guild_cache.set(guildId, guild);
        return guild;
      }

      return this._create(guildId);
    },

    /**
     * Creates a new guild and caches it.
     *
     * @param guildId - The ID of the guild to create
     * @returns Guild - The created guild
     */

    async _create(guildId: string): Promise<Guild> {
      const guild = await prisma.guild.create({
        data: { id: guildId }
      });

      CacheManager.guild_cache.set(guildId, guild);
      return guild;
    },

    /**
     * Removes a guild from the cache (most likely due to an update or deletion).
     *
     * @param guildId - The ID of the guild to remove
     * @returns boolean - If the guild was present in the cache and is now wiped
     */

    free(guildId: string): boolean {
      return CacheManager.guild_cache.delete(guildId);
    },

    /**
     * Removes all guilds from the cache.
     */

    freeAll(): void {
      return CacheManager.guild_cache.clear();
    }
  };
}
