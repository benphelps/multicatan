// The Multicatan map: six home islands around a central belt, both dealt fairly.
//
// Every home island has the same 6-hex shape and the same tiles (HOME_TERRAIN) in a different
// arrangement. Its six numbers always include a 6 and an 8 and their pips (the dots under each
// number) total 21. The bottom island of each segment mirrors the top one. Islands deliberately lack
// some numbers and resources, and the belt third of the same segment makes up for them:
// 13 hexes worth 42 pips, with 2-3 copies of each number the home island is missing, and
// terrain that brings the segment to about four hexes of every resource.
//
// 'classic' reproduces a reference board from a reconstruction of the original COW game
// (fixed home islands and belt number bags); 'random' deals new islands every game.

import { GEO, SEGMENT_COLS, SIDES, Side, hexesWithin, rowsInCol } from './board.ts';
import { Rng } from './rng.ts';
import {
  Harbor, HexState, IslandId, MapLayout, RESOURCES, Resource, TERRAIN_RESOURCE, Terrain, Treasure,
  TreasureKind,
} from './types.ts';

type HomeHex = [c: number, r: number, terrain: Terrain, num: number];
type LandTerrain = Exclude<Terrain, 'sea'>;
const LAND: LandTerrain[] = ['hills', 'forest', 'pasture', 'fields', 'mountains'];
const NUMBERS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
export const pips = (n: number | null) => (n ? 6 - Math.abs(7 - n) : 0);
export const HOME_PIPS = 21;
export const BELT_PIPS = 42;

// Every home island holds exactly these tiles, shuffled (from the original game's start-island
// screenshot: two hills and one of everything else).
export const HOME_TERRAIN: LandTerrain[] = ['hills', 'hills', 'forest', 'pasture', 'fields', 'mountains'];

// The home island shape in segment 0 (top row); other segments are offset by 6 columns.
const HOME_SHAPE: [number, number][] = [[1, 1], [2, 1], [2, 2], [3, 1], [4, 1], [4, 2]];

// Reference board: top-row home islands per segment.
const CLASSIC_HOMES: HomeHex[][] = [
  [[1, 1, 'hills', 9], [2, 1, 'pasture', 8], [2, 2, 'fields', 11], [3, 1, 'pasture', 2], [4, 1, 'hills', 5], [4, 2, 'mountains', 6]],
  [[7, 1, 'forest', 10], [8, 1, 'hills', 9], [8, 2, 'forest', 8], [9, 1, 'pasture', 5], [10, 1, 'pasture', 4], [10, 2, 'mountains', 11]],
  [[13, 1, 'pasture', 6], [14, 1, 'hills', 4], [14, 2, 'hills', 10], [15, 1, 'fields', 5], [16, 1, 'pasture', 8], [16, 2, 'hills', 2]],
];
const CLASSIC_BELT_NUMBERS: number[][] = [
  [3, 3, 4, 4, 4, 5, 6, 8, 9, 10, 10, 10, 11],
  [2, 3, 3, 4, 5, 6, 6, 6, 8, 9, 10, 11, 12],
  [3, 3, 3, 4, 5, 6, 8, 9, 9, 9, 10, 11, 11],
];

/** Mirror a top-half hex to the bottom half. Lattice Y' = 18 - Y. */
export const mirrorRow = (c: number, r: number) => rowsInCol(c) - 1 - r;

// Belt land positions, grouped by segment third.
const BELT: [number, number][][] = [
  [[0, 3], [0, 4], [0, 5], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 3], [3, 4], [3, 5], [5, 4], [5, 5]],
  [[6, 4], [6, 5], [7, 4], [8, 4], [8, 5], [9, 3], [9, 4], [9, 5], [10, 4], [10, 5], [11, 3], [11, 4], [11, 5]],
  [[12, 3], [12, 4], [12, 5], [12, 6], [13, 4], [15, 3], [15, 4], [15, 5], [16, 4], [16, 5], [17, 3], [17, 4], [17, 5]],
];

// Harbors: [c, r, side] on the land hex.
const HOME_HARBOR_TOP: [number, number, Side] = [1, 1, 'SW']; // + 6 per segment
const BELT_HARBORS: [number, number, Side][] = [
  [1, 3, 'N'], [1, 5, 'S'], [9, 3, 'N'], [9, 5, 'S'], [15, 3, 'N'], [15, 5, 'S'],
];

/** Island index i: segment = floor(i/2), top if even. Seat order in the original: 1&2 face each other. */
export const NUM_HOMES = 6;
export const homeSegment = (home: number) => Math.floor(home / 2);
export const homeIsTop = (home: number) => home % 2 === 0;

