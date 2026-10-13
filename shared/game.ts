// Authoritative Multicatan rules engine. Pure state + mutation; no timers or I/O.
// The server owns timing (round timer, auto-roll) and calls into this module.

import { GEO, hexesWithin } from './board.ts';
import { GameMap, generateMap, homeOrder } from './mapgen.ts';
import { Rng } from './rng.ts';
import {
  Building, COSTS, DEFAULT_OPTIONS, DevCard, DevKind, GameOptions, IslandId, PLAYER_COLORS,
  RESOURCES, ResMap, Resource, Route, TERRAIN_RESOURCE, TradeOffer, addRes, emptyRes, hasRes,
  resTotal,
} from './types.ts';

export const MAX_SETTLEMENTS = 5;
export const MIN_LONGEST_ROUTE = 5;
export const MIN_LARGEST_ARMY = 3;
/** Placing a piece uncovers only the hexes it touches. */
export const REVEAL_RADIUS = 0;
/** At the start you can see your home island and the water touching it. */
export const HOME_REVEAL_RADIUS = 1;
export const SHIP_MOVE_INTERVAL = 2;
export const SETUP_DONE = 5;

export interface PlayerState {
  seat: number;
  home: number; // home island index 0..5
  name: string;
  token: string;
  color: string;
  isBot: boolean;
  connected: boolean;
  resources: ResMap;
  devCards: DevCard[];
  devDeck: DevKind[];
  knights: number;
  freeBuilds: number;
  pendingGold: number;
  pendingHarbor: number;
  pendingDiscard: number;
  harbor3: boolean;
  harbor2: Resource[];
  done: boolean;
  setupStep: number; // 0 settle, 1 route, 2 settle, 3 route, 4 pick city, 5 done
  setupLastVertex: number | null;
  lastShipMove: number;
  revealed: boolean[];
  discovered: number[];
  islands: IslandId[];
  robberHex: number | null;
  longest: number;
}

export interface LogEntry {
  id: number;
  round: number;
  text: string;
  to: number[] | null; // null = everyone
}
export interface ChatEntry {
  id: number;
  from: number;
  to: number | null;
  text: string;
}

export interface GameState {
  id: string;
  rngState: number;
  options: GameOptions;
  phase: 'setup' | 'playing' | 'ended';
  round: number;
  dice: [number, number] | null;
  map: GameMap;
  players: PlayerState[];
  buildings: Record<number, Building>;
  routes: Record<number, Route>;
  trades: TradeOffer[];
  nextId: number;
  log: LogEntry[];
  chat: ChatEntry[];
  awards: { longest: number[]; army: number[] };
}

export type Action =
  | { type: 'setupSettlement'; vertex: number }
  | { type: 'setupRoute'; edge: number; kind: 'road' | 'ship' }
  | { type: 'setupCity'; vertex: number }
  | { type: 'buildSettlement'; vertex: number }
  | { type: 'buildCity'; vertex: number }
  | { type: 'buildRoute'; edge: number; kind: 'road' | 'ship' }
  | { type: 'moveShip'; from: number; to: number }
  | { type: 'buyDev' }
  | { type: 'playKnight'; choice?: [Resource, Resource] }
  | { type: 'playRoadBuilding' }
  | { type: 'bankTrade'; give: Resource; get: Resource; count?: number }
  | { type: 'offerTrade'; to: number | null; give: ResMap; want: ResMap }
  | { type: 'cancelTrade'; id: number }
  | { type: 'acceptTrade'; id: number }
  | { type: 'declineTrade'; id: number }
  | { type: 'confirmTrade'; id: number; with: number }
  | { type: 'discard'; res: ResMap }
  | { type: 'chooseGold'; res: [Resource, Resource] }
  | { type: 'chooseHarbor'; res: Resource }
  | { type: 'endTurn' };

export interface NewPlayer {
  name: string;
  token: string;
  isBot: boolean;
}

// ---------- creation ----------

