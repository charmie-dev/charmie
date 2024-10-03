import { InteractionReplyOptions } from 'discord.js';

export type InteractionReplyData = InteractionReplyOptions &
  Partial<Record<'temporary', boolean>> &
  Partial<Record<'error', string>>;

export type Result<T = undefined> =
  | { success: false; message: string }
  | ({ success: true } & (T extends undefined ? { data?: never } : { data: T }));
