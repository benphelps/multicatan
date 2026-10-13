import { useMemo } from 'react';
import { CORNERS, GEO, px, py } from '../../shared/board.ts';
import { generateMap } from '../../shared/mapgen.ts';
import { Rng, randomSeed } from '../../shared/rng.ts';
import type { Terrain } from '../../shared/types.ts';
import { MAP_W, S, TERRAIN_FILL } from './game/Board.tsx';
import { TERRAIN_MOTIF } from './icons.tsx';

const hexPoints = (X: number, Y: number) => CORNERS.map(([dx, dy]) => `${px(X + dx, S)},${py(Y + dy, S)}`).join(' ');

/** The whole tube, drifting past forever — it loops seamlessly because the world wraps. */
export function MapBackdrop() {
  const map = useMemo(() => generateMap(new Rng(randomSeed())), []);
  const tile = (
    <g>
      {GEO.hexes.map((h) => {
        const hs = map.hexes[h.id];
        return (
          <g key={h.id}>
            <polygon points={hexPoints(h.X, h.Y)} fill={TERRAIN_FILL[hs.terrain]} className={`hex ${hs.terrain === 'sea' ? 'sea' : 'land'}`} />
            <use href={`#bm-${hs.terrain}`} transform={`translate(${px(h.X, S)},${py(h.Y, S)})`} />
            {hs.number && (
              <g transform={`translate(${px(h.X, S)},${py(h.Y, S)})`} className="token">
                <circle r={S * 0.37} className="token-disc" />
                <text y={1.5} className={hs.number === 6 || hs.number === 8 ? 'hot' : ''}>
                  {hs.number}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
  return (
    <div className="backdrop" aria-hidden>
      <svg viewBox={`0 ${py(-1.2, S)} ${MAP_W * 2} ${py(20.4, S)}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          {(Object.keys(TERRAIN_MOTIF) as Terrain[]).map((t) => (
            <g key={t} id={`bm-${t}`}>
              {TERRAIN_MOTIF[t]}
            </g>
          ))}
        </defs>
        <g className="drift" style={{ ['--drift' as string]: `${-MAP_W}px` }}>
          {[0, 1, 2].map((k) => (
            <g key={k} transform={`translate(${k * MAP_W},0)`}>
              {tile}
            </g>
          ))}
        </g>
      </svg>
      <div className="backdrop-shade" />
    </div>
  );
}
