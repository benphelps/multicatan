export const RESOURCES = ['brick', 'lumber', 'wool', 'grain', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];
export type ResMap = Record<Resource, number>;

export type Terrain = 'sea' | 'hills' | 'forest' | 'pasture' | 'fields' | 'mountains';
export const TERRAIN_RESOURCE: Record<Terrain, Resource | null> = {
  sea: null,
  hills: 'brick',
  forest: 'lumber',
  pasture: 'wool',
  fields: 'grain',
  mountains: 'ore',
};

export type IslandId = `home${number}` | 'belt';

export interface HexState {
  terrain: Terrain;
  number: number | null;
  island: IslandId | null;
}

export type TreasureKind =
  | { type: 'three'; res: [Resource, Resource, Resource] }
  | { type: 'build' } // build 2 roads/ships for free
  | { type: 'gold' }; // take any 2 resources

export interface Treasure {
  vertex: number;
  kind: TreasureKind;
  claimedBy: number | null;
}

export interface Harbor {
  edge: number;
  kind: '3:1' | '2:1';
}

export type DevKind = 'knight' | 'roadBuilding' | 'victoryPoint';
export interface DevCard {
  kind: DevKind;
  round: number;
}

export interface Building {
  vertex: number;
  owner: number;
  kind: 'settlement' | 'city';
}
export interface Route {
  edge: number;
  owner: number;
  kind: 'road' | 'ship';
}

export interface TradeOffer {
  id: number;
  from: number;
  to: number | null; // null = any discovered player
  give: ResMap;
  want: ResMap;
  accepted: number[]; // players willing to take it; the offerer confirms one
  declined: number[];
}

export const COSTS = {
  road: { brick: 1, lumber: 1, wool: 0, grain: 0, ore: 0 },
  ship: { brick: 0, lumber: 1, wool: 1, grain: 0, ore: 0 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 0 },
  city: { brick: 0, lumber: 0, wool: 0, grain: 2, ore: 3 },
  dev: { brick: 0, lumber: 0, wool: 1, grain: 1, ore: 1 },
} satisfies Record<string, ResMap>;

export const emptyRes = (): ResMap => ({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 });
export const resTotal = (r: ResMap) => RESOURCES.reduce((s, k) => s + r[k], 0);
export const hasRes = (have: ResMap, need: ResMap) => RESOURCES.every((k) => have[k] >= need[k]);
export const addRes = (a: ResMap, b: ResMap, sign = 1) => {
  for (const k of RESOURCES) a[k] += sign * b[k];
};

export const PLAYER_COLORS = ['#d33b2c', '#2f6fd6', '#e8e8e8', '#f08a1c', '#3a9a3a', '#8a4fc7'];
export const PLAYER_COLOR_NAMES = ['Red', 'Blue', 'White', 'Orange', 'Green', 'Purple'];

export type MapLayout = 'random' | 'classic';

export interface GameOptions {
  layout: MapLayout;
  rounds: number;
  roundSeconds: number; // 0 = no timer
  setupSeconds: number;
  robberGraceRounds: number; // robber can't invade home islands until after this round
}
export const DEFAULT_OPTIONS: GameOptions = {
  layout: 'random',
  rounds: 72,
  roundSeconds: 60,
  setupSeconds: 120,
  robberGraceRounds: 0,
};