export function createGame(id: string, newPlayers: NewPlayer[], options: Partial<GameOptions>, seed: number): GameState {
  const rng = new Rng(seed);
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const map = generateMap(rng, opts.layout);
  const homes = homeOrder(newPlayers.length);
  const players: PlayerState[] = newPlayers.map((np, seat) => {
    const deck: DevKind[] = [
      ...Array<DevKind>(15).fill('knight'),
      ...Array<DevKind>(5).fill('roadBuilding'),
      ...Array<DevKind>(4).fill('victoryPoint'),
    ];
    return {
      seat,
      home: homes[seat],
      name: np.name,
      token: np.token,
      color: PLAYER_COLORS[seat],
      isBot: np.isBot,
      connected: np.isBot,
      resources: emptyRes(),
      devCards: [],
      devDeck: rng.shuffle(deck),
      knights: 0,
      freeBuilds: 0,
      pendingGold: 0,
      pendingHarbor: 0,
      pendingDiscard: 0,
      harbor3: false,
      harbor2: [],
      done: false,
      setupStep: 0,
      setupLastVertex: null,
      lastShipMove: -99,
      revealed: GEO.hexes.map(() => false),
      discovered: [],
      islands: [],
      robberHex: null,
      longest: 0,
    };
  });
  const game: GameState = {
    id,
    rngState: rng.state,
    options: opts,
    phase: 'setup',
    round: 0,
    dice: null,
    map,
    players,
    buildings: {},
    routes: {},
    trades: [],
    nextId: 1,
    log: [],
    chat: [],
    awards: { longest: [], army: [] },
  };
  for (const p of players) reveal(game, p, map.homeHexes[p.home], HOME_REVEAL_RADIUS);
  checkDiscovery(game);
  log(game, `Game created: ${players.length} settlers, ${game.options.rounds} rounds.`);
  return game;
}

// ---------- helpers ----------

function withRng<T>(game: GameState, f: (rng: Rng) => T): T {
  const rng = new Rng(game.rngState);
  const out = f(rng);
  game.rngState = rng.state;
  return out;
}

export function log(game: GameState, text: string, to: number[] | null = null) {
  game.log.push({ id: game.nextId++, round: game.round, text, to });
  if (game.log.length > 400) game.log.splice(0, game.log.length - 400);
}

const isLand = (game: GameState, h: number) => game.map.hexes[h].terrain !== 'sea';
const isSea = (game: GameState, h: number) => game.map.hexes[h].terrain === 'sea';
export const homeIsland = (p: PlayerState): IslandId => `home${p.home}`;

function reveal(game: GameState, p: PlayerState, hexes: Iterable<number>, radius = REVEAL_RADIUS) {
  for (const h of hexesWithin(hexes, radius)) p.revealed[h] = true;
}
const revealVertex = (game: GameState, p: PlayerState, v: number) => reveal(game, p, GEO.vertices[v].hexes);
const revealEdge = (game: GameState, p: PlayerState, e: number) => reveal(game, p, GEO.edges[e].hexes);

function presence(game: GameState, p: PlayerState): Set<number> {
  const s = new Set(game.map.homeHexes[p.home]);
  for (const b of Object.values(game.buildings)) if (b.owner === p.seat) GEO.vertices[b.vertex].hexes.forEach((h) => s.add(h));
  for (const r of Object.values(game.routes)) if (r.owner === p.seat) GEO.edges[r.edge].hexes.forEach((h) => s.add(h));
  return s;
}

function checkDiscovery(game: GameState) {
  const pres = game.players.map((p) => presence(game, p));
  for (const a of game.players)
    for (const b of game.players) {
      if (b.seat <= a.seat || a.discovered.includes(b.seat)) continue;
      const aSeesB = [...pres[b.seat]].some((h) => a.revealed[h]);
      const bSeesA = [...pres[a.seat]].some((h) => b.revealed[h]);
      if (aSeesB || bSeesA) {
        a.discovered.push(b.seat);
        b.discovered.push(a.seat);
        log(game, `You discovered ${b.name}!`, [a.seat]);
        log(game, `You discovered ${a.name}!`, [b.seat]);
      }
    }
}

const routeAt = (game: GameState, e: number) => game.routes[e];
const buildingAt = (game: GameState, v: number) => game.buildings[v];

function distanceOk(game: GameState, v: number) {
  if (buildingAt(game, v)) return false;
  return GEO.vertices[v].neighbors.every((n) => !buildingAt(game, n));
}

const settlementCount = (game: GameState, seat: number) =>
  Object.values(game.buildings).filter((b) => b.owner === seat && b.kind === 'settlement').length;

const revealedEdge = (p: PlayerState, e: number) => GEO.edges[e].hexes.some((h) => p.revealed[h]);
const revealedVertex = (p: PlayerState, v: number) => GEO.vertices[v].hexes.some((h) => p.revealed[h]);

/** Can `seat` connect a new route of `kind` at edge `e`? Roads and ships only join through own buildings. */
function connects(game: GameState, seat: number, e: number, kind: 'road' | 'ship', ignoreEdge = -1) {
  for (const v of GEO.edges[e].vertices) {
    const b = buildingAt(game, v);
    if (b) {
      if (b.owner === seat) return true;
      continue;
    }
    for (const oe of GEO.vertices[v].edges) {
      if (oe === e || oe === ignoreEdge) continue;
      const r = routeAt(game, oe);
      if (r && r.owner === seat && r.kind === kind) return true;
    }
  }
  return false;
}