const mirrorSide: Record<Side, Side> = { N: 'S', S: 'N', NE: 'SE', SE: 'NE', NW: 'SW', SW: 'NW' };
const edgeOf = (c: number, r: number, side: Side) => {
  const h = GEO.hexAt(c, r);
  if (h === undefined) throw new Error(`no hex ${c},${r}`);
  return GEO.hexes[h].edges[SIDES.indexOf(side)];
};

export interface GameMap {
  hexes: HexState[];
  harbors: Harbor[];
  treasures: Treasure[];
  homeHexes: number[][]; // by home index
}

const isRed = (n: number | null) => n === 6 || n === 8;

export function generateMap(rng: Rng, layout: MapLayout = 'random'): GameMap {
  const hexes: HexState[] = GEO.hexes.map(() => ({ terrain: 'sea', number: null, island: null }));
  const homeHexes: number[][] = [];
  const beltNumbers: number[][] = [];
  const beltTerrain: LandTerrain[][] = [];

  for (let seg = 0; seg < 3; seg++) {
    const home = layout === 'classic' ? CLASSIC_HOMES[seg] : randomHome(rng, seg);
    const top: number[] = [];
    const bottom: number[] = [];
    for (const [c, r, terrain, num] of home) {
      const t = GEO.hexAt(c, r)!;
      const b = GEO.hexAt(c, mirrorRow(c, r))!;
      hexes[t] = { terrain, number: num, island: `home${seg * 2}` as IslandId };
      hexes[b] = { terrain, number: num, island: `home${seg * 2 + 1}` as IslandId };
      top.push(t);
      bottom.push(b);
    }
    homeHexes.push(top, bottom);
    beltNumbers.push(layout === 'classic' ? CLASSIC_BELT_NUMBERS[seg] : beltNumberBag(rng, home.map((h) => h[3])));
    beltTerrain.push(beltTerrainBag(rng, home.map((h) => h[2] as LandTerrain)));
  }

  placeBelt(rng, hexes, beltNumbers, beltTerrain);

  const harbors: Harbor[] = [];
  for (let seg = 0; seg < 3; seg++) {
    const [c, r, side] = HOME_HARBOR_TOP;
    const cc = c + seg * SEGMENT_COLS;
    harbors.push({ edge: edgeOf(cc, r, side), kind: '3:1' });
    harbors.push({ edge: edgeOf(cc, mirrorRow(cc, r), mirrorSide[side]), kind: '3:1' });
  }
  for (const [c, r, side] of BELT_HARBORS) harbors.push({ edge: edgeOf(c, r, side), kind: '2:1' });

  const treasures = placeTreasures(rng, hexes, homeHexes, harbors);
  return { hexes, harbors, treasures, homeHexes };
}

// ---------- home islands ----------

/**
 * Every set of six different numbers that includes a 6 and an 8 and whose dots (the pips under each
 * number: ways to roll it out of 36) add up to 21. Each home island is dealt one of these at random.
 */
const HOME_NUMBER_SETS: number[][] = (() => {
  const out: number[][] = [];
  const pick = (start: number, set: number[]) => {
    if (set.length === 6) {
      if (set.includes(6) && set.includes(8) && set.reduce((s, n) => s + pips(n), 0) === HOME_PIPS) out.push(set);
      return;
    }
    for (let i = start; i < NUMBERS.length; i++) pick(i + 1, [...set, NUMBERS[i]]);
  };
  pick(0, []);
  return out;
})();

function randomHome(rng: Rng, seg: number): HomeHex[] {
  const cells = HOME_SHAPE.map(([c, r]) => [c + seg * SEGMENT_COLS, r] as const);
  const ids = cells.map(([c, r]) => GEO.hexAt(c, r)!);
  for (;;) {
    const terrain = rng.shuffle([...HOME_TERRAIN]);

    const nums = rng.shuffle([...rng.pick(HOME_NUMBER_SETS)]);
    const redClash = ids.some((h, i) => isRed(nums[i]) && GEO.hexes[h].neighbors.some((nb) => {
      const j = ids.indexOf(nb);
      return j >= 0 && isRed(nums[j]);
    }));
    // Don't stack both hot numbers on one resource.
    const hotTerrain = terrain.filter((_, i) => isRed(nums[i]));
    if (redClash || new Set(hotTerrain).size < hotTerrain.length) continue;
    return cells.map(([c, r], i) => [c, r, terrain[i], nums[i]]);
  }
}

