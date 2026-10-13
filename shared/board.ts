// Board geometry for the Multicatan "tube" map.
//
// Flat-top hexes in an odd-q offset layout: odd columns sit half a hex lower.
// Even columns have 10 rows, odd columns 9, so the top and bottom edges are jagged.
// The map wraps horizontally (column 17 borders column 0) — "die Welt ist eine Röhre".
//
// Everything is placed on an integer lattice so corners can be shared exactly:
//   hex center  X = 3c,  Y = 2r + (c & 1)
//   corner offsets (flat-top): E(+2,0) SE(+1,+1) SW(-1,+1) W(-2,0) NW(-1,-1) NE(+1,-1)
// One X unit = size/2 px, one Y unit = size*sqrt(3)/2 px.

export const COLS = 18;
export const SEGMENT_COLS = 6;
export const WRAP_X = COLS * 3;
export const rowsInCol = (c: number) => (c % 2 === 0 ? 10 : 9);

export const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [2, 0], [1, 1], [-1, 1], [-2, 0], [-1, -1], [1, -1],
];
// Side i lies between corner i and corner i+1.
export const SIDES = ['SE', 'S', 'SW', 'NW', 'N', 'NE'] as const;
export type Side = (typeof SIDES)[number];

export interface HexGeo {
  id: number;
  c: number;
  r: number;
  X: number;
  Y: number;
  vertices: number[]; // 6, by corner index
  edges: number[]; // 6, by side index
  neighbors: number[]; // hex ids sharing an edge
}
export interface VertexGeo {
  id: number;
  X: number; // canonical, 0 <= X < WRAP_X
  Y: number;
  hexes: number[];
  edges: number[];
  neighbors: number[]; // vertex ids one edge away
}
export interface EdgeGeo {
  id: number;
  vertices: [number, number];
  hexes: number[]; // in-map hexes touching this edge (1 or 2)
}
export interface Geometry {
  hexes: HexGeo[];
  vertices: VertexGeo[];
  edges: EdgeGeo[];
  hexAt: (c: number, r: number) => number | undefined;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

function build(): Geometry {
  const hexes: HexGeo[] = [];
  const hexIndex = new Map<string, number>();
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < rowsInCol(c); r++) {
      const id = hexes.length;
      hexes.push({ id, c, r, X: 3 * c, Y: 2 * r + (c & 1), vertices: [], edges: [], neighbors: [] });
      hexIndex.set(`${c},${r}`, id);
    }
  }

  const vertices: VertexGeo[] = [];
  const vIndex = new Map<string, number>();
  const vertexId = (X: number, Y: number) => {
    const cx = mod(X, WRAP_X);
    const key = `${cx},${Y}`;
    let id = vIndex.get(key);
    if (id === undefined) {
      id = vertices.length;
      vertices.push({ id, X: cx, Y, hexes: [], edges: [], neighbors: [] });
      vIndex.set(key, id);
    }
    return id;
  };

  const edges: EdgeGeo[] = [];
  const eIndex = new Map<string, number>();
  const edgeId = (a: number, b: number) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    let id = eIndex.get(key);
    if (id === undefined) {
      id = edges.length;
      edges.push({ id, vertices: a < b ? [a, b] : [b, a], hexes: [] });
      eIndex.set(key, id);
    }
    return id;
  };

  for (const h of hexes) {
    h.vertices = CORNERS.map(([dx, dy]) => vertexId(h.X + dx, h.Y + dy));
    h.edges = h.vertices.map((v, i) => edgeId(v, h.vertices[(i + 1) % 6]));
    for (const v of h.vertices) vertices[v].hexes.push(h.id);
    for (const e of h.edges) edges[e].hexes.push(h.id);
  }
  for (const e of edges) {
    const [a, b] = e.vertices;
    vertices[a].edges.push(e.id);
    vertices[b].edges.push(e.id);
    vertices[a].neighbors.push(b);
    vertices[b].neighbors.push(a);
    if (e.hexes.length === 2) {
      hexes[e.hexes[0]].neighbors.push(e.hexes[1]);
      hexes[e.hexes[1]].neighbors.push(e.hexes[0]);
    }
  }
  return { hexes, vertices, edges, hexAt: (c, r) => hexIndex.get(`${mod(c, COLS)},${r}`) };
}

export const GEO: Geometry = build();

/** Lattice → pixel. */
export const px = (X: number, size: number) => (X * size) / 2;
export const py = (Y: number, size: number) => (Y * size * Math.sqrt(3)) / 2;

/** Hexes within `radius` steps of any hex in `start`. */
export function hexesWithin(start: Iterable<number>, radius: number): Set<number> {
  const seen = new Set<number>(start);
  let frontier = [...seen];
  for (let i = 0; i < radius; i++) {
    const next: number[] = [];
    for (const h of frontier)
      for (const n of GEO.hexes[h].neighbors)
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
    frontier = next;
  }
  return seen;
}

/** The pixel position of a vertex as seen from a given hex (handles the wrap seam). */
export function vertexNear(v: number, nearX: number): number {
  const X = GEO.vertices[v].X;
  const k = Math.round((nearX - X) / WRAP_X);
  return X + k * WRAP_X;
}