function edgeAllows(game: GameState, e: number, kind: 'road' | 'ship') {
  const edge = GEO.edges[e];
  if (edge.hexes.length !== 2) return false;
  return kind === 'road' ? edge.hexes.some((h) => isLand(game, h)) : edge.hexes.some((h) => isSea(game, h));
}

function canBuildRoute(game: GameState, p: PlayerState, e: number, kind: 'road' | 'ship', ignoreEdge = -1) {
  return (
    (!routeAt(game, e) || e === ignoreEdge) &&
    edgeAllows(game, e, kind) &&
    revealedEdge(p, e) &&
    connects(game, p.seat, e, kind, ignoreEdge)
  );
}

function canBuildSettlement(game: GameState, p: PlayerState, v: number) {
  const vert = GEO.vertices[v];
  if (!vert.hexes.some((h) => isLand(game, h))) return false;
  if (!distanceOk(game, v) || !revealedVertex(p, v)) return false;
  return vert.edges.some((e) => routeAt(game, e)?.owner === p.seat);
}

/** Ships at an open end of a route (one end not anchored by another own ship or own building). */
function movableShip(game: GameState, p: PlayerState, e: number) {
  const r = routeAt(game, e);
  if (!r || r.owner !== p.seat || r.kind !== 'ship') return false;
  const anchored = (v: number) => {
    const b = buildingAt(game, v);
    if (b && b.owner === p.seat) return true;
    return GEO.vertices[v].edges.some((oe) => oe !== e && routeAt(game, oe)?.owner === p.seat && routeAt(game, oe)?.kind === 'ship');
  };
  const [a, b] = GEO.edges[e].vertices;
  return !anchored(a) || !anchored(b);
}

export const canMoveShipNow = (game: GameState, p: PlayerState) =>
  game.phase === 'playing' && game.round - p.lastShipMove >= SHIP_MOVE_INTERVAL;

function shipTargets(game: GameState, p: PlayerState, from: number): number[] {
  const out: number[] = [];
  for (const e of GEO.edges) {
    if (e.id === from) continue;
    if (canBuildRoute(game, p, e.id, 'ship', from)) {
      // The moved ship must not connect only through itself.
      out.push(e.id);
    }
  }
  return out;
}

export function bankRatio(p: PlayerState, res: Resource) {
  if (p.harbor2.includes(res)) return 2;
  return p.harbor3 ? 3 : 4;
}

function pay(p: PlayerState, cost: ResMap) {
  addRes(p.resources, cost, -1);
}

const resName = (r: Resource) => r;
const fmtRes = (m: ResMap) =>
  RESOURCES.filter((k) => m[k] > 0)
    .map((k) => `${m[k]} ${resName(k)}`)
    .join(', ') || 'nothing';

// ---------- placement side effects ----------

function onSettlementPlaced(game: GameState, p: PlayerState, v: number) {
  revealVertex(game, p, v);
  // Harbors
  for (const h of game.map.harbors) {
    if (!GEO.edges[h.edge].vertices.includes(v)) continue;
    if (h.kind === '3:1') {
      if (!p.harbor3) log(game, `${p.name} gained a 3:1 harbor.`, [p.seat]);
      p.harbor3 = true;
    } else p.pendingHarbor++;
  }
  // Special VP for settling another island
  for (const h of GEO.vertices[v].hexes) {
    const island = game.map.hexes[h].island;
    if (!island || island === homeIsland(p) || p.islands.includes(island)) continue;
    p.islands.push(island);
    const what = island === 'belt' ? 'the central chain of islands' : `${ownerName(game, island)}'s home island`;
    log(game, `${p.name} settled ${what}: +2 special VP!`);
  }
  claimTreasure(game, p, v);
  checkDiscovery(game);
}

function ownerName(game: GameState, island: IslandId) {
  const home = Number(island.slice(4));
  const owner = game.players.find((q) => q.home === home);
  return owner ? owner.name : 'an unclaimed';
}

function onRoutePlaced(game: GameState, p: PlayerState, e: number) {
  revealEdge(game, p, e);
  for (const v of GEO.edges[e].vertices) claimTreasure(game, p, v);
  checkDiscovery(game);
}

function claimTreasure(game: GameState, p: PlayerState, v: number) {
  const t = game.map.treasures.find((t) => t.vertex === v && t.claimedBy === null);
  if (!t) return;
  t.claimedBy = p.seat;
  switch (t.kind.type) {
    case 'three':
      for (const r of t.kind.res) p.resources[r]++;
      log(game, `Treasure! You found ${t.kind.res.join(', ')}.`, [p.seat]);
      break;
    case 'build':
      p.freeBuilds += 2;
      log(game, `Treasure! You may build 2 roads/ships for free.`, [p.seat]);
      break;
    case 'gold':
      p.pendingGold += 2;
      log(game, `Treasure! Choose 2 resources.`, [p.seat]);
      break;
  }
  log(game, `${p.name} found a treasure.`, game.players.filter((q) => q.seat !== p.seat).map((q) => q.seat));
}

