import { InteractionReplyOptions } from 'discord.js';
import { Guild, Prisma } from '@prisma/client';

export type InteractionReplyData = InteractionReplyOptions &
  Partial<Record<'temporary', boolean>> &
  Partial<Record<'error', string>>;

export type Result<T = undefined> =
  | { success: false; message: string }
  | ({ success: true } & (T extends undefined ? { data?: never } : { data: T }));

export type GuildConfig = Prisma.GuildGetPayload<{
  include: {
    permissions: true;
    infractions: true;
    tasks: true;
    muteRequests: true;
    banRequests: true;
    userReports: true;
    messageReports: true;
  };
}>;
