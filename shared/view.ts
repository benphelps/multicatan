// What one player is allowed to see. The server sends this; the client renders it.

import { GEO } from './board.ts';
import {
  ChatEntry, GameState, Legal, LogEntry, Score, bankRatio, canMoveShipNow, finalRanking, legalMoves,
  score,
} from './game.ts';
import {
  Building, DevCard, GameOptions, HexState, RESOURCES, ResMap, Resource, Route, TradeOffer, resTotal,
} from './types.ts';

export interface PlayerView {
  seat: number;
  name: string;
  color: string;
  isBot: boolean;
  connected: boolean;
  done: boolean;
  home: number;
  discovered: boolean; // by the viewer (always true for self)
  // Only present when discovered (or self, or game over):
  vp?: number;
  cards?: number;
  devCards?: number;
  knights?: number;
  longest?: number;
  hasLongest?: boolean;
  hasArmy?: boolean;
  islands?: number;
  score?: Score;
}

export interface MeView {
  resources: ResMap;
  devCards: DevCard[];
  deckLeft: number;
  freeBuilds: number;
  pendingDiscard: number;
  pendingGold: number;
  pendingHarbor: number;
  harbor3: boolean;
  harbor2: Resource[];
  ratios: ResMap;
  setupStep: number;
  canMoveShip: boolean;
  robberHex: number | null;
  score: Score;
}

export interface GameView {
  gameId: string;
  you: number;
  phase: GameState['phase'];
  round: number;
  rounds: number;
  dice: [number, number] | null;
  options: GameOptions;
  deadline: number | null;
  serverNow: number;
  hexes: (HexState | null)[];
  robbers: number[]; // hexes with a visible robber
  harbors: { edge: number; kind: '3:1' | '2:1' }[];
  treasures: number[]; // vertices with an unclaimed, visible treasure
  buildings: Building[];
  routes: Route[];
  players: PlayerView[];
  me: MeView;
  legal: Legal;
  trades: TradeOffer[];
  log: LogEntry[];
  chat: ChatEntry[];
  ranking?: number[];
}

export function viewFor(game: GameState, seat: number, deadline: number | null): GameView {
  const me = game.players[seat];
  const over = game.phase === 'ended';
  // Once you've discovered a settler you see everything they've explored, too.
  const sharers = [me, ...me.discovered.map((s) => game.players[s])];
  const seen = (h: number) => over || sharers.some((p) => p.revealed[h]);
  const seenAny = (hs: number[]) => hs.some(seen);

  const players: PlayerView[] = game.players.map((p) => {
    const discovered = over || p.seat === seat || me.discovered.includes(p.seat);
    const base: PlayerView = {
      seat: p.seat, name: p.name, color: p.color, isBot: p.isBot, connected: p.connected,
      done: p.done, home: p.home, discovered,
    };
    if (!discovered) return base;
    const s = score(game, p.seat);
    return {
      ...base,
      vp: over || p.seat === seat ? s.vp : s.publicVp,
      cards: resTotal(p.resources),
      devCards: p.devCards.length,
      knights: p.knights,
      longest: p.longest,
      hasLongest: game.awards.longest.includes(p.seat),
      hasArmy: game.awards.army.includes(p.seat),
      islands: p.islands.length,
      score: over || p.seat === seat ? s : undefined,
    };
  });

  const visibleRobbers = game.players
    .map((p) => p.robberHex)
    .filter((h): h is number => h !== null && seen(h));

  return {
    gameId: game.id,
    you: seat,
    phase: game.phase,
    round: game.round,
    rounds: game.options.rounds,
    dice: game.dice,
    options: game.options,
    deadline,
    serverNow: Date.now(),
    hexes: game.map.hexes.map((h, i) => (seen(i) ? h : null)),
    robbers: visibleRobbers,
    harbors: game.map.harbors.filter((h) => seenAny(GEO.edges[h.edge].hexes)),
    treasures: game.map.treasures
      .filter((t) => t.claimedBy === null && seenAny(GEO.vertices[t.vertex].hexes))
      .map((t) => t.vertex),
    buildings: Object.values(game.buildings).filter((b) => seenAny(GEO.vertices[b.vertex].hexes)),
    routes: Object.values(game.routes).filter((r) => seenAny(GEO.edges[r.edge].hexes)),
    players,
    me: {
      resources: { ...me.resources },
      devCards: me.devCards,
      deckLeft: me.devDeck.length,
      freeBuilds: me.freeBuilds,
      pendingDiscard: me.pendingDiscard,
      pendingGold: me.pendingGold,
      pendingHarbor: me.pendingHarbor,
      harbor3: me.harbor3,
      harbor2: me.harbor2,
      ratios: Object.fromEntries(RESOURCES.map((r) => [r, bankRatio(me, r)])) as ResMap,
      setupStep: me.setupStep,
      canMoveShip: canMoveShipNow(game, me),
      robberHex: me.robberHex,
      score: score(game, seat),
    },
    legal: legalMoves(game, seat),
    trades: game.trades.filter(
      (t) => t.from === seat || ((t.to === null || t.to === seat) && game.players[t.from].discovered.includes(seat)),
    ),
    log: game.log.filter((l) => l.to === null || l.to.includes(seat)).slice(-80),
    chat: game.chat.filter((c) => c.to === null || c.to === seat || c.from === seat).slice(-80),
    ranking: over ? finalRanking(game) : undefined,
  };
}