// ---------- longest route & awards ----------

export function longestRoute(game: GameState, seat: number): number {
  const mine = Object.values(game.routes).filter((r) => r.owner === seat);
  if (!mine.length) return 0;
  const visited = new Set<number>();
  let best = 0;
  const walk = (v: number, kind: 'road' | 'ship', len: number) => {
    best = Math.max(best, len);
    const b = buildingAt(game, v);
    if (b && b.owner !== seat) return;
    const own = b && b.owner === seat;
    for (const e of GEO.vertices[v].edges) {
      if (visited.has(e)) continue;
      const r = routeAt(game, e);
      if (!r || r.owner !== seat) continue;
      if (r.kind !== kind && !own) continue;
      visited.add(e);
      const [a, c] = GEO.edges[e].vertices;
      walk(a === v ? c : a, r.kind, len + 1);
      visited.delete(e);
    }
  };
  for (const r of mine)
    for (const start of GEO.edges[r.edge].vertices) {
      visited.add(r.edge);
      const [a, c] = GEO.edges[r.edge].vertices;
      walk(a === start ? c : a, r.kind, 1);
      visited.delete(r.edge);
    }
  return best;
}

function updateAwards(game: GameState) {
  for (const p of game.players) p.longest = longestRoute(game, p.seat);
  const award = (val: (p: PlayerState) => number, min: number) =>
    game.players
      .filter((p) => p.discovered.length > 0 && val(p) >= min)
      .filter((p) => p.discovered.every((s) => val(p) >= val(game.players[s])))
      .map((p) => p.seat);
  const prev = game.awards;
  const next = { longest: award((p) => p.longest, MIN_LONGEST_ROUTE), army: award((p) => p.knights, MIN_LARGEST_ARMY) };
  for (const p of game.players) {
    if (next.longest.includes(p.seat) && !prev.longest.includes(p.seat)) log(game, `${p.name} now holds the Longest Trade Route (+2 VP).`);
    if (!next.longest.includes(p.seat) && prev.longest.includes(p.seat)) log(game, `${p.name} lost the Longest Trade Route.`);
    if (next.army.includes(p.seat) && !prev.army.includes(p.seat)) log(game, `${p.name} now holds the Largest Army (+2 VP).`);
    if (!next.army.includes(p.seat) && prev.army.includes(p.seat)) log(game, `${p.name} lost the Largest Army.`);
  }
  game.awards = next;
}

export interface Score {
  settlements: number;
  cities: number;
  islands: number;
  vpCards: number;
  longest: number;
  army: number;
  publicVp: number;
  vp: number;
}

export function score(game: GameState, seat: number): Score {
  const p = game.players[seat];
  let settlements = 0;
  let cities = 0;
  for (const b of Object.values(game.buildings)) {
    if (b.owner !== seat) continue;
    if (b.kind === 'settlement') settlements++;
    else cities++;
  }
  const vpCards = p.devCards.filter((d) => d.kind === 'victoryPoint').length;
  const islands = p.islands.length * 2;
  const longest = game.awards.longest.includes(seat) ? 2 : 0;
  const army = game.awards.army.includes(seat) ? 2 : 0;
  const publicVp = settlements + cities * 2 + islands + longest + army;
  return { settlements, cities, islands, vpCards, longest, army, publicVp, vp: publicVp + vpCards };
}

// ---------- round flow ----------

export function setupComplete(game: GameState) {
  return game.players.every((p) => p.setupStep >= SETUP_DONE);
}

export function allDone(game: GameState) {
  return game.players.every((p) => p.done);
}

/** Roll the dice for the next round and pay out. Returns false if the game just ended. */
export function startRound(game: GameState): boolean {
  if (game.phase === 'ended') return false;
  if (game.phase === 'playing' && game.round >= game.options.rounds) {
    endGame(game);
    return false;
  }
  game.phase = 'playing';
  game.round++;
  game.trades = [];
  for (const p of game.players) p.done = false;
  const dice = withRng(game, (rng) => [rng.int(6) + 1, rng.int(6) + 1] as [number, number]);
  game.dice = dice;
  const roll = dice[0] + dice[1];
  log(game, `Round ${game.round}: rolled ${roll}.`);

  if (roll === 7) {
    for (const p of game.players) {
      const total = resTotal(p.resources);
      if (total > 7) {
        p.pendingDiscard = Math.floor(total / 2);
        log(game, `The robber strikes! Discard ${p.pendingDiscard} cards.`, [p.seat]);
      }
    }
    if (game.round > game.options.robberGraceRounds) {
      for (const p of game.players) {
        const land = game.map.homeHexes[p.home];
        p.robberHex = withRng(game, (rng) => rng.pick(land));
        const hex = game.map.hexes[p.robberHex];
        log(game, `The robber moved onto your island (the ${hex.number} ${hex.terrain}).`, [p.seat]);
      }
    }
  } else {
    const blocked = new Set(game.players.map((p) => p.robberHex).filter((h): h is number => h !== null));
    const gains = game.players.map(() => emptyRes());
    game.map.hexes.forEach((hex, h) => {
      if (hex.number !== roll || blocked.has(h)) return;
      const res = TERRAIN_RESOURCE[hex.terrain];
      if (!res) return;
      for (const v of GEO.hexes[h].vertices) {
        const b = buildingAt(game, v);
        if (b) gains[b.owner][res] += b.kind === 'city' ? 2 : 1;
      }
    });
    game.players.forEach((p, i) => {
      addRes(p.resources, gains[i]);
      if (resTotal(gains[i]) > 0) log(game, `You received ${fmtRes(gains[i])}.`, [p.seat]);
    });
  }
  return true;
}

