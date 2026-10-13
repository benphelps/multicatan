import { RESOURCES, type Terrain } from '../../shared/types.ts';
import { TERRAIN_FILL } from './game/Board.tsx';
import { Die, GLYPHS, GlyphName, Icon, TERRAIN_MOTIF } from './icons.tsx';
import { RES_LABEL, ResSwatch } from './ui.tsx';

/** Visit /?icons to review the full icon set. */
export function IconSheet() {
  const hex = 'M40 0 L20 34.6 L-20 34.6 L-40 0 L-20 -34.6 L20 -34.6 Z';
  return (
    <main className="icon-sheet">
      <h1>Multicatan icons</h1>
      <h2>Resources</h2>
      <div className="sheet-row">
        {RESOURCES.map((r) => (
          <figure key={r}>
            <ResSwatch res={r} size="lg" count={3} />
            <figcaption>{RES_LABEL[r]}</figcaption>
          </figure>
        ))}
      </div>
      <h2>Pieces and cards</h2>
      <div className="sheet-row">
        {(Object.keys(GLYPHS) as GlyphName[]).map((g) => (
          <figure key={g}>
            <Icon name={g} size={56} style={{ color: g === 'card' ? '#d9c48f' : g === 'victoryPoint' ? '#d4a73a' : '#d33b2c' }} />
            <figcaption>{g}</figcaption>
          </figure>
        ))}
        {[1, 2, 3, 4, 5, 6].map((v) => (
          <figure key={v}>
            <Die value={v} size={44} red={v % 2 === 0} />
            <figcaption>die {v}</figcaption>
          </figure>
        ))}
      </div>
      <h2>Terrain</h2>
      <div className="sheet-row">
        {(Object.keys(TERRAIN_MOTIF) as Terrain[]).map((t) => (
          <figure key={t}>
            <svg width="120" height="104" viewBox="-44 -38 88 76">
              <path d={hex} fill={TERRAIN_FILL[t]} stroke="#e9dcb7" strokeWidth="1.6" />
              {TERRAIN_MOTIF[t]}
              {t !== 'sea' && <circle r="14.4" fill="#f3e6c4" stroke="#6b5a33" />}
            </svg>
            <figcaption>{t}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