/** 13 belt numbers worth 42 pips, carrying 2-3 copies of each number the home island lacks. */
function beltNumberBag(rng: Rng, home: number[]): number[] {
  const missing = NUMBERS.filter((n) => !home.includes(n));
  for (;;) {
    const bag: number[] = [];
    for (const n of missing) {
      const copies = n === 2 || n === 12 ? rng.int(2) : 2 + rng.int(2);
      for (let i = 0; i < copies; i++) bag.push(n);
    }
    while (bag.length < 13) bag.push(rng.pick(NUMBERS));
    if (bag.length !== 13) continue;
    if (bag.reduce((s, n) => s + pips(n), 0) !== BELT_PIPS) continue;
    if (NUMBERS.some((n) => bag.filter((x) => x === n).length > 3)) continue;
    if (bag.filter(isRed).length > 4) continue;
    return bag;
  }
}

/** Belt terrain that brings home + belt to four of each resource (one resource gets three). */
function beltTerrainBag(rng: Rng, home: LandTerrain[]): LandTerrain[] {
  const have = Object.fromEntries(LAND.map((k) => [k, home.filter((x) => x === k).length])) as Record<LandTerrain, number>;
  const most = Math.max(...LAND.map((k) => have[k]));
  const trim = rng.pick(LAND.filter((k) => have[k] === most));
  const bag: LandTerrain[] = [];
  for (const k of LAND) for (let i = have[k]; i < (k === trim ? 3 : 4); i++) bag.push(k);
  return bag;
}

function placeBelt(rng: Rng, hexes: HexState[], numbers: number[][], terrain: LandTerrain[][]) {
  const thirds = BELT.map((third) => third.map(([c, r]) => GEO.hexAt(c, r)!));
  const all = thirds.flat();
  const num = new Map<number, number>();
  const terr = new Map<number, LandTerrain>();

  // Penalties: adjacent 6/8, identical adjacent numbers, two hot numbers on one resource in a third.
  const score = () => {
    let s = 0;
    for (const h of all)
      for (const nb of GEO.hexes[h].neighbors) {
        if (nb < h || !num.has(nb)) continue;
        if (isRed(num.get(h)!) && isRed(num.get(nb)!)) s += 10;
        else if (num.get(h) === num.get(nb)) s += 3;
      }
    for (const third of thirds) {
      const hot = third.filter((h) => isRed(num.get(h)!)).map((h) => terr.get(h));
      s += 2 * (hot.length - new Set(hot).size);
    }
    return s;
  };

  let best = Infinity;
  let bestNum = new Map(num);
  let bestTerr = new Map(terr);
  for (let restart = 0; restart < 20 && best > 0; restart++) {
    thirds.forEach((third, t) => {
      const ns = rng.shuffle([...numbers[t]]);
      const ts = rng.shuffle([...terrain[t]]);
      third.forEach((h, i) => {
        num.set(h, ns[i]);
        terr.set(h, ts[i]);
      });
    });
    let cur = score();
    // Hill-climb by swapping numbers (or terrain) between two hexes of the same third.
    for (let i = 0; i < 3000 && cur > 0; i++) {
      const third = rng.pick(thirds);
      const a = rng.pick(third);
      const b = rng.pick(third);
      const map = rng.next() < 0.7 ? num : terr;
      const swap = () => {
        const x = map.get(a)!;
        (map as Map<number, unknown>).set(a, map.get(b));
        (map as Map<number, unknown>).set(b, x);
      };
      swap();
      const next = score();
      if (next <= cur) cur = next;
      else swap();
    }
    if (cur < best) {
      best = cur;
      bestNum = new Map(num);
      bestTerr = new Map(terr);
    }
  }
  for (const h of all) hexes[h] = { terrain: bestTerr.get(h)!, number: bestNum.get(h)!, island: 'belt' };
}

/** Resources a segment's home island + belt third produce, counted in hexes. */
export function segmentResources(map: GameMap, seg: number): Record<Resource, number> {
  const out = Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;
  const ids = [...map.homeHexes[seg * 2], ...BELT[seg].map(([c, r]) => GEO.hexAt(c, r)!)];
  for (const h of ids) {
    const r = TERRAIN_RESOURCE[map.hexes[h].terrain];
    if (r) out[r]++;
  }
  return out;
}

// ---------- Treasures ----------

const isSeaVertex = (hexes: HexState[], v: number) =>
  GEO.vertices[v].hexes.length === 3 && GEO.vertices[v].hexes.every((h) => hexes[h].terrain === 'sea');

