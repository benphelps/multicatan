import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CORNERS, GEO, WRAP_X, px, py, vertexNear } from '../../../shared/board.ts';
import type { Terrain } from '../../../shared/types.ts';
import type { GameView } from '../../../shared/view.ts';
import { GLYPHS, TERRAIN_MOTIF } from '../icons.tsx';

export const S = 40; // hex radius in px
export const MAP_W = px(WRAP_X, S);
const MAP_TOP = py(-1, S);
const MAP_BOTTOM = py(19, S);

export const TERRAIN_FILL: Record<Terrain, string> = {
  sea: '#2f86a8',
  hills: '#c0602f',
  forest: '#2f6a3a',
  pasture: '#93c25a',
  fields: '#e2b93b',
  mountains: '#878d95',
};
// Light → dark pairs for a gentle bevel on each tile.
const TERRAIN_SHADE: Record<Terrain, [string, string]> = {
  sea: ['#3a97ba', '#2a7898'],
  hills: ['#d27140', '#a8522a'],
  forest: ['#3b7b45', '#255831'],
  pasture: ['#a4d06a', '#7fae4a'],
  fields: ['#ecc853', '#cfa52f'],
  mountains: ['#9aa0a8', '#757b84'],
};

export type Mode =
  | { kind: 'none' }
  | { kind: 'settlement' }
  | { kind: 'city' }
  | { kind: 'road' }
  | { kind: 'ship' }
  | { kind: 'route' } // setup: road or ship
  | { kind: 'moveFrom' }
  | { kind: 'moveTo'; from: number };

export interface BoardProps {
  view: GameView;
  mode: Mode;
  onVertex: (v: number) => void;
  onEdge: (e: number, kind: 'road' | 'ship') => void;
  onShip: (e: number) => void;
  centerKey: number;
  highlight: number | null; // the number just rolled
  zoomRef?: React.MutableRefObject<((f: number) => void) | null>;
  apiRef?: React.MutableRefObject<BoardApi | null>;
}

/** Screen positions of board features (for flying-token animations). */
export interface BoardApi {
  hex(id: number): { x: number; y: number } | null;
  vertex(id: number): { x: number; y: number } | null;
  edge(id: number): { x: number; y: number } | null;
  center(): { x: number; y: number } | null;
}

const hexPoints = (X: number, Y: number) =>
  CORNERS.map(([dx, dy]) => `${px(X + dx, S).toFixed(1)},${py(Y + dy, S).toFixed(1)}`).join(' ');

const pips = (n: number) => 6 - Math.abs(7 - n);

function edgeEnds(e: number) {
  const [a, b] = GEO.edges[e].vertices;
  const ax = GEO.vertices[a].X;
  const bx = vertexNear(b, ax);
  return { x1: px(ax, S), y1: py(GEO.vertices[a].Y, S), x2: px(bx, S), y2: py(GEO.vertices[b].Y, S) };
}
const mid = (e: number) => {
  const p = edgeEnds(e);
  return { x: (p.x1 + p.x2) / 2, y: (p.y1 + p.y2) / 2, angle: (Math.atan2(p.y2 - p.y1, p.x2 - p.x1) * 180) / Math.PI };
};
const vpos = (v: number) => ({ x: px(GEO.vertices[v].X, S), y: py(GEO.vertices[v].Y, S) });

type Hover = { kind: 'vertex'; id: number } | { kind: 'edge'; id: number; route: 'road' | 'ship' } | null;

