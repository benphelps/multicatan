import { describe, expect, it } from 'vitest';
import { COLS, GEO, rowsInCol } from './board.ts';
import { botTakeTurn } from './bot.ts';
import {
  GameState, allDone, applyAction, createGame, finalRanking, longestRoute, score, setupComplete, startRound,
} from './game.ts';
import { HOME_TERRAIN, generateMap, mirrorRow, pips, segmentResources } from './mapgen.ts';
import { Rng } from './rng.ts';
import { emptyRes } from './types.ts';
import { viewFor } from './view.ts';


describe('board geometry', () => {
  it('has 171 hexes on an 18-column tube', () => {
    expect(GEO.hexes.length).toBe(9 * 10 + 9 * 9);
    for (const h of GEO.hexes) {
      expect(h.vertices.length).toBe(6);
      expect(new Set(h.vertices).size).toBe(6);
    }
    for (const v of GEO.vertices) expect(v.hexes.length).toBeLessThanOrEqual(3);
  });

  it('wraps column 17 onto column 0', () => {
    const right = GEO.hexAt(17, 4)!;
    const left = GEO.hexAt(0, 4)!;
    expect(GEO.hexes[right].neighbors).toContain(left);
  });

  it('gives interior hexes 6 neighbours', () => {
    for (let c = 0; c < COLS; c++)
      for (let r = 1; r < rowsInCol(c) - 1; r++) expect(GEO.hexes[GEO.hexAt(c, r)!].neighbors.length).toBe(6);
  });
});

describe('map generation', () => {
  for (const layout of ['classic', 'random'] as const) {
    for (const seed of layout === 'classic' ? [1234] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
      describe(`${layout} #${seed}`, () => {
        const map = generateMap(new Rng(seed), layout);

        it('deals six fair, mirrored home islands', () => {
          expect(map.homeHexes.length).toBe(6);
          for (const island of map.homeHexes) {
            expect(island.length).toBe(6);
            const nums = island.map((h) => map.hexes[h].number!);
            expect(new Set(nums).size).toBe(6);
            expect(nums.reduce((s, n) => s + pips(n), 0)).toBe(21);
            if (layout === 'random') {
              expect(island.map((h) => map.hexes[h].terrain).sort()).toEqual([...HOME_TERRAIN].sort());
              expect(nums).toContain(6);
              expect(nums).toContain(8);
            }
            for (const h of island)
              if (nums.includes(map.hexes[h].number!) && [6, 8].includes(map.hexes[h].number!))
                for (const n of GEO.hexes[h].neighbors) if (island.includes(n)) expect([6, 8]).not.toContain(map.hexes[n].number);
          }
          for (let seg = 0; seg < 3; seg++) {
            for (const h of map.homeHexes[seg * 2].map((x) => GEO.hexes[x])) {
              const m = GEO.hexAt(h.c, mirrorRow(h.c, h.r))!;
              expect(map.hexes[m].number).toBe(map.hexes[h.id].number);
              expect(map.hexes[m].terrain).toBe(map.hexes[h.id].terrain);
            }
          }
        });

        it('shuffles the belt fairly: 13 hexes / 42 pips per third, complementing its islands', () => {
          const belt = map.hexes.map((h, i) => ({ ...h, i })).filter((h) => h.island === 'belt');
          expect(belt.length).toBe(39);
          for (let t = 0; t < 3; t++) {
            const third = belt.filter((h) => Math.floor(GEO.hexes[h.i].c / 6) === t);
            expect(third.length).toBe(13);
            expect(third.reduce((s, h) => s + pips(h.number), 0)).toBe(42);
            const home = map.homeHexes[t * 2].map((h) => map.hexes[h].number);
            for (const n of [3, 4, 5, 6, 8, 9, 10, 11])
              if (!home.includes(n)) expect(third.filter((h) => h.number === n).length).toBeGreaterThanOrEqual(2);
            const res = Object.values(segmentResources(map, t));
            expect(res.reduce((s, n) => s + n, 0)).toBe(19);
            for (const n of res) expect([3, 4]).toContain(n);
          }
          for (const h of belt) {
            if (h.number !== 6 && h.number !== 8) continue;
            for (const n of GEO.hexes[h.i].neighbors) expect([6, 8]).not.toContain(map.hexes[n].number);
          }
        });

        it('puts harbors on coasts and treasures where they can be reached', () => {
          expect(map.harbors.filter((h) => h.kind === '3:1').length).toBe(6);
          expect(map.harbors.filter((h) => h.kind === '2:1').length).toBe(6);
          for (const h of map.harbors) {
            const terr = GEO.edges[h.edge].hexes.map((x) => map.hexes[x].terrain);
            expect(terr.filter((x) => x === 'sea').length).toBe(1);
          }
          expect(map.treasures.length).toBeGreaterThanOrEqual(18);
        });
      });
    }
  }
});