export function endGame(game: GameState) {
  game.phase = 'ended';
  for (const p of game.players) p.revealed = p.revealed.map(() => true);
  const ranking = finalRanking(game);
  log(game, `Game over! ${game.players[ranking[0]].name} wins.`);
}

export function finalRanking(game: GameState): number[] {
  return game.players
    .map((p) => p.seat)
    .sort((a, b) => {
      const sa = score(game, a).vp;
      const sb = score(game, b).vp;
      if (sb !== sa) return sb - sa;
      return resTotal(game.players[b].resources) - resTotal(game.players[a].resources);
    });
}

// ---------- automatic resolution (timeouts, bots) ----------

function randomResources(game: GameState, n: number, from?: ResMap): ResMap {
  const out = emptyRes();
  withRng(game, (rng) => {
    const pool = from ? { ...from } : null;
    for (let i = 0; i < n; i++) {
      const choices = pool ? RESOURCES.filter((k) => pool[k] > 0) : [...RESOURCES];
      if (!choices.length) break;
      const k = rng.pick(choices);
      out[k]++;
      if (pool) pool[k]--;
    }
  });
  return out;
}

export function resolvePendingRandomly(game: GameState, p: PlayerState) {
  if (p.pendingDiscard > 0) applyAction(game, p.seat, { type: 'discard', res: randomResources(game, p.pendingDiscard, p.resources) });
  while (p.pendingGold > 0) {
    const r = randomResources(game, 2);
    const list = RESOURCES.flatMap((k) => Array<Resource>(r[k]).fill(k));
    applyAction(game, p.seat, { type: 'chooseGold', res: [list[0], list[1]] });
  }
  while (p.pendingHarbor > 0) {
    const options = RESOURCES.filter((r) => !p.harbor2.includes(r));
    const res = withRng(game, (rng) => rng.pick(options.length ? options : [...RESOURCES]));
    applyAction(game, p.seat, { type: 'chooseHarbor', res });
  }
}

/** Timer expired: finish this player's turn for them. */
export function forceFinish(game: GameState, seat: number) {
  const p = game.players[seat];
  if (game.phase === 'setup') {
    autoSetup(game, seat);
    return;
  }
  resolvePendingRandomly(game, p);
  p.done = true;
}

function setupSettlementSpots(game: GameState, p: PlayerState) {
  const home = new Set(game.map.homeHexes[p.home]);
  return GEO.vertices
    .filter((v) => v.hexes.some((h) => home.has(h)) && distanceOk(game, v.id))
    .map((v) => v.id);
}

function setupRouteSpots(game: GameState, p: PlayerState) {
  const v = p.setupLastVertex;
  if (v === null) return { roads: [], ships: [] };
  const free = GEO.vertices[v].edges.filter((e) => !routeAt(game, e));
  return {
    roads: free.filter((e) => edgeAllows(game, e, 'road')),
    ships: free.filter((e) => edgeAllows(game, e, 'ship')),
  };
}

export function vertexPips(game: GameState, v: number) {
  const pips = (n: number | null) => (n ? 6 - Math.abs(7 - n) : 0);
  return GEO.vertices[v].hexes.reduce((s, h) => s + pips(game.map.hexes[h].number), 0);
}

