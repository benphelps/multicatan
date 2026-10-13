// A simple greedy bot: grow toward the best reachable spots, upgrade to cities, buy cards.
// Good enough to fill empty seats and to exercise the engine in tests.

import { GEO } from './board.ts';
import {
  Action, GameState, PlayerState, applyAction, autoSetup, bankRatio, legalMoves, resolvePendingRandomly, vertexPips,
} from './game.ts';
import { COSTS, RESOURCES, ResMap, Resource, hasRes, resTotal } from './types.ts';

const need = (p: PlayerState, cost: ResMap) => hasRes(p.resources, cost);

/** Take one round's worth of actions for a bot, then end its turn. */
export function botTakeTurn(game: GameState, seat: number) {
  const p = game.players[seat];
  if (game.phase === 'setup') {
    autoSetup(game, seat);
    return;
  }
  if (game.phase !== 'playing' || p.done) return;
  resolvePendingRandomly(game, p);

  for (let guard = 0; guard < 40; guard++) {
    if (!step(game, p)) break;
    resolvePendingRandomly(game, p);
  }
  applyAction(game, seat, { type: 'endTurn' });
}

function targetValue(game: GameState, p: PlayerState, v: number) {
  let val = vertexPips(game, v);
  for (const h of GEO.vertices[v].hexes) {
    const island = game.map.hexes[h].island;
    if (island && island !== `home${p.home}` && !p.islands.includes(island)) val += 8;
  }
  if (game.map.treasures.some((t) => t.vertex === v && t.claimedBy === null)) val += 4;
  return val;
}

type Option = { cost: ResMap; act: Action };

function step(game: GameState, p: PlayerState): boolean {
  const seat = p.seat;
  const legal = legalMoves(game, seat);
  const act = (a: Action) => !applyAction(game, seat, a);

  // Cards in hand first: free roads, and knights to clear the robber or turn into resources.
  if (p.devCards.some((d) => d.kind === 'roadBuilding')) return act({ type: 'playRoadBuilding' });
  const knights = p.devCards.filter((d) => d.kind === 'knight').length;
  if (knights && (p.robberHex !== null || knights >= 2 || game.round >= game.options.rounds - 1))
    return act({ type: 'playKnight', choice: [scarcest(p), scarcest(p)] });

  const expansion = bestExpansion(game, p, legal.roads, legal.ships);
  if (p.freeBuilds > 0 && expansion) return act({ type: 'buildRoute', edge: expansion.edge, kind: expansion.kind });

  const options: Option[] = [];
  if (legal.cities.length) {
    const v = [...legal.cities].sort((a, b) => vertexPips(game, b) - vertexPips(game, a))[0];
    options.push({ cost: COSTS.city, act: { type: 'buildCity', vertex: v } });
  }
  if (legal.settlements.length) {
    const v = [...legal.settlements].sort((a, b) => targetValue(game, p, b) - targetValue(game, p, a))[0];
    options.push({ cost: COSTS.settlement, act: { type: 'buildSettlement', vertex: v } });
  } else if (expansion) {
    options.push({ cost: COSTS[expansion.kind], act: { type: 'buildRoute', edge: expansion.edge, kind: expansion.kind } });
  }
  for (const o of options) if (need(p, o.cost)) return act(o.act);

  // Ship moves toward targets now and then.
  for (const [from, targets] of Object.entries(legal.shipMoves)) {
    const choice = bestExpansion(game, p, [], targets);
    if (choice && choice.d > 1 && game.round % 4 === 0) return act({ type: 'moveShip', from: Number(from), to: choice.edge });
  }
  // Bank-trade toward the most important goal that trading can reach.
  for (const o of options) if (tradeToward(game, p, o.cost)) return true;
  // Leftovers go into development cards (knights double as resources).
  if (p.devDeck.length && need(p, COSTS.dev) && resTotal(p.resources) >= 5) return act({ type: 'buyDev' });
  return false;
}

function scarcest(p: PlayerState): Resource {
  return [...RESOURCES].sort((a, b) => p.resources[a] - p.resources[b])[0];
}

function tradeToward(game: GameState, p: PlayerState, cost: ResMap): boolean {
  const missing = RESOURCES.filter((r) => p.resources[r] < cost[r]);
  const shortfall = missing.reduce((s, r) => s + cost[r] - p.resources[r], 0);
  if (!missing.length || shortfall > 2) return false;
  for (const give of RESOURCES) {
    if (p.resources[give] - cost[give] >= bankRatio(p, give))
      return !applyAction(game, p.seat, { type: 'bankTrade', give, get: missing[0] });
  }
  return false;
}

/** Pick the legal road/ship edge whose far end is closest to a valuable target. */
function bestExpansion(game: GameState, p: PlayerState, roads: number[], ships: number[]) {
  const targets = GEO.vertices
    .filter((v) => {
      if (game.buildings[v.id] || v.neighbors.some((n) => game.buildings[n])) return false;
      if (!v.hexes.some((h) => game.map.hexes[h].terrain !== 'sea')) return false;
      return v.hexes.some((h) => p.revealed[h]);
    })
    .map((v) => ({ v: v.id, val: targetValue(game, p, v.id) }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 8)
    .map((t) => t.v);
  // With nothing good in sight, head for the unexplored frontier instead.
  let queue = targets.length
    ? targets
    : GEO.vertices.filter((v) => v.hexes.some((h) => !p.revealed[h])).map((v) => v.id);
  const dist = new Map<number, number>(queue.map((v) => [v, 0]));
  while (queue.length) {
    const next: number[] = [];
    for (const v of queue)
      for (const n of GEO.vertices[v].neighbors)
        if (!dist.has(n)) {
          dist.set(n, dist.get(v)! + 1);
          next.push(n);
        }
    queue = next;
  }
  let best: { edge: number; kind: 'road' | 'ship'; d: number } | null = null;
  const consider = (edge: number, kind: 'road' | 'ship') => {
    const d = Math.min(...GEO.edges[edge].vertices.map((v) => dist.get(v) ?? 99));
    if (!best || d < best.d) best = { edge, kind, d };
  };
  roads.forEach((e) => consider(e, 'road'));
  ships.forEach((e) => consider(e, 'ship'));
  return best as { edge: number; kind: 'road' | 'ship'; d: number } | null;
}

/** Bots accept offers that don't cost them more cards than they get, and don't strip a scarce resource. */
export function botConsiderTrades(game: GameState, seat: number): boolean {
  const p = game.players[seat];
  if (game.phase !== 'playing' || p.pendingDiscard) return false;
  for (const t of [...game.trades]) {
    if (t.from === seat || (t.to !== null && t.to !== seat)) continue;
    const from = game.players[t.from];
    if (!from.discovered.includes(seat) || (from.done && p.done)) continue;
    if (t.accepted.includes(seat) || t.declined.includes(seat)) continue;
    if (!hasRes(p.resources, t.want) || !hasRes(from.resources, t.give)) continue;
    const fair = resTotal(t.give) >= resTotal(t.want) && !RESOURCES.some((r) => t.want[r] > 0 && p.resources[r] - t.want[r] < 1);
    const action = fair ? ({ type: 'acceptTrade', id: t.id } as const) : ({ type: 'declineTrade', id: t.id } as const);
    if (!applyAction(game, seat, action)) return true;
  }
  return false;
}