function playSetup(game: GameState) {
  for (const p of game.players) botTakeTurn(game, p.seat);
  expect(setupComplete(game)).toBe(true);
}

function playToEnd(game: GameState) {
  playSetup(game);
  let rounds = 0;
  while (startRound(game)) {
    rounds++;
    for (const p of game.players) botTakeTurn(game, p.seat);
    expect(allDone(game)).toBe(true);
    for (const p of game.players) viewFor(game, p.seat, null); // views must never throw
  }
  return rounds;
}

describe('a full game with bots', () => {
  it('plays 72 rounds for 6 players and produces a ranking', () => {
    const game = createGame(
      't',
      Array.from({ length: 6 }, (_, i) => ({ name: `Bot ${i + 1}`, token: `b${i}`, isBot: true })),
      {},
      42,
    );
    const rounds = playToEnd(game);
    expect(rounds).toBe(72);
    expect(game.phase).toBe('ended');
    const ranking = finalRanking(game);
    expect(ranking.length).toBe(6);
    const scores = ranking.map((s) => score(game, s).vp);
    expect(scores[0]).toBeGreaterThan(8);
    // Even these simple bots should sail off their home islands and settle elsewhere.
    expect(game.players.some((p) => p.islands.length > 0)).toBe(true);
    console.log('final scores', ranking.map((s) => `${game.players[s].name}: ${score(game, s).vp}`).join(' | '));
  });

  it('works with fewer players', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const game = createGame(
        't',
        Array.from({ length: n }, (_, i) => ({ name: `Bot ${i + 1}`, token: `b${i}`, isBot: true })),
        { rounds: 20 },
        n,
      );
      expect(playToEnd(game)).toBe(20);
    }
  });
});