/** Ship-path distance (in edges) from a set of vertices across sea-touching edges. */
function seaDistances(hexes: HexState[], from: number[]): Map<number, number> {
  const dist = new Map<number, number>(from.map((v) => [v, 0]));
  let frontier = [...from];
  while (frontier.length) {
    const next: number[] = [];
    for (const v of frontier) {
      for (const e of GEO.vertices[v].edges) {
        const edge = GEO.edges[e];
        if (edge.hexes.length < 2 || !edge.hexes.some((h) => hexes[h].terrain === 'sea')) continue;
        const w = edge.vertices[0] === v ? edge.vertices[1] : edge.vertices[0];
        if (!dist.has(w)) {
          dist.set(w, dist.get(v)! + 1);
          next.push(w);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

const mirrorVertex = (v: number) => {
  const { X, Y } = GEO.vertices[v];
  return GEO.vertices.find((o) => o.X === X && o.Y === 18 - Y)!.id;
};

function randomThree(rng: Rng): TreasureKind {
  const res = rng.shuffle([...RESOURCES]).slice(0, 3) as [Resource, Resource, Resource];
  return { type: 'three', res };
}

function placeTreasures(rng: Rng, hexes: HexState[], homeHexes: number[][], harbors: Harbor[]): Treasure[] {
  const treasures: Treasure[] = [];
  const taken = new Set<number>();
  const harborVerts = new Set(harbors.flatMap((h) => GEO.edges[h.edge].vertices));
  const blocked = (v: number) =>
    taken.has(v) || harborVerts.has(v) || GEO.vertices[v].neighbors.some((n) => taken.has(n));
  const add = (v: number, kind: TreasureKind) => {
    taken.add(v);
    treasures.push({ vertex: v, kind, claimedBy: null });
  };

  // Sea treasures: 3 per top home island (outer edge, left, right), mirrored to the bottom island.
  for (let seg = 0; seg < 3; seg++) {
    const island = homeHexes[seg * 2];
    const islandVerts = [...new Set(island.flatMap((h) => GEO.hexes[h].vertices))];
    const dist = seaDistances(hexes, islandVerts);
    const cx = (seg * SEGMENT_COLS + 2.5) * 3;
    const minY = Math.min(...island.map((h) => GEO.hexes[h].Y));
    const relX = (v: number) => {
      let d = GEO.vertices[v].X - cx;
      if (d > 27) d -= 54;
      if (d < -27) d += 54;
      return d;
    };
    const cands = (pred: (v: number, d: number) => boolean) =>
      [...dist.entries()].filter(([v, d]) => isSeaVertex(hexes, v) && GEO.vertices[v].Y < 8 && pred(v, d)).map(([v]) => v);

    const kinds = rng.shuffle<TreasureKind>([randomThree(rng), { type: 'build' }, { type: 'gold' }]);
    const slots = [
      cands((v, d) => d >= 1 && d <= 2 && GEO.vertices[v].Y < minY - 1), // toward the map edge
      cands((v, d) => d >= 2 && d <= 3 && relX(v) < -7), // left
      cands((v, d) => d >= 2 && d <= 3 && relX(v) > 7), // right
    ];
    slots.forEach((list, i) => {
      const options = list.filter((v) => !blocked(v) && !blocked(mirrorVertex(v)));
      if (!options.length) return;
      const v = rng.pick(options);
      add(v, kinds[i]);
      add(mirrorVertex(v), kinds[i]);
    });
  }

  // Belt treasures: 2 per third on interior land vertices (reachable only by road).
  for (let t = 0; t < 3; t++) {
    const lo = t * SEGMENT_COLS * 3 - 1;
    const hi = (t + 1) * SEGMENT_COLS * 3 - 1;
    const interior = GEO.vertices.filter(
      (v) =>
        v.hexes.length === 3 &&
        v.hexes.every((h) => hexes[h].island === 'belt') &&
        v.X >= lo && v.X < hi,
    );
    const kinds: TreasureKind[] = [randomThree(rng), rng.next() < 0.5 ? { type: 'build' } : { type: 'gold' }];
    for (const kind of kinds) {
      const options = interior.filter((v) => !blocked(v.id));
      if (options.length) add(rng.pick(options).id, kind);
    }
  }
  return treasures;
}

/** The seat → home island assignment for a given player count. */
export function homeOrder(n: number): number[] {
  return [0, 3, 4, 1, 2, 5].slice(0, n);
}

export { hexesWithin };