export function autoSetup(game: GameState, seat: number) {
  const p = game.players[seat];
  let guard = 10;
  while (p.setupStep < SETUP_DONE && guard-- > 0) {
    if (p.setupStep === 0 || p.setupStep === 2) {
      const spots = setupSettlementSpots(game, p).sort((a, b) => vertexPips(game, b) - vertexPips(game, a));
      applyAction(game, seat, { type: 'setupSettlement', vertex: spots[0] });
    } else if (p.setupStep === 1 || p.setupStep === 3) {
      const { roads, ships } = setupRouteSpots(game, p);
      if (ships.length) applyAction(game, seat, { type: 'setupRoute', edge: ships[0], kind: 'ship' });
      else applyAction(game, seat, { type: 'setupRoute', edge: roads[0], kind: 'road' });
    } else {
      const mine = Object.values(game.buildings).filter((b) => b.owner === seat);
      mine.sort((a, b) => vertexPips(game, b.vertex) - vertexPips(game, a.vertex));
      applyAction(game, seat, { type: 'setupCity', vertex: mine[0].vertex });
    }
  }
}

// ---------- actions ----------

export function applyAction(game: GameState, seat: number, a: Action): string | null {
  const p = game.players[seat];
  if (!p) return 'Unknown player';
  if (game.phase === 'ended') return 'The game is over';

  // --- setup phase ---
  if (game.phase === 'setup') {
    switch (a.type) {
      case 'setupSettlement': {
        if (p.setupStep !== 0 && p.setupStep !== 2) return 'Not time to place a settlement';
        if (!setupSettlementSpots(game, p).includes(a.vertex)) return 'Settlements go on your home island, two corners apart';
        game.buildings[a.vertex] = { vertex: a.vertex, owner: seat, kind: 'settlement' };
        if (p.setupStep === 2) {
          const got = emptyRes();
          for (const h of GEO.vertices[a.vertex].hexes) {
            const r = TERRAIN_RESOURCE[game.map.hexes[h].terrain];
            if (r) got[r]++;
          }
          addRes(p.resources, got);
          log(game, `Starting resources: ${fmtRes(got)}.`, [seat]);
        }
        p.setupLastVertex = a.vertex;
        p.setupStep++;
        onSettlementPlaced(game, p, a.vertex);
        return null;
      }
      case 'setupRoute': {
        if (p.setupStep !== 1 && p.setupStep !== 3) return 'Not time to place a road or ship';
        const spots = setupRouteSpots(game, p);
        if (!(a.kind === 'road' ? spots.roads : spots.ships).includes(a.edge)) return 'Place it next to the settlement you just built';
        game.routes[a.edge] = { edge: a.edge, owner: seat, kind: a.kind };
        p.setupStep++;
        onRoutePlaced(game, p, a.edge);
        return null;
      }
      case 'setupCity': {
        if (p.setupStep !== 4) return 'Not time to choose your city';
        const b = buildingAt(game, a.vertex);
        if (!b || b.owner !== seat) return 'Pick one of your settlements';
        b.kind = 'city';
        p.setupStep++;
        p.done = true;
        log(game, `${p.name} finished setting up.`);
        return null;
      }
      case 'chooseHarbor':
        break;
      default:
        return 'Finish placing your starting pieces first';
    }
  }

  // --- pending choices block everything else ---
  if (a.type === 'discard') {
    if (p.pendingDiscard <= 0) return 'Nothing to discard';
    if (resTotal(a.res) !== p.pendingDiscard || !hasRes(p.resources, a.res) || RESOURCES.some((k) => a.res[k] < 0))
      return `Discard exactly ${p.pendingDiscard} cards you own`;
    pay(p, a.res);
    p.pendingDiscard = 0;
    log(game, `${p.name} lost ${resTotal(a.res)} cards to the robber.`);
    return null;
  }
  if (a.type === 'chooseGold') {
    if (p.pendingGold <= 0) return 'No treasure to choose';
    for (const r of a.res) p.resources[r]++;
    p.pendingGold -= 2;
    return null;
  }
  if (a.type === 'chooseHarbor') {
    if (p.pendingHarbor <= 0) return 'No harbor to choose';
    if (!p.harbor2.includes(a.res)) p.harbor2.push(a.res);
    p.pendingHarbor--;
    log(game, `${p.name} chose a 2:1 ${a.res} harbor.`);
    return null;
  }
  if (p.pendingDiscard > 0) return 'Discard cards first';
  if (p.pendingGold > 0) return 'Choose your treasure first';
  if (p.pendingHarbor > 0) return 'Choose your harbor resource first';

  // Trading is allowed while done, as long as the partner is still active.
  if (a.type === 'acceptTrade') return acceptTrade(game, p, a.id);
  if (a.type === 'declineTrade') {
    const t = game.trades.find((x) => x.id === a.id);
    if (t && t.from !== seat && !t.declined.includes(seat)) {
      t.declined.push(seat);
      t.accepted = t.accepted.filter((s) => s !== seat);
    }
    return null;
  }
  if (a.type === 'confirmTrade') return confirmTrade(game, p, a.id, a.with);
  if (a.type === 'cancelTrade') {
    game.trades = game.trades.filter((t) => !(t.id === a.id && t.from === seat));
    return null;
  }
  if (a.type === 'offerTrade') return offerTrade(game, p, a);

  if (p.done) return 'You have already finished this round';

  switch (a.type) {
    case 'buildSettlement': {
      if (!canBuildSettlement(game, p, a.vertex)) return 'You cannot build a settlement there';
      if (settlementCount(game, seat) >= MAX_SETTLEMENTS) return `At most ${MAX_SETTLEMENTS} settlements — upgrade one to a city first`;
      if (!hasRes(p.resources, COSTS.settlement)) return 'Not enough resources';
      pay(p, COSTS.settlement);
      game.buildings[a.vertex] = { vertex: a.vertex, owner: seat, kind: 'settlement' };
      log(game, `${p.name} built a settlement.`);
      onSettlementPlaced(game, p, a.vertex);
      updateAwards(game);
      return null;
    }
    case 'buildCity': {
      const b = buildingAt(game, a.vertex);
      if (!b || b.owner !== seat || b.kind !== 'settlement') return 'Upgrade one of your settlements';
      if (!hasRes(p.resources, COSTS.city)) return 'Not enough resources';
      pay(p, COSTS.city);
      b.kind = 'city';
      log(game, `${p.name} built a city.`);
      return null;
    }
    case 'buildRoute': {
      if (!canBuildRoute(game, p, a.edge, a.kind)) return `You cannot build a ${a.kind} there`;
      if (p.freeBuilds > 0) p.freeBuilds--;
      else {
        const cost = COSTS[a.kind];
        if (!hasRes(p.resources, cost)) return 'Not enough resources';
        pay(p, cost);
      }
      game.routes[a.edge] = { edge: a.edge, owner: seat, kind: a.kind };
      onRoutePlaced(game, p, a.edge);
      updateAwards(game);
      return null;
    }
    case 'moveShip': {
      if (!canMoveShipNow(game, p)) return 'You can move a ship only every second round';
      if (!movableShip(game, p, a.from)) return 'That ship is not at an open end of a route';
      if (!canBuildRoute(game, p, a.to, 'ship', a.from) || a.to === a.from) return 'You cannot move the ship there';
      delete game.routes[a.from];
      game.routes[a.to] = { edge: a.to, owner: seat, kind: 'ship' };
      p.lastShipMove = game.round;
      onRoutePlaced(game, p, a.to);
      updateAwards(game);
      return null;
    }
    case 'buyDev': {
      if (!p.devDeck.length) return 'Your development deck is empty';
      if (!hasRes(p.resources, COSTS.dev)) return 'Not enough resources';
      pay(p, COSTS.dev);
      const kind = p.devDeck.pop()!;
      p.devCards.push({ kind, round: game.round });
      log(game, `${p.name} bought a development card.`);
      return null;
    }
    case 'playKnight': {
      const i = p.devCards.findIndex((d) => d.kind === 'knight');
      if (i < 0) return 'You have no knight';
      if (p.robberHex !== null) {
        const res = TERRAIN_RESOURCE[game.map.hexes[p.robberHex].terrain]!;
        p.resources[res]++;
        p.robberHex = null;
        log(game, `${p.name} played a knight and drove off the robber.`);
        log(game, `Your knight recovered 1 ${res}.`, [seat]);
      } else {
        if (!a.choice || a.choice.length !== 2) return 'Choose 2 resources';
        for (const r of a.choice) p.resources[r]++;
        log(game, `${p.name} played a knight.`);
      }
      p.devCards.splice(i, 1);
      p.knights++;
      updateAwards(game);
      return null;
    }
    case 'playRoadBuilding': {
      const i = p.devCards.findIndex((d) => d.kind === 'roadBuilding');
      if (i < 0) return 'You have no road building card';
      p.devCards.splice(i, 1);
      p.freeBuilds += 2;
      log(game, `${p.name} played Road Building.`);
      return null;
    }
    case 'bankTrade': {
      if (a.give === a.get) return 'Pick two different resources';
      const count = Math.max(1, Math.min(20, Math.floor(a.count ?? 1)));
      const ratio = bankRatio(p, a.give);
      if (p.resources[a.give] < ratio * count) return `You need ${ratio * count} ${a.give}`;
      p.resources[a.give] -= ratio * count;
      p.resources[a.get] += count;
      log(game, `You traded ${ratio * count} ${a.give} to the bank for ${count} ${a.get}.`, [seat]);
      return null;
    }
    case 'endTurn': {
      p.done = true;
      return null;
    }
  }
  return 'Unknown action';
}