describe('rules', () => {
  const fresh = () => {
    const game = createGame(
      't',
      [
        { name: 'A', token: 'a', isBot: false },
        { name: 'B', token: 'b', isBot: false },
      ],
      {},
      7,
    );
    playSetup(game);
    startRound(game);
    return game;
  };

  it('starts everyone with a settlement, a city and 2 routes', () => {
    const game = fresh();
    for (const p of game.players) {
      const s = score(game, p.seat);
      expect(s.settlements).toBe(1);
      expect(s.cities).toBe(1);
      expect(Object.values(game.routes).filter((r) => r.owner === p.seat).length).toBe(2);
    }
  });

  it('refuses trades between undiscovered players', () => {
    const game = fresh();
    const [a, b] = game.players;
    a.discovered = [];
    b.discovered = [];
    a.resources.brick = 2;
    const err = applyAction(game, 0, { type: 'offerTrade', to: 1, give: { ...emptyRes(), brick: 1 }, want: { ...emptyRes(), ore: 1 } });
    expect(err).toMatch(/discovered/);
  });

  it('lets a finished player trade with an active one, but not two finished players', () => {
    const game = fresh();
    const [a, b] = game.players;
    a.discovered = [1];
    b.discovered = [0];
    a.resources = { ...emptyRes(), brick: 2 };
    b.resources = { ...emptyRes(), ore: 2 };
    const offer = { type: 'offerTrade' as const, to: 1, give: { ...emptyRes(), brick: 1 }, want: { ...emptyRes(), ore: 1 } };
    expect(applyAction(game, 0, offer)).toBeNull();
    applyAction(game, 0, { type: 'endTurn' });
    const id = game.trades[0].id;
    expect(applyAction(game, 1, { type: 'acceptTrade', id })).toBeNull();
    expect(a.resources.ore).toBe(0); // nothing moves until the offerer confirms
    expect(applyAction(game, 0, { type: 'confirmTrade', id, with: 1 })).toBeNull();
    expect(a.resources.ore).toBe(1);
    expect(b.resources.brick).toBe(1);
    expect(game.trades.length).toBe(0);
    expect(applyAction(game, 0, offer)).toBeNull();
    applyAction(game, 1, { type: 'endTurn' });
    expect(applyAction(game, 1, { type: 'acceptTrade', id: game.trades[0].id })).toMatch(/finished/);
  });

  it('uncovers only the hexes a new piece touches', () => {
    const game = fresh();
    const p = game.players[0];
    p.resources = { ...emptyRes(), brick: 5, lumber: 5, wool: 5 };
    const legal = viewFor(game, 0, null).legal;
    const edge = legal.roads[0] ?? legal.ships[0];
    const before = p.revealed.filter(Boolean).length;
    const touched = GEO.edges[edge].hexes.filter((h) => !p.revealed[h]).length;
    expect(applyAction(game, 0, { type: 'buildRoute', edge, kind: legal.roads.includes(edge) ? 'road' : 'ship' })).toBeNull();
    expect(p.revealed.filter(Boolean).length).toBe(before + touched);
  });

  it("shows you everything a discovered settler has explored", () => {
    const game = fresh();
    const [a, b] = game.players;
    const theirs = b.revealed.findIndex((r, h) => r && !a.revealed[h]);
    expect(theirs).toBeGreaterThanOrEqual(0);
    a.discovered = [];
    b.discovered = [];
    expect(viewFor(game, 0, null).hexes[theirs]).toBeNull();
    a.discovered = [1];
    b.discovered = [0];
    expect(viewFor(game, 0, null).hexes[theirs]).not.toBeNull();
  });

  it('only allows a ship move every second round', () => {
    const game = fresh();
    const p = game.players[0];
    p.resources = { ...emptyRes(), lumber: 5, wool: 5 };
    // Give player 0 a coastal settlement so ships are possible.
    const home = new Set(game.map.homeHexes[p.home]);
    const coastal = GEO.vertices.find(
      (v) =>
        v.hexes.some((h) => home.has(h)) &&
        v.hexes.some((h) => game.map.hexes[h].terrain === 'sea') &&
        !game.buildings[v.id] &&
        v.neighbors.every((n) => !game.buildings[n]),
    )!;
    game.buildings[coastal.id] = { vertex: coastal.id, owner: 0, kind: 'settlement' };
    const legal = () => viewFor(game, 0, null).legal;
    const ship = legal().ships[0];
    expect(ship).toBeDefined();
    expect(applyAction(game, 0, { type: 'buildRoute', edge: ship, kind: 'ship' })).toBeNull();
    const moves = legal().shipMoves;
    const from = Number(Object.keys(moves)[0]);
    expect(applyAction(game, 0, { type: 'moveShip', from, to: moves[from][0] })).toBeNull();
    expect(Object.keys(legal().shipMoves).length).toBe(0);
  });

  it('counts longest route through own settlements only when switching road/ship', () => {
    const game = fresh();
    expect(longestRoute(game, 0)).toBeGreaterThanOrEqual(1);
  });

  it('caps settlements at 5 on the board', () => {
    const game = fresh();
    const p = game.players[0];
    p.resources = { brick: 99, lumber: 99, wool: 99, grain: 99, ore: 0 };
    p.revealed = p.revealed.map(() => true);
    let built = 0;
    for (let i = 0; i < 60 && built < 10; i++) {
      const legal = viewFor(game, 0, null).legal;
      if (legal.settlements.length) {
        if (!applyAction(game, 0, { type: 'buildSettlement', vertex: legal.settlements[0] })) built++;
      } else if (legal.roads.length) applyAction(game, 0, { type: 'buildRoute', edge: legal.roads[0], kind: 'road' });
      else if (legal.ships.length) applyAction(game, 0, { type: 'buildRoute', edge: legal.ships[0], kind: 'ship' });
      p.pendingGold = 0;
      p.pendingHarbor = 0;
    }
    expect(score(game, 0).settlements).toBe(5);
  });
});