export function Board({ view, mode, onVertex, onEdge, onShip, centerKey, highlight, zoomRef, apiRef }: BoardProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState({ x: 0, y: 0, z: 1 });
  const [hover, setHover] = useState<Hover>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const autoCenter = useRef(true); // keep re-centering on resize until the player moves the map
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number; cx: number; cy: number; camx: number; camy: number } | null>(null);
  const me = view.players[view.you];

  useLayoutEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const clampY = (y: number, z: number, h = size.h) => {
    const top = -MAP_TOP * z + 80;
    const bottom = h - MAP_BOTTOM * z - 80;
    return bottom > top ? (top + bottom) / 2 : Math.min(top, Math.max(bottom, y));
  };

  // Center on our home island.
  const home = me.home;
  useEffect(() => {
    autoCenter.current = true;
  }, [centerKey]);
  useEffect(() => {
    if (!autoCenter.current) return;
    const homeHexes = GEO.hexes.filter((_, i) => view.hexes[i]?.island === `home${home}`);
    if (!homeHexes.length || size.w < 10 || size.h < 10) return;
    const hx = px(homeHexes.reduce((s, h) => s + h.X, 0) / homeHexes.length, S);
    const hy = py(9, S) * 0.45 + py(homeHexes.reduce((s, h) => s + h.Y, 0) / homeHexes.length, S) * 0.55;
    const z = Math.min(1.5, Math.max(0.7, size.h / 600));
    setCam({ x: size.w / 2 - hx * z, y: clampY(size.h / 2 - hy * z, z), z });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey, home, size.w, size.h]);

  const zoomBy = (factor: number, cx = size.w / 2, cy = size.h / 2) => {
    autoCenter.current = false;
    setCam((c) => {
      const z = Math.min(2.4, Math.max(0.35, c.z * factor));
      const k = z / c.z;
      return { z, x: cx - (cx - c.x) * k, y: clampY(cy - (cy - c.y) * k, z) };
    });
  };
  if (zoomRef) zoomRef.current = (f) => zoomBy(f);
  if (apiRef) {
    // World → screen, choosing the copy of the tube nearest the middle of the view.
    const toScreen = (wx: number, wy: number) => {
      const el = wrap.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const span = MAP_W * cam.z;
      let sx = cam.x + wx * cam.z;
      sx += Math.round((size.w / 2 - sx) / span) * span;
      return { x: r.left + sx, y: r.top + cam.y + wy * cam.z };
    };
    apiRef.current = {
      hex: (id) => toScreen(px(GEO.hexes[id].X, S), py(GEO.hexes[id].Y, S)),
      vertex: (id) => toScreen(px(GEO.vertices[id].X, S), py(GEO.vertices[id].Y, S)),
      edge: (id) => {
        const m = mid(id);
        return toScreen(m.x, m.y);
      },
      center: () => {
        const r = wrap.current?.getBoundingClientRect();
        return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
      },
    };
  }

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = wrap.current!.getBoundingClientRect();
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, camx: cam.x, camy: cam.y };
      drag.current = null;
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const z = Math.min(2.4, Math.max(0.35, (p.z * Math.hypot(a.x - b.x, a.y - b.y)) / p.d));
      const k = z / p.z;
      autoCenter.current = false;
      setCam({ z, x: p.cx - (p.cx - p.camx) * k, y: clampY(p.cy - (p.cy - p.camy) * k, z) });
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) (e.currentTarget as Element).setPointerCapture(e.pointerId);
    d.moved = true;
    autoCenter.current = false;
    setCam((c) => ({ ...c, x: d.cx + dx, y: clampY(d.cy + dy, c.z) }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    setTimeout(() => (drag.current = null), 0);
  };
  const clickGuard = (f: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (drag.current?.moved) return;
    f();
  };

  useEffect(() => {
    const el = wrap.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      else {
        autoCenter.current = false;
        setCam((c) => ({ ...c, x: c.x - e.deltaX }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // Copies of the tube needed to fill the viewport.
  const span = MAP_W * cam.z;
  const copies: number[] = [];
  for (let k = Math.floor(-cam.x / span) - 1; k <= Math.ceil((size.w - cam.x) / span); k++) copies.push(k);

  const colorOf = (seat: number) => view.players[seat]?.color ?? '#999';
  const legal = view.legal;
  const targets = useMemo(() => {
    const t = { v: [] as number[], roads: [] as number[], ships: [] as number[], shipSources: [] as number[], vKind: 'settlement' as 'settlement' | 'city' };
    switch (mode.kind) {
      case 'settlement':
        t.v = legal.settlements;
        break;
      case 'city':
        t.v = legal.cities;
        t.vKind = 'city';
        break;
      case 'road':
        t.roads = legal.roads;
        break;
      case 'ship':
        t.ships = legal.ships;
        break;
      case 'route':
        t.roads = legal.roads;
        t.ships = legal.ships.filter((e) => !legal.roads.includes(e));
        break;
      case 'moveFrom':
        t.shipSources = Object.keys(legal.shipMoves).map(Number);
        break;
      case 'moveTo':
        t.ships = legal.shipMoves[mode.from] ?? [];
        break;
    }
    return t;
  }, [mode, legal]);
  useEffect(() => {
    setHover(null);
  }, [mode]);

  const myRobber = view.me.robberHex;
  const landHexes = GEO.hexes.filter((h) => view.hexes[h.id] && view.hexes[h.id]!.terrain !== 'sea');

  const shipGlyph = (color: string, x: number, y: number, ghost = false) => (
    <g transform={`translate(${x - 10.5},${y - 14}) scale(0.88)`} style={{ color }} className={ghost ? 'ghost' : 'ship-glyph'}>
      {GLYPHS.ship}
    </g>
  );
  const buildingGlyph = (kind: 'settlement' | 'city', color: string, x: number, y: number, ghost = false) => (
    <g transform={`translate(${x},${y})`} style={{ color }} className={ghost ? 'ghost' : 'building'}>
      {!ghost && <ellipse cx="1.5" cy={kind === 'city' ? 11 : 8.5} rx={kind === 'city' ? 13 : 10} ry="3.2" className="piece-shadow" />}
      {kind === 'settlement' ? (
        <g transform="translate(-9.6,-11) scale(0.8)">{GLYPHS.settlement}</g>
      ) : (
        <g transform="translate(-13.2,-14) scale(1.1)">{GLYPHS.city}</g>
      )}
    </g>
  );

  const renderCopy = (k: number) => {
    const off = k * WRAP_X;
    return (
      <g key={k} transform={`translate(${px(off, S)},0)`}>
        {/* fog and sea */}
        {GEO.hexes.map((h) => {
          const hs = view.hexes[h.id];
          if (!hs) return <polygon key={h.id} points={hexPoints(h.X, h.Y)} className="fog" />;
          if (hs.terrain !== 'sea') return null;
          return (
            <g key={h.id}>
              <polygon points={hexPoints(h.X, h.Y)} fill="url(#t-sea)" className="hex sea" />
              <use href="#m-sea" transform={`translate(${px(h.X, S)},${py(h.Y, S)})`} className="motif" />
            </g>
          );
        })}
        {/* coast shadows, then land */}
        {landHexes.map((h) => (
          <polygon key={`s${h.id}`} points={hexPoints(h.X, h.Y)} className="land-shadow" transform="translate(0,4)" />
        ))}
        {landHexes.map((h) => {
          const hs = view.hexes[h.id]!;
          const hot = highlight !== null && hs.number === highlight && !view.robbers.includes(h.id);
          return (
            <g key={h.id} className={hot ? 'hot-hex' : ''}>
              <polygon points={hexPoints(h.X, h.Y)} fill={`url(#t-${hs.terrain})`} className="hex land" />
              <use href={`#m-${hs.terrain}`} transform={`translate(${px(h.X, S)},${py(h.Y, S)})`} className="motif" />
              {hs.number && (
                <g transform={`translate(${px(h.X, S)},${py(h.Y, S)})`} className={`token ${hot ? 'rolled' : ''}`}>
                  {hot && <circle r={S * 0.5} className="token-glow" />}
                  <circle r={S * 0.37} className="token-disc" />
                  <text y={1.5} className={hs.number === 6 || hs.number === 8 ? 'hot' : ''}>
                    {hs.number}
                  </text>
                  <g className="pips">
                    {Array.from({ length: pips(hs.number) }, (_, i) => (
                      <circle key={i} cx={(i - (pips(hs.number!) - 1) / 2) * 3.6} cy={S * 0.23} r={1.25} />
                    ))}
                  </g>
                </g>
              )}
            </g>
          );
        })}

        {view.harbors.map((hb) => {
          const ends = edgeEnds(hb.edge);
          const sea = GEO.edges[hb.edge].hexes.find((x) => view.hexes[x]?.terrain === 'sea') ?? GEO.edges[hb.edge].hexes[0];
          const sh = GEO.hexes[sea];
          const mx = (ends.x1 + ends.x2) / 2;
          const my = (ends.y1 + ends.y2) / 2;
          const anchorX = GEO.vertices[GEO.edges[hb.edge].vertices[0]].X;
          const tx = px(sh.X + Math.round((anchorX - sh.X) / WRAP_X) * WRAP_X, S);
          const lx = mx + (tx - mx) * 0.55;
          const ly = my + (py(sh.Y, S) - my) * 0.55;
          return (
            <g key={`h${hb.edge}`} className={`port ${hb.kind === '2:1' ? 'p2' : 'p3'}`}>
              <line x1={ends.x1} y1={ends.y1} x2={lx} y2={ly} />
              <line x1={ends.x2} y1={ends.y2} x2={lx} y2={ly} />
              <circle cx={lx} cy={ly} r={S * 0.31} />
              <text x={lx} y={ly + 1}>
                {hb.kind}
              </text>
            </g>
          );
        })}

        {view.routes.map((r) => {
          const ends = edgeEnds(r.edge);
          if (r.kind === 'ship') {
            const m = mid(r.edge);
            return (
              <g key={`e${r.edge}`} className="route ship">
                <line {...ends} className="wake" />
                {shipGlyph(colorOf(r.owner), m.x, m.y)}
              </g>
            );
          }
          return (
            <g key={`e${r.edge}`} className="route road">
              <line {...ends} className="under" />
              <line {...ends} stroke={colorOf(r.owner)} className="over" />
            </g>
          );
        })}

        {view.treasures.map((v) => {
          const p = vpos(v);
          return (
            <g key={`t${v}`} className="treasure" transform={`translate(${p.x - 9},${p.y - 10}) scale(0.75)`}>
              {GLYPHS.treasure}
            </g>
          );
        })}

        {view.robbers.map((h) => {
          const hx = GEO.hexes[h];
          return (
            <g key={`r${h}`} className={`robber ${h === myRobber ? 'mine' : ''}`} transform={`translate(${px(hx.X, S) + S * 0.47},${py(hx.Y, S) - S * 0.1})`}>
              <ellipse cx={0} cy={11} rx={9} ry={3} className="piece-shadow" />
              <g transform="translate(-13,-15) scale(1.1)">{GLYPHS.robber}</g>
            </g>
          );
        })}

        {view.buildings.map((b) => {
          const p = vpos(b.vertex);
          return <g key={`b${b.vertex}`}>{buildingGlyph(b.kind, colorOf(b.owner), p.x, p.y)}</g>;
        })}

        {/* ghost preview of what you're about to build */}
        {hover?.kind === 'vertex' && (() => {
          const p = vpos(hover.id);
          return buildingGlyph(targets.vKind, me.color, p.x, p.y, true);
        })()}
        {hover?.kind === 'edge' &&
          (hover.route === 'ship' ? (
            (() => {
              const m = mid(hover.id);
              return shipGlyph(me.color, m.x, m.y, true);
            })()
          ) : (
            <line {...edgeEnds(hover.id)} stroke={me.color} className="ghost-road" />
          ))}

        {/* interaction targets */}
        {targets.roads.map((e) => (
          <line
            key={`tr${e}`}
            {...edgeEnds(e)}
            className="target-edge road"
            onClick={clickGuard(() => onEdge(e, 'road'))}
            onPointerEnter={() => setHover({ kind: 'edge', id: e, route: 'road' })}
            onPointerLeave={() => setHover(null)}
          />
        ))}
        {targets.ships.map((e) => (
          <line
            key={`ts${e}`}
            {...edgeEnds(e)}
            className="target-edge ship"
            onClick={clickGuard(() => (mode.kind === 'moveTo' ? onShip(e) : onEdge(e, 'ship')))}
            onPointerEnter={() => setHover({ kind: 'edge', id: e, route: 'ship' })}
            onPointerLeave={() => setHover(null)}
          />
        ))}
        {targets.shipSources.map((e) => {
          const m = mid(e);
          return <circle key={`ss${e}`} cx={m.x} cy={m.y} r={13} className="target-ship" onClick={clickGuard(() => onShip(e))} />;
        })}
        {mode.kind === 'moveTo' && (() => {
          const m = mid(mode.from);
          return <circle cx={m.x} cy={m.y} r={14} className="moving-ship" />;
        })()}
        {targets.v.map((v) => {
          const p = vpos(v);
          return (
            <circle
              key={`tv${v}`}
              cx={p.x}
              cy={p.y}
              r={targets.vKind === 'city' ? 15 : 9}
              className={`target-vertex ${targets.vKind}`}
              onClick={clickGuard(() => onVertex(v))}
              onPointerEnter={() => setHover({ kind: 'vertex', id: v })}
              onPointerLeave={() => setHover(null)}
            />
          );
        })}
      </g>
    );
  };

  return (
    <div className="board" ref={wrap} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <svg width={size.w} height={size.h}>
        <defs>
          <pattern id="chart" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
            <rect width="10" height="10" fill="var(--fog)" />
            <line x1="0" y1="0" x2="0" y2="10" stroke="var(--fog-line)" strokeWidth="1" />
          </pattern>
          {(Object.keys(TERRAIN_SHADE) as Terrain[]).map((t) => (
            <linearGradient key={t} id={`t-${t}`} x1="0" y1="0" x2="0.35" y2="1">
              <stop offset="0" stopColor={TERRAIN_SHADE[t][0]} />
              <stop offset="1" stopColor={TERRAIN_SHADE[t][1]} />
            </linearGradient>
          ))}
          {(Object.keys(TERRAIN_MOTIF) as Terrain[]).map((t) => (
            <g key={t} id={`m-${t}`}>
              {TERRAIN_MOTIF[t]}
            </g>
          ))}
        </defs>
        <g transform={`translate(${cam.x},${cam.y}) scale(${cam.z})`}>{copies.map(renderCopy)}</g>
      </svg>
    </div>
  );
}