function validResMap(m: ResMap) {
  return m && RESOURCES.every((k) => Number.isInteger(m[k]) && m[k] >= 0 && m[k] <= 20);
}

function offerTrade(game: GameState, p: PlayerState, a: Extract<Action, { type: 'offerTrade' }>) {
  if (game.phase !== 'playing') return 'Trading starts after setup';
  if (!validResMap(a.give) || !validResMap(a.want)) return 'Invalid offer';
  if (resTotal(a.give) < 1 || resTotal(a.want) < 1) return 'Offer at least one card for at least one card';
  if (RESOURCES.some((k) => a.give[k] > 0 && a.want[k] > 0)) return 'You cannot give and want the same resource';
  if (!hasRes(p.resources, a.give)) return "You don't have those cards";
  if (a.to !== null && !p.discovered.includes(a.to)) return 'You can only trade with players you have discovered';
  if (!p.discovered.length) return 'Discover another player first';
  if (game.trades.filter((t) => t.from === p.seat).length >= 6) return 'Too many open offers';
  game.trades.push({ id: game.nextId++, from: p.seat, to: a.to, give: { ...a.give }, want: { ...a.want }, accepted: [], declined: [] });
  return null;
}

/** Check that a and b can trade this offer right now. */
function tradeBlocker(game: GameState, t: TradeOffer, a: PlayerState, b: PlayerState): string | null {
  if (a.seat === b.seat) return 'That is your own offer';
  if (t.to !== null && t.to !== b.seat) return 'That offer is not for you';
  if (!a.discovered.includes(b.seat)) return 'You have not discovered that player';
  if (a.done && b.done) return 'Both of you have finished the round — wait for the next one';
  if (!hasRes(a.resources, t.give)) return `${a.name} no longer has those cards`;
  if (!hasRes(b.resources, t.want)) return `${b.name} doesn't have the cards wanted`;
  return null;
}

