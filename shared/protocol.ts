import type { Action } from './game.ts';
import type { GameOptions } from './types.ts';
import type { GameView } from './view.ts';

export type ClientMsg =
  | { t: 'create'; token: string; name: string }
  | { t: 'join'; token: string; name: string; room: string }
  | { t: 'leave' }
  | { t: 'setOptions'; options: Partial<GameOptions> }
  | { t: 'addBot' }
  | { t: 'removeSeat'; index: number }
  | { t: 'start' }
  | { t: 'action'; action: Action }
  | { t: 'chat'; text: string; to: number | null };

export interface LobbySeat {
  name: string;
  isBot: boolean;
  connected: boolean;
  isHost: boolean;
  isYou: boolean;
}
export interface LobbyView {
  code: string;
  seats: LobbySeat[];
  options: GameOptions;
  isHost: boolean;
  chat: { name: string; text: string }[];
}

export type ServerMsg =
  | { t: 'lobby'; lobby: LobbyView }
  | { t: 'game'; view: GameView }
  | { t: 'left' }
  | { t: 'error'; message: string };

export const MAX_PLAYERS = 6;