/** A player signals they'd take the offer; the offerer then picks who to trade with. */
function acceptTrade(game: GameState, b: PlayerState, id: number) {
  const t = game.trades.find((t) => t.id === id);
  if (!t) return 'That offer is gone';
  const err = tradeBlocker(game, t, game.players[t.from], b);
  if (err) return err;
  if (!t.accepted.includes(b.seat)) t.accepted.push(b.seat);
  t.declined = t.declined.filter((s) => s !== b.seat);
  return null;
}

function confirmTrade(game: GameState, a: PlayerState, id: number, withSeat: number) {
  const t = game.trades.find((t) => t.id === id);
  if (!t || t.from !== a.seat) return 'That offer is gone';
  if (!t.accepted.includes(withSeat)) return 'That player has not accepted';
  const b = game.players[withSeat];
  const err = tradeBlocker(game, t, a, b);
  if (err) return err;
  addRes(a.resources, t.give, -1);
  addRes(b.resources, t.give);
  addRes(b.resources, t.want, -1);
  addRes(a.resources, t.want);
  game.trades = game.trades.filter((x) => x.id !== id);
  log(game, `${a.name} traded ${fmtRes(t.give)} to ${b.name} for ${fmtRes(t.want)}.`, [a.seat, b.seat]);
  return null;
}

// ---------- legal moves (for the client UI) ----------

export interface Legal {
  settlements: number[];
  cities: number[];
  roads: number[];
  ships: number[];
  shipMoves: Record<number, number[]>;
}

export function legalMoves(game: GameState, seat: number): Legal {
  const p = game.players[seat];
  const none: Legal = { settlements: [], cities: [], roads: [], ships: [], shipMoves: {} };
  if (game.phase === 'setup') {
    if (p.setupStep === 0 || p.setupStep === 2) return { ...none, settlements: setupSettlementSpots(game, p) };
    if (p.setupStep === 1 || p.setupStep === 3) {
      const { roads, ships } = setupRouteSpots(game, p);
      return { ...none, roads, ships };
    }
    if (p.setupStep === 4)
      return { ...none, cities: Object.values(game.buildings).filter((b) => b.owner === seat).map((b) => b.vertex) };
    return none;
  }
  if (game.phase !== 'playing' || p.done || p.pendingDiscard || p.pendingGold || p.pendingHarbor) return none;
  const out: Legal = { ...none, shipMoves: {} };
  if (settlementCount(game, seat) < MAX_SETTLEMENTS)
    out.settlements = GEO.vertices.filter((v) => canBuildSettlement(game, p, v.id)).map((v) => v.id);
  out.cities = Object.values(game.buildings).filter((b) => b.owner === seat && b.kind === 'settlement').map((b) => b.vertex);
  for (const e of GEO.edges) {
    if (canBuildRoute(game, p, e.id, 'road')) out.roads.push(e.id);
    if (canBuildRoute(game, p, e.id, 'ship')) out.ships.push(e.id);
  }
  if (canMoveShipNow(game, p))
    for (const r of Object.values(game.routes))
      if (movableShip(game, p, r.edge)) {
        const targets = shipTargets(game, p, r.edge);
        if (targets.length) out.shipMoves[r.edge] = targets;
      }
  return out;
}
